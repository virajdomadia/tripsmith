"""F6 home data: featured-first cards, testimonials with their package, real counts (06 C1)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package
from app.models.enums import PackageStatus
from app.services.catalog.home import HOME_LIMIT, get_home_data
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

CACHE = "public, s-maxage=60, stale-while-revalidate=300"


async def seeded(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def set_package(db: AsyncSession, slug: str, **values: object) -> None:
    await db.execute(update(Package).where(Package.slug == slug).values(**values))
    await db.commit()


@pytest.mark.db
async def test_home_returns_destinations_packages_testimonials_and_stats(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/home")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    body = res.json()
    assert [d["slug"] for d in body["destinations"]] == ["goa"]
    assert body["destinations"][0]["packageCount"] == 2
    # Both fixture packages are featured: cheapest first, as cards with badges.
    assert [p["slug"] for p in body["packages"]] == ["north-goa-beaches", "goa-quiet-escape"]
    assert body["packages"][0]["badge"] == "guaranteed"
    assert [t["name"] for t in body["testimonials"]] == [
        "Priya and Rohan Mehta",
        "Anand Kulkarni",
        "Sneha Iyer",
    ]
    assert body["testimonials"][0]["packageSlug"] == "goa-quiet-escape"
    assert body["testimonials"][0]["packageName"] == "Goa Quiet Escape"
    assert body["testimonials"][2]["packageSlug"] is None
    assert body["testimonials"][2]["rating"] == 4
    assert body["stats"] == {"destinations": 1, "packages": 2, "departures": 7}


@pytest.mark.db
async def test_home_puts_featured_packages_before_cheaper_unfeatured_ones(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    await set_package(db, "north-goa-beaches", featured=False)  # the cheaper one

    body = (await db_client.get("/home")).json()

    assert [p["slug"] for p in body["packages"]] == ["goa-quiet-escape", "north-goa-beaches"]


@pytest.mark.db
async def test_home_hides_draft_packages_and_unlinks_their_testimonials(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    await set_package(db, "goa-quiet-escape", status=PackageStatus.DRAFT)

    body = (await db_client.get("/home")).json()

    assert [p["slug"] for p in body["packages"]] == ["north-goa-beaches"]
    assert body["testimonials"][0]["packageSlug"] is None
    assert body["testimonials"][0]["packageName"] is None
    assert body["stats"]["packages"] == 1
    assert body["stats"]["departures"] == 4  # only the live package's dates count


@pytest.mark.db
async def test_home_counts_only_upcoming_departures(db: AsyncSession) -> None:
    await seeded(db)

    home = await get_home_data(db, today=dt.date(2026, 12, 1))

    # 2026-11-20 and 2026-11-27 have passed; five dates remain.
    assert home.stats.departures == 5


def test_home_limit_is_six() -> None:
    assert HOME_LIMIT == 6
