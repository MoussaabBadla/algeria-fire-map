"""GET /forecast — ML next-day fire-risk per grid cell (GeoJSON).

Reads the daily `cell_risk` predictions (written by predict.predict_all). A
data-driven, satellite-history + terrain model — a planning aid, not a guarantee.
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Header, Query, Response

from ..cache import get_cache
from ..db import get_pool

router = APIRouter()

_CACHE_KEY = "forecast:v1"
_TTL = 900  # 15 min


def _etag(payload: str) -> str:
    return 'W/"' + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16] + '"'


async def _build(min_class: str | None) -> dict:
    pool = await get_pool()
    if pool is None:
        return {"type": "FeatureCollection", "features": [], "properties": {"enabled": False}}
    order = {"very-low": 0, "low": 1, "moderate": 2, "high": 3, "very-high": 4, "extreme": 5}
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "select cell_id, lat, lng, day, prob, risk_class from cell_risk"
        )
    day = None
    feats = []
    floor = order.get(min_class or "", 0)
    for r in rows:
        if order.get(r["risk_class"], 0) < floor:
            continue
        day = r["day"].isoformat() if r["day"] else day
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": {
                "cell_id": r["cell_id"],
                "prob": round(float(r["prob"]), 4),
                "class": r["risk_class"],
            },
        })
    return {
        "type": "FeatureCollection",
        "features": feats,
        "properties": {"enabled": True, "day": day, "count": len(feats),
                       "advisory": True},
    }


@router.get("/forecast")
async def get_forecast(
    min_class: str | None = Query(default=None),
    if_none_match: str | None = Header(default=None),
) -> Response:
    cache = get_cache()
    key = f"{_CACHE_KEY}:{min_class or 'all'}"
    body = await cache.get(key)
    if body is None:
        body = json.dumps(await _build(min_class), separators=(",", ":"))
        await cache.set(key, body, _TTL)
    etag = _etag(body)
    headers = {"ETag": etag, "Cache-Control": f"public, s-maxage={_TTL}, stale-while-revalidate=600"}
    if if_none_match and if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
