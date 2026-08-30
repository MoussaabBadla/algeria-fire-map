"""Tiny cache abstraction: Redis if REDIS_URL is set, else in-memory.

This keeps local dev dependency-free (no Redis needed) while the same code
path uses Railway/managed Redis in production.
"""
from __future__ import annotations

import time
from typing import Optional

from .config import get_settings

try:  # redis is optional at import time
    from redis import asyncio as aioredis
except Exception:  # pragma: no cover
    aioredis = None  # type: ignore


class _MemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, str]] = {}

    async def get(self, key: str) -> Optional[str]:
        item = self._store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < time.time():
            self._store.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: str, ttl: int) -> None:
        self._store[key] = (time.time() + ttl, value)

    async def delete(self, *keys: str) -> None:
        for k in keys:
            self._store.pop(k, None)

    async def delete_prefix(self, prefix: str) -> None:
        for k in [k for k in self._store if k.startswith(prefix)]:
            self._store.pop(k, None)


class _RedisCache:
    def __init__(self, url: str) -> None:
        self._redis = aioredis.from_url(url, decode_responses=True)

    async def get(self, key: str) -> Optional[str]:
        try:
            return await self._redis.get(key)
        except Exception:
            return None

    async def set(self, key: str, value: str, ttl: int) -> None:
        try:
            await self._redis.set(key, value, ex=ttl)
        except Exception:
            pass

    async def delete(self, *keys: str) -> None:
        try:
            if keys:
                await self._redis.delete(*keys)
        except Exception:
            pass

    async def delete_prefix(self, prefix: str) -> None:
        try:
            async for key in self._redis.scan_iter(match=f"{prefix}*"):
                await self._redis.delete(key)
        except Exception:
            pass


_cache: Optional[_MemoryCache | _RedisCache] = None


def get_cache() -> _MemoryCache | _RedisCache:
    global _cache
    if _cache is None:
        url = get_settings().redis_url
        if url and aioredis is not None:
            _cache = _RedisCache(url)
        else:
            _cache = _MemoryCache()
    return _cache
