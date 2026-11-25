import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./crisistwin.db"
    @field_validator("database_url")
    @classmethod
    def _normalise_db_url(cls, v: str) -> str:
        v = v.strip()
        # Hosted providers (Neon, Supabase, Vercel Postgres, Heroku) hand out postgres:// or postgresql:// URLs.
        for old in ("postgres://", "postgresql://"):
            if v.startswith(old):
                return "postgresql+psycopg://" + v[len(old):]
        return v

    secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 60
    cors_origins: list[str] = ["http://localhost:3000"]
    ai_provider: str = "auto"  # auto | groq | gemini  (auto = Groq if GROQ_API_KEY is set, else Gemini)
    admin_email: str | None = None  # optional: auto-create this administrator at startup (set in Vercel env, not in code)
    admin_password: str | None = None
    groq_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    ai_rate_limit_per_minute: int = 10
    # Approximate bounding box of Balochistan, used only as a sanity check on coordinates.
    bbox_min_lon: float = 60.8
    bbox_max_lon: float = 70.6
    bbox_min_lat: float = 24.0
    bbox_max_lat: float = 32.2


settings = Settings()

ON_VERCEL = bool(os.getenv("VERCEL"))
EPHEMERAL_DB = False
if ON_VERCEL and settings.database_url.startswith("sqlite"):
    # Vercel's filesystem is read-only except /tmp, and /tmp is wiped between invocations.
    # This only keeps the API from crashing; set DATABASE_URL to a hosted PostgreSQL for real data.
    settings.database_url = "sqlite:////tmp/crisistwin.db"
    EPHEMERAL_DB = True

if settings.app_env == "production" and settings.secret_key == "dev-only-change-me":
    raise RuntimeError("SECRET_KEY must be set in production")
