"""Settings: every api/ env var from docs/04-technical-design.md §12.

Secrets are `SecretStr | None` so the app imports and constructs with no environment at
all (CI has no secrets, 04 §10) and never reprs a secret. Non-secret keys carry the local
dev defaults from api/.env.example.
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Database (Neon; asyncpg URL). TEST_DATABASE_URL is dev/CI only. ---
    database_url: SecretStr | None = None
    test_database_url: SecretStr | None = None

    # --- Auth ---
    session_secret: SecretStr | None = None
    owner_email: str | None = None
    owner_password: SecretStr | None = None

    # --- Email (Resend) ---
    resend_api_key: SecretStr | None = None
    email_from: str = "Tripsmith <onboarding@resend.dev>"
    owner_notify_email: str | None = None
    whatsapp_number: str = "919845012345"  # E.164 digits, no "+"; printed in the visitor email

    # --- Storage (Vercel Blob) ---
    blob_read_write_token: SecretStr | None = None

    # --- Rate limiting (Upstash Redis REST) ---
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: SecretStr | None = None

    # --- Errors (Sentry; empty = off) ---
    sentry_dsn: str | None = None

    # --- Payments (Razorpay, test mode; unset = online booking answers 503) ---
    # The key id is public — Checkout.js is opened with it — so only the secret is a SecretStr.
    razorpay_key_id: str | None = None
    razorpay_key_secret: SecretStr | None = None
    # Signs `POST /webhooks/razorpay` (B6); set only where the webhook is registered (production).
    razorpay_webhook_secret: SecretStr | None = None

    # --- Cron ---
    cron_secret: SecretStr | None = None

    # --- Cross-service URLs ---
    web_url: str = "http://localhost:3000"
    revalidate_secret: SecretStr | None = None
    site_url: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    """FastAPI dependency; cached so the env file is read once per process."""
    return Settings()
