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

    # --- Redis (optional). If unset, an in-memory cache is used (fine for local dev). ---
    redis_url: str = ""

    # --- Fires endpoint cache TTL (seconds). FIRMS NRT updates only a few times/day. ---
    fires_cache_ttl: int = 600

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
