"""Populated places + the "Communities at risk" query.

Two jobs:
  * seed_places() — one-off (idempotent) load of Algeria's inhabited settlements
    (OSM place = city/town/village/hamlet) from Overpass into `places`. Static
    reference data; re-runnable to refresh names/population.
  * communities_at_risk() — settlements sitting near recent fires, tiered by
    distance, so volunteers/authorities can see which inhabited areas are
    threatened and prioritise help. Derived from FIRMS detections + OSM, NOT an
    official evacuation source — the API/UI label it as an early-warning aid.

Runs server-side on Railway (needs the DB pool). seed via POST /admin/seed-places.
"""
from __future__ import annotations

import logging

import httpx

from .db import get_pool
from .firms import _in_algeria

logger = logging.getLogger(__name__)

# Overpass: inhabited place nodes in Algeria (admin_level=2 country area). Queried
# ONE place type at a time — the combined city|town|village|hamlet body query is
# too heavy and 504s server-side, but each type (village ~5.6k, hamlet ~4k) returns
# fine (~25s) and ~87% carry a clean name:ar. Mirrors tried in order (flaky).
_PLACE_TYPES = ("city", "town", "village", "hamlet")


def _overpass_query(place_type: str) -> str:
    return (
        '[out:json][timeout:180];'
        'area["ISO3166-1"="DZ"][admin_level=2]->.dz;'
        f'node["place"="{place_type}"]["name"](area.dz);'
        "out body;"
    )
_OVERPASS_MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
# Overpass etiquette requires an identifying User-Agent; without one some mirrors
# (overpass-api.de) reject the request with 406 Not Acceptable.
_OVERPASS_HEADERS = {
    "User-Agent": "algeria-fire-map/1.0 (wildfire monitoring; https://github.com/MoussaabBadla/algeria-fire-map)"
}

_ENSURE_SCHEMA = """
create extension if not exists postgis;
create table if not exists places (
    id            bigserial primary key,
    osm_id        bigint unique,
    name          text not null,
    name_ar       text,
    name_en       text,
    place_type    text not null,
    population    integer,
    lng           double precision not null,
    lat           double precision not null,
    geom          geometry(Point, 4326) not null,
    wilaya_code   integer references wilayas(code),
    created_at    timestamptz not null default now()
);
create index if not exists places_geom_gix   on places using gist (geom);
create index if not exists places_wilaya_idx on places (wilaya_code);
create index if not exists places_type_idx   on places (place_type);
"""

# Upsert one place, assigning the nearest wilaya via KNN (same rule detections use).
_UPSERT_SQL = """
insert into places (osm_id, name, name_ar, name_en, place_type, population, lng, lat, geom, wilaya_code)
values (
    $1, $2, $3, $4, $5, $6, $7, $8,
    ST_SetSRID(ST_MakePoint($7, $8), 4326),
    (select code from wilayas order by geom <-> ST_SetSRID(ST_MakePoint($7, $8), 4326) limit 1)
)
on conflict (osm_id) do update set
    name       = excluded.name,
    name_ar    = excluded.name_ar,
    name_en    = excluded.name_en,
    place_type = excluded.place_type,
    population = excluded.population
"""


def _to_int(v) -> int | None:
    """OSM population tags are messy ('12345', '12 345', '~1000'). Best-effort."""
    if v is None:
        return None
    digits = "".join(c for c in str(v) if c.isdigit())
    return int(digits) if digits else None


async def _fetch_overpass() -> list[dict]:
    """Query Overpass for Algeria's place nodes, one type at a time (with mirror
    fallback per type). Tolerates a single type failing — partial data beats none."""
    elements: list[dict] = []
    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=240.0, headers=_OVERPASS_HEADERS) as client:
        for pt in _PLACE_TYPES:
            got: list[dict] | None = None
            for url in _OVERPASS_MIRRORS:
                try:
                    resp = await client.post(url, data={"data": _overpass_query(pt)})
                    resp.raise_for_status()
                    got = resp.json().get("elements", [])
                    break
                except (httpx.HTTPError, ValueError) as e:  # network or bad JSON
                    logger.warning("overpass %s @ %s failed: %s", pt, url, e)
                    last_err = e
            if got is not None:
                logger.info("overpass %s: %d nodes", pt, len(got))
                elements.extend(got)
    if not elements:
        raise RuntimeError(f"all Overpass requests failed: {last_err}")
    return elements


