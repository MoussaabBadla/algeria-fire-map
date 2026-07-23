"""GET /fires — normalized active-fire GeoJSON for the northern-Algeria AOI.

Cache-aside on Redis/in-memory, keyed by day range, with an ETag (content
hash) so repeat polls get a cheap 304 Not Modified. FIRMS data changes only a
few times per day, so nearly every poll is a 304.
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Header, HTTPException, Query, Response

from ..cache import get_cache
from ..config import get_settings
from ..firms import fetch_fires_geojson

router = APIRouter()


def _etag(payload: str) -> str:
    return 'W/"' + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16] + '"'


@router.get("/fires")
async def get_fires(
    days: int = Query(1, ge=1, le=5, description="Look-back window in days (1-5; FIRMS caps at 5)."),
    if_none_match: str | None = Header(default=None),
) -> Response:
    settings = get_settings()
    if not settings.nasa_firms_map_key:
        raise HTTPException(
            status_code=503,
            detail="NASA_FIRMS_MAP_KEY not configured. Get a free key at "
            "https://firms.modaps.eosdis.nasa.gov/api/area/",
        )

    cache = get_cache()
    cache_key = f"fires:v2:days={days}"  # v2 = Algeria border clip
    ttl = settings.fires_cache_ttl

    body = await cache.get(cache_key)
    if body is None:
        geojson = await fetch_fires_geojson(settings.nasa_firms_map_key, days)
        body = json.dumps(geojson, separators=(",", ":"))
        await cache.set(cache_key, body, ttl)

    etag = _etag(body)
    headers = {
        "ETag": etag,
        "Cache-Control": f"public, s-maxage={ttl}, stale-while-revalidate=900",
    }

    # Conditional request → 304 when unchanged (near-free repeat polls).
    if if_none_match and if_none_match == etag:
        return Response(status_code=304, headers=headers)

    return Response(content=body, media_type="application/json", headers=headers)
