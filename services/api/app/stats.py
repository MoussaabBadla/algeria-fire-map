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
        top_all = await conn.fetch(
            """select s.wilaya_code code, w.name, w.name_ar,
                      sum(s.detections)::int det, sum(s.confirmed)::int conf
               from stats_monthly s join wilayas w on w.code = s.wilaya_code
               group by 1,2,3 order by det desc limit 12"""
        )
        top_year = await conn.fetch(
            """select s.wilaya_code code, w.name, w.name_ar,
                      sum(s.detections)::int det, sum(s.confirmed)::int conf
               from stats_monthly s join wilayas w on w.code = s.wilaya_code
               where s.year = $1
               group by 1,2,3 order by det desc limit 12""",
            cur_year,
        )
        frp = await conn.fetchrow(_FRP_BUCKETS_SQL)

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
    }
