"""Migration 0003 (expand-only): sessions opened before v1.0.1 hold only the raw token; the
upgrade backfills `token_hash` beside it, so the cookie a signed-in owner already has keeps
working, and the old code's `token` column stays readable until the v2 contract step."""

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
def test_upgrade_backfills_hashes_and_keeps_the_old_column(migrated_database_url: str) -> None:
    # Sync on purpose: env.py runs its own event loop, like the conftest harness.
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    expires = (dt.datetime.now(dt.UTC) + dt.timedelta(days=1)).isoformat()
    try:
        command.downgrade(cfg, "0002")
        asyncio.run(
            _sql(
                url,
                "truncate table users cascade",
                "insert into users (id, name, email, role) "
                "values ('u-mig', 'Owner', 'mig@tripsmith.demo', 'owner')",
                "insert into sessions (id, user_id, token, expires_at) "
                f"values ('s-old', 'u-mig', '{RAW}', '{expires}')",
            )
        )
        command.upgrade(cfg, "head")
        rows = asyncio.run(_sql(url, "select token, token_hash from sessions where id = 's-old'"))
        assert rows == [(RAW, hash_token(RAW))]  # expand: the old column is untouched

        # Old code still running after the migration: it inserts `token` only — allowed now
        # that the column is nullable-compatible both ways. New code writes `token_hash` only.
        asyncio.run(
            _sql(
                url,
                "insert into sessions (id, user_id, token, expires_at) "
                f"values ('s-gap', 'u-mig', 'opened-by-old-code', '{expires}')",
                "insert into sessions (id, user_id, token_hash, expires_at) "
                f"values ('s-new', 'u-mig', '{hash_token('new')}', '{expires}')",
            )
        )

        command.downgrade(cfg, "0002")  # new-code rows have no raw token: they go
        rows = asyncio.run(_sql(url, "select id from sessions order by id"))
        assert rows == [("s-gap",), ("s-old",)]
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(_sql(url, "truncate table users cascade"))
