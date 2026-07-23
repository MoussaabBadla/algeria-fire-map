"""GET /risk — per-wilaya Fire Weather Index (FWI) fire-danger.

Fetches Open-Meteo weather for every wilaya, spins up the FWI moisture codes,
and returns each wilaya's current FWI + danger class. Cached ~1 h (weather is
hourly). No training data needed — FWI is a physically-based index.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Response

from ..cache import get_cache
from ..fwi import DayWeather, compute_fwi
from ..weather import fetch_wilaya_weather

router = APIRouter()

RISK_TTL = 3600  # 1 hour


def _num(x, default=0.0) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _series_for(w: dict) -> list[DayWeather]:
    days: list[DayWeather] = []
    times = w.get("time", [])
    for i, iso in enumerate(times):
        try:
            month = datetime.fromisoformat(iso).month
        except ValueError:
            month = 7
        days.append(
            DayWeather(
                temp=_num(w["temp"][i] if i < len(w["temp"]) else 25),
                rh=max(1.0, min(100.0, _num(w["rh"][i] if i < len(w["rh"]) else 40, 40))),
                wind=_num(w["wind"][i] if i < len(w["wind"]) else 10),
                rain=_num(w["rain"][i] if i < len(w["rain"]) else 0),
                month=month,
            )
        )
    return days


@router.get("/risk")
async def get_risk() -> Response:
    cache = get_cache()
    body = await cache.get("risk:all")
    if body is None:
        weather = await fetch_wilaya_weather()
        wilayas = []
        for w in weather:
            series = _series_for(w)
            if not series:
                continue
            fwi = compute_fwi(series)
            last = series[-1]
            wilayas.append(
                {
                    "code": w["code"],
                    "name": w["name"],
                    "lat": w["lat"],
                    "lng": w["lng"],
                    "fwi": fwi["fwi"],
                    "class": fwi["class"],
                    "temp": round(last.temp, 1),
                    "rh": round(last.rh),
                    "wind": round(last.wind),
                }
            )
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "wilayas": sorted(wilayas, key=lambda x: x["fwi"], reverse=True),
        }
        body = json.dumps(payload, ensure_ascii=False)
        await cache.set("risk:all", body, RISK_TTL)

    return Response(content=body, media_type="application/json", headers={"Cache-Control": "public, s-maxage=3600"})
