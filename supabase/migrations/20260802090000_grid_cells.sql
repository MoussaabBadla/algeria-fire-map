-- Algeria Fire Map — ML training grid (Milestone 6, part 1: the R2-independent foundation).
-- grid_cells: a static 0.1° (~11 km) grid over fire-prone NORTHERN Algeria, clipped
-- to the border polygon and cut off south of ~34°N (excludes the Sahara / gas-flare
-- belt). Each (cell, day) is one future training sample; features + labels attach
-- to cell_id later. Small & static — lives in Postgres, not the R2 Parquet lake.
-- Everything EPSG:4326.

create extension if not exists postgis;

create table if not exists grid_cells (
    id            bigserial primary key,
    -- Stable natural key = global 0.1° grid indices "row_col" (lat_idx_lng_idx),
    -- independent of bbox, so re-seeds and feature joins stay reproducible.
    cell_id       text unique not null,
    cx            double precision not null,          -- centre longitude
    cy            double precision not null,          -- centre latitude
    geom          geometry(Point, 4326)   not null,   -- centre point (weather sampling)
    cell          geometry(Polygon, 4326) not null,   -- 0.1° square footprint (label: detection-in-cell)
    wilaya_code   integer references wilayas(code),
    -- Static terrain / land cover — filled later from GEE (DEM + land-cover). Null for now.
    elevation_m   real,
    slope_deg     real,
    aspect_deg    real,
    land_cover    text,
    created_at    timestamptz not null default now()
);

create index if not exists grid_cells_geom_gix   on grid_cells using gist (geom);
create index if not exists grid_cells_cell_gix    on grid_cells using gist (cell);
create index if not exists grid_cells_wilaya_idx  on grid_cells (wilaya_code);
