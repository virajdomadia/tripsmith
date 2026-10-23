"""Settings: every api/ env var from docs/04-technical-design.md §12.

Secrets are `SecretStr | None` so the app imports and constructs with no environment at
all (CI has no secrets, 04 §10) and never reprs a secret. Non-secret keys carry the local
dev defaults from api/.env.example.
"""

import os
from functools import lru_cache
from typing import Any

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Database (Supabase in production; asyncpg URL). TEST_DATABASE_URL is dev/CI only. ---
    database_url: SecretStr | None = None
    test_database_url: SecretStr | None = None

    # --- Auth ---
    session_secret: SecretStr | None = None
    owner_email: str | None = None
    owner_password: SecretStr | None = None
    # P19: the owner login is printed on the site (it's a portfolio demo). True = what an owner
    # does can't reach a real inbox or a real customer's full ID number: customer emails on
    # counter bookings and inbox replies go to OWNER_NOTIFY_EMAIL, and the manifest masks the
    # IDs of anyone but the seeded demo addresses. V2 (SA-1): every customer email the owner
    # (or the cron) sends goes there too — only the sign-in code and a customer's own receipt
    # reach a real inbox. V2 (SA-3): unset on production (VERCEL_ENV=production) means on; only
    # an explicit 'false' turns it off there, and while on, a live Razorpay key is refused.
    public_demo_owner: bool = False

    # --- Email: SMTP when host, user and password are all set (v2.5 P0: Gmail), else Resend ---
    smtp_host: str | None = None
    smtp_port: int = 587  # STARTTLS
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
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

    # --- Traveller ID numbers (P9, R49) ---
    # Fernet keys, comma-separated, newest first: the first encrypts, any of them decrypts (so a
    # key can be rotated). Unset = ID numbers can't be saved (the rest of the details can).
    id_number_key: SecretStr | None = None

    # --- Cron ---
    cron_secret: SecretStr | None = None
    # V4 (OP-1): healthchecks.io ping URLs, hit at the end of /cron/daily and /cron/emails, so a
    # job that stops running alerts within its grace. Secrets: whoever holds one can report the
    # job healthy. Unset = no ping (local dev, previews).
    healthcheck_daily_url: SecretStr | None = None
    healthcheck_emails_url: SecretStr | None = None

    # --- Cross-service URLs ---
    web_url: str = "http://localhost:3000"
    revalidate_secret: SecretStr | None = None
    site_url: str = "http://localhost:3000"

    @model_validator(mode="before")
    @classmethod
    def _demo_owner_on_in_production(cls, data: Any) -> Any:
        """SA-3: a lost PUBLIC_DEMO_OWNER must fail safe, not open. VERCEL_ENV is Vercel's own
        system variable (not one of ours), so it is read from the process env."""
        if isinstance(data, dict) and data.get("public_demo_owner") in (None, ""):
            data = {**data, "public_demo_owner": os.environ.get("VERCEL_ENV") == "production"}
        return data


@lru_cache
def get_settings() -> Settings:
    """FastAPI dependency; cached so the env file is read once per process."""
    return Settings()
