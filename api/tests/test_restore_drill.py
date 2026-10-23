"""V6 (OP-3): the restore drill's pure parts — it never touches a non-local database."""

import argparse
from pathlib import Path

import pytest

from scripts.restore_drill import local_target, main, newest_backup, parse_counts, with_db


def test_parse_counts_reads_the_workflow_file() -> None:
    assert parse_counts("bookings\t296\r\nusers\t2\n\n") == {"bookings": 296, "users": 2}


def test_with_db_swaps_only_the_database() -> None:
    url = "postgresql://u@localhost:5433/drill"
    assert with_db(url, "postgres") == "postgresql://u@localhost:5433/postgres"


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
        # libpq lets these override the URI's host — the guard must not be fooled by them.
        "postgresql://u@localhost:5433/x?host=aws-0-ap-south-1.pooler.supabase.com",
        "postgresql://u@localhost:5433/x?hostaddr=13.200.0.1",
        "postgresql://u@localhost:5433/x?service=prod",
        "postgresql:///x",  # a socket path, not a named local host
    ],
)
def test_a_target_that_could_be_remote_is_refused(url: str) -> None:
    assert local_target(url) is not None


def test_the_default_kind_of_target_is_accepted() -> None:
    assert local_target("postgresql://tripsmith@localhost:5433/tripsmith_restore_drill") is None


def test_a_remote_target_is_refused_before_anything_runs() -> None:
    args = argparse.Namespace(
        target="postgresql://u@localhost:5433/x?host=db.example.test",
        key="k", run=None, dir=None, prod_url=None, drop=False,
    )  # fmt: skip
    assert main(args) == 1


def test_newest_backup_pairs_the_dump_with_its_own_counts(tmp_path: Path) -> None:
    for stamp in ("2026-10-20T2040Z", "2026-10-23T2040Z", "2026-10-21T2040Z"):
        night = tmp_path / f"tripsmith-db-{stamp}"
        night.mkdir()
        (night / f"tripsmith-{stamp}.dump.age").write_bytes(b"")
        (night / f"tripsmith-{stamp}.counts.tsv.age").write_bytes(b"")
    dump, counts = newest_backup(tmp_path)
    assert dump.name == "tripsmith-2026-10-23T2040Z.dump.age"
    assert counts.name == "tripsmith-2026-10-23T2040Z.counts.tsv.age"
    assert counts.parent == dump.parent


def test_newest_backup_without_its_counts_stops_clearly(tmp_path: Path) -> None:
    (tmp_path / "tripsmith-2026-10-23T2040Z.dump.age").write_bytes(b"")
    with pytest.raises(SystemExit, match="counts.tsv.age is missing"):
        newest_backup(tmp_path)
