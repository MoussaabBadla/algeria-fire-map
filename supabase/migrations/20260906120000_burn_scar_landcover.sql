-- Phase 2a: per-burn-scar land cover (ESA WorldCover v200, sampled via GEE).
-- Lets the restoration map distinguish forest (reforest) vs cropland
-- (agricultural) vs rangeland vs non-vegetation, and down-rank noise.
create table if not exists burn_scar_landcover (
    event_id      bigint primary key references fire_events(id) on delete cascade,
    forest_ha     double precision not null default 0,
    shrub_ha      double precision not null default 0,
    grass_ha      double precision not null default 0,
    cropland_ha   double precision not null default 0,
    other_ha      double precision not null default 0,
    dominant      text,
    updated_at    timestamptz not null default now()
);
