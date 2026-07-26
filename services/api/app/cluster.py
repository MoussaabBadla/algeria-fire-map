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


# One-time (idempotent) clustering of the whole archive into historical incidents.
# Clusters every not-yet-clustered detection within fixed time buckets, so fires
# from different years never merge. minpoints=2 drops isolated noise pixels (they
# stay raw, event_id NULL) so we only create real multi-detection incidents.
async def cluster_history(bucket_days: int = 7, min_points: int = 2, year: int | None = None) -> dict:
    """Cluster unclustered detections into historical incidents. Pass `year` to
    scope to one calendar year (recommended — keeps each transaction small enough
    to avoid statement timeouts on the pooler)."""
    settings = get_settings()
    pool = await get_pool()
    if pool is None:
        return {"clustered": 0, "events_created": 0}
    T = 600  # generous per-statement timeout for these bulk ops
    year_filter = "and extract(year from acq_datetime) = $4::int" if year is not None else ""
    args = [bucket_days, settings.cluster_eps_deg, min_points] + ([year] if year is not None else [])

    async with pool.acquire() as conn:
        async with conn.transaction():
            pending = await conn.fetchval(
                "select count(*) from detections where event_id is null "
                + ("and extract(year from acq_datetime) = $1::int" if year is not None else ""),
                *([year] if year is not None else []), timeout=T,
            )
            if not pending:
                return {"clustered": 0, "events_created": 0}

            # Assign every unclustered detection a global incident group number:
            # DBSCAN within each fixed time bucket, then dense-rank across buckets.
            await conn.execute(
                f"""
                create temp table _cl on commit drop as
                select id, dense_rank() over (order by bucket, cl) as grp
                from (
                    select id,
                           ST_ClusterDBSCAN(geom, eps => $2::float8, minpoints => $3::int)
                               over (partition by bucket) as cl,
                           bucket
                    from (
                        select id, geom,
                               floor(extract(epoch from acq_datetime) / ($1::int * 86400))::bigint as bucket
                        from detections
                        where event_id is null {year_filter}
                    ) s
                ) t
                where cl is not null
                """,
                *args, timeout=T,
            )

            # Aggregate each group into an incident, reserving a real event id per group.
            await conn.execute(
                """
                create temp table _grp on commit drop as
                select
                    c.grp,
                    nextval('fire_events_id_seq') as event_id,
                    ST_Centroid(ST_Collect(d.geom)) as centroid,
                    case when count(*) >= 3
                              and ST_GeometryType(ST_ConvexHull(ST_Collect(d.geom))) = 'ST_Polygon'
                         then ST_ConvexHull(ST_Collect(d.geom)) end as hull,
                    min(d.acq_datetime) as first_seen,
                    max(d.acq_datetime) as last_seen,
                    count(*)::int       as detection_count,
                    max(d.frp)          as max_frp,
                    sum(d.frp)          as total_frp,
                    mode() within group (order by d.wilaya_code) as wilaya_code,
                    bool_or(d.confidence = 'high' and d.frp >= 15) as confirmed
                from _cl c join detections d using (id)
                group by c.grp
                """,
                timeout=T,
            )

            await conn.execute(
                """
                insert into fire_events
                    (id, centroid, hull, first_seen, last_seen, detection_count,
                     max_frp, total_frp, wilaya_code, confirmed, is_active, updated_at)
                select event_id, centroid, hull, first_seen, last_seen, detection_count,
                       max_frp, total_frp, wilaya_code, confirmed,
                       (last_seen >= now() - make_interval(hours => $1::int)), now()
                from _grp
                """,
                settings.event_active_hours, timeout=T,
            )

            await conn.execute(
                """update detections d set event_id = g.event_id
                   from _cl c join _grp g on g.grp = c.grp
                   where d.id = c.id""",
                timeout=T,
            )

            events_created = await conn.fetchval("select count(*) from _grp", timeout=T)
            clustered = await conn.fetchval("select count(*) from _cl", timeout=T)

    log.info("cluster_history: %d detections → %d incidents", clustered, events_created)
    return {"clustered": int(clustered or 0), "events_created": int(events_created or 0)}
