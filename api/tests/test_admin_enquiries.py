"""F21 enquiries inbox: schemas, service and `/admin/enquiries*` routes (06 §A4, §C-REST)."""

import datetime as dt

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Destination, Enquiry, Package
from app.models.enums import EnquiryStatus, EnquiryType, PackageStatus
from app.schemas.admin_enquiries import (
    PAGE_SIZE,
    EnquiryFilters,
    EnquiryNoteInput,
    EnquiryStatusInput,
)
from app.services import admin_enquiries as svc
from app.services.email.render import IST

# --- filters --------------------------------------------------------------------------------------


def test_filters_default_to_the_unfiltered_first_page() -> None:
    f = EnquiryFilters()
    assert f.page == 1
    assert (f.status, f.type, f.package_id, f.from_, f.to, f.q) == (None,) * 6


def test_filters_read_the_wire_names() -> None:
    f = EnquiryFilters.model_validate(
        {
            "status": "new",
            "type": "custom",
            "packageId": "pkg_1",
            "from": "2026-09-01",
            "to": "2026-09-30",
            "q": "Priya",
            "page": "3",
        }
    )
    assert f.status == EnquiryStatus.NEW
    assert f.package_id == "pkg_1"
    assert f.from_ == dt.date(2026, 9, 1) and f.to == dt.date(2026, 9, 30)
    assert f.page == 3


def test_filters_reject_a_backwards_date_range_under_the_to_field() -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryFilters.model_validate({"from": "2026-09-30", "to": "2026-09-01"})
    assert exc.value.errors()[0]["loc"] == ("to",)


def test_filters_reject_nonsense_values() -> None:
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"status": "archived"})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"page": 0})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"q": "x" * 81})


# --- writes ---------------------------------------------------------------------------------------


def test_status_input_takes_the_four_v1_statuses() -> None:
    assert EnquiryStatusInput.model_validate({"status": "converted"}).status == (
        EnquiryStatus.CONVERTED
    )


def test_note_input_strips_and_refuses_an_empty_body() -> None:
    assert EnquiryNoteInput.model_validate({"body": "  Called back  "}).body == "Called back"
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "   "})
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "x" * 2001})


# --- service: list --------------------------------------------------------------------------------


async def make_package(
    db: AsyncSession, *, slug: str = "test-goa-beaches", dest_slug: str = "test-goa"
) -> Package:
    """Slugs are prefixed `test-`: the route tests seed `tests/fixture_content/`, which already
    owns `goa` and `north-goa-beaches`, and both columns are unique."""
    dest = Destination(
        slug=dest_slug,
        name="Goa",
        tagline="Sun and sand",
        intro="A long enough intro paragraph for the destination record used by these tests.",
        cover_url="http://localhost:8000/seed-photos/goa.jpg",
        region="West India",
        best_months=[11, 12, 1],
        position=1,
    )
    db.add(dest)
    await db.flush()
    pkg = Package(
        slug=slug,
        name="North Goa Beaches",
        destination_id=dest.id,
        nights=3,
        days=4,
        summary="Three slow nights on the Konkan coast with one free beach day.",
        themes=[],
        starting_price_paise=1_499_900,
        status=PackageStatus.LIVE,
        featured=False,
    )
    db.add(pkg)
    await db.flush()
    return pkg


async def make_enquiry(db: AsyncSession, *, ref: str, **overrides: object) -> Enquiry:
    fields: dict[str, object] = {
        "ref": ref,
        "type": EnquiryType.STANDARD,
        "name": "Priya Sharma",
        "phone": "9845022110",
        "email": "priya.s@gmail.com",
        "adults": 2,
        "children": 0,
        "status": EnquiryStatus.NEW,
    }
    fields.update(overrides)
    row = Enquiry(**fields)
    db.add(row)
    await db.flush()
    return row


def at_ist(row: Enquiry, when: dt.datetime) -> None:
    """`created_at` has a server default, so a test that cares about the day sets it explicitly."""
    row.created_at = when


def test_ist_day_start_is_midnight_in_india_expressed_in_utc() -> None:
    start = svc.ist_day_start(dt.date(2026, 9, 22))
    assert start == dt.datetime(2026, 9, 21, 18, 30, tzinfo=dt.UTC)
    assert start.astimezone(IST).hour == 0


def test_like_escape_stops_a_wildcard_in_the_search_box() -> None:
    assert svc.like_escape("100%") == r"100\%"
    assert svc.like_escape("a_b") == r"a\_b"
    assert svc.like_escape(r"back\slash") == "back\\\\slash"


