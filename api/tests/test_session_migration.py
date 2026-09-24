"""Migration 0002: sessions opened before v1.0.1 hold the raw token; the upgrade hashes them in
place, so the cookie a signed-in owner already has keeps working."""

import asyncio
import datetime as dt
import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.services.auth.sessions import hash_token

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = "pre-upgrade-raw-token_-AbC123"


async def _sql(url: str, *statements: str) -> list[tuple[object, ...]]:
    engine = create_async_engine(url, poolclass=NullPool)
    rows: list[tuple[object, ...]] = []
    try:
        async with engine.begin() as conn:
            for stmt in statements:
                res = await conn.execute(text(stmt))
                if res.returns_rows:
                    rows = [tuple(r) for r in res.all()]
    finally:
        await engine.dispose()
    return rows


@pytest.mark.db
def test_upgrade_hashes_existing_sessions_in_place(migrated_database_url: str) -> None:
    # Sync on purpose: env.py runs its own event loop, like the conftest harness.
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    expires = (dt.datetime.now(dt.UTC) + dt.timedelta(days=1)).isoformat()
    try:
        command.downgrade(cfg, "0001")
        asyncio.run(
            _sql(
                url,
                "truncate table users cascade",
                "insert into users (id, name, email, role) "
                "values ('u-mig', 'Owner', 'mig@tripsmith.demo', 'owner')",
                "insert into sessions (id, user_id, token, expires_at) "
                f"values ('s-mig', 'u-mig', '{RAW}', '{expires}')",
            )
        )
        command.upgrade(cfg, "head")
        rows = asyncio.run(_sql(url, "select token_hash from sessions where id = 's-mig'"))
        assert rows == [(hash_token(RAW),)]

        command.downgrade(cfg, "0001")  # tokens cannot be recovered: the rows go
        assert asyncio.run(_sql(url, "select count(*) from sessions")) == [(0,)]
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(_sql(url, "truncate table users cascade"))
