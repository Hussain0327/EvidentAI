"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "sqlite+aiosqlite:///./evidentai.db"
    database_pool_size: int = 5
    database_max_overflow: int = 10

    # API Key settings
    api_key_prefix: str = "rg_"
    api_key_length: int = 32

    # JWT settings (for future web dashboard)
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # Application
    environment: str = "development"
    debug: bool = True
    app_name: str = "EvidentAI API"
    app_version: str = "0.1.0"

    # CORS
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Dashboard URL (for generating links)
    dashboard_url: str = "http://localhost:3000"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
