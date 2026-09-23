"""App factory. Vercel's FastAPI preset imports the module-level `app` from here."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import Settings, get_settings
from app.errors import install_error_handlers
from app.infra.db import dispose_engine
from app.infra.email import build_email_sender
from app.infra.observability import init_sentry
from app.infra.ratelimit import build_rate_limiter
from app.infra.storage import LOCAL_STORE_DIR, build_store
from app.middleware import BlankQueryParamsMiddleware, FreshQueryMiddleware, RequestIdMiddleware
from app.routers import auth
from app.routers.admin import destinations as admin_destinations
from app.routers.admin import enquiries as admin_enquiries
from app.routers.admin import package_images as admin_package_images
from app.routers.admin import packages as admin_packages
from app.routers.cron import pdf_gc
from app.routers.site import catalog, enquiries, health, meta, pdf, views
from app.services.pdf.service import PdfService


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
    app = FastAPI(
        title="Tripsmith API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,  # ReDoc off (06 C0)
        lifespan=lifespan,
    )
    app.state.settings = settings  # read by infra.db.get_session
    app.state.rate_limiter = build_rate_limiter(settings)  # swapped by tests; read by routers
    app.state.email_sender = build_email_sender(settings)  # swapped by tests; read by routers
    app.state.store = build_store(settings)  # Vercel Blob or None; read by services/pdf
    app.state.pdf = PdfService(app.state.store, settings)  # swapped by tests; read by routers

    # Before the middleware stack is built, so sentry-sdk's ASGI integration wraps everything below.
    init_sentry(settings)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(BlankQueryParamsMiddleware)
    app.add_middleware(FreshQueryMiddleware)

    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(meta.router)
    app.include_router(auth.router)
    app.include_router(admin_destinations.router)
    app.include_router(admin_enquiries.router)
    app.include_router(admin_packages.router)
    app.include_router(admin_package_images.router)
    app.include_router(catalog.router)
    app.include_router(pdf.router)
    app.include_router(enquiries.router)
    app.include_router(views.router)
    app.include_router(pdf_gc.router)

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
