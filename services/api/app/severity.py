"""Automated burn-severity + erosion enrichment (Sentinel-2 dNBR + SRTM slope, GEE).

For each burn scar (confirmed, inactive fire event) old enough to have post-fire
imagery, compute:
  * dNBR = pre-fire NBR − post-fire NBR (Sentinel-2), a burn-severity measure
    (Key & Benson) → class unburned/low/moderate/high;
  * mean slope (SRTM) → combined with severity into an erosion-urgency class,
    since steep, severely-burned slopes lose soil in the first rains.

Recent fires (post-imagery not yet available) are stored as status='pending' and
retried by the sweep later. dNBR is far heavier than land cover (per-scar S2
composites), so the sweep processes only a few scars per run, on a long interval.

No-op unless GEE_SERVICE_ACCOUNT_JSON is configured. Blocking EE calls run in a
thread executor.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging

from .config import get_settings
from .db import get_pool
from .landcover import _init_ee, gee_configured  # reuse EE init

log = logging.getLogger("severity")

# USGS/Key&Benson dNBR severity breakpoints.
def _severity_class(dnbr: float | None) -> str | None:
    if dnbr is None:
        return None
    if dnbr < 0.10:
        return "unburned"
    if dnbr < 0.27:
        return "low"
    if dnbr < 0.66:
        return "moderate"
    return "high"


_SEV_RANK = {"unburned": 0, "low": 1, "moderate": 2, "high": 3}


def _erosion_risk(slope_deg: float | None, sev: str | None) -> str | None:
    """Combine terrain steepness and burn severity into an erosion-urgency class."""
    if slope_deg is None or sev is None:
        return None
    r = _SEV_RANK.get(sev, 0)
    if slope_deg >= 15 and r >= 2:
        return "high"
    if (slope_deg >= 8 and r >= 1) or r >= 2:
        return "medium"
    return "low"


_DDL = """
create table if not exists burn_scar_severity (
    event_id      bigint primary key references fire_events(id) on delete cascade,
    dnbr          double precision,
    severity      text,
    slope_deg     double precision,
    erosion_risk  text,
    status        text not null default 'done',
    updated_at    timestamptz not null default now()
);
"""

# Candidates: old enough for post-imagery, not done (or a stale 'pending' to retry).
_CANDIDATES_SQL = """
select fe.id, ST_AsGeoJSON(fe.hull) as hull, fe.first_seen, fe.last_seen
from fire_events fe
left join burn_scar_severity bs on bs.event_id = fe.id
where fe.last_seen between now() - interval '400 days' and now() - interval '15 days'
  and fe.is_active = false and fe.confirmed = true and fe.hull is not null
  and (bs.event_id is null or (bs.status = 'pending' and bs.updated_at < now() - interval '7 days'))
order by fe.detection_count desc
limit $1
"""

_UPSERT_SQL = """
insert into burn_scar_severity (event_id, dnbr, severity, slope_deg, erosion_risk, status, updated_at)
values ($1,$2,$3,$4,$5,$6, now())
on conflict (event_id) do update set
    dnbr=excluded.dnbr, severity=excluded.severity, slope_deg=excluded.slope_deg,
    erosion_risk=excluded.erosion_risk, status=excluded.status, updated_at=now()
"""

_last_severity: dict | None = None


def get_last_severity() -> dict | None:
    return _last_severity


def _compute_one(hull_json: str, first_seen: dt.datetime, last_seen: dt.datetime) -> dict:
    """Blocking: one scar's dNBR + slope via a single getInfo. Returns
    {dnbr, slope, npre, npost} (dnbr None if imagery insufficient)."""
    import ee

    geom = ee.Geometry(json.loads(hull_json))
    pre_start = (first_seen - dt.timedelta(days=120)).isoformat()
    pre_end = (first_seen - dt.timedelta(days=10)).isoformat()
    post_start = (last_seen + dt.timedelta(days=10)).isoformat()
    post_end = (last_seen + dt.timedelta(days=120)).isoformat()

    def col(start, end):
        return (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterBounds(geom).filterDate(start, end)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 60)))

    def masked_nbr_median(c):
        def prep(img):
            scl = img.select("SCL")
            good = scl.remap([4, 5, 6, 7, 11], [1, 1, 1, 1, 1], 0)
            return img.updateMask(good).normalizedDifference(["B8", "B12"]).rename("nbr")
        # A 1-band image even when empty (fully masked) so subtract never fails.
        empty = ee.Image.constant(0).rename("nbr").updateMask(ee.Image.constant(0))
        return ee.Image(ee.Algorithms.If(c.size().gt(0), c.map(prep).select("nbr").median(), empty))

    pre_c, post_c = col(pre_start, pre_end), col(post_start, post_end)
    dnbr = masked_nbr_median(pre_c).subtract(masked_nbr_median(post_c)).rename("dnbr")
    slope = ee.Terrain.slope(ee.Image("USGS/SRTMGL1_003")).rename("slope")
    stats = dnbr.addBands(slope).reduceRegion(
        reducer=ee.Reducer.mean(), geometry=geom, scale=20, maxPixels=1e9, bestEffort=True
    )
    out = ee.Dictionary({
        "dnbr": stats.get("dnbr"), "slope": stats.get("slope"),
        "npre": pre_c.size(), "npost": post_c.size(),
    }).getInfo()
    return out


async def enrich_severity(limit: int | None = None) -> dict:
    """Compute dNBR severity + erosion for up to `limit` scars needing it. Safe
    no-op without GEE. Recent scars (no post imagery) are marked 'pending'."""
    settings = get_settings()
    if not gee_configured():
        return {"ok": False, "reason": "GEE not configured", "done": 0}
    pool = await get_pool()
    if pool is None:
        return {"ok": False, "reason": "no database", "done": 0}
    limit = int(limit or settings.severity_batch)

    async with pool.acquire() as conn:
        await conn.execute(_DDL)
        rows = await conn.fetch(_CANDIDATES_SQL, limit)
    if not rows:
        return {"ok": True, "done": 0, "pending": 0}

    if not await asyncio.to_thread(_init_ee):
        return {"ok": False, "reason": "EE init failed", "done": 0}

    upserts: list[tuple] = []
    pending = 0
    for r in rows:
        try:
            res = await asyncio.to_thread(_compute_one, r["hull"], r["first_seen"], r["last_seen"])
        except Exception as e:  # noqa: BLE001 — never break the loop on one scar
            log.warning("severity compute failed for #%s: %s", r["id"], e)
            continue
        dnbr = res.get("dnbr")
        slope = res.get("slope")
        if dnbr is None or res.get("npost", 0) == 0:
            upserts.append((r["id"], None, None, slope, None, "pending"))
            pending += 1
            continue
        sev = _severity_class(dnbr)
        ero = _erosion_risk(slope, sev)
        upserts.append((r["id"], round(dnbr, 3), sev, round(slope, 1) if slope is not None else None, ero, "done"))

    if upserts:
        async with pool.acquire() as conn:
            await conn.executemany(_UPSERT_SQL, upserts)
    done = len(upserts) - pending
    log.info("severity: %d done, %d pending", done, pending)

    global _last_severity
    from datetime import timezone
    _last_severity = {
        "at": dt.datetime.now(timezone.utc).isoformat(),
        "done": done, "pending": pending,
    }
    return {"ok": True, "done": done, "pending": pending}
