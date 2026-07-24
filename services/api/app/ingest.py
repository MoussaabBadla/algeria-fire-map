"""Ingestion: pull FIRMS → upsert detections → refresh fire_events.

Runs on an in-process APScheduler loop inside the FastAPI service (only when
INGEST_ENABLED=true, i.e. on the Railway deployment — not on every dev machine).
Ingest is the only writer to the DB; the map endpoints stay read-only.
"""
from __future__ import annotations

import logging

from .cluster import recluster
from .config import get_settings
from .db import get_pool, upsert_detections
from .firms import fetch_fires_geojson

log = logging.getLogger("ingest")

_scheduler = None


async def ingest_once() -> dict:
    """One ingest cycle: fetch → upsert detections → recluster events."""
    settings = get_settings()
    pool = await get_pool()
    if pool is None:
        return {"ok": False, "reason": "no database configured"}
    if not settings.nasa_firms_map_key:
        return {"ok": False, "reason": "no FIRMS key configured"}

    fc = await fetch_fires_geojson(settings.nasa_firms_map_key, days=settings.ingest_days)
    features = fc.get("features", [])
    upserted = await upsert_detections(features)
    events = await recluster()
    log.info("ingest: fetched=%d upserted=%d active_events=%d", len(features), upserted, events.get("active", 0))
    return {"ok": True, "fetched": len(features), "upserted": upserted, **events}


def start_scheduler() -> None:
    """Start the interval ingest loop if enabled. Idempotent."""
    global _scheduler
    settings = get_settings()
    if not settings.ingest_enabled:
        log.info("ingest scheduler disabled (INGEST_ENABLED is false)")
        return
    if _scheduler is not None:
        return
    from apscheduler.schedulers.asyncio import AsyncIOScheduler

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        ingest_once,
        "interval",
        seconds=settings.ingest_interval_seconds,
        id="firms_ingest",
        max_instances=1,
        coalesce=True,
        next_run_time=None,  # first real run happens after one interval; kick a manual run at startup
    )
    _scheduler.start()
    log.info("ingest scheduler started (every %ds)", settings.ingest_interval_seconds)


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
