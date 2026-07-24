"""Cluster raw detections into stable fire_events (incidents).

Approach — a pragmatic ST-DBSCAN:
  * Spatially cluster only detections inside a rolling *link window*
    (CLUSTER_LINK_DAYS) with PostGIS ST_ClusterDBSCAN. Detections older than the
    window keep the event_id they were already assigned, so they never re-merge
    fires that have since gone quiet — that is the temporal ("ST") split.
  * Stable IDs: a new cluster reuses the event_id its detections already carry
    (smallest id wins); clusters that bridge two old events *merge* into one.
    Only genuinely new clusters allocate a fresh event.
  * Aggregates (centroid, hull, first/last-seen, counts, max/total FRP, wilaya)
    are recomputed over *all* detections of each touched event, so an incident's
    lifespan and footprint grow monotonically as it is re-detected.

Idempotent: re-running with no new detections is a no-op.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from .config import get_settings
from .db import get_pool

log = logging.getLogger("cluster")

# Assign each windowed detection a DBSCAN cluster number (single-link within eps).
_CLUSTER_SQL = """
select id, event_id,
       ST_ClusterDBSCAN(geom, eps => $2::float8, minpoints => $3::int) over () as cl
from detections
where acq_datetime >= now() - make_interval(days => $1::int)
"""

# Recompute event aggregates from every detection currently assigned to it.
# hull is stored only when it is a real polygon (>=3 non-collinear points).
_AGG_SQL = """
update fire_events fe set
    centroid        = agg.centroid,
    hull            = agg.hull,
    first_seen      = agg.first_seen,
    last_seen       = agg.last_seen,
    detection_count = agg.cnt,
    max_frp         = agg.max_frp,
    total_frp       = agg.total_frp,
    wilaya_code     = agg.wilaya_code,
    confirmed       = agg.confirmed,
    updated_at      = now()
from (
    select event_id,
           ST_Centroid(ST_Collect(geom))                       as centroid,
           case when count(*) >= 3
                     and ST_GeometryType(ST_ConvexHull(ST_Collect(geom))) = 'ST_Polygon'
                then ST_ConvexHull(ST_Collect(geom)) end        as hull,
           min(acq_datetime)                                    as first_seen,
           max(acq_datetime)                                    as last_seen,
           count(*)                                             as cnt,
           max(frp)                                             as max_frp,
           sum(frp)                                             as total_frp,
           mode() within group (order by wilaya_code)           as wilaya_code,
           -- Confirmed = contains at least one confirmed detection
           -- (high confidence AND FRP >= 15), matching the app-wide definition.
           bool_or(confidence = 'high' and frp >= 15)           as confirmed
    from detections
    where event_id = any($1::bigint[])
    group by event_id
) agg
where fe.id = agg.event_id
"""


async def recluster() -> dict:
    """Rebuild/refresh fire_events from detections. Returns {total, active}."""
    settings = get_settings()
    pool = await get_pool()
    if pool is None:
        return {"total": 0, "active": 0}

    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                _CLUSTER_SQL,
                settings.cluster_link_days,
                settings.cluster_eps_deg,
                settings.cluster_min_points,
            )

            # Group windowed detections by DBSCAN cluster number.
            clusters: dict[int, list] = defaultdict(list)
            for r in rows:
                if r["cl"] is None:  # shouldn't happen with minpoints=1, but guard
                    continue
                clusters[r["cl"]].append(r)

            affected: set[int] = set()

            for members in clusters.values():
                det_ids = [m["id"] for m in members]
                existing = {m["event_id"] for m in members if m["event_id"] is not None}

                if existing:
                    canonical = min(existing)
                    others = existing - {canonical}
                else:
                    # Brand-new incident: allocate an event (placeholder aggregates,
                    # overwritten by _AGG_SQL below).
                    canonical = await conn.fetchval(
                        """insert into fire_events (centroid, first_seen, last_seen)
                           values (ST_SetSRID(ST_MakePoint(0, 0), 4326), now(), now())
                           returning id"""
                    )
                    others = set()

                # Assign this cluster's windowed detections to the canonical event.
                await conn.execute(
                    "update detections set event_id = $1 where id = any($2::bigint[])",
                    canonical, det_ids,
                )
                # Merge any bridged events' *entire* detection sets into canonical.
                if others:
                    await conn.execute(
                        "update detections set event_id = $1 where event_id = any($2::bigint[])",
                        canonical, list(others),
                    )
                affected.add(canonical)
                affected.update(others)

            # Recompute aggregates for every touched event.
            if affected:
                await conn.execute(_AGG_SQL, list(affected))

            # Drop events that ended up with no detections (fully merged away).
            await conn.execute(
                "delete from fire_events fe where not exists "
                "(select 1 from detections d where d.event_id = fe.id)"
            )

            # Refresh the active flag for all events.
            await conn.execute(
                "update fire_events set is_active = "
                "(last_seen >= now() - make_interval(hours => $1::int))",
                settings.event_active_hours,
            )

            total = await conn.fetchval("select count(*) from fire_events")
            active = await conn.fetchval("select count(*) from fire_events where is_active")

    return {"total": int(total or 0), "active": int(active or 0)}
