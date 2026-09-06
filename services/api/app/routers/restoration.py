"""GET /restoration — recent burn scars needing reforestation ("Green Recovery").

Post-fire restoration planning aid: recent burned areas (fire out), priority-scored,
with per-wilaya summary. A satellite-derived estimate, NOT an official burned-area
assessment. Cached a while — restoration data changes slowly (fires are already out)
and the union/area computation is heavy.
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Header, Query, Response

from ..cache import get_cache
from ..restoration import burn_scars

router = APIRouter()

_CACHE_PREFIX = "restoration:v2"  # v2 = + land cover (ESA WorldCover) & veg-weighted priority
_TTL = 1800  # 30 min — fires here are already out; no need to recompute often


def _etag(payload: str) -> str:
    return 'W/"' + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16] + '"'


@router.get("/restoration")
async def get_restoration(
    days: int = Query(default=120, ge=1, le=365),
    if_none_match: str | None = Header(default=None),
) -> Response:
    cache = get_cache()
    key = f"{_CACHE_PREFIX}:days={days}"
    body = await cache.get(key)
    if body is None:
        body = json.dumps(await burn_scars(window_days=days), separators=(",", ":"))
        await cache.set(key, body, _TTL)

    etag = _etag(body)
    headers = {"ETag": etag, "Cache-Control": f"public, s-maxage={_TTL}, stale-while-revalidate=600"}
    if if_none_match and if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
