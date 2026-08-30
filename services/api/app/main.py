"""FastAPI entry point — the single backend for Algeria Fire Map.

Owns all data endpoints and (later) ingestion, geospatial, and AI. Holds all
secrets (FIRMS key, DB, etc.); the Next.js frontend is stateless and only
calls this API.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import close_pool, db_healthy, latest_detection_at
from .grid import seed_grid
from .ingest import get_last_ingest, ingest_once, shutdown_scheduler, start_scheduler
from .places import seed_places
from .routers import at_risk, events, fires, place, risk, stats

# A day with zero new detections means ingestion has almost certainly stalled
# (Algeria sees fires or at least ag-burns most days in season, and NRT latency
# is only a few hours). Generous enough to avoid false alarms from a quiet night.
_STALE_AFTER_HOURS = 24

logging.basicConfig(level=logging.INFO)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the ingest scheduler (no-op unless INGEST_ENABLED=true).
    start_scheduler()
    yield
    shutdown_scheduler()
    await close_pool()


app = FastAPI(
    title="Algeria Fire Map API",
    version="0.2.0",
    description="Wildfire monitoring API for Algeria (NASA FIRMS + more).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["ETag"],
)

app.include_router(fires.router, tags=["fires"])
app.include_router(place.router, tags=["place"])
app.include_router(risk.router, tags=["risk"])
app.include_router(events.router, tags=["events"])
app.include_router(stats.router, tags=["stats"])
app.include_router(at_risk.router, tags=["at-risk"])


def _require_admin(x_admin_token: str | None) -> None:
    """Guard admin endpoints: require ADMIN_TOKEN when set, and never allow an
    unprotected trigger on a live ingest-enabled deploy."""
    if settings.admin_token:
        if x_admin_token != settings.admin_token:
            raise HTTPException(status_code=401, detail="invalid admin token")
    elif settings.ingest_enabled:
        raise HTTPException(status_code=403, detail="ADMIN_TOKEN not configured")


@app.get("/health", tags=["meta"])
async def health() -> dict:
    """Liveness + data-freshness. `ingest_stale` flips true when the newest
    detection is older than a day, so a stalled ingest surfaces instead of
    hiding behind a green status (as it did before the scheduler fix)."""
    last_det = await latest_detection_at()
    age_hours = None
    if last_det is not None:
        if last_det.tzinfo is None:
            last_det = last_det.replace(tzinfo=timezone.utc)
        age_hours = round((datetime.now(timezone.utc) - last_det).total_seconds() / 3600, 1)
    return {
        "status": "ok",
        "firms_key_configured": bool(settings.nasa_firms_map_key),
        "db_connected": await db_healthy(),
        "ingest_enabled": settings.ingest_enabled,
        "last_detection": last_det.isoformat() if last_det else None,
        "data_age_hours": age_hours,
        "ingest_stale": bool(
            settings.ingest_enabled and age_hours is not None and age_hours > _STALE_AFTER_HOURS
        ),
        "last_ingest": get_last_ingest(),
    }


@app.post("/admin/ingest", tags=["meta"])
async def admin_ingest(x_admin_token: str | None = Header(default=None)) -> dict:
    """Manually trigger one ingest cycle. Guarded by ADMIN_TOKEN when set."""
    _require_admin(x_admin_token)
    return await ingest_once()


@app.post("/admin/backfill", tags=["meta"])
async def admin_backfill(
    start: str,
    end: str,
    sources: str | None = None,
    x_admin_token: str | None = Header(default=None),
) -> dict:
    """Backfill detections for a date range (fills gaps if ingestion ever lapsed).
    start/end are YYYY-MM-DD (end exclusive). `sources` defaults to the recent-NRT
    trio for filling recent gaps; pass the SP archive trio for deep history.
    Dedup-safe (overlap is a no-op). Guarded like /admin/ingest."""
    _require_admin(x_admin_token)
    from datetime import date

    from .backfill import run_backfill
    from .firms import SOURCES  # NRT trio — the right default for recent gaps

    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="start/end must be YYYY-MM-DD")
    if e <= s:
        raise HTTPException(status_code=400, detail="end must be after start")
    src = tuple(x.strip() for x in sources.split(",") if x.strip()) if sources else tuple(SOURCES)
    return await run_backfill(
        s, e, src, summer_only=False, summer_first=False, recluster_after=True
    )


@app.post("/admin/seed-grid", tags=["meta"])
async def admin_seed_grid(x_admin_token: str | None = Header(default=None)) -> dict:
    """Seed the ML training grid (grid_cells). Idempotent. Guarded like /admin/ingest."""
    _require_admin(x_admin_token)
    return await seed_grid()


@app.post("/admin/seed-places", tags=["meta"])
async def admin_seed_places(x_admin_token: str | None = Header(default=None)) -> dict:
    """Seed/refresh populated places from OSM (for /at-risk). Idempotent. Guarded."""
    _require_admin(x_admin_token)
    return await seed_places()