async def seed_places() -> dict:
    """Load/refresh Algeria's populated places from OSM. Idempotent."""
    pool = await get_pool()
    if pool is None:
        return {"seeded": 0, "total": 0, "reason": "no database configured"}

    elements = await _fetch_overpass()
    rows: list[tuple] = []
    for el in elements:
        lat, lng = el.get("lat"), el.get("lon")
        tags = el.get("tags", {})
        name = tags.get("name")
        if lat is None or lng is None or not name:
            continue
        # Border-clip to Algeria so we never flag a settlement just across the
        # frontier (same polygon the fire clip uses — no drift).
        if not _in_algeria(float(lng), float(lat)):
            continue
        rows.append((
            el.get("id"),
            name,
            tags.get("name:ar"),
            tags.get("name:en"),
            tags.get("place"),
            _to_int(tags.get("population")),
            float(lng),
            float(lat),
        ))

    async with pool.acquire() as conn:
        await conn.execute(_ENSURE_SCHEMA)
        before = await conn.fetchval("select count(*) from places")
        await conn.executemany(_UPSERT_SQL, rows)
        after = await conn.fetchval("select count(*) from places")
    seeded = int(after) - int(before)
    logger.info("places seed: %d fetched, %d new, %d total", len(rows), seeded, after)
    return {"fetched": len(rows), "seeded": seeded, "total": int(after)}


# Settlements near a recent fire. The join prefilters with a geometry ST_DWithin
# (~16 km, uses the GiST index), computes the exact geodesic distance per (place,
# fire) pair, then aggregates. Besides proximity we compute the ON-SETTLEMENT
# signal: fires whose pixel fell inside the settlement's built-up footprint (a
# radius scaled by place type, since a VIIRS pixel is 375 m and a settlement has
# real extent) — that is the "the fire actually reached the village" evidence used
# to flag likely-damaged communities.
_AT_RISK_SQL = """
with fires as (
    select geom, frp, acq_datetime::date as d
    from detections
    where confidence = 'high' and frp >= 15
      and acq_datetime >= now() - make_interval(hours => $2::int)
),
pf as (
    select
        p.id,
        ST_Distance(p.geom::geography, f.geom::geography) as dist,
        f.frp, f.d,
        case p.place_type
            when 'city' then 3000 when 'town' then 2000
            when 'village' then 1200 else 800 end as footprint
    from places p
    join fires f on ST_DWithin(p.geom, f.geom, 0.15)
)
select
    p.id, p.name, p.name_ar, p.name_en, p.place_type, p.population,
    p.lng, p.lat, p.wilaya_code,
    w.name as wilaya_name, w.name_ar as wilaya_name_ar,
    min(pf.dist)::int as nearest_m,
    count(*) filter (where pf.dist <= $1) as fires_nearby,
    round(max(pf.frp) filter (where pf.dist <= $1)::numeric, 1) as max_frp_nearby,
    count(*) filter (where pf.dist <= pf.footprint) as on_hits,
    round(coalesce(sum(pf.frp) filter (where pf.dist <= pf.footprint), 0)::numeric, 1) as on_frp,
    count(distinct pf.d) filter (where pf.dist <= pf.footprint) as on_days
from pf
join places p on p.id = pf.id
left join wilayas w on w.code = p.wilaya_code
group by p.id, p.name, p.name_ar, p.name_en, p.place_type, p.population,
         p.lng, p.lat, p.wilaya_code, w.name, w.name_ar
having min(pf.dist) <= $1::float8
"""

