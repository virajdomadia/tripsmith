"""Shared fixtures: a fresh app per test and an in-process httpx client, plus the DB harness.

`raise_app_exceptions=False` so unhandled errors reach the test as the 500 envelope
(what a real client sees) instead of a traceback out of the transport.

DB harness (S10): tests marked `db` need `TEST_DATABASE_URL`. Once per session the schema is
rebuilt through Alembic (downgrade base → upgrade head, so the downgrade path is exercised too);
before every test all tables are truncated. Without the variable, `db` tests are skipped —
unless `REQUIRE_DB_TESTS=1` (CI sets it), where a missing URL fails the run instead, so a broken
Postgres service can never turn into a green build that ran none of them.
"""

import os
from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
import sentry_sdk
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.infra import db as db_module
from app.infra.db import get_session
from app.main import create_app
from app.models import Base
from app.services.pdf.service import PdfService
from tests.settings import make_settings

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture(autouse=True, scope="session")
def _sentry_off() -> None:
    # Importing app.main builds the module-level `app` from the real settings, which turns Sentry
    # on when api/.env.local carries a DSN. Tests start from an inactive SDK.
    sentry_sdk.get_global_scope().set_client(None)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "db: needs TEST_DATABASE_URL (Postgres)")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if TEST_DATABASE_URL:
        return
    if os.environ.get("REQUIRE_DB_TESTS") == "1" and any("db" in i.keywords for i in items):
        raise pytest.UsageError("REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is not set")
    skip = pytest.mark.skip(reason="TEST_DATABASE_URL not set")
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def app() -> FastAPI:
    # Pure defaults (tests/settings.py): no env, no .env.local — Sentry and the DB stay off.
    settings = make_settings()
    app = create_app(settings=settings)
    # No store, and a cover fetch that always 404s: PDFs render, nothing leaves the process.
    app.state.pdf = PdfService(
        None, settings, transport=httpx.MockTransport(lambda r: httpx.Response(404))
    )
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- DB harness ---------------------------------------------------------------------------------


@pytest.fixture(scope="session")
def migrated_database_url() -> Iterator[str]:
    """Rebuild the schema via Alembic once per session (sync: env.py owns its own event loop)."""
    assert TEST_DATABASE_URL  # `db` tests are skipped without it
    os.environ["ALEMBIC_URL"] = TEST_DATABASE_URL
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield TEST_DATABASE_URL


@pytest.fixture
async def db_engine(migrated_database_url: str) -> AsyncIterator[AsyncEngine]:
    # Per test: asyncpg connections are bound to the running loop, and pytest-asyncio gives each
    # test its own loop, so the engine (NullPool, nothing to reuse) lives with the test.
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(migrated_database_url, poolclass=NullPool)
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"truncate table {tables} restart identity cascade"))
    yield engine
    await engine.dispose()


@pytest.fixture
async def db(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with async_sessionmaker(db_engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture
async def db_app(app: FastAPI, db_engine: AsyncEngine) -> AsyncIterator[FastAPI]:
    """The app wired to the test database (routes that use the `get_session` dependency)."""
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def override() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override
    try:
        yield app
    finally:
        app.dependency_overrides.pop(get_session, None)
        await db_module.dispose_engine()


@pytest.fixture
async def db_client(db_app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=db_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
