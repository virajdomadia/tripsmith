"""S10 — the schema behaves as 06 Part A specifies. Runs only with TEST_DATABASE_URL (CI has a
postgres:17 service; locally any throwaway Postgres)."""

import datetime as dt

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Destination, Package, PackageImage
from app.models.enums import PackageStatus, Theme

pytestmark = pytest.mark.db


def goa() -> Destination:
    return Destination(
        slug="goa",
        name="Goa",
        tagline="Beaches, cafés, sunsets",
        intro="Goa.",
        cover_url="https://example.test/goa.jpg",
        region="West India",
        best_months=[11, 12, 1, 2],
    )


def package(destination: Destination, **overrides: object) -> Package:
    fields: dict[str, object] = {
        "slug": "north-goa-beaches",
        "name": "North Goa Beaches",
        "summary": "Three nights on the Vagator side.",
        "themes": [Theme.BEACH, Theme.FAMILY],
        "nights": 3,
        "days": 4,
        "destination": destination,
    }
    fields.update(overrides)
    return Package(**fields)


async def test_enums_persist_their_values_not_member_names(db: AsyncSession) -> None:
    pkg = package(goa(), status=PackageStatus.LIVE)
    db.add(pkg)
    await db.commit()

    raw = (await db.execute(text("select status::text, themes::text[] from packages"))).one()
    assert raw == ("live", ["beach", "family"])
    reloaded = (await db.execute(select(Package))).scalar_one()
    assert reloaded.themes == [Theme.BEACH, Theme.FAMILY]
    assert reloaded.status is PackageStatus.LIVE


async def test_days_must_be_nights_plus_one(db: AsyncSession) -> None:
    db.add(package(goa(), nights=3, days=5))
    with pytest.raises(IntegrityError, match="days_is_nights_plus_one"):
        await db.commit()


async def test_one_departure_per_package_per_date(db: AsyncSession) -> None:
    pkg = package(goa())
    prices = {
        "price_double_paise": 1_499_900,
        "price_triple_paise": 1_399_900,
        "price_child_paise": 899_900,
        "single_supplement_paise": 400_000,
    }
    pkg.departures = [
        Departure(date=dt.date(2026, 12, 18), seats_total=12, **prices),
        Departure(date=dt.date(2026, 12, 18), seats_total=8, **prices),
    ]
    db.add(pkg)
    with pytest.raises(IntegrityError, match="uq_departures_package_id_date"):
        await db.commit()


async def test_availability_view_reports_seats_total_with_no_bookings(db: AsyncSession) -> None:
    pkg = package(goa())
    pkg.departures = [
        Departure(
            date=dt.date(2026, 12, 18),
            seats_total=12,
            price_double_paise=1,
            price_triple_paise=1,
            price_child_paise=1,
            single_supplement_paise=1,
        )
    ]
    db.add(pkg)
    await db.commit()

    rows = (
        await db.execute(text("select departure_id, seats_left from departure_availability"))
    ).all()
    assert rows == [(pkg.departures[0].id, 12)]


async def test_deleting_the_cover_image_nulls_the_reference(db: AsyncSession) -> None:
    pkg = package(goa())
    image = PackageImage(url="https://example.test/1.jpg", alt="Vagator", width=1400, height=900)
    pkg.images = [image]
    pkg.cover_image = image
    db.add(pkg)
    await db.commit()
    pkg_id, image_id = pkg.id, image.id

    cover = select(Package.cover_image_id).where(Package.id == pkg_id)
    assert (await db.execute(cover)).scalar_one() == image_id

    await db.execute(text("delete from package_images where id = :id"), {"id": image_id})
    await db.commit()
    assert (await db.execute(cover)).scalar_one() is None


async def test_tables_start_empty_for_every_test(db: AsyncSession) -> None:
    # The harness truncates between tests; the packages written above must be gone.
    assert (await db.execute(select(Package))).first() is None
