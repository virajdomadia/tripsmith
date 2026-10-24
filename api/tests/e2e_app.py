"""The api for the Playwright journeys (web/e2e, V9): the real app over a throwaway Postgres,
with every outside service swapped for an in-process fake. Never deployed.

    E2E_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5432/tripsmith_e2e \\
        uv run --directory api uvicorn tests.e2e_app:app --port 8000

- Razorpay is `FakeRazorpay` (orders answered locally, real HMACs under its test secret), so
  the browser's Checkout stub signs `order|payment` with the same secret and the confirm verifies.
- Email goes to an in-memory outbox, read back on `GET /__e2e/outbox?to=…` (the sign-in code).
- `POST /__e2e/razorpay` flips the fake's refund endpoint down / up, so a refund can be left
  owed for the owner's "Send refund" journey.
- Rate limiting is the null limiter, Sentry is off, PDFs never fetch a cover, there is no Blob.

Settings are built from explicit values only — never the process env or api/.env.local, which
holds production — and the database must be one whose name says it is the e2e one.
"""

import os
from typing import Any

import httpx
import sentry_sdk
from fastapi import FastAPI, Query
from pydantic import BaseModel
from sqlalchemy import make_url

from app.infra.email import EmailMessage
from app.infra.ratelimit import NullRateLimiter
from app.main import create_app
from app.services.pdf.service import PdfService
from tests.razorpay_fake import KEY_ID, KEY_SECRET, FakeRazorpay
from tests.settings import make_settings

if os.environ.get("VERCEL"):
    raise SystemExit("tests.e2e_app is a local / CI test server and never runs on Vercel")

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


class Outbox:
    """An `EmailSender` that keeps every message."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> str | None:
        self.sent.append(message)
        return f"e2e_{len(self.sent)}"


class RazorpaySwitch(BaseModel):
    refunds_down: bool


def build_app() -> FastAPI:
    web_url = os.environ.get("E2E_WEB_URL", "http://localhost:3000")
    settings = make_settings(
        database_url=e2e_database_url(),
        session_secret=SESSION_SECRET,
        owner_email=OWNER_EMAIL,
        owner_password=OWNER_PASSWORD,
        public_demo_owner=False,
        email_from=EMAIL_FROM,
        razorpay_key_id=KEY_ID,
        razorpay_key_secret=KEY_SECRET,
        web_url=web_url,
        site_url=web_url,
    )
    app = create_app(settings=settings)
    # Importing app.main built its module-level app from the real env; nothing reports anywhere.
    sentry_sdk.get_global_scope().set_client(None)

    outbox = Outbox()
    rzp = FakeRazorpay()
    app.state.email_sender = outbox
    app.state.razorpay = rzp
    app.state.rate_limiter = NullRateLimiter()
    app.state.store = None
    app.state.pdf = PdfService(
        None, settings, transport=httpx.MockTransport(lambda r: httpx.Response(404))
    )

    @app.get("/__e2e/outbox", include_in_schema=False)
    async def read_outbox(to: str = Query(...)) -> list[dict[str, Any]]:
        """Newest first: what was sent to `to`."""
        want = to.strip().lower()
        return [
            {"to": m.to, "subject": m.subject, "text": m.text}
            for m in reversed(outbox.sent)
            if m.to.strip().lower() == want
        ]

    @app.post("/__e2e/razorpay", include_in_schema=False)
    async def switch_razorpay(body: RazorpaySwitch) -> dict[str, bool]:
        rzp.refunds_down = body.refunds_down
        return {"refundsDown": rzp.refunds_down}

    return app


app = build_app()
