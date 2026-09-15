"""App factory. Vercel's FastAPI preset imports the module-level `app` from here."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import Settings, get_settings
from app.errors import install_error_handlers
from app.infra.observability import init_sentry
from app.middleware import BlankQueryParamsMiddleware, RequestIdMiddleware
from app.routers.site import health, meta


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # S10: create the SQLAlchemy async engine lazily here (infra/db.py) and dispose on exit.
    yield


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

    # Before the middleware stack is built, so sentry-sdk's ASGI integration wraps everything below.
    init_sentry(settings)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(BlankQueryParamsMiddleware)

    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(meta.router)
    return app


app = create_app()
