"""NASA FIRMS active-fire ingestion → normalized GeoJSON.

We query the FIRMS *Area API* (CSV) for the northern-Algeria AOI, combining
several satellites for coverage, then normalize into a single GeoJSON
FeatureCollection. The MAP_KEY never leaves the backend.

FIRMS Area API shape:
  https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{BBOX}/{DAY_RANGE}
  BBOX = west,south,east,north
"""
from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime, timezone

import httpx
from shapely.geometry import Point, shape
from shapely.prepared import prep

# Algeria border polygon — used to clip out fires that fall in neighbouring
# countries (a bounding box can't match the country shape, so e.g. Tunisian
# border fires were being counted toward Souk Ahras). Small outward buffer
# keeps genuine Algerian border fires despite polygon simplification.
_BORDER_PATH = os.path.join(os.path.dirname(__file__), "algeria_border.json")
with open(_BORDER_PATH, encoding="utf-8") as _bf:
    _ALGERIA = prep(shape(json.load(_bf)).buffer(0.01))


def _in_algeria(lng: float, lat: float) -> bool:
    return _ALGERIA.contains(Point(lng, lat))

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

# Satellites: VIIRS (375 m, higher resolution) on NOAA-20/21 & SNPP, plus MODIS (1 km).
SOURCES: tuple[str, ...] = (
    "VIIRS_NOAA20_NRT",
    "VIIRS_SNPP_NRT",
    "MODIS_NRT",
)

# AOI = fire-prone NORTHERN Algeria only. This deliberately excludes the Sahara,
# whose persistent FIRMS detections are mostly industrial gas flares (Hassi
# Messaoud / R'Mel), not wildfires. Format: west,south,east,north
AOI_BBOX = "-8.7,32.0,12.0,37.1"


def _normalize_confidence(raw: str) -> str:
    """VIIRS uses low/nominal/high (l/n/h); MODIS uses 0-100. → low|nominal|high."""
    raw = (raw or "").strip().lower()
    if raw in ("l", "low"):
        return "low"
    if raw in ("n", "nominal"):
        return "nominal"
    if raw in ("h", "high"):
        return "high"
    # MODIS numeric percentage
    try:
        pct = float(raw)
        if pct < 30:
            return "low"
        if pct < 80:
            return "nominal"
        return "high"
    except ValueError:
        return "nominal"


def _acq_datetime_iso(acq_date: str, acq_time: str) -> str | None:
    """FIRMS acq_date=YYYY-MM-DD, acq_time=HHMM (UTC) → ISO 8601 UTC string."""
    try:
        t = acq_time.strip().zfill(4)
        dt = datetime.strptime(f"{acq_date.strip()} {t}", "%Y-%m-%d %H%M")
        return dt.replace(tzinfo=timezone.utc).isoformat()
    except (ValueError, AttributeError):
        return None


def _row_to_feature(row: dict[str, str]) -> dict | None:
    try:
        lon = round(float(row["longitude"]), 5)
        lat = round(float(row["latitude"]), 5)
    except (KeyError, ValueError, TypeError):
        return None

    # VIIRS reports FRP; brightness field differs (bright_ti4 vs brightness).
    frp = row.get("frp") or "0"
    try:
        frp_val = round(float(frp), 1)
    except ValueError:
        frp_val = 0.0

    brightness = row.get("bright_ti4") or row.get("brightness") or None

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "frp": frp_val,
            "confidence": _normalize_confidence(row.get("confidence", "")),
            "acq_datetime": _acq_datetime_iso(row.get("acq_date", ""), row.get("acq_time", "")),
            "satellite": row.get("satellite", ""),
            "instrument": row.get("instrument", ""),
            "daynight": row.get("daynight", ""),
            "brightness": float(brightness) if brightness else None,
        },
    }


def _parse_csv(text: str) -> list[dict]:
    # FIRMS returns an error string (not CSV) on bad key / no data; guard against it.
    if not text or "," not in text.splitlines()[0]:
        return []
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "latitude" not in reader.fieldnames:
        return []
    features = (_row_to_feature(r) for r in reader)
    return [f for f in features if f is not None]


async def _fetch_source(client: httpx.AsyncClient, map_key: str, source: str, days: int) -> list[dict]:
    url = f"{FIRMS_BASE}/{map_key}/{source}/{AOI_BBOX}/{days}"
    try:
        resp = await client.get(url, timeout=30.0)
        resp.raise_for_status()
        return _parse_csv(resp.text)
    except (httpx.HTTPError, httpx.TimeoutException):
        # A single failing source is skipped, not fatal.
        return []


async def fetch_fires_geojson(map_key: str, days: int = 1) -> dict:
    """Fetch all sources in parallel and merge into one FeatureCollection."""
    # FIRMS Area API caps DAY_RANGE at 5; higher values return no data.
    days = max(1, min(days, 5))
    async with httpx.AsyncClient() as client:
        results: list[list[dict]] = []
        # Fetch sources concurrently.
        import asyncio

        results = await asyncio.gather(
            *(_fetch_source(client, map_key, src, days) for src in SOURCES)
        )

    features: list[dict] = []
    for source_features in results:
        features.extend(source_features)

    # Clip to Algeria's actual borders (drops neighbouring-country fires).
    features = [f for f in features if _in_algeria(f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1])]

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "days": days,
            "count": len(features),
            "sources": list(SOURCES),
            "aoi_bbox": AOI_BBOX,
        },
    }