@pytest.mark.db
async def test_list_returns_newest_first_with_the_package_joined(db: AsyncSession) -> None:
    pkg = await make_package(db)
    older = await make_enquiry(db, ref="TS-OLD111", package_id=pkg.id)
    newer = await make_enquiry(db, ref="TS-NEW111", package_id=pkg.id, name="Anirudh S")
    at_ist(older, dt.datetime.now(dt.UTC) - dt.timedelta(days=2))
    await db.commit()

    out = await svc.list_enquiries(db, EnquiryFilters())

    assert [r.ref for r in out.items] == [newer.ref, older.ref]
    assert out.items[0].package is not None
    assert out.items[0].package.name == "North Goa Beaches"
    assert (out.total, out.page, out.page_size, out.total_pages) == (2, 1, PAGE_SIZE, 1)


@pytest.mark.db
async def test_a_contact_enquiry_has_no_package(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-CONT11", type=EnquiryType.CONTACT, package_id=None)
    await db.commit()
    out = await svc.list_enquiries(db, EnquiryFilters())
    assert out.items[0].package is None


@pytest.mark.db
async def test_counts_ignore_the_status_filter_but_honour_the_others(db: AsyncSession) -> None:
    pkg = await make_package(db)
    other = await make_package(db, slug="test-leh", dest_slug="test-ladakh")
    await make_enquiry(db, ref="TS-AAA111", package_id=pkg.id, status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-BBB111", package_id=pkg.id, status=EnquiryStatus.CONTACTED)
    await make_enquiry(db, ref="TS-CCC111", package_id=other.id, status=EnquiryStatus.NEW)
    await db.commit()

    out = await svc.list_enquiries(
        db, EnquiryFilters.model_validate({"status": "new", "packageId": pkg.id})
    )

    assert [r.ref for r in out.items] == ["TS-AAA111"]
    assert out.total == 1
    # Counts: this package only (the packageId filter applies), all four statuses (it does not).
    assert (out.counts.new, out.counts.contacted, out.counts.all) == (1, 1, 2)


@pytest.mark.db
async def test_date_filter_is_an_inclusive_ist_business_day_range(db: AsyncSession) -> None:
    late = await make_enquiry(db, ref="TS-LATE11")
    early = await make_enquiry(db, ref="TS-EARL11")
    # 23:30 IST on the 22nd is still the 22nd for the owner, though it is 18:00 UTC.
    at_ist(late, dt.datetime(2026, 9, 22, 18, 0, tzinfo=dt.UTC))
    at_ist(early, dt.datetime(2026, 9, 23, 3, 0, tzinfo=dt.UTC))  # 08:30 IST on the 23rd
    await db.commit()

    one_day = EnquiryFilters.model_validate({"from": "2026-09-22", "to": "2026-09-22"})
    assert [r.ref for r in (await svc.list_enquiries(db, one_day)).items] == ["TS-LATE11"]

    both = EnquiryFilters.model_validate({"from": "2026-09-22", "to": "2026-09-23"})
    assert {r.ref for r in (await svc.list_enquiries(db, both)).items} == {"TS-LATE11", "TS-EARL11"}


@pytest.mark.db
async def test_search_matches_a_name_or_a_phone_however_it_is_typed(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-PRIYA1", name="Priya Sharma", phone="9845022110")
    await make_enquiry(db, ref="TS-ANIR11", name="Anirudh S", phone="9980041234")
    await db.commit()

    async def refs(q: str) -> list[str]:
        out = await svc.list_enquiries(db, EnquiryFilters.model_validate({"q": q}))
        return [r.ref for r in out.items]

    assert await refs("priya") == ["TS-PRIYA1"]
    assert await refs("+91 98450-22110") == ["TS-PRIYA1"]
    assert await refs("9980") == ["TS-ANIR11"]
    assert await refs("%") == []  # a wildcard is matched literally, not as "everything"


@pytest.mark.db
async def test_paging_is_fifty_to_a_page(db: AsyncSession) -> None:
    for i in range(PAGE_SIZE + 3):
        await make_enquiry(db, ref=f"TS-P{i:05d}")
    await db.commit()

    first = await svc.list_enquiries(db, EnquiryFilters())
    second = await svc.list_enquiries(db, EnquiryFilters(page=2))

    assert len(first.items) == PAGE_SIZE and len(second.items) == 3
    assert first.total == PAGE_SIZE + 3 and first.total_pages == 2
    assert not {r.id for r in first.items} & {r.id for r in second.items}


@pytest.mark.db
async def test_an_empty_inbox_still_reports_one_page(db: AsyncSession) -> None:
    out = await svc.list_enquiries(db, EnquiryFilters())
    assert (out.items, out.total, out.total_pages, out.counts.all) == ([], 0, 1, 0)
