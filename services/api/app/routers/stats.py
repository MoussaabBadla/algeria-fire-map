"""GET /stats — national wildfire statistics for Algeria.

Reads the precomputed monthly rollup, cached in Redis/in-memory (refreshed by
the ingest cron), with an ETag so repeat loads get a cheap 304.
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Header, Response

from ..cache import get_cache
from ..stats import national_summary

router = APIRouter()

_CACHE_KEY = "stats:national:v1"
_TTL = 900  # 15 min; the underlying data changes only a few times/day


def _etag(payload: str) -> str:
    return 'W/"' + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16] + '"'


@router.get("/stats")
async def get_stats(if_none_match: str | None = Header(default=None)) -> Response:
    cache = get_cache()
    body = await cache.get(_CACHE_KEY)
    if body is None:
        summary = await national_summary()
        body = json.dumps(summary, separators=(",", ":"))
        await cache.set(_CACHE_KEY, body, _TTL)

    etag = _etag(body)
    headers = {"ETag": etag, "Cache-Control": f"public, s-maxage={_TTL}, stale-while-revalidate=900"}
    if if_none_match and if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
