"""App factory. Vercel's FastAPI preset imports the module-level `app` from here."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.errors import install_error_handlers
from app.middleware import RequestIdMiddleware
from app.routers.public import health


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # S10: create the SQLAlchemy async engine lazily here (infra/db.py) and dispose on exit.
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Tripsmith API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,  # ReDoc off (06 C0)
        lifespan=lifespan,
    )

    # S8 hook point: `infra.observability.init_sentry(get_settings())` goes here, before the
    # middleware stack is built, so sentry-sdk's ASGI integration wraps everything below.
    app.add_middleware(RequestIdMiddleware)

    install_error_handlers(app)

    app.include_router(health.router)
    return app


app = create_app()
