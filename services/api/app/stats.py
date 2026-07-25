"""Statistics aggregation over the detection archive.

`refresh_stats()` rebuilds the small `stats_monthly` rollup from `detections`
(called on every ingest/backfill). The query helpers read mostly from that
rollup, so the endpoints stay fast even as the archive grows to millions of rows.
"""
from __future__ import annotations

import logging

from .db import get_pool

log = logging.getLogger("stats")

_REFRESH_SQL = """
insert into stats_monthly (wilaya_code, year, month, detections, confirmed, sum_frp, max_frp)
select
    wilaya_code,
    extract(year  from acq_datetime)::int,
    extract(month from acq_datetime)::int,
    count(*),
    count(*) filter (where confidence = 'high' and frp >= 15),
    coalesce(sum(frp), 0),
    max(frp)
from detections
where wilaya_code is not null
group by 1, 2, 3
on conflict (wilaya_code, year, month) do update set
    detections = excluded.detections,
    confirmed  = excluded.confirmed,
    sum_frp    = excluded.sum_frp,
    max_frp    = excluded.max_frp
"""


async def refresh_stats() -> int:
    """Recompute the monthly rollup. Returns rows in stats_monthly."""
    pool = await get_pool()
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        await conn.execute(_REFRESH_SQL)
        return int(await conn.fetchval("select count(*) from stats_monthly") or 0)


# FRP intensity buckets — aligned with the frontend fire-power legend (MW).
_FRP_BUCKETS_SQL = """
select
    count(*) filter (where frp < 5)                    as b0,
    count(*) filter (where frp >= 5   and frp < 20)    as b1,
    count(*) filter (where frp >= 20  and frp < 50)    as b2,
    count(*) filter (where frp >= 50  and frp < 100)   as b3,
    count(*) filter (where frp >= 100)                 as b4
from detections
"""


async def national_summary() -> dict:
    """All-Algeria statistics for the /stats page."""
    pool = await get_pool()
    if pool is None:
        return {"enabled": False}

    async with pool.acquire() as conn:
        # Headline KPIs.
        kpi = await conn.fetchrow(
            """
            select
                (select count(*) from detections)                                   as total_detections,
                (select count(*) from detections where confidence='high' and frp>=15) as total_confirmed,
                (select count(distinct wilaya_code) from detections
                    where wilaya_code is not null)                                   as wilayas_affected,
                (select coalesce(sum(frp),0) from detections)                        as total_frp,
                (select count(*) from fire_events where is_active and confirmed)     as active_incidents,
                (select min(acq_datetime)::date from detections)                     as first_date,
                (select max(acq_datetime)::date from detections)                     as last_date
            """
        )

        # Per-year totals (from the rollup).
        by_year = await conn.fetch(
            """select year, sum(detections)::int det, sum(confirmed)::int conf,
                      coalesce(sum(sum_frp),0) frp
               from stats_monthly group by year order by year"""
        )
        # Seasonal signature: totals per calendar month across all years.
        by_month = await conn.fetch(
            """select month, sum(detections)::int det, sum(confirmed)::int conf
               from stats_monthly group by month order by month"""
        )
        # Most-affected wilayas — all-time and current year.
        cur_year = kpi["last_date"].year if kpi["last_date"] else None
        # Rank by CONFIRMED fires, not raw detections — raw counts are inflated
        # by persistent industrial gas-flares (e.g. Ghardaïa) that the confirmed
        # filter (high-confidence & FRP>=15) largely excludes.
        top_all = await conn.fetch(
            """select s.wilaya_code code, w.name, w.name_ar,
                      sum(s.detections)::int det, sum(s.confirmed)::int conf
               from stats_monthly s join wilayas w on w.code = s.wilaya_code
               group by 1,2,3 order by conf desc, det desc limit 12"""
        )
        top_year = await conn.fetch(
            """select s.wilaya_code code, w.name, w.name_ar,
                      sum(s.detections)::int det, sum(s.confirmed)::int conf
               from stats_monthly s join wilayas w on w.code = s.wilaya_code
               where s.year = $1
               group by 1,2,3 order by conf desc, det desc limit 12""",
            cur_year,
        )
        frp = await conn.fetchrow(_FRP_BUCKETS_SQL)

        # Every wilaya's totals — powers the national choropleth.
        totals = await conn.fetch(
            """select wilaya_code code, sum(detections)::int det, sum(confirmed)::int conf
               from stats_monthly group by wilaya_code"""
        )

    return {
        "enabled": True,
        "kpis": {
            "total_detections": kpi["total_detections"],
            "total_confirmed": kpi["total_confirmed"],
            "wilayas_affected": kpi["wilayas_affected"],
            "total_frp": round(kpi["total_frp"] or 0),
            "active_incidents": kpi["active_incidents"],
            "this_year": sum(r["det"] for r in by_year if r["year"] == cur_year),
        },
        "coverage": {
            "first_date": kpi["first_date"].isoformat() if kpi["first_date"] else None,
            "last_date": kpi["last_date"].isoformat() if kpi["last_date"] else None,
            "current_year": cur_year,
        },
        "by_year": [{"year": r["year"], "detections": r["det"], "confirmed": r["conf"], "frp": round(r["frp"])} for r in by_year],
        "by_month": [{"month": r["month"], "detections": r["det"], "confirmed": r["conf"]} for r in by_month],
        "top_wilayas_all": [{"code": r["code"], "name": r["name"], "name_ar": r["name_ar"], "detections": r["det"], "confirmed": r["conf"]} for r in top_all],
        "top_wilayas_year": [{"code": r["code"], "name": r["name"], "name_ar": r["name_ar"], "detections": r["det"], "confirmed": r["conf"]} for r in top_year],
        "frp_buckets": [frp["b0"], frp["b1"], frp["b2"], frp["b3"], frp["b4"]],
        "wilaya_totals": [{"code": r["code"], "detections": r["det"], "confirmed": r["conf"]} for r in totals],
    }


