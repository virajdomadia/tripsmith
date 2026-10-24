"""The restore drill (V6, OP-3): take a nightly backup artifact, decrypt it, restore it into a
scratch database, and compare its row counts with the ones captured in the dump's snapshot —
and, with --prod-url, show how production has moved since (informational). Prints the timings
for docs/18-runbook.md § Restore.

    uv run python -m scripts.restore_drill --key C:/Users/Viraj/.age/tripsmith-backup.txt
    uv run python -m scripts.restore_drill --key … --run 123456789      # a given workflow run
    uv run python -m scripts.restore_drill --key … --dir ./downloaded    # an artifact already here
    uv run python -m scripts.restore_drill --key … --prod-url "$env:BACKUP_DATABASE_URL"

Needs gh (signed in), age and the Postgres client tools on PATH. The target defaults to a
local scratch database, which is dropped and re-created; a --target that is not local, or that
has any query parameters (libpq's host=, hostaddr= or service= would override the host), is
refused, so the drill can never overwrite production. The decrypted dump is deleted on exit;
the scratch database stays (for poking at) unless --drop.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

WORKFLOW = "db-backup.yml"
DEFAULT_TARGET = "postgresql://tripsmith@localhost:5433/tripsmith_restore_drill"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# The same query the workflow writes counts.tsv with — keep the two identical.
COUNTS_SQL = (
    "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c "
    "from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables "
    "where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
)


def run(*args: str, capture: bool = False) -> str:
    # S603: the drill's own fixed commands (pg tools, age, gh), never shell, never user input.
    done = subprocess.run(args, check=True, text=True, capture_output=capture)  # noqa: S603
    return done.stdout if capture else ""


def counts(url: str) -> dict[str, int]:
    out = run("psql", url, "-XAt", "-F", "\t", "-c", COUNTS_SQL, capture=True)
    return parse_counts(out)


def parse_counts(text: str) -> dict[str, int]:
    rows = (line.split("\t") for line in text.splitlines() if line.strip())
    return {table: int(n) for table, n in rows}


def with_db(url: str, db: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{db}"))


def download(run_id: str | None, into: Path) -> None:
    if run_id is None:
        run_id = run(
            "gh", "run", "list", "--workflow", WORKFLOW, "--status", "success", "--limit", "1",
            "--json", "databaseId", "--jq", ".[0].databaseId",
            capture=True,
        ).strip()  # fmt: skip
        if not run_id:
            raise SystemExit(f"No successful {WORKFLOW} run to restore from")
    print(f"Downloading the artifact of run {run_id}")
    run("gh", "run", "download", run_id, "--dir", str(into))


def local_target(url: str) -> str | None:
    """Why the target is refused, or None when it is safe to drop and re-create."""
    parts = urlsplit(url)
    if parts.query:
        return "the target URL may not carry query parameters"
    if parts.hostname not in LOCAL_HOSTS:
        return f"{parts.hostname} is not a local database"
    return None


def newest_backup(source: Path) -> tuple[Path, Path]:
    """The newest `.dump.age` (stamps sort as text) and the counts file of the same night."""
    dumps = sorted(source.rglob("*.dump.age"), key=lambda p: p.name)
    if not dumps:
        raise SystemExit(f"No *.dump.age under {source}")
    dump = dumps[-1]
    counts_file = dump.with_name(dump.name.removesuffix(".dump.age") + ".counts.tsv.age")
    if not counts_file.exists():
        raise SystemExit(f"{counts_file.name} is missing beside {dump.name}")
    return dump, counts_file


def compare(label: str, want: dict[str, int], got: dict[str, int]) -> bool:
    diff = {t for t in want.keys() | got.keys() if want.get(t) != got.get(t)}
    for table in sorted(diff):
        print(f"  {table}: {label} {want.get(table)} vs restored {got.get(table)}")
    print(f"{label}: {len(want)} tables, {'all match' if not diff else f'{len(diff)} differ'}")
    return not diff


def main(args: argparse.Namespace) -> int:
    refused = local_target(args.target)
    if refused:
        print(f"Refusing: {refused}", file=sys.stderr)
        return 1
    db_name = urlsplit(args.target).path.lstrip("/")
    admin_url = with_db(args.target, "postgres")
    started = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="tripsmith-drill-") as tmp:
        work = Path(tmp)
        source = Path(args.dir) if args.dir else work / "artifact"
        if not args.dir:
            download(args.run, source)
        dump_age, counts_age = newest_backup(source)
        print(f"Backup: {dump_age.name}")
        fetched = time.monotonic()

        dump, counts_file = work / "tripsmith.dump", work / "counts.tsv"
        for sealed, plain in ((dump_age, dump), (counts_age, counts_file)):
            run("age", "--decrypt", "--identity", args.key, "--output", str(plain), str(sealed))
        at_dump = parse_counts(counts_file.read_text(encoding="utf-8"))
        decrypted = time.monotonic()

        # `with (force)`: a psql left open on last time's scratch database must not block it.
        run("psql", admin_url, "-Xqc", f'drop database if exists "{db_name}" with (force)')
        run("psql", admin_url, "-Xqc", f'create database "{db_name}"')
        run("psql", args.target, "-Xqc", "drop schema public")  # the dump creates it
        run("pg_restore", f"--dbname={args.target}", "--no-owner", "--no-privileges",
            "--exit-on-error", str(dump))  # fmt: skip
        restored_at = time.monotonic()

    restored = counts(args.target)
    revision = run(
        "psql", args.target, "-XAtc", "select version_num from alembic_version", capture=True
    ).strip()
    ok = compare("at dump time", at_dump, restored)
    if args.prod_url:  # informational: production has moved on since the dump
        compare("production now", counts(args.prod_url), restored)
    print(f"alembic revision: {revision}")
    print(
        f"Timings: download {fetched - started:.0f} s, decrypt {decrypted - fetched:.0f} s, "
        f"restore {restored_at - decrypted:.0f} s, total {time.monotonic() - started:.0f} s"
    )
    if args.drop:
        run("psql", admin_url, "-Xqc", f'drop database "{db_name}" with (force)')
    return 0 if ok else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore a nightly backup into a scratch DB")
    parser.add_argument("--key", required=True, help="the age identity file (private key)")
    parser.add_argument("--run", help="workflow run id (default: the newest successful run)")
    parser.add_argument("--dir", help="an artifact already downloaded (skips gh)")
    parser.add_argument("--target", default=DEFAULT_TARGET, help="local scratch database URL")
    parser.add_argument("--prod-url", help="also compare with production (read-only URL)")
    parser.add_argument("--drop", action="store_true", help="drop the scratch database after")
    parsed = parser.parse_args()
    for tool in ("age", "psql", "pg_restore") + (() if parsed.dir else ("gh",)):
        if shutil.which(tool) is None:
            raise SystemExit(f"{tool} is not on PATH")
    sys.exit(main(parsed))
