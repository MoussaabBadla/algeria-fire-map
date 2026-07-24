# CLAUDE.md — Algeria Fire Map

Project context for Claude Code / contributors. Keep this current.

## What it is
Open-source, real-time wildfire monitoring + fire-risk for Algeria.
**Live:** https://www.algeriafiremap.site (apex `algeriafiremap.site` → www) · **License:** MIT · **Author:** Moussaab Badla.

## Architecture
```
NASA FIRMS ─┐                         Open-Meteo
            ▼                            ▼
   ┌──────────── FastAPI (Railway) — all APIs + Redis cache ────────────┐
   │  /fires  /place  /risk  /health   (holds all secrets)              │
   └────────────────────────────┬──────────────────────────────────────┘
                                ▼  HTTPS, no secrets
                Next.js (Vercel) — stateless, SEO, i18n, MapLibre
```
- **Frontend** `apps/web` — Next.js (App Router, TS) + MapLibre GL JS. Stateless (no secrets), calls the API via `NEXT_PUBLIC_API_URL`. English + Arabic (RTL).
- **Backend** `services/api` — one FastAPI service on Railway + Railway Redis. Owns ingestion, geospatial, FWI, secrets.
- **Data** — NASA FIRMS (fires), Open-Meteo (weather/FWI), OpenStreetMap/OpenFreeMap + Esri (basemaps), GeoAlgeria (wilaya names).

## Repo layout
```
apps/web        Next.js frontend (components/, lib/, lib/i18n/, messages/)
services/api    FastAPI backend (app/, app/routers/)
railway.json    Railway monorepo build (repo-root context → services/api/Dockerfile)
docker-compose.yml   Local dev: api + redis
```

## Commands
```bash
# Backend (needs services/api/.env with NASA_FIRMS_MAP_KEY)
docker compose up --build              # API → :8000/docs
# or: cd services/api && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend
cd apps/web && cp .env.example .env.local && npm install && npm run dev   # → :3000
npm run build                          # always run before deploying
```

## Deploy & CI/CD
- Push to `main` auto-deploys **both**: Railway (backend, builds from repo-root `railway.json`) + Vercel (frontend, root dir `apps/web`).
- **Wait for a Vercel deploy** by polling the API for `state == "READY"` (token at `~/Library/Application Support/com.vercel.cli/auth.json`; project `prj_6Gq6gq9kHLqzHREe8iOkHJ1UdYoe`, team `team_Sv5qB0eJAA7NHZc1jbnfAYdO`). Railway: `railway service status --service algeria-fire-map`.
- Custom domain + CORS: `CORS_ORIGINS` on Railway includes www + apex. Env vars set on Railway (backend) and Vercel (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`).

## Gotchas (read before changing these)
- **maplibre-gl is pinned to 4.7.1** — v6 renders a blank map (no tiles, `transform` undefined). Do not bump.
- **FIRMS Area API caps day-range at 5** — `days=6+` returns empty. `/fires` and the frontend clamp to 5.
- **Fires are clipped to Algeria's border polygon** (shapely, `services/api/app/algeria_border.json`) so neighbouring-country fires (e.g. Tunisian) don't get counted toward border wilayas like Souk Ahras.
- **Arabic labels need `setRTLTextPlugin`** (set once in `FireMap.tsx`) or they render disconnected/reversed.
- **Redis cache keys are versioned** when output changes: `fires:v2:days=N`, `risk:all:v3`. Bump to force fresh data after logic changes.
- **`setStyle` uses `{ diff: false }`** so custom overlays re-add on basemap switch.
- Confirmed fires = `confidence == high && frp >= 15`. AOI bbox = `-8.7,32.0,12.0,37.1` (then polygon-clipped).

## Conventions
- **No emojis in the UI** — use inline SVG icons (`components/Icons.tsx`).
- Apple-style: solid controls, no gradients on buttons; glass panels; dark theme in `globals.css`.
- Micro-commits, small messages (`feat(web):`, `fix(api):`, …). Branch off main for new work.
- i18n: add strings to `messages/{en,ar}.json`, use `useTranslations()`/`useLocale()`, logical CSS props (`insetInlineStart/End`) for RTL.

## What's built
Live fire map (dark/satellite/light, Algeria border + dimmed neighbours, bilingual labels) · confirmed-only filter w/ explainer · fire detail + reverse-geocoded place · Live(anchored to freshest data)/24h/48h · Latest fires · Most-affected wilayas · 5-day Replay timeline · **FWI fire-risk layer + 3-day forecast** · mobile bottom-sheet UX · SEO/OG/favicon/manifest · **English + Arabic (RTL, incl. wilaya labels)** · GitHub/author credit.

## What's next — Persistence milestone (blocked on accounts)
Needs the user to provide: **Supabase** `DATABASE_URL` (Postgres+PostGIS) and **Cloudflare R2** keys (`R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY`, bucket `algeria-fire-map`). Then build:
1. PostGIS schema — `detections` (raw + dedup index), `fire_events` (incidents).
2. Ingestion cron (Railway) — FIRMS → dedupe → upsert; archive raw to R2.
3. Server-side clustering (ST-DBSCAN) — stable incident IDs, first/last-seen, affected-area hull, wilaya, max FRP.
4. `/events` endpoint + frontend "Incidents" view.
5. History beyond 5 days; daily feature/label snapshots → training dataset for ML risk models.

Optional (no accounts needed): French translation, share button, DGPC official-stats overlay, burned-area (Sentinel NBR), alerts.
