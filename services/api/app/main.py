"""FastAPI entry point — the single backend for Algeria Fire Map.

Owns all data endpoints and (later) ingestion, geospatial, and AI. Holds all
secrets (FIRMS key, DB, etc.); the Next.js frontend is stateless and only
calls this API.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import fires, place

settings = get_settings()

app = FastAPI(
    title="Algeria Fire Map API",
    version="0.1.0",
    description="Wildfire monitoring API for Algeria (NASA FIRMS + more).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
    expose_headers=["ETag"],
)

app.include_router(fires.router, tags=["fires"])
app.include_router(place.router, tags=["place"])


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "firms_key_configured": bool(settings.nasa_firms_map_key)}
