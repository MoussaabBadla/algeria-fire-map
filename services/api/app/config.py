"""Application settings, loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- NASA FIRMS ---
    # Free key: https://firms.modaps.eosdis.nasa.gov/api/area/  (click "Get MAP_KEY")
    nasa_firms_map_key: str = ""

    # --- CORS: comma-separated list of allowed frontend origins ---
    cors_origins: str = "http://localhost:3000"
    # Optional regex to allow dynamic origins (e.g. Vercel preview deploys).
    cors_origin_regex: str = ""

    # --- Redis (optional). If unset, an in-memory cache is used (fine for local dev). ---
    redis_url: str = ""

    # --- Postgres/PostGIS (Supabase). If unset, persistence features are disabled
    # and the API runs in stateless passthrough mode (current behaviour). ---
    database_url: str = ""

    # --- Admin ---
    # Shared secret guarding POST /admin/* (manual ingest, etc.). Required when
    # ingest is enabled in production.
    admin_token: str = ""

    # --- Ingestion scheduler ---
    # Enable the in-process APScheduler ingest loop (set true on the Railway service).
    ingest_enabled: bool = False
    # How often to pull FIRMS and upsert detections (seconds).
    ingest_interval_seconds: int = 900  # 15 min
    # Day-range to pull each ingest cycle (FIRMS NRT caps at 5).
    ingest_days: int = 3
    # A detection is part of an "active" incident if seen within this many hours.
    event_active_hours: int = 24

    # --- Clustering (ST-DBSCAN-ish) ---
    # Spatial radius for grouping detections into one incident (degrees; ~0.03° ≈ 3 km).
    cluster_eps_deg: float = 0.03
    cluster_min_points: int = 1
    # Only detections within this rolling window drive clustering, so a location
    # that reignites after a quiet gap becomes a NEW incident (the temporal split).
    cluster_link_days: int = 4

    # --- Fires endpoint cache TTL (seconds). FIRMS NRT updates only a few times/day. ---
    fires_cache_ttl: int = 600

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
