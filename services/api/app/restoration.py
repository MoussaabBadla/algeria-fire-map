"""Post-fire restoration planning — the "Green Recovery" data.

Where the fire map answers *where are fires burning now*, this answers *where did
the land burn recently and now needs replanting*. It surfaces recent burn scars
(clustered fire_events whose fire is out), estimates the burned area, scores each
scar by a transparent restoration-priority, and attaches the nearest community —
so foresters / NGOs / volunteers (DGF, associations) can plan where to reforest.

Honest by construction:
  * A burn scar = a confirmed fire_event (already clustered) whose fire is OUT.
  * Burned-area is ESTIMATED by buffering each detection pixel (~375 m VIIRS
    footprint) and unioning — a patchy real footprint, NOT the inflated convex
    hull (a hull over scattered fires wildly overcounts). Still a satellite
    estimate; true burned area/severity comes with Sentinel-2 dNBR (Phase 2).
  * No land-cover yet, so desert gas-flares / ag-burns can appear as "scars"
    (e.g. Ghardaïa). Phase 2 (ESA WorldCover) filters to real vegetation.

Runs server-side on Railway (needs the DB pool).
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone

from .db import get_pool

# VIIRS pixel is ~375 m; buffer each detection by that radius and union per event
# to estimate the burned footprint (see module docstring).
_PIXEL_BUFFER_M = 375

# Default lookback: 4 months captures a full summer fire season. Capped so the
# union cost (per cache-miss) stays bounded.
_DEFAULT_WINDOW_DAYS = 120
_MAX_WINDOW_DAYS = 365

# Priority weighting (transparent): size dominates (bigger job), then burn
# intensity (soil/seed-bank damage), then recency (recent burns need erosion
# control before the rains). Tuned to be explainable, not a black box.
_W_SIZE, _W_SEVERITY, _W_RECENCY = 0.5, 0.3, 0.2
_PRIORITY_HIGH, _PRIORITY_MEDIUM = 60.0, 30.0
# Lowest multiplier a fully non-vegetation ("other") scar keeps, so noise is
# down-ranked but never fully hidden (it may be misclassified).
_VEG_FLOOR = 0.35

# One SQL round-trip: per burn-scar aggregate + nearest inhabited place (KNN via
# the places GiST index). Only CONFIRMED events whose fire is OUT — an active
# fire belongs on the fire map, not the restoration map.
_SCARS_SQL = f"""
with scars as (
    select
        fe.id,
        fe.wilaya_code,
        fe.centroid,
        fe.first_seen,
        fe.last_seen,
        fe.detection_count,
        fe.max_frp,
        fe.total_frp,
        ST_AsGeoJSON(fe.hull) as hull_json,
        ST_Area(
            ST_Union(ST_Buffer(d.geom::geography, {_PIXEL_BUFFER_M})::geometry)::geography
        ) / 10000.0 as area_ha
    from fire_events fe
    join detections d on d.event_id = fe.id
    where fe.last_seen >= now() - make_interval(days => $1::int)
      and fe.is_active = false
      and fe.confirmed = true
      and fe.hull is not null
    group by fe.id
)
select
    s.id,
    s.wilaya_code,
    ST_X(s.centroid) as lng,
    ST_Y(s.centroid) as lat,
    s.hull_json,
    s.first_seen,
    s.last_seen,
    s.detection_count,
    s.max_frp,
    s.total_frp,
    s.area_ha,
    w.name as wilaya_name,
    w.name_ar as wilaya_name_ar,
    nc.name as nearest_name,
    nc.name_ar as nearest_name_ar,
    nc.population as nearest_population,
    ST_Distance(s.centroid::geography, nc.geom::geography)::int as nearest_m,
    lc.forest_ha, lc.shrub_ha, lc.grass_ha, lc.cropland_ha, lc.other_ha, lc.dominant as land_cover,
    sv.dnbr, sv.severity as severity_class, sv.slope_deg, sv.erosion_risk
