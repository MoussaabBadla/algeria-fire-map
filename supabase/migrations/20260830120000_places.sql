-- Algeria Fire Map — populated places (for the "Communities at risk" feature).
-- Inhabited settlements (OSM place = city/town/village/hamlet) so we can flag
-- which communities sit near active fires and mobilise help. Static reference
-- data (like wilayas), seeded from OpenStreetMap via Overpass. Everything 4326.

create extension if not exists postgis;

create table if not exists places (
    id            bigserial primary key,
    osm_id        bigint unique,                       -- OSM node id (dedup / re-seed key)
    name          text not null,                       -- default name (OSM `name`)
    name_ar       text,                                -- OSM `name:ar`
    name_en       text,                                -- OSM `name:en`
    place_type    text not null,                       -- city | town | village | hamlet
    population    integer,                             -- OSM `population` when tagged
    lng           double precision not null,
    lat           double precision not null,
    geom          geometry(Point, 4326) not null,
    wilaya_code   integer references wilayas(code),    -- nearest-centroid (KNN), like detections
    created_at    timestamptz not null default now()
);

create index if not exists places_geom_gix   on places using gist (geom);
create index if not exists places_wilaya_idx on places (wilaya_code);
create index if not exists places_type_idx   on places (place_type);
