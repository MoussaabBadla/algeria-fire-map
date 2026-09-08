-- ML fire-risk forecast: daily per-grid-cell next-day fire probability + class,
-- written by predict.predict_all and served by /forecast.
create table if not exists cell_risk (
    cell_id     text primary key,
    cx          double precision,
    cy          double precision,
    lat         double precision,
    lng         double precision,
    day         date not null,
    prob        double precision not null,
    risk_class  text not null,
    updated_at  timestamptz not null default now()
);
create index if not exists cell_risk_class_idx on cell_risk (risk_class);
