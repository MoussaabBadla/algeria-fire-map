-- Resumable checkpoint for the historical FIRMS backfill. One row per
-- (source, window_start) once that window has been fetched + upserted, so a
-- re-run skips completed windows and only pays for what's missing.
create table if not exists backfill_progress (
    source        text        not null,   -- FIRMS product (VIIRS_SNPP_SP, MODIS_SP, ...)
    window_start  date        not null,   -- first day of the fetched window
    window_days   integer     not null,   -- window length (<=10; FIRMS archive cap)
    detections    integer     not null default 0,  -- rows upserted from this window
    fetched_at    timestamptz not null default now(),
    primary key (source, window_start)
);
