"""Async Alembic environment. URL precedence: ALEMBIC_URL env (harness / one-off targets) →
Settings.database_url (.env.local / Vercel). Views are raw SQL inside the revisions."""

import asyncio
import os

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import get_settings
from app.models import Base

config = context.config
target_metadata = Base.metadata


def database_url() -> str:
    url = os.environ.get("ALEMBIC_URL")
    if url:
        return url
    secret = get_settings().database_url
    if secret is None:
        raise SystemExit("Set DATABASE_URL (api/.env.local) or ALEMBIC_URL to run migrations.")
    return secret.get_secret_value()


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(
        connection=connection, target_metadata=target_metadata, compare_server_default=True
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = async_engine_from_config({"sqlalchemy.url": database_url()}, prefix="sqlalchemy.")
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
