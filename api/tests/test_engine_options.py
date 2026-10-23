"""Engine options per database URL: only Supabase's transaction pooler turns the statement caches
off (no database needed)."""

from app.infra.db import connect_args

POOLER = "postgresql+asyncpg://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
SESSION = "postgresql+asyncpg://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
LOCAL = "postgresql+asyncpg://tripsmith@localhost:5433/tripsmith_dev"


def test_transaction_pooler_turns_statement_caches_off() -> None:
    args = connect_args(POOLER)
    assert args["statement_cache_size"] == 0
    assert args["prepared_statement_cache_size"] == 0
    first, second = args["prepared_statement_name_func"](), args["prepared_statement_name_func"]()
    assert first != second
    assert first.startswith("__asyncpg_")


def test_session_pooler_and_local_keep_the_caches() -> None:
    assert connect_args(SESSION) == {}
    assert connect_args(LOCAL) == {}
