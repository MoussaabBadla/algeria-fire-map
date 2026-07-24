-- Algeria Fire Map — persistence schema (Milestone 2/3)
-- detections (raw satellite pixels) + fire_events (clustered incidents) + wilayas seed.
-- Everything EPSG:4326. Spatial ops via PostGIS; distance/area math casts to geography.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- wilayas — Algeria's 69 wilayas: bilingual names + centroid.
-- Seeded from the same GeoAlgeria-derived table the API already uses.
-- (Boundary polygons can be added later for exact point-in-polygon joins.)
-- ---------------------------------------------------------------------------
create table if not exists wilayas (
    code      integer primary key,
    name      text not null,               -- Latin/English name (stable key)
    name_ar   text,                         -- Arabic name
    geom      geometry(Point, 4326) not null
);
create index if not exists wilayas_geom_gix on wilayas using gist (geom);

-- ---------------------------------------------------------------------------
-- detections — one row per FIRMS satellite pixel (already border-clipped to
-- Algeria at ingest). Immutable facts; ingest dedupes on overpass overlap.
-- ---------------------------------------------------------------------------
create table if not exists detections (
    id            bigserial primary key,
    geom          geometry(Point, 4326) not null,
    lng           double precision not null,
    lat           double precision not null,
    frp           real,                     -- fire radiative power (MW)
    confidence    text,                     -- low | nominal | high (normalized)
    brightness    real,                     -- bright_ti4 / brightness (K)
    acq_datetime  timestamptz not null,     -- acquisition time (UTC)
    satellite     text not null,            -- e.g. N, N20, Aqua
    instrument    text,                     -- VIIRS | MODIS
    daynight      text,                     -- D | N
    source        text,                     -- FIRMS product (VIIRS_NOAA20_NRT, ...)
    wilaya_code   integer references wilayas(code),
    event_id      bigint,                   -- assigned by clustering (nullable until clustered)
    ingested_at   timestamptz not null default now()
);

-- Dedup key across overlapping satellite passes. lat/lng are rounded to 5 dp at
-- ingest, so a same-pixel re-report collapses to one row.
create unique index if not exists detections_dedup_uidx
    on detections (satellite, acq_datetime, lat, lng);

create index if not exists detections_geom_gix   on detections using gist (geom);
create index if not exists detections_acq_idx     on detections (acq_datetime desc);
create index if not exists detections_wilaya_idx  on detections (wilaya_code);
create index if not exists detections_event_idx   on detections (event_id);

-- ---------------------------------------------------------------------------
-- fire_events — clustered incidents (ST-DBSCAN over space+time). Stable id
-- persists across re-cluster runs; first/last-seen track the incident lifespan.
-- ---------------------------------------------------------------------------
create table if not exists fire_events (
    id                bigserial primary key,
    centroid          geometry(Point, 4326) not null,
    hull              geometry(Polygon, 4326),   -- affected-area convex hull (null if single point)
    first_seen        timestamptz not null,
    last_seen         timestamptz not null,
    detection_count   integer not null default 0,
    max_frp           real,
    total_frp         real,
    wilaya_code       integer references wilayas(code),
    is_active         boolean not null default true,  -- last_seen within the active window
    updated_at        timestamptz not null default now()
);
create index if not exists fire_events_centroid_gix on fire_events using gist (centroid);
create index if not exists fire_events_lastseen_idx  on fire_events (last_seen desc);
create index if not exists fire_events_active_idx    on fire_events (is_active);
create index if not exists fire_events_wilaya_idx    on fire_events (wilaya_code);

-- FK from detections → events (added after both tables exist).
alter table detections
    drop constraint if exists detections_event_fk;
alter table detections
    add constraint detections_event_fk
    foreign key (event_id) references fire_events(id) on delete set null;
