"""GET /place — reverse-geocode a fire's coordinates to a human place.

Proxies OpenStreetMap Nominatim server-side (keeps a single origin + a proper
User-Agent) and caches results in Redis/memory for a long time, since a place
name for a coordinate doesn't change. Returns wilaya + nearest town.
"""
from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Query, Response

from ..cache import get_cache

router = APIRouter()

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
PLACE_TTL = 60 * 60 * 24 * 30  # 30 days
# Nominatim requires a descriptive User-Agent identifying the app.
UA = "AlgeriaFireMap/1.0 (https://algeria-fire-map.vercel.app)"


def _extract(addr: dict) -> dict:
    town = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("suburb")
        or addr.get("county")
    )
    return {
        "wilaya": addr.get("state") or addr.get("region"),
        "town": town,
        "district": addr.get("county") if town != addr.get("county") else None,
        "country": addr.get("country"),
    }


@router.get("/place")
async def get_place(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> Response:
    cache = get_cache()
    key = f"place:{lat:.3f},{lng:.3f}"  # ~100 m grid

    body = await cache.get(key)
    if body is None:
        params = {
            "format": "jsonv2",
            "lat": f"{lat}",
            "lon": f"{lng}",
            "zoom": "12",
            "accept-language": "fr",
        }
        result: dict
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(NOMINATIM, params=params, headers={"User-Agent": UA}, timeout=10.0)
                resp.raise_for_status()
                data = resp.json()
            result = _extract(data.get("address", {}))
            result["display"] = data.get("display_name")
        except (httpx.HTTPError, ValueError):
            result = {"wilaya": None, "town": None, "district": None, "country": None, "display": None}
        body = json.dumps(result, ensure_ascii=False)
        await cache.set(key, body, PLACE_TTL)

    return Response(content=body, media_type="application/json", headers={"Cache-Control": "public, max-age=86400"})
