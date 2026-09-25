"""App factory. Vercel's FastAPI preset imports the module-level `app` from here."""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.types import ASGIApp

from app.config import Settings, get_settings
from app.errors import install_error_handlers
from app.infra.db import dispose_engine
from app.infra.email import build_email_sender
from app.infra.observability import init_sentry
from app.infra.ratelimit import build_rate_limiter
from app.infra.razorpay import build_razorpay
from app.infra.storage import LOCAL_STORE_DIR, build_store
from app.middleware import (
    BlankQueryParamsMiddleware,
    FreshQueryMiddleware,
    HeadAsGetMiddleware,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
)
from app.routers import auth
from app.routers.admin import dashboard as admin_dashboard
from app.routers.admin import destinations as admin_destinations
from app.routers.admin import enquiries as admin_enquiries
from app.routers.admin import package_images as admin_package_images
from app.routers.admin import packages as admin_packages
from app.routers.cron import daily, pdf_gc
from app.routers.site import bookings, catalog, enquiries, health, meta, pdf, views, webhooks
from app.services.pdf.service import PdfService

log = logging.getLogger(__name__)


def _check_keyed_hashing(settings: Settings) -> None:
    """`services/enquiries.hash_ip` keys its digest with `SESSION_SECRET` (H4, docs/12).

    Nothing else reads that variable — it is reserved for v2's OTP — so a deployment that never
    set it would look healthy while storing an unkeyed digest of every visitor's address, which
    is enumerable over IPv4. Say so loudly on a deployment; locally there is nothing to protect.
    ERROR rather than WARNING so Sentry's logging integration carries it to the dashboard.
    """
    if os.environ.get("VERCEL") and not settings.session_secret:
        log.error(
            "SESSION_SECRET is unset: enquiry IP hashes are unkeyed and can be reversed by "
            "enumeration. Set it on this project (see docs/12-security-performance.md)."
        )


class TripsmithApi(FastAPI):
    """FastAPI with `HeadAsGetMiddleware` around the *finished* stack — outside even Starlette's
    ServerErrorMiddleware, which `add_middleware` cannot reach. Only there does every body a HEAD
    could produce get dropped, the unhandled-500 envelope included (a body on a HEAD response
    is a protocol error in h11)."""

    def build_middleware_stack(self) -> ASGIApp:
        return HeadAsGetMiddleware(super().build_middleware_stack())


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # The engine is created lazily by the first session (infra/db.py); only disposal lives here.
    try:
        yield
    finally:
        await dispose_engine()


def create_app(settings: Settings | None = None) -> FastAPI:
    """`settings` lets tests build an app with Sentry off regardless of the local .env."""
    settings = settings or get_settings()
    app = TripsmithApi(
        title="Tripsmith API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,  # ReDoc off (06 C0)
        lifespan=lifespan,
    )
    app.state.settings = settings  # read by infra.db.get_session
    # First: sentry-sdk's ASGI integration must wrap the middleware stack built below, and the
    # startup checks that follow (rate limiter, email sender, Razorpay, keyed hashing) log at
    # ERROR so Sentry's logging integration carries them — which it can only do once initialised.
    init_sentry(settings)
    app.state.rate_limiter = build_rate_limiter(settings)  # swapped by tests; read by routers
    app.state.email_sender = build_email_sender(settings)  # swapped by tests; read by routers
    app.state.razorpay = build_razorpay(settings)  # None when unset; swapped by tests
    app.state.store = build_store(settings)  # Vercel Blob or None; read by services/pdf
    app.state.pdf = PdfService(app.state.store, settings)  # swapped by tests; read by routers

    _check_keyed_hashing(settings)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(BlankQueryParamsMiddleware)
    app.add_middleware(FreshQueryMiddleware)
    # Last call = outermost (Starlette inserts each at index 0 and wraps the list in reverse), so
    # this one sees every response the stack below can produce — including one from a middleware
    # added here later that answers without delegating. Keep it at the bottom of this block.
    app.add_middleware(SecurityHeadersMiddleware)

    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(meta.router)
    app.include_router(auth.router)
    app.include_router(admin_dashboard.router)
    app.include_router(admin_destinations.router)
    app.include_router(admin_enquiries.router)
    app.include_router(admin_packages.router)
    app.include_router(admin_package_images.router)
    app.include_router(catalog.router)
    app.include_router(pdf.router)
    app.include_router(enquiries.router)
    app.include_router(bookings.router)
    app.include_router(webhooks.router)
    app.include_router(views.router)
    app.include_router(pdf_gc.router)
    app.include_router(daily.router)

    # Dev only: `scripts/seed.py --local` mirrors photos to api/.seed-photos (gitignored, never
    # deployed) and points image URLs here; on Vercel photos come from Blob. `check_dir=False`
    # so a dev server started before the first local seed serves the folder once it appears.
    if not os.environ.get("VERCEL"):
        app.mount(
            "/seed-photos",
            StaticFiles(directory=LOCAL_STORE_DIR, check_dir=False),
            name="seed-photos",
        )
    return app


app = create_app()
