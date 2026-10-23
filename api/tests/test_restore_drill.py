"""V6 (OP-3): the restore drill's pure parts — it never touches a non-local database."""

import argparse

from scripts.restore_drill import main, parse_counts, with_db


def test_parse_counts_reads_the_workflow_file() -> None:
    assert parse_counts("bookings\t296\nusers\t2\n\n") == {"bookings": 296, "users": 2}


def test_with_db_swaps_only_the_database() -> None:
    url = "postgresql://u@localhost:5433/drill?sslmode=disable"
    assert with_db(url, "postgres") == "postgresql://u@localhost:5433/postgres?sslmode=disable"


def test_a_remote_target_is_refused_before_anything_runs() -> None:
    args = argparse.Namespace(
        target="postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
        key="k", run=None, dir=None, prod_url=None, drop=False,
    )  # fmt: skip
    assert main(args) == 1
