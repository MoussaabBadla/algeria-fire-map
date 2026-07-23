# Algeria Fire Map 🇩🇿🔥

Open-source wildfire monitoring platform for Algeria. Real-time satellite fire
detection on an interactive national map, with fire-risk intelligence layered
on top over time.

> **Status:** early MVP — Milestone 1 (live fire monitoring map).

## Architecture

- **Frontend** — Next.js (stateless, SEO-friendly) + MapLibre GL JS. Deployed on Vercel.
- **Backend** — one FastAPI service (owns all APIs, ingestion, secrets). Deployed on Railway.
- **Data** — Supabase Postgres/PostGIS (hot window) + Cloudflare R2 (Parquet data lake).
- **Cache** — Redis (version/ETag-driven).
- **Sources** — NASA FIRMS (VIIRS + MODIS), Open-Meteo, Google Earth Engine.

We operate on **fire-prone northern Algeria** only; the Sahara is display-only
(its persistent FIRMS detections are mostly industrial gas flares, not wildfires).

## Repo layout

```
apps/web        Next.js frontend (stateless)
services/api    FastAPI backend (data + ingestion)
docker-compose.yml   Local dev: api + redis
```

## Quick start (backend)

1. **Get a free NASA FIRMS key** — https://firms.modaps.eosdis.nasa.gov/api/area/
   (enter your email under *Get MAP_KEY*; issued instantly).
2. Configure env:
   ```bash
   cp services/api/.env.example services/api/.env
   # edit services/api/.env and set NASA_FIRMS_MAP_KEY
   ```
3. Run with Docker (recommended):
   ```bash
   docker compose up --build
   # API → http://localhost:8000  (docs at /docs)
   ```
   …or without Docker:
   ```bash
   cd services/api
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload
   ```
4. Try it:
   ```bash
   curl "http://localhost:8000/fires?days=1"
   ```

## License

MIT — see [LICENSE](./LICENSE).
