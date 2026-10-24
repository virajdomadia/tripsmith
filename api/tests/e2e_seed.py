"""Reset the e2e database for the Playwright journeys (web/e2e, V9): migrate to head, empty
every table, run the full seed (local photo URLs, the e2e owner), and add one departure that is
always far enough out for a full-refund cancellation — the content's own dates are fixed and
pass with time.

    E2E_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5432/tripsmith_e2e \\
        uv run --directory api python -m tests.e2e_seed

Refuses any database whose name does not say e2e (tests.e2e_app.e2e_database_url).
"""

import asyncio
import datetime as dt
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.infra.db import make_engine
from app.infra.storage import LocalStore
from app.models import Base, Departure, Package
from app.services.analytics import ist_today
from content import load_content
from scripts.seed import seed
from tests.e2e_app import OWNER_EMAIL, OWNER_PASSWORD, e2e_database_url
from tests.settings import make_settings

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Under Razorpay test mode's ₹15,000 for one traveller, and the trip the specs book.
E2E_PACKAGE = "kasol-weekend-camp"
E2E_DAYS_OUT = 75  # past the 30-day full-refund tier, inside any booking window
E2E_SEATS = 40


def migrate(url: str) -> None:
    os.environ["ALEMBIC_URL"] = url  # alembic/env.py reads only this
    command.upgrade(Config(os.path.join(API_DIR, "alembic.ini")), "head")


async def reset(url: str) -> dt.date:
    engine = make_engine(url)
    try:
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        async with engine.begin() as conn:
            await conn.execute(text(f"truncate table {tables} restart identity cascade"))
        settings = make_settings(owner_email=OWNER_EMAIL, owner_password=OWNER_PASSWORD)
        api_url = os.environ.get("E2E_API_URL", "http://localhost:8000").rstrip("/")
        store = LocalStore(f"{api_url}/seed-photos")  # the e2e api serves them
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await seed(db, load_content(), store, settings)
            pkg = (
                await db.execute(select(Package).where(Package.slug == E2E_PACKAGE))
            ).scalar_one()
            dates = (
                (
                    await db.execute(
                        select(Departure)
                        .where(Departure.package_id == pkg.id)
                        .order_by(Departure.date)
                    )
                )
                .scalars()
                .all()
            )
            if not dates:
                raise SystemExit(f"{E2E_PACKAGE} has no departure to copy prices from")
            like = dates[0]
            date = ist_today() + dt.timedelta(days=E2E_DAYS_OUT)
            while any(d.date == date for d in dates):  # a content date already there
                date += dt.timedelta(days=1)
            db.add(
                Departure(
                    package_id=pkg.id,
                    date=date,
                    seats_total=E2E_SEATS,
                    price_double_paise=like.price_double_paise,
                    price_triple_paise=like.price_triple_paise,
                    price_child_paise=like.price_child_paise,
                    single_supplement_paise=like.single_supplement_paise,
                )
            )
            await db.commit()
        return date
    finally:
        await engine.dispose()


def main() -> None:
    url = e2e_database_url()
    migrate(url)
    date = asyncio.run(reset(url))
    print(f"e2e database ready: {E2E_PACKAGE} departs {date.isoformat()}")


if __name__ == "__main__":
    main()
