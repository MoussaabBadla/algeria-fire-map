"""Daily fire-risk prediction (ML) — scores every grid cell with the trained
LightGBM model and writes `cell_risk`, which /forecast serves.

Features are rebuilt per cell exactly as in training (static terrain/land-cover
from grid_cells + fire-history windows from detections as-of today + seasonality),
so train/serve are consistent. Runs on a daily schedule on the ingest service.
No-op if the model file or DB is missing.
"""
from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timezone

from .db import get_pool

log = logging.getLogger("predict")

_MODEL = None
_META: dict | None = None
_DIR = os.path.join(os.path.dirname(__file__), "ml")
_MODEL_PATH = os.path.join(_DIR, "fire_model.txt")
_META_PATH = os.path.join(_DIR, "fire_model_meta.json")

# Must match training (ml_train.py).
_LC_CODE = {"forest": 0, "shrub": 1, "grass": 2, "cropland": 3, "other": 4}
_FEATS = ["elevation_m", "slope_deg", "aspect_deg", "lc", "cx", "cy",
          "f7", "f30", "f365", "dsl", "nb7", "alltime", "month", "doy_sin", "doy_cos"]

# FWI-style class names (shared with the weather-risk layer for UI consistency).
_CLASSES = ["very-low", "low", "moderate", "high", "very-high", "extreme"]

_last_predict: dict | None = None


def model_available() -> bool:
    return os.path.exists(_MODEL_PATH)


def get_last_predict() -> dict | None:
    return _last_predict


def _load_model() -> bool:
    global _MODEL, _META
    if _MODEL is not None:
        return True
    if not model_available():
        return False
    import lightgbm as lgb
    _MODEL = lgb.Booster(model_file=_MODEL_PATH)
    _META = json.load(open(_META_PATH)) if os.path.exists(_META_PATH) else {"feats": _FEATS}
    log.info("fire model loaded (%d features)", len(_META.get("feats", _FEATS)))
    return True


_STATIC_SQL = """
select cell_id, cx, cy, ST_X(geom) as lng, ST_Y(geom) as lat,
       elevation_m, slope_deg, aspect_deg, land_cover
from grid_cells
"""

# Per-cell fire-history aggregates as-of a date D (fires strictly before D, from 2015).
_HIST_SQL = """
with fires as (
    select gc.cell_id, (d.acq_datetime at time zone 'UTC')::date as day
    from detections d join grid_cells gc on ST_Contains(gc.cell, d.geom)
    where d.confidence='high' and d.frp>=15
      and d.acq_datetime >= '2015-01-01' and d.acq_datetime < $1::date
    group by gc.cell_id, day
)
select cell_id,
    count(*) filter (where day >= $1::date - 7)   as f7,
    count(*) filter (where day >= $1::date - 30)  as f30,
    count(*) filter (where day >= $1::date - 365) as f365,
    count(*) as alltime,
    ($1::date - max(day)) as dsl
from fires group by cell_id
"""

_UPSERT_SQL = """
insert into cell_risk (cell_id, cx, cy, lat, lng, day, prob, risk_class, updated_at)
values ($1,$2,$3,$4,$5,$6,$7,$8, now())
on conflict (cell_id) do update set
    cx=excluded.cx, cy=excluded.cy, lat=excluded.lat, lng=excluded.lng,
    day=excluded.day, prob=excluded.prob, risk_class=excluded.risk_class, updated_at=now()
"""

_DDL = """
create table if not exists cell_risk (
    cell_id     text primary key,
    cx          double precision, cy double precision,
    lat         double precision, lng double precision,
    day         date not null,
    prob        double precision not null,
    risk_class  text not null,
    updated_at  timestamptz not null default now()
);
create index if not exists cell_risk_class_idx on cell_risk (risk_class);
"""


def _classify(prob: float, ranks: list[float]) -> str:
    """Percentile-rank class so the daily map always shows a readable spread."""
    # ranks = sorted probs; find percentile of prob.
    import bisect
    pct = bisect.bisect_right(ranks, prob) / max(len(ranks), 1)
    if pct >= 0.98: return "extreme"
    if pct >= 0.93: return "very-high"
    if pct >= 0.80: return "high"
    if pct >= 0.55: return "moderate"
    if pct >= 0.30: return "low"
    return "very-low"


async def predict_all(target: str | None = None) -> dict:
    """Score every grid cell for `target` day (default: today UTC) and upsert
    cell_risk. Returns a summary for /health & admin."""
    import numpy as np

    if not _load_model():
        return {"ok": False, "reason": "no model", "scored": 0}
    pool = await get_pool()
    if pool is None:
        return {"ok": False, "reason": "no database", "scored": 0}

    from datetime import date
    D = date.fromisoformat(target) if target else datetime.now(timezone.utc).date()

    async with pool.acquire() as conn:
        await conn.execute(_DDL)
        statics = await conn.fetch(_STATIC_SQL)
        hist = await conn.fetch(_HIST_SQL, D)

    hmap = {r["cell_id"]: r for r in hist}
    f7map = {r["cell_id"]: (r["f7"] or 0) for r in hist}
    coord = {(r["cx"], r["cy"]): r["cell_id"] for r in statics}

    doy = D.timetuple().tm_yday
    doy_sin, doy_cos = math.sin(2 * math.pi * doy / 365), math.cos(2 * math.pi * doy / 365)

    ids, rows, meta = [], [], []
    for r in statics:
        cid = r["cell_id"]
        h = hmap.get(cid)
        f7 = h["f7"] if h else 0
        f30 = h["f30"] if h else 0
        f365 = h["f365"] if h else 0
        alltime = h["alltime"] if h else 0
        dsl = min(h["dsl"], 999) if (h and h["dsl"] is not None) else 999
        nb7 = 0
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                ncid = coord.get((r["cx"] + dx, r["cy"] + dy))
                if ncid:
                    nb7 += f7map.get(ncid, 0)
        lc = _LC_CODE.get(r["land_cover"], -1)
        rows.append([
            r["elevation_m"], r["slope_deg"], r["aspect_deg"], lc, r["cx"], r["cy"],
            f7, f30, f365, dsl, nb7, alltime, D.month, doy_sin, doy_cos,
        ])
        ids.append(cid)
        meta.append((r["cx"], r["cy"], r["lat"], r["lng"]))

    X = np.array(rows, dtype="float64")
    probs = _MODEL.predict(X)
    ranks = sorted(float(p) for p in probs)

    upserts = []
    for cid, p, m in zip(ids, probs, meta):
        cls = _classify(float(p), ranks)
        upserts.append((cid, m[0], m[1], m[2], m[3], D, round(float(p), 5), cls))

    async with pool.acquire() as conn:
        await conn.executemany(_UPSERT_SQL, upserts)

    global _last_predict
    hi = sum(1 for u in upserts if u[7] in ("extreme", "very-high", "high"))
    _last_predict = {"at": datetime.now(timezone.utc).isoformat(), "day": D.isoformat(), "scored": len(upserts), "elevated": hi}
    log.info("predict: scored %d cells for %s (%d elevated)", len(upserts), D, hi)
    return {"ok": True, "scored": len(upserts), "day": D.isoformat(), "elevated": hi}
