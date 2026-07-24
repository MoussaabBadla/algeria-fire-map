"""FastAPI entry point — the single backend for Algeria Fire Map.

Owns all data endpoints and (later) ingestion, geospatial, and AI. Holds all
secrets (FIRMS key, DB, etc.); the Next.js frontend is stateless and only
calls this API.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import close_pool, db_healthy
from .ingest import ingest_once, shutdown_scheduler, start_scheduler
from .routers import events, fires, place, risk

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


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {
        "status": "ok",
        "firms_key_configured": bool(settings.nasa_firms_map_key),
        "db_connected": await db_healthy(),
        "ingest_enabled": settings.ingest_enabled,
    }


@app.post("/admin/ingest", tags=["meta"])
async def admin_ingest(x_admin_token: str | None = Header(default=None)) -> dict:
    """Manually trigger one ingest cycle. Guarded by ADMIN_TOKEN when set."""
    if settings.admin_token:
        if x_admin_token != settings.admin_token:
            raise HTTPException(status_code=401, detail="invalid admin token")
    elif settings.ingest_enabled:
        # Never leave a live ingest-enabled deploy with an unprotected trigger.
        raise HTTPException(status_code=403, detail="ADMIN_TOKEN not configured")
    return await ingest_once()