_WILAYA_FRP_SQL = """
select
    count(*) filter (where frp < 5)                  as b0,
    count(*) filter (where frp >= 5   and frp < 20)  as b1,
    count(*) filter (where frp >= 20  and frp < 50)  as b2,
    count(*) filter (where frp >= 50  and frp < 100) as b3,
    count(*) filter (where frp >= 100)               as b4
from detections where wilaya_code = $1
"""


async def wilaya_summary(code: int) -> dict:
    """Per-wilaya statistics for /stats/wilaya/{code}."""
    pool = await get_pool()
    if pool is None:
        return {"enabled": False}

    async with pool.acquire() as conn:
        w = await conn.fetchrow("select code, name, name_ar from wilayas where code = $1", code)
        if w is None:
            return {"enabled": True, "found": False}

        # National rank by confirmed fires + this wilaya's share of the national total.
        rank = await conn.fetchrow(
            """
            with tot as (
                select wilaya_code, sum(confirmed)::bigint conf, sum(detections)::bigint det
                from stats_monthly group by wilaya_code
            )
            select
                coalesce((select conf from tot where wilaya_code = $1), 0)  as conf,
                coalesce((select det  from tot where wilaya_code = $1), 0)  as det,
                (select count(*) + 1 from tot t2
                    where t2.conf > coalesce((select conf from tot where wilaya_code = $1), 0)) as rank,
                (select count(*) from tot) as ranked_total,
                (select sum(confirmed) from stats_monthly) as nat_conf,
                (select sum(detections) from stats_monthly) as nat_det
            """,
            code,
        )

        last_date = await conn.fetchval("select max(acq_datetime)::date from detections")
        cur_year = last_date.year if last_date else None
        this_year = await conn.fetchval(
            "select coalesce(sum(detections),0) from stats_monthly where wilaya_code=$1 and year=$2",
            code, cur_year,
        )

        by_year = await conn.fetch(
            """select year, sum(detections)::int det, sum(confirmed)::int conf
               from stats_monthly where wilaya_code=$1 group by year order by year""",
            code,
        )
        by_month = await conn.fetch(
            "select month, sum(detections)::int det from stats_monthly where wilaya_code=$1 group by month order by month",
            code,
        )
        frp = await conn.fetchrow(_WILAYA_FRP_SQL, code)

        # Recent confirmed incidents in this wilaya.
        incidents = await conn.fetch(
            """select id, first_seen, last_seen, detection_count, max_frp, is_active
               from fire_events
               where wilaya_code = $1 and confirmed
               order by last_seen desc limit 10""",
            code,
        )
        biggest = await conn.fetchval(
            "select max(max_frp) from fire_events where wilaya_code=$1", code
        )

    nat_conf = rank["nat_conf"] or 1
    return {
        "enabled": True,
        "found": True,
        "wilaya": {"code": w["code"], "name": w["name"], "name_ar": w["name_ar"]},
        "kpis": {
            "detections": int(rank["det"]),
            "confirmed": int(rank["conf"]),
            "this_year": int(this_year or 0),
            "rank": int(rank["rank"]),
            "ranked_total": int(rank["ranked_total"]),
            "share_pct": round(100 * (rank["conf"] or 0) / nat_conf, 1),
            "biggest_frp": round(biggest) if biggest else None,
        },
        "coverage": {"current_year": cur_year},
        "by_year": [{"year": r["year"], "detections": r["det"], "confirmed": r["conf"]} for r in by_year],
        "by_month": [{"month": r["month"], "detections": r["det"]} for r in by_month],
        "frp_buckets": [frp["b0"], frp["b1"], frp["b2"], frp["b3"], frp["b4"]],
        "incidents": [
            {
                "id": r["id"],
                "first_seen": r["first_seen"].isoformat() if r["first_seen"] else None,
                "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
                "detection_count": r["detection_count"],
                "max_frp": round(r["max_frp"]) if r["max_frp"] else None,
                "is_active": r["is_active"],
            }
            for r in incidents
        ],
    }
