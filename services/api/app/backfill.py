"""Historical FIRMS backfill → detections (for AI training + long-term stats).

Pulls past years of active-fire detections from the FIRMS **archive** (SP =
Standard Processing) sources over the northern-Algeria AOI, border-clips them,
and upserts into `detections` (same dedup path as live ingest). Designed to
grab as much history as possible — with an emphasis on summer fire seasons.

Key ideas
---------
* **Archive sources** (`*_SP`) cover the deep past; live NRT covers only ~2
  recent months. The `detections` dedup index makes overlap harmless.
* **Multi-key pool** — each MAP_KEY is an independent ~5000-transactions/10-min
  quota bucket. Windows are sharded across keys and run concurrently, one
  in-flight request per key, so N keys ≈ N× throughput.
* **Resumable** — every completed (source, window) is checkpointed in
  `backfill_progress`; a re-run skips them and only fetches what's missing.
* **Summer-first** — `--summer` restricts to (or `--summer-first` prioritizes)
  the Jun–Oct fire season, the highest-signal data for models and stats.

Run (locally or as a Railway one-off), with the key pool in the environment:

    python -m app.backfill --start 2019-01-01 --end 2025-06-01 --summer

Env: DATABASE_URL, NASA_FIRMS_MAP_KEY (+ NASA_FIRMS_MAP_KEYS="k2,k3,...").
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta

import httpx

from .cluster import recluster
from .config import get_settings
from .db import get_pool, upsert_detections
from .firms import AOI_BBOX, FIRMS_BASE, _in_algeria, _parse_csv

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backfill")

# FIRMS archive (Standard Processing) products — the full historical record.
ARCHIVE_SOURCES = ("VIIRS_NOAA20_SP", "VIIRS_SNPP_SP", "MODIS_SP")

# FIRMS Area API caps a single request (archive or NRT) at 5 days.
CHUNK_DAYS = 5
# Algeria's wildfire season (inclusive months). Peaks Jul–Aug.
SUMMER_MONTHS = {6, 7, 8, 9, 10}
# Politeness delay between consecutive requests on the SAME key (well under the
# 5000/10min = ~8.3/s ceiling).
PER_KEY_DELAY_S = 1.0


def _windows(start: date, end: date) -> list[date]:
    """Chunk [start, end) into CHUNK_DAYS-aligned window-start dates."""
    out: list[date] = []
    d = start
    while d < end:
        out.append(d)
        d += timedelta(days=CHUNK_DAYS)
    return out


def _summer_key(win_start: date) -> tuple:
    """Sort key that floats summer windows to the front, newest-first within."""
    is_summer = win_start.month in SUMMER_MONTHS
    return (0 if is_summer else 1, -win_start.toordinal())


def _plan(start: date, end: date, sources, summer_only: bool, summer_first: bool,
          avail: dict[str, tuple[date, date]] | None = None):
    """Build the (source, window_start) work list, filtered/ordered as requested.
    Clamps each source to its availability window when `avail` is provided."""
    avail = avail or {}
    jobs = []
    for src in sources:
        s, e = start, end
        if src in avail:
            lo, hi = avail[src]
            s = max(s, lo)
            e = min(e, hi + timedelta(days=1))  # hi is inclusive
            if s >= e:
                log.info("skip %s — no availability in [%s, %s)", src, start, end)
                continue
        for w in _windows(s, e):
            if summer_only and w.month not in SUMMER_MONTHS:
                # Skip a window only if it lies entirely outside summer.
                if (w + timedelta(days=CHUNK_DAYS - 1)).month not in SUMMER_MONTHS:
                    continue
            jobs.append((src, w))
    if summer_first:
        jobs.sort(key=lambda j: _summer_key(j[1]))
    else:
        jobs.sort(key=lambda j: (-j[1].toordinal()))  # newest-first
    return jobs


async def _availability(key: str) -> dict[str, tuple[date, date]]:
    """FIRMS data_availability → {source: (min_date, max_date)}. Lets us clamp
    each source's windows to when its satellite actually has data (no wasted
    requests / 400s before a sensor came online)."""
    url = f"https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{key}/all"
    out: dict[str, tuple[date, date]] = {}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=30.0)
            resp.raise_for_status()
        for line in resp.text.splitlines()[1:]:
            parts = line.split(",")
            if len(parts) >= 3:
                try:
                    out[parts[0]] = (_parse_date(parts[1]), _parse_date(parts[2]))
                except ValueError:
                    continue
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        log.warning("data_availability lookup failed (%s); not clamping", e)
    return out


async def _already_done(pool) -> set[tuple]:
    async with pool.acquire() as conn:
        rows = await conn.fetch("select source, window_start from backfill_progress")
    return {(r["source"], r["window_start"]) for r in rows}


async def _mark_done(pool, source: str, w: date, days: int, n: int) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """insert into backfill_progress (source, window_start, window_days, detections)
               values ($1, $2, $3, $4)
               on conflict (source, window_start)
               do update set window_days = excluded.window_days,
                             detections  = excluded.detections,
                             fetched_at  = now()""",
            source, w, days, n,
        )


async def _fetch_window(client: httpx.AsyncClient, key: str, source: str, w: date) -> list[dict]:
    url = f"{FIRMS_BASE}/{key}/{source}/{AOI_BBOX}/{CHUNK_DAYS}/{w.isoformat()}"
    try:
        resp = await client.get(url, timeout=60.0)
        resp.raise_for_status()
        feats = _parse_csv(resp.text)
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        log.warning("fetch failed %s %s: %s", source, w, e)
        return []
    for f in feats:
        f["properties"]["source"] = source
    # Border-clip (drops neighbouring-country pixels), same as live ingest.
    return [f for f in feats if _in_algeria(*f["geometry"]["coordinates"])]


async def _key_worker(key: str, queue: asyncio.Queue, pool, stats: dict) -> None:
    """One worker per MAP_KEY: drains windows serially on its own quota bucket."""
    async with httpx.AsyncClient() as client:
        while True:
            try:
                source, w = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                feats = await _fetch_window(client, key, source, w)
                n = await upsert_detections(feats)
                await _mark_done(pool, source, w, CHUNK_DAYS, n)
                stats["windows"] += 1
                stats["detections"] += n
                if stats["windows"] % 20 == 0:
                    log.info("progress: %d windows, %d detections upserted",
                             stats["windows"], stats["detections"])
            except Exception as e:  # keep the worker alive on a bad window
                log.warning("window %s %s errored: %s", source, w, e)
            finally:
                queue.task_done()
                await asyncio.sleep(PER_KEY_DELAY_S)


async def run_backfill(start: date, end: date, sources, summer_only: bool,
                       summer_first: bool, recluster_after: bool) -> dict:
    settings = get_settings()
    keys = settings.firms_key_pool
    pool = await get_pool()
    if pool is None:
        raise SystemExit("DATABASE_URL not configured — cannot backfill.")
    if not keys:
        raise SystemExit("No FIRMS keys configured.")

    avail = await _availability(keys[0])
    jobs = _plan(start, end, sources, summer_only, summer_first, avail)
    done = await _already_done(pool)
    todo = [j for j in jobs if j not in done]
    log.info("backfill plan: %d windows total, %d already done, %d to fetch, across %d key(s)",
             len(jobs), len(jobs) - len(todo), len(todo), len(keys))

    queue: asyncio.Queue = asyncio.Queue()
    for j in todo:
        queue.put_nowait(j)

    stats = {"windows": 0, "detections": 0}
    workers = [asyncio.create_task(_key_worker(k, queue, pool, stats)) for k in keys]
    await asyncio.gather(*workers)

    result = {"windows_fetched": stats["windows"], "detections_upserted": stats["detections"]}
    if recluster_after:
        log.info("re-clustering after backfill…")
        result["events"] = await recluster()
    log.info("backfill complete: %s", result)
    return result


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def main() -> None:
    p = argparse.ArgumentParser(description="Historical FIRMS backfill for Algeria.")
    p.add_argument("--start", type=_parse_date, required=True, help="YYYY-MM-DD (inclusive)")
    p.add_argument("--end", type=_parse_date, required=True, help="YYYY-MM-DD (exclusive)")
    p.add_argument("--sources", default=",".join(ARCHIVE_SOURCES),
                   help="comma-separated FIRMS products (default: SP archive trio)")
    p.add_argument("--summer", action="store_true", help="only Jun–Oct windows")
    p.add_argument("--summer-first", action="store_true", help="prioritize summer, still fetch all")
    p.add_argument("--no-recluster", action="store_true", help="skip clustering afterwards")
    args = p.parse_args()

    sources = tuple(s.strip() for s in args.sources.split(",") if s.strip())
    asyncio.run(run_backfill(
        args.start, args.end, sources,
        summer_only=args.summer,
        summer_first=args.summer_first,
        recluster_after=not args.no_recluster,
    ))


if __name__ == "__main__":
    main()
