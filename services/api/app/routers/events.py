"""GET /events — clustered fire incidents (fire_events) as GeoJSON.

Each feature is an incident: centroid geometry + lifespan/intensity properties
and (when available) the affected-area hull. Backed by Postgres; returns an
empty FeatureCollection when persistence isn't configured, so the frontend can
call it unconditionally.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Query, Response

from ..db import get_pool

router = APIRouter()

_LIST_SQL = """
select
    e.id,
    ST_X(e.centroid) as lng,
    ST_Y(e.centroid) as lat,
    case when e.hull is not null then ST_AsGeoJSON(e.hull) end as hull_json,
    e.first_seen, e.last_seen, e.detection_count,
    e.max_frp, e.total_frp, e.is_active,
    e.wilaya_code, w.name as wilaya_name, w.name_ar as wilaya_name_ar
from fire_events e
left join wilayas w on w.code = e.wilaya_code
where ($1::boolean is false or e.is_active)
  and ($2::int is null or e.wilaya_code = $2)
  and ($3::timestamptz is null or e.last_seen >= $3)
order by e.last_seen desc
limit $4
"""


@router.get("/events")
async def get_events(
    active_only: bool = Query(False, description="Only incidents seen within the active window."),
    wilaya: int | None = Query(None, description="Filter to a wilaya code."),
    days: int | None = Query(None, ge=1, le=3650, description="Only incidents seen in the last N days."),
    limit: int = Query(500, ge=1, le=5000),
) -> Response:
    pool = await get_pool()
    if pool is None:
        empty = {"type": "FeatureCollection", "features": [], "properties": {"count": 0, "enabled": False}}
        return Response(content=json.dumps(empty), media_type="application/json")

    since = None
    if days is not None:
        # Compute the cutoff in SQL to avoid clock/timezone drift in the app.
        async with pool.acquire() as conn:
            since = await conn.fetchval("select now() - make_interval(days => $1::int)", days)

    async with pool.acquire() as conn:
        rows = await conn.fetch(_LIST_SQL, active_only, wilaya, since, limit)

    features = []
    for r in rows:
        props = {
            "id": r["id"],
            "first_seen": r["first_seen"].isoformat() if r["first_seen"] else None,
            "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
            "detection_count": r["detection_count"],
            "max_frp": r["max_frp"],
            "total_frp": r["total_frp"],
            "is_active": r["is_active"],
            "wilaya_code": r["wilaya_code"],
            "wilaya_name": r["wilaya_name"],
            "wilaya_name_ar": r["wilaya_name_ar"],
        }
        if r["hull_json"]:
            props["hull"] = json.loads(r["hull_json"])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": props,
        })

    fc = {
        "type": "FeatureCollection",
        "features": features,
        "properties": {"count": len(features), "enabled": True},
    }
    return Response(content=json.dumps(fc, separators=(",", ":")), media_type="application/json")
