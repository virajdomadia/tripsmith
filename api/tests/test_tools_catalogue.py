"""v4.1 `listDestinations` and `getPackageDetails`: thin, compact mappers over the catalogue
services; no contact details, no ids."""

import datetime as dt

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import CANCELLATION_TIERS
from app.models import Package
from app.models.enums import PackageStatus
from app.services.ai.tools import TOOLS, ToolContext, run_tool
from app.services.analytics import ist_today
from app.services.catalog.reads import get_package, list_destinations
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

pytestmark = pytest.mark.db

SLUG = "goa-quiet-escape"


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def run(db: AsyncSession, name: str, args: dict[str, object]) -> dict[str, object]:
    now = dt.datetime.now(dt.UTC)
    result, _ = await run_tool(ToolContext(db, ist_today(now), now), name, args)
    return result


def test_surfaces_of_the_two_catalogue_tools() -> None:
    assert TOOLS["listDestinations"].surfaces == frozenset({"mcp"})
    assert TOOLS["getPackageDetails"].surfaces == frozenset({"chat", "mcp"})


async def test_list_destinations_matches_the_service(catalog: None, db: AsyncSession) -> None:
    got = await run(db, "listDestinations", {})
    cards = await list_destinations(db, now=dt.datetime.now(dt.UTC))
    assert [d["slug"] for d in got["destinations"]] == [c.slug for c in cards]  # type: ignore[index, union-attr]
    assert [d["name"] for d in got["destinations"]] == [c.name for c in cards]  # type: ignore[index, union-attr]
    first = got["destinations"][0]  # type: ignore[index]
    assert first["fromPricePerPerson"].startswith("₹")
    assert first["packageCount"] == cards[0].package_count
    assert first["bestMonths"] == cards[0].best_months


async def test_package_details_has_itinerary_inclusions_and_policy(
    catalog: None, db: AsyncSession
) -> None:
    now = dt.datetime.now(dt.UTC)
    detail = await get_package(db, SLUG, today=ist_today(now), now=now)
    assert detail is not None
    got = await run(db, "getPackageDetails", {"packageSlug": SLUG})
    assert got["slug"] == SLUG and got["name"] == detail.name
    assert got["destination"] == detail.destination.name
    assert len(got["itinerary"]) == len(detail.itinerary)  # type: ignore[arg-type]
    assert got["itinerary"][0]["day"] == 1  # type: ignore[index]
    assert got["inclusions"] == detail.inclusions and got["exclusions"] == detail.exclusions
    policy = got["cancellationPolicy"]
    assert [t["fromDaysBefore"] for t in policy] == [t.from_days for t in CANCELLATION_TIERS]  # type: ignore[union-attr]
    assert [t["note"] for t in policy] == [t.refund for t in CANCELLATION_TIERS]  # type: ignore[union-attr]
    assert "non-refundable" in policy[0]["note"]  # type: ignore[index]  # the caveat travels
    assert got["pageUrl"] == f"/packages/{SLUG}"
    assert got["itineraryPdfUrl"] == f"/packages/{SLUG}/itinerary.pdf"
    assert str(got["pricePerPerson"]).startswith("₹")


async def test_package_details_refuses_a_draft_and_unknown_slug(
    catalog: None, db: AsyncSession
) -> None:
    await db.execute(update(Package).where(Package.slug == SLUG).values(status=PackageStatus.DRAFT))
    await db.flush()
    for slug in (SLUG, "no-such-trip"):
        got = await run(db, "getPackageDetails", {"packageSlug": slug})
        assert got == {"error": f"No live package called '{slug}'. Use searchPackages."}


async def test_package_details_caps_long_itinerary_text(catalog: None, db: AsyncSession) -> None:
    from app.models import ItineraryDay

    row = (
        await db.execute(
            select(ItineraryDay).join(Package).where(Package.slug == SLUG, ItineraryDay.day_no == 1)
        )
    ).scalar_one()
    row.description = "x" * 2000
    await db.flush()
    got = await run(db, "getPackageDetails", {"packageSlug": SLUG})
    text = got["itinerary"][0]["text"]  # type: ignore[index]
    assert len(text) <= 400 and text.endswith("…") and text.startswith("xxx")


async def test_package_details_omits_leader_and_rating_when_there_are_none(
    catalog: None, db: AsyncSession
) -> None:
    await db.execute(
        update(Package).where(Package.slug == SLUG).values(leader_id=None, rating_count=0)
    )
    await db.flush()
    got = await run(db, "getPackageDetails", {"packageSlug": SLUG})
    assert "leader" not in got and "rating" not in got
