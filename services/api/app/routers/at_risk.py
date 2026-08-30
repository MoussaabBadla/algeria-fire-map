"""GET /at-risk — inhabited places near recent fires ("Communities at risk").

A satellite-derived early-warning aid (FIRMS detections + OSM settlements), NOT an
official evacuation source. Cached briefly so it stays close to live as fires move.
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Header, Response

from ..cache import get_cache
from ..places import communities_at_risk

router = APIRouter()

_CACHE_KEY = "at_risk:v3"  # v3 = + severe (likely-damaged) tier & damage score
_TTL = 300  # 5 min — detections refresh on the ~15-min ingest; keeps it near-live


def _etag(payload: str) -> str:
    return 'W/"' + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16] + '"'


@router.get("/at-risk")
async def get_at_risk(if_none_match: str | None = Header(default=None)) -> Response:
    cache = get_cache()
    body = await cache.get(_CACHE_KEY)
    if body is None:
        body = json.dumps(await communities_at_risk(), separators=(",", ":"))
        await cache.set(_CACHE_KEY, body, _TTL)

    etag = _etag(body)
    headers = {"ETag": etag, "Cache-Control": f"public, s-maxage={_TTL}, stale-while-revalidate=300"}
    if if_none_match and if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
