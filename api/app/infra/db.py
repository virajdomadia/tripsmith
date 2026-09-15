"""Database engine + session dependency (05 §3: infra owns the vendor; services get sessions).

The engine is created lazily on first use — the app must import and serve `/health` with no
`DATABASE_URL` at all (CI, tests, the meta endpoint) — and disposed by the lifespan.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings, get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


class DatabaseNotConfigured(RuntimeError):
    pass


def make_engine(url: str) -> AsyncEngine:
    """One place for engine options. Neon's pooled endpoint closes idle connections, so
    `pool_pre_ping` re-validates before use; the pool stays small for a serverless function."""
    return create_async_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=3)


def get_engine(settings: Settings | None = None) -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        settings = settings or get_settings()
        if settings.database_url is None:
            raise DatabaseNotConfigured("DATABASE_URL is not set")
        _engine = make_engine(settings.database_url.get_secret_value())
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _session_factory is not None
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, rolled back unless the service committed."""
    async with session_factory()() as session:
        yield session


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