from scars s
left join wilayas w on w.code = s.wilaya_code
left join burn_scar_landcover lc on lc.event_id = s.id
left join burn_scar_severity sv on sv.event_id = s.id
left join lateral (
    select name, name_ar, population, geom
    from places
    order by places.geom <-> s.centroid
    limit 1
) nc on true
order by s.area_ha desc nulls last
"""


def _priority(score: float) -> str:
    if score >= _PRIORITY_HIGH:
        return "high"
    if score >= _PRIORITY_MEDIUM:
        return "medium"
    return "low"


async def burn_scars(window_days: int = _DEFAULT_WINDOW_DAYS) -> dict:
    """Recent burn scars needing restoration, priority-scored, with per-wilaya
    summary (for ranking + filtering). Cached by the router."""
    window_days = max(1, min(int(window_days), _MAX_WINDOW_DAYS))

    pool = await get_pool()
    if pool is None:
        return {"enabled": False}

    async with pool.acquire() as conn:
        rows = await conn.fetch(_SCARS_SQL, window_days)

    now = datetime.now(timezone.utc)
    scars: list[dict] = []
    for r in rows:
        area_ha = float(r["area_ha"] or 0.0)
        total_frp = float(r["total_frp"] or 0.0)
        last_seen = r["last_seen"]
        first_seen = r["first_seen"]
        days_since = None
        duration_days = None
        if last_seen is not None:
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            days_since = max(0, (now - last_seen).days)
        if first_seen is not None and r["last_seen"] is not None:
            duration_days = max(0, (r["last_seen"] - first_seen).days) + 1
        try:
            hull = json.loads(r["hull_json"]) if r["hull_json"] else None
        except (TypeError, ValueError):
            hull = None
        # Land cover (ESA WorldCover, enriched via GEE). None until a scar is enriched.
        lc = None
        veg_frac = None
        if r["land_cover"] is not None:
            forest = float(r["forest_ha"] or 0.0)
            shrub = float(r["shrub_ha"] or 0.0)
            grass = float(r["grass_ha"] or 0.0)
            crop = float(r["cropland_ha"] or 0.0)
            other = float(r["other_ha"] or 0.0)
            tot = forest + shrub + grass + crop + other
            if tot > 0:
                pct = lambda x: round(100.0 * x / tot)
                lc = {
                    "dominant": r["land_cover"],
                    "forest": pct(forest), "shrub": pct(shrub), "grass": pct(grass),
                    "cropland": pct(crop), "other": pct(other),
                }
                veg_frac = (forest + shrub + grass + crop) / tot
        scars.append({
            "id": r["id"],
            "lng": r["lng"],
            "lat": r["lat"],
            "hull": hull,
            "area_ha": round(area_ha, 1),
            "detections": r["detection_count"],
            "max_frp": round(float(r["max_frp"]), 1) if r["max_frp"] is not None else None,
            "total_frp": round(total_frp, 1),
            "first_seen": r["first_seen"].isoformat() if r["first_seen"] else None,
            "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
            "days_since": days_since,
            "duration_days": duration_days,
            "wilaya_code": r["wilaya_code"],
            "wilaya_name": r["wilaya_name"],
            "wilaya_name_ar": r["wilaya_name_ar"],
            "nearest_community": r["nearest_name"],
            "nearest_community_ar": r["nearest_name_ar"],
            "nearest_community_m": r["nearest_m"],
            "population_nearby": r["nearest_population"],
            "land_cover": lc,  # {dominant, forest, shrub, grass, cropland, other%} or null
            # Burn severity (Sentinel-2 dNBR) + erosion urgency (with slope). None
            # until enriched; class present only once post-fire imagery exists.
            "severity": (
                {
                    "dnbr": float(r["dnbr"]) if r["dnbr"] is not None else None,
                    "class": r["severity_class"],
                    "slope_deg": float(r["slope_deg"]) if r["slope_deg"] is not None else None,
                    "erosion_risk": r["erosion_risk"],
                }
                if r["severity_class"] is not None else None
            ),
            "_veg_frac": veg_frac,  # internal: for priority weighting (stripped below)
            # priority filled in below (needs the set-wide maxima)
        })

    # Normalise size & severity across the set (log-scaled so a few megafires
    # don't flatten everything), recency 1=today .. 0=window edge. Combine.
    max_size = max((math.log1p(s["area_ha"]) for s in scars), default=0.0) or 1.0
    max_sev = max((math.log1p(s["total_frp"]) for s in scars), default=0.0) or 1.0
    for s in scars:
        size = math.log1p(s["area_ha"]) / max_size
        sev = math.log1p(s["total_frp"]) / max_sev
        rec = 1.0 - (s["days_since"] / window_days) if s["days_since"] is not None else 0.5
        rec = min(1.0, max(0.0, rec))
        base = 100.0 * (_W_SIZE * size + _W_SEVERITY * sev + _W_RECENCY * rec)
        # Vegetation weight: reforestation targets forested/crop/rangeland, so a
        # scar that's mostly bare/built/water (a desert gas-flare or ag-burn false
        # scar) is down-ranked. Gentle floor (_VEG_FLOOR) so it's never zeroed and
        # unenriched scars (veg_frac None) keep their base score.
        vf = s.pop("_veg_frac")
        weight = 1.0 if vf is None else (_VEG_FLOOR + (1.0 - _VEG_FLOOR) * vf)
        score = round(base * weight, 1)
        s["priority_score"] = score
        s["priority"] = _priority(score)

    # Per-wilaya summary — powers the ranking list and the wilaya filter (only
    # wilayas that actually have scars, most-burned first).
    by_wilaya: dict[int, dict] = {}
    for s in scars:
        code = s["wilaya_code"]
        if code is None:
            continue
        w = by_wilaya.setdefault(code, {
            "code": code,
            "name": s["wilaya_name"],
            "name_ar": s["wilaya_name_ar"],
            "scars": 0,
            "area_ha": 0.0,
            "high_priority": 0,
        })
        w["scars"] += 1
        w["area_ha"] += s["area_ha"]
        if s["priority"] == "high":
            w["high_priority"] += 1
    wilaya_summary = sorted(by_wilaya.values(), key=lambda w: w["area_ha"], reverse=True)
    for w in wilaya_summary:
        w["area_ha"] = round(w["area_ha"], 1)

    total_area = round(sum(s["area_ha"] for s in scars), 1)
    # Land-cover counts (dominant class) — powers the UI land-cover filter.
    land_cover_counts: dict[str, int] = {}
    enriched = 0
    for s in scars:
        if s["land_cover"]:
            enriched += 1
            d = s["land_cover"]["dominant"]
            land_cover_counts[d] = land_cover_counts.get(d, 0) + 1
    return {
        "enabled": True,
        "generated_at": now.isoformat(),
        "window_days": window_days,
        # Satellite-derived estimate for planning, not an official burned-area
        # assessment — the frontend shows this disclaimer.
        "advisory": True,
        "totals": {
            "scars": len(scars),
            "area_ha": total_area,
            "wilayas": len(wilaya_summary),
            "enriched": enriched,
        },
        "land_cover_counts": land_cover_counts,
        "wilaya_summary": wilaya_summary,
        "scars": scars,
    }
