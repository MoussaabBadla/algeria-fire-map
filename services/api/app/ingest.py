"""Ingestion: pull FIRMS → upsert detections → refresh fire_events.

Runs on an in-process APScheduler loop inside the FastAPI service (only when
INGEST_ENABLED=true, i.e. on the Railway deployment — not on every dev machine).
Ingest is the only writer to the DB; the map endpoints stay read-only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from .cluster import recluster
from .config import get_settings
from .db import get_pool, upsert_detections
from .firms import fetch_fires_geojson
from .stats import refresh_stats

log = logging.getLogger("ingest")

_scheduler = None
# Last successful cycle, surfaced by /health as a scheduler-liveness signal.
# None until the first cycle completes; if it stops advancing, ingestion stalled.
_last_ingest: dict | None = None


def get_last_ingest() -> dict | None:
    """The most recent successful ingest cycle (or None), for /health."""
    return _last_ingest


async def ingest_once() -> dict:
    """One ingest cycle: fetch → upsert detections → recluster events."""
    global _last_ingest
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
    await refresh_stats()
    log.info("ingest: fetched=%d upserted=%d active_events=%d", len(features), upserted, events.get("active", 0))
    _last_ingest = {
        "at": datetime.now(timezone.utc).isoformat(),
        "fetched": len(features),
        "upserted": upserted,
        "active_events": events.get("active", 0),
    }
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
        # Run once at startup, then every interval. NOTE: passing next_run_time=None
        # here adds the job PAUSED (APScheduler only auto-computes a first fire time
        # when the attribute is absent, not when it is None) — that silently disabled
        # ingestion. An explicit start time both fixes the pause and kicks an
        # immediate first run so a fresh deploy doesn't wait a full interval.
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    log.info("ingest scheduler started (every %ds)", settings.ingest_interval_seconds)


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
