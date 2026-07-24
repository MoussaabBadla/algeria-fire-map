"""Postgres/PostGIS access via an asyncpg pool (Supabase).

Graceful degradation: if DATABASE_URL is unset or asyncpg is unavailable, the
pool is simply absent and callers no-op — the API keeps serving the live FIRMS
passthrough exactly as before. Persistence is additive, never load-bearing for
the map's core availability.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Optional

from .config import get_settings

try:  # asyncpg is optional at import time (mirrors the redis pattern in cache.py)
    import asyncpg
except Exception:  # pragma: no cover
    asyncpg = None  # type: ignore

_pool: "Optional[asyncpg.Pool]" = None
_lock = asyncio.Lock()


async def get_pool() -> "Optional[asyncpg.Pool]":
    """Lazily create (once) and return the connection pool, or None if disabled."""
    global _pool
    if _pool is not None:
        return _pool
    settings = get_settings()
    if not settings.database_url or asyncpg is None:
        return None
    async with _lock:
        if _pool is None:
            _pool = await asyncpg.create_pool(
                settings.database_url,
                min_size=1,
                max_size=5,
                command_timeout=30,
                # statement_cache_size=0 keeps us compatible with Supavisor's
                # transaction-mode pooler too, at a negligible cost in session mode.
                statement_cache_size=0,
            )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def db_healthy() -> bool:
    pool = await get_pool()
    if pool is None:
        return False
    try:
        async with pool.acquire() as conn:
            return (await conn.fetchval("select 1")) == 1
    except Exception:
        return False


# Insert one detection, assigning the nearest wilaya via KNN (<->) on the seeded
# centroids (matches the frontend's nearest-centroid assignment). Dedup on the
# unique (satellite, acq_datetime, lat, lng) index — a re-reported pixel is a no-op.
_UPSERT_SQL = """
insert into detections
    (geom, lng, lat, frp, confidence, brightness, acq_datetime,
     satellite, instrument, daynight, source, wilaya_code)
values
    (ST_SetSRID(ST_MakePoint($1, $2), 4326), $1, $2, $3, $4, $5, $6,
     $7, $8, $9, $10,
     (select code from wilayas
       order by geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) limit 1))
on conflict (satellite, acq_datetime, lat, lng) do nothing
"""


def _feature_to_params(f: dict) -> Optional[tuple]:
    """GeoJSON fire Feature → asyncpg params tuple, or None if unusable."""
    try:
        lng, lat = f["geometry"]["coordinates"]
    except (KeyError, ValueError, TypeError):
        return None
    p = f.get("properties", {})
    iso = p.get("acq_datetime")
    if not iso:
        return None  # acq_datetime is part of the dedup key — required
    try:
        acq = datetime.fromisoformat(iso)
    except (ValueError, TypeError):
        return None
    sat = p.get("satellite") or ""
    if not sat:
        return None  # satellite is part of the dedup key — required
    return (
        float(lng),
        float(lat),
        _to_float(p.get("frp")),
        p.get("confidence"),
        _to_float(p.get("brightness")),
        acq,
        sat,
        p.get("instrument"),
        p.get("daynight"),
        p.get("source"),
    )


def _to_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (ValueError, TypeError):
        return None


async def upsert_detections(features: list[dict]) -> int:
    """Bulk-upsert detection features. Returns the number of rows attempted
    (dedup no-ops are not distinguished — good enough for a change signal)."""
    pool = await get_pool()
    if pool is None or not features:
        return 0
    params = [p for p in (_feature_to_params(f) for f in features) if p is not None]
    if not params:
        return 0
    async with pool.acquire() as conn:
        await conn.executemany(_UPSERT_SQL, params)
    return len(params)
