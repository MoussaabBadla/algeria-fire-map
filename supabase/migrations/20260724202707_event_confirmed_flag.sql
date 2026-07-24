-- Mark which incidents are "confirmed": contain at least one confirmed detection
-- (confidence = high AND frp >= 15 — the same definition used across the app),
-- so the Incidents view can default to real fires only and hide noise clusters.
alter table fire_events
    add column if not exists confirmed boolean not null default false;

create index if not exists fire_events_confirmed_idx on fire_events (confirmed);
