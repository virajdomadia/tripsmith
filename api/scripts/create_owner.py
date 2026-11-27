"""Create (or reset) a private owner login — QA 2026-11-19.

The demo owner (`OWNER_EMAIL`, printed on the site) is made read-only in production by
`DEMO_READ_ONLY_EMAILS`, so the real owner needs a login of their own that is not printed
anywhere. This adds one — or, for an email that already has a `users` row, makes it an owner and
sets a new password. The password is asked for twice at the prompt (never an argument, so it
stays out of shell history and process lists) and stored as an argon2 hash, like the seed's.

    uv run python scripts/create_owner.py --email you@yourdomain.com --name "Your Name" \\
        --database-url "postgresql+asyncpg://…session pooler, port 5432…"

The target is required: --database-url, or SEED_DATABASE_URL in the environment — never
DATABASE_URL, which is production in api/.env.local (same rule as scripts/seed.py). Don't list
this email in DEMO_READ_ONLY_EMAILS. Sign in at /admin/login as usual.
"""

import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

# Runnable both as `python scripts/create_owner.py` and `python -m scripts.create_owner` from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.infra.db import make_engine  # noqa: E402
from app.models import Session, User  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.schemas.enquiries import EMAIL_RE  # noqa: E402
from app.services.auth.passwords import hash_password  # noqa: E402

MIN_PASSWORD = 12


class OwnerInputError(ValueError):
    pass


def check(email: str, password: str) -> str:
    """The normalised email; raises OwnerInputError for a bad email or a short password."""
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise OwnerInputError(f"Not an email address: {email!r}")
    if len(password) < MIN_PASSWORD:
        raise OwnerInputError(f"Use a password of at least {MIN_PASSWORD} characters")
    return email


async def create_owner(db: AsyncSession, email: str, name: str, password: str) -> bool:
    """Upsert an owner. True = a new user; False = an existing one promoted / re-passworded."""
    email = check(email, password)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    created = user is None
    if user is None:
        user = User(email=email, name=name.strip() or "Owner")
        db.add(user)
    user.role = UserRole.OWNER
    user.password_hash = hash_password(password)
    if not created:  # review 2026-11-27 (L6): a new password signs out every old cookie
        await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return created


def _ask_password() -> str:
    first = getpass.getpass("New owner password: ")
    if first != getpass.getpass("Again: "):
        raise OwnerInputError("The two passwords differ")
    return first


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--email", required=True, help="the owner's sign-in email")
    parser.add_argument("--name", default="Owner", help="shown in the admin (default: Owner)")
    parser.add_argument("--database-url", help="target database (required, or SEED_DATABASE_URL)")
    args = parser.parse_args(argv)

    url = args.database_url or os.environ.get("SEED_DATABASE_URL")
    if not url:
        print(
            "No target database. Pass --database-url (or set SEED_DATABASE_URL); this never"
            " falls back to DATABASE_URL.",
            file=sys.stderr,
        )
        return 2
    if args.email.strip().lower() in get_settings().read_only_emails():
        print(f"warning: {args.email} is listed in DEMO_READ_ONLY_EMAILS", file=sys.stderr)
    try:
        password = _ask_password()
        check(args.email, password)
    except OwnerInputError as exc:
        print(exc, file=sys.stderr)
        return 2
    engine = make_engine(url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            created = await create_owner(db, args.email, args.name, password)
    finally:
        await engine.dispose()
    print(f"{'Created' if created else 'Updated'} owner {args.email.strip().lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
