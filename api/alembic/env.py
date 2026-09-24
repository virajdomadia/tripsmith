"""Async Alembic environment. The target is ALEMBIC_URL and nothing else: api/.env.local holds the
production DATABASE_URL (the app's runtime secret), so a bare `alembic upgrade head` must never
fall through to it. Every run names its database explicitly. Views are raw SQL inside the
revisions."""

import asyncio
import os

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.models import Base

config = context.config
target_metadata = Base.metadata


def database_url() -> str:
    url = os.environ.get("ALEMBIC_URL")
    if not url:
        raise SystemExit(
            "ALEMBIC_URL is not set. Migrations never fall back to DATABASE_URL (it is production"
            " in api/.env.local). Name the target explicitly, e.g.\n"
            "  ALEMBIC_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tripsmith"
            " uv run alembic upgrade head"
        )
    return url


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
