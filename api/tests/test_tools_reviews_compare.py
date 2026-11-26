"""v4.1 `getReviews` and `comparePackages`: thin mappers; customer text is labelled and no
reviewer contact details travel."""

import datetime as dt

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package
from app.models.enums import PackageStatus
from app.services import reviews as svc
from app.services.ai.tools import TOOLS, ToolContext, run_tool
from app.services.analytics import ist_today
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_booking_orders import seeded
from tests.test_catalog import RecordingStore
from tests.test_reviews import extra_review

pytestmark = pytest.mark.db

A, B = "goa-quiet-escape", "north-goa-beaches"


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def run(db: AsyncSession, name: str, args: dict[str, object]) -> dict[str, object]:
    now = dt.datetime.now(dt.UTC)
    result, _ = await run_tool(ToolContext(db, ist_today(now), now), name, args)
    return result


def test_both_tools_are_mcp_only() -> None:
    for name in ("getReviews", "comparePackages"):
        assert TOOLS[name].surfaces == frozenset({"mcp"})


async def test_reviews_are_labelled_customer_text(db: AsyncSession) -> None:
    pkg, departure = await seeded(db, seats=40)
    slug, departure_id = pkg.slug, departure.id
    start = dt.datetime(2026, 9, 1, tzinfo=dt.UTC)
    made = [
        (await extra_review(db, pkg, departure_id, n, r, at=start + dt.timedelta(hours=n))).id
        for n, r in enumerate([5, 4])
    ]
    for review_id in made:
        await svc.moderate(db, review_id, publish=True)

    got = await run(db, "getReviews", {"packageSlug": slug})

    assert got["rating"] == {"average": 4.5, "count": 2}
    assert got["page"] == 1 and got["pages"] == 1
    reviews = got["reviews"]
    assert [r["stars"] for r in reviews] == [4, 5]  # type: ignore[index, union-attr]
    first = reviews[0]  # type: ignore[index]
    assert first["customerWrote"] == "Review number 1 is long enough."
    assert set(first) == {"stars", "customerWrote", "travelledIn"}
    assert first["travelledIn"][:2].isalpha()
    text = str(got)
    assert "guest" not in text and "@" not in text and "Number1" not in text


async def test_reviews_for_a_package_with_none(catalog: None, db: AsyncSession) -> None:
    got = await run(db, "getReviews", {"packageSlug": A})
    assert got == {"rating": None, "reviews": [], "page": 1, "pages": 1}


async def test_reviews_refuse_a_draft_and_unknown_slug(catalog: None, db: AsyncSession) -> None:
    await db.execute(update(Package).where(Package.slug == A).values(status=PackageStatus.DRAFT))
    await db.flush()
    for slug in (A, "no-such-trip"):
        got = await run(db, "getReviews", {"packageSlug": slug})
        assert got == {"error": f"No live package called '{slug}'. Use searchPackages."}


async def test_compare_two_live_packages(catalog: None, db: AsyncSession) -> None:
    got = await run(db, "comparePackages", {"packageSlugs": [A, B]})
    trips = got["trips"]
    assert [t["slug"] for t in trips] == [A, B]  # type: ignore[index, union-attr]
    first = trips[0]  # type: ignore[index]
    assert first["name"] and first["nights"] > 0
    assert str(first["pricePerPerson"]).startswith("₹")
    assert first["inclusions"] and isinstance(first["inclusions"], list)
    assert got["missing"] == []
    rows = (await db.execute(select(Package.slug, Package.name).where(Package.slug == A))).all()
    assert first["name"] == rows[0].name


async def test_compare_rejects_one_and_four_slugs_and_duplicates(db: AsyncSession) -> None:
    for slugs in (["a"], ["a", "b", "c", "d"], ["a", "a"], []):
        got = await run(db, "comparePackages", {"packageSlugs": slugs})
        assert "2 to 3" in str(got["error"]), slugs


async def test_compare_lists_unknown_slugs_as_missing(catalog: None, db: AsyncSession) -> None:
    got = await run(db, "comparePackages", {"packageSlugs": [A, "no-such-trip"]})
    assert [t["slug"] for t in got["trips"]] == [A]  # type: ignore[index, union-attr]
    assert got["missing"] == ["no-such-trip"]
