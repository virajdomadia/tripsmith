"""Database engine + session dependency (05 §3: infra owns the vendor; services get sessions).

Engines are created lazily per database URL — the app must import and serve `/health` with no
`DATABASE_URL` at all (CI, tests, the meta endpoint) — and disposed by the lifespan. The
dependency reads the URL from the app's own `Settings` (`app.state.settings`), never from the
process env behind the app's back, so a test app with no URL stays offline even when the
developer's `.env.local` has one.
"""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings

_engines: dict[str, AsyncEngine] = {}


class DatabaseNotConfigured(RuntimeError):
    pass


def make_engine(url: str) -> AsyncEngine:
    """One place for engine options. Neon's pooled endpoint closes idle connections, so
    `pool_pre_ping` re-validates before use; the pool stays small for a serverless function."""
    return create_async_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=3)


def get_engine(settings: Settings) -> AsyncEngine:
    if settings.database_url is None:
        raise DatabaseNotConfigured("DATABASE_URL is not set")
    url = settings.database_url.get_secret_value()
    engine = _engines.get(url)
    if engine is None:
        engine = _engines[url] = make_engine(url)
    return engine


def session_factory(settings: Settings) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(settings), expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, rolled back unless the service committed."""
    settings: Settings = request.app.state.settings
    async with session_factory(settings)() as session:
        yield session


async def dispose_engine() -> None:
    for engine in list(_engines.values()):
        await engine.dispose()
    _engines.clear()
