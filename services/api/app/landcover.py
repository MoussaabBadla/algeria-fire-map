"""Automated land-cover enrichment for burn scars (ESA WorldCover via GEE).

Runs on the ingest service: a periodic sweep finds confirmed, inactive fire
events (burn scars) that have no land-cover row yet, samples ESA WorldCover v200
(10 m) inside each hull, and upserts a per-class hectare breakdown + dominant
class into `burn_scar_landcover`. The /restoration endpoint joins that table and
weights priority by vegetation fraction.

No-op unless GEE_SERVICE_ACCOUNT_JSON is configured, so the API runs fine without
Earth Engine. GEE calls are blocking, so they run in a thread executor.
"""
from __future__ import annotations

import asyncio
import json
import logging

from .config import get_settings
from .db import get_pool

log = logging.getLogger("landcover")

# ESA WorldCover class -> simplified restoration category.
_SIMPLE = {
    "10": "forest", "20": "shrub", "30": "grass", "40": "cropland",
    "50": "other", "60": "other", "70": "other", "80": "other",
    "90": "other", "95": "other", "100": "other",
}
_CATS = ("forest", "shrub", "grass", "cropland", "other")

_DDL = """
create table if not exists burn_scar_landcover (
    event_id      bigint primary key references fire_events(id) on delete cascade,
    forest_ha     double precision not null default 0,
    shrub_ha      double precision not null default 0,
    grass_ha      double precision not null default 0,
    cropland_ha   double precision not null default 0,
    other_ha      double precision not null default 0,
    dominant      text,
    updated_at    timestamptz not null default now()
);
"""

_MISSING_SQL = """
select fe.id, ST_AsGeoJSON(fe.hull) as hull
from fire_events fe
left join burn_scar_landcover lc on lc.event_id = fe.id
where fe.last_seen >= now() - interval '365 days'
  and fe.is_active = false and fe.confirmed = true and fe.hull is not null
  and lc.event_id is null
limit $1
"""

_UPSERT_SQL = """
insert into burn_scar_landcover (event_id, forest_ha, shrub_ha, grass_ha, cropland_ha, other_ha, dominant, updated_at)
values ($1,$2,$3,$4,$5,$6,$7, now())
on conflict (event_id) do update set
    forest_ha=excluded.forest_ha, shrub_ha=excluded.shrub_ha, grass_ha=excluded.grass_ha,
    cropland_ha=excluded.cropland_ha, other_ha=excluded.other_ha,
    dominant=excluded.dominant, updated_at=now()
"""

_ee_ready = False
# Last enrichment sweep result, surfaced by /health for observability.
_last_enrich: dict | None = None


def get_last_enrich() -> dict | None:
    return _last_enrich


def gee_configured() -> bool:
    return bool(get_settings().gee_service_account_json.strip())


def _init_ee() -> bool:
    """Initialise Earth Engine once from the service-account JSON. Idempotent."""
    global _ee_ready
    if _ee_ready:
        return True
    raw = get_settings().gee_service_account_json.strip()
    if not raw:
        return False
    try:
        import ee
        info = json.loads(raw)
        creds = ee.ServiceAccountCredentials(info["client_email"], key_data=raw)
        ee.Initialize(creds, project=info["project_id"])
        _ee_ready = True
        log.info("Earth Engine initialised (project %s)", info["project_id"])
        return True
    except Exception as e:  # noqa: BLE001 — never let EE break the ingest loop
        log.warning("Earth Engine init failed: %s", e)
        return False


def _reduce_batch(hulls: list[tuple[int, str]]) -> dict[int, dict[str, float]]:
    """Blocking GEE call: per-hull ESA WorldCover histogram -> hectares by category.
    Returns {event_id: {cat: ha}}. Runs in a thread (see enrich_new_scars)."""
    import ee
    wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    feats = [ee.Feature(ee.Geometry(json.loads(h)), {"eid": eid}) for eid, h in hulls]
    fc = ee.FeatureCollection(feats)
    res = wc.reduceRegions(collection=fc, reducer=ee.Reducer.frequencyHistogram(), scale=10).getInfo()
    out: dict[int, dict[str, float]] = {}
    for f in res["features"]:
        eid = int(f["properties"]["eid"])
        hist = f["properties"].get("histogram") or {}
        acc = {c: 0.0 for c in _CATS}
        for code, px in hist.items():
            acc[_SIMPLE.get(code, "other")] += float(px) * 0.01  # 10 m px = 0.01 ha
        out[eid] = acc
    return out


async def enrich_new_scars(limit: int | None = None) -> dict:
    """Enrich up to `limit` burn scars that have no land cover yet. Safe no-op if
    GEE isn't configured or the pool is down. Returns a summary for /health & admin."""
    settings = get_settings()
    if not gee_configured():
        return {"ok": False, "reason": "GEE not configured", "enriched": 0}
    pool = await get_pool()
    if pool is None:
        return {"ok": False, "reason": "no database", "enriched": 0}
    limit = int(limit or settings.landcover_batch)

    async with pool.acquire() as conn:
        await conn.execute(_DDL)
        rows = await conn.fetch(_MISSING_SQL, limit)
    if not rows:
        return {"ok": True, "enriched": 0, "remaining": 0}

    if not await asyncio.to_thread(_init_ee):
        return {"ok": False, "reason": "EE init failed", "enriched": 0}

    hulls = [(r["id"], r["hull"]) for r in rows]
    # One batched reduceRegions for the whole limit (chunk defensively at 40).
    upserts: list[tuple] = []
    for i in range(0, len(hulls), 40):
        chunk = hulls[i:i + 40]
        try:
            acc_by_id = await asyncio.to_thread(_reduce_batch, chunk)
        except Exception as e:  # noqa: BLE001
            log.warning("landcover reduce failed for chunk: %s", e)
            continue
        for eid, acc in acc_by_id.items():
            dominant = max(acc, key=acc.get) if sum(acc.values()) > 0 else None
            upserts.append((eid, acc["forest"], acc["shrub"], acc["grass"], acc["cropland"], acc["other"], dominant))

    if upserts:
        async with pool.acquire() as conn:
            await conn.executemany(_UPSERT_SQL, upserts)
    log.info("landcover: enriched %d scars", len(upserts))

    async with pool.acquire() as conn:
        remaining = await conn.fetchval(
            "select count(*) from fire_events fe left join burn_scar_landcover lc on lc.event_id=fe.id "
            "where fe.last_seen>=now()-interval '365 days' and fe.is_active=false and fe.confirmed=true "
            "and fe.hull is not null and lc.event_id is null"
        )
    global _last_enrich
    from datetime import datetime, timezone
    _last_enrich = {
        "at": datetime.now(timezone.utc).isoformat(),
        "enriched": len(upserts),
        "remaining": int(remaining),
    }
    return {"ok": True, "enriched": len(upserts), "remaining": int(remaining)}
