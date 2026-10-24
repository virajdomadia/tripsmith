"""What the e2e app (tests.e2e_app) and its reset (tests.e2e_seed) share, with no side effects:
importing tests.e2e_app builds the app, and through app.main the env-configured one too."""

import os

from sqlalchemy import make_url

OWNER_EMAIL = "owner@tripsmith-e2e.dev"
OWNER_PASSWORD = "e2e-owner-password-not-secret"
SESSION_SECRET = "e2e-session-secret-not-secret"
# Not @resend.dev and not a demo domain: the sign-in code is "emailed" (to the outbox), not
# shown on screen, so the journey exercises the real email path.
EMAIL_FROM = "Tripsmith <bookings@tripsmith-e2e.dev>"


def e2e_database_url() -> str:
    url = os.environ.get("E2E_DATABASE_URL", "")
    if not url:
        raise SystemExit("E2E_DATABASE_URL is not set (a throwaway Postgres, e.g. …/tripsmith_e2e)")
    name = make_url(url).database or ""
    if "e2e" not in name:
        raise SystemExit(f"E2E_DATABASE_URL must name an e2e database, not {name!r}")
    return url
