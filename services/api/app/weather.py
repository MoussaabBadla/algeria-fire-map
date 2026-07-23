"""Batch weather fetch from Open-Meteo (free, no key) for all wilayas.

One multi-location call returns ~14 days of daily weather per wilaya, which we
feed into the FWI spin-up. Daily max-temp / min-RH / max-wind approximate the
noon conditions the FWI system expects during fire season.
"""
from __future__ import annotations

import asyncio

import httpx

from .wilayas import WILAYAS

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
DAILY = "temperature_2m_max,relative_humidity_2m_min,wind_speed_10m_max,precipitation_sum"
CHUNK = 20  # Open-Meteo rejects very large multi-location batches.


async def _fetch_chunk(client: httpx.AsyncClient, group: list[tuple]) -> list[dict]:
    params = {
        "latitude": ",".join(f"{w[2]}" for w in group),
        "longitude": ",".join(f"{w[3]}" for w in group),
        "daily": DAILY,
        "past_days": 14,
        "forecast_days": 1,
        "timezone": "Africa/Algiers",
    }
    resp = await client.get(OPEN_METEO, params=params, timeout=30.0)
    resp.raise_for_status()
    data = resp.json()
    locations = data if isinstance(data, list) else [data]
    out: list[dict] = []
    for i, w in enumerate(group):
        daily = (locations[i] if i < len(locations) else {}).get("daily", {})
        out.append(
            {
                "code": w[0],
                "name": w[1],
                "lat": w[2],
                "lng": w[3],
                "time": daily.get("time", []),
                "temp": daily.get("temperature_2m_max", []),
                "rh": daily.get("relative_humidity_2m_min", []),
                "wind": daily.get("wind_speed_10m_max", []),
                "rain": daily.get("precipitation_sum", []),
            }
        )
    return out


async def fetch_wilaya_weather() -> list[dict]:
    """Return one dict per wilaya with parallel daily arrays. Chunked + concurrent."""
    groups = [WILAYAS[i : i + CHUNK] for i in range(0, len(WILAYAS), CHUNK)]
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*(_fetch_chunk(client, g) for g in groups))
    out: list[dict] = []
    for r in results:
        out.extend(r)
    return out