# A community is "severe" (likely damaged) when confirmed fire landed on its
# footprint across at least this many satellite passes — not a single, possibly
# adjacent, pixel. Two+ passes = the fire genuinely engaged the settlement.
_SEVERE_MIN_HITS = 2
# Cap the severe list so the UI focuses on the worst-hit communities.
_SEVERE_CAP = 100


async def communities_at_risk(
    immediate_m: int = 3000, warning_m: int = 10000, window_hours: int = 96
) -> dict:
    """Inhabited places within `warning_m` of a confirmed fire in the last
    `window_hours` (default 4 days). Tiered:
      * severe   — fire landed ON the settlement across >= _SEVERE_MIN_HITS passes
                   (likely damaged); ranked by a damage score (cumulative FRP on
                   the settlement, weighted by days it burned), capped to top 100.
      * immediate — nearest fire within immediate_m.
      * warning   — within warning_m.
    """
    import math
    from datetime import datetime, timezone

    pool = await get_pool()
    if pool is None:
        return {"enabled": False}

    async with pool.acquire() as conn:
        rows = await conn.fetch(_AT_RISK_SQL, float(warning_m), int(window_hours))

    communities = []
    for r in rows:
        on_hits = r["on_hits"] or 0
        on_frp = float(r["on_frp"] or 0)
        on_days = r["on_days"] or 0
        # Damage score: total fire power that fell on the settlement, amplified by
        # how many days it kept burning there (persistence => more destruction).
        damage_score = round(on_frp * (1 + math.log1p(on_days)), 1) if on_hits >= _SEVERE_MIN_HITS else 0.0
        communities.append({
            "id": r["id"],
            "name": r["name"],
            "name_ar": r["name_ar"],
            "name_en": r["name_en"],
            "place_type": r["place_type"],
            "population": r["population"],
            "lng": r["lng"],
            "lat": r["lat"],
            "wilaya_code": r["wilaya_code"],
            "wilaya_name": r["wilaya_name"],
            "wilaya_name_ar": r["wilaya_name_ar"],
            "nearest_fire_m": r["nearest_m"],
            "fires_nearby": r["fires_nearby"],
            "max_frp_nearby": float(r["max_frp_nearby"]) if r["max_frp_nearby"] is not None else None,
            "on_hits": on_hits,
            "on_frp": on_frp,
            "on_days": on_days,
            "damage_score": damage_score,
        })

    # Flag the worst-hit communities as "severe": on-settlement fire over >= N
    # passes, then the top _SEVERE_CAP by damage score. The rest tier by distance.
    severe_ids = {
        c["id"] for c in sorted(
            (c for c in communities if c["on_hits"] >= _SEVERE_MIN_HITS),
            key=lambda c: c["damage_score"], reverse=True,
        )[:_SEVERE_CAP]
    }
    severe = immediate = warning = 0
    for c in communities:
        if c["id"] in severe_ids:
            c["tier"] = "severe"; severe += 1
        elif c["nearest_fire_m"] <= immediate_m:
            c["tier"] = "immediate"; immediate += 1
        else:
            c["tier"] = "warning"; warning += 1

    # Order: severe first (worst damage first), then by nearest fire.
    tier_rank = {"severe": 0, "immediate": 1, "warning": 2}
    communities.sort(key=lambda c: (
        tier_rank[c["tier"]],
        -c["damage_score"] if c["tier"] == "severe" else c["nearest_fire_m"],
    ))

    return {
        "enabled": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "immediate_m": immediate_m,
        "warning_m": warning_m,
        "window_hours": window_hours,
        # This is a satellite-derived early-warning / impact estimate, not an
        # official damage assessment — surfaced so the frontend shows the disclaimer.
        "advisory": True,
        "counts": {
            "severe": severe,
            "immediate": immediate,
            "warning": warning,
            "total": len(communities),
        },
        "communities": communities,
    }
