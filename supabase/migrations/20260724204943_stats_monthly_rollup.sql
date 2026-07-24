-- Precomputed monthly rollup of detections per wilaya. Tiny (69 wilayas ×
-- ~300 months ≈ 20k rows max) and refreshed on every ingest/backfill, so the
-- stats endpoints read instant aggregates instead of scanning detections.
create table if not exists stats_monthly (
    wilaya_code  integer not null references wilayas(code),
    year         integer not null,
    month        integer not null,          -- 1..12
    detections   integer not null default 0,
    confirmed    integer not null default 0, -- high-confidence & FRP>=15
    sum_frp      double precision not null default 0,
    max_frp      real,
    primary key (wilaya_code, year, month)
);
create index if not exists stats_monthly_ym_idx on stats_monthly (year, month);
