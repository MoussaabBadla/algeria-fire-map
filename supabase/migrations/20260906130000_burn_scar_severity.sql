-- Phase 2b/2c: per-burn-scar burn severity (Sentinel-2 dNBR) + slope-based
-- erosion urgency, sampled via GEE. status='pending' when post-fire imagery
-- isn't available yet (recent fires), retried by the enrichment sweep.
create table if not exists burn_scar_severity (
    event_id      bigint primary key references fire_events(id) on delete cascade,
    dnbr          double precision,
    severity      text,
    slope_deg     double precision,
    erosion_risk  text,
    status        text not null default 'done',
    updated_at    timestamptz not null default now()
);
