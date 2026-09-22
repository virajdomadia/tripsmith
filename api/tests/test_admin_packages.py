"""F18 package CRUD: schemas, service and `/admin/packages` routes (06 §A3, §C-REST, §C4)."""

import datetime as dt
from collections.abc import Sequence

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Departure, Destination, Enquiry, ItineraryDay, Package, PackageImage
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType, PackageStatus
from app.schemas.catalog import DepartureInput, PackageInput, PublishRule
from app.services.catalog import admin_packages as svc
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie
from tests.test_catalog import RecordingStore

SUMMARY = "Three slow nights on the Konkan coast with one free beach day and a fort sunset."


def soon(days: int = 30) -> dt.date:
    """A date that is always in the future — never hardcode a calendar date in a test."""
    return dt.date.today() + dt.timedelta(days=days)


def departure(**overrides: object) -> dict[str, object]:
    fields: dict[str, object] = {
        "date": soon().isoformat(),
        "seatsTotal": 16,
        "guaranteed": False,
        "priceDoublePaise": 1_499_900,
        "priceTriplePaise": 1_349_900,
        "priceChildPaise": 899_900,
        "singleSupplementPaise": 600_000,
    }
    fields.update(overrides)
    return fields


def day(n: int) -> dict[str, object]:
    return {
        "title": f"Day {n}",
        "description": f"What happens on day {n}, in a sentence long enough to be real.",
        "meals": {"breakfast": True, "lunch": False, "dinner": False},
        "stay": "Lemon Tree Amarante, Candolim",
    }


def payload(**overrides: object) -> PackageInput:
    fields: dict[str, object] = {
        "slug": "konkan-coast",
        "destinationId": "d-goa",
        "name": "Konkan Coast",
        "summary": SUMMARY,
        "themes": ["beach"],
        "nights": 3,
        "departureCity": "Ex-Mumbai",
        "highlights": ["Sunset at the fort"],
        "inclusions": ["3 nights with breakfast"],
        "exclusions": ["Flights"],
        "hotels": [{"name": "Lemon Tree", "city": "Candolim", "stars": 4, "nights": 3}],
        "faq": [{"q": "Is it family friendly?", "a": "Yes, the beach is calm."}],
        "featured": False,
        "itinerary": [day(1), day(2), day(3), day(4)],
        "departures": [departure()],
    }
    fields.update(overrides)
    return PackageInput.model_validate(fields)


# --- schema ---------------------------------------------------------------------------------------


def test_days_is_derived_from_nights_and_never_sent() -> None:
    assert payload(nights=3).days == 4
    assert "days" not in PackageInput.model_fields


def test_itinerary_may_be_short_for_a_draft_but_never_longer_than_the_trip() -> None:
    assert payload(itinerary=[]).itinerary == []
    assert len(payload(itinerary=[day(1), day(2)]).itinerary) == 2
    with pytest.raises(ValidationError) as exc:
        payload(itinerary=[day(n) for n in range(1, 6)])
    assert "4 days" in str(exc.value)


def test_departure_dates_must_be_unique_within_the_payload() -> None:
    same = soon(45).isoformat()
    with pytest.raises(ValidationError) as exc:
        payload(departures=[departure(date=same), departure(date=same)])
    assert "same date" in str(exc.value)


def test_prices_may_be_zero_so_a_draft_can_park_a_departure() -> None:
    parked = payload(departures=[departure(priceDoublePaise=0, priceChildPaise=0)])
    assert parked.departures[0].price_double_paise == 0
    with pytest.raises(ValidationError):
        payload(departures=[departure(priceDoublePaise=-1)])


def test_rejects_bad_slugs_themes_and_empty_text() -> None:
    with pytest.raises(ValidationError):
        payload(slug="Konkan Coast")
    with pytest.raises(ValidationError):
        payload(themes=["spa"])
    with pytest.raises(ValidationError):
        payload(name="   ")
    with pytest.raises(ValidationError):
        payload(nights=0)
    with pytest.raises(ValidationError):
        payload(nights=31)


def test_strips_and_drops_blank_list_entries() -> None:
    out = payload(highlights=["  Sunset at the fort  ", "", "   "])
    assert out.highlights == ["Sunset at the fort"]
    assert payload(name="  Konkan Coast ").name == "Konkan Coast"


def test_departure_id_is_optional_so_new_rows_can_be_inserted() -> None:
    assert DepartureInput.model_validate(departure()).id is None
    assert DepartureInput.model_validate(departure(id="dep-1")).id == "dep-1"


# --- publish rules and pricing (pure) -------------------------------------------------------------


def built_package(
    *,
    nights: int = 3,
    days_written: int = 4,
    departures: Sequence[tuple[dt.date, int]] = (),
    images: int = 1,
) -> Package:
    """An in-memory Package graph — enough for the pure rule functions, no session needed."""
    pkg = Package(
        slug="konkan-coast",
        destination_id="d-goa",
        name="Konkan Coast",
        summary=SUMMARY,
        nights=nights,
        days=nights + 1,
    )
    pkg.itinerary = [
        ItineraryDay(day_no=n, title=f"Day {n}", description="Text")
        for n in range(1, days_written + 1)
    ]
    pkg.departures = [
        Departure(
            date=d,
            seats_total=16,
            price_double_paise=price,
            price_triple_paise=max(price - 100_000, 0),
            price_child_paise=max(price - 500_000, 0),
            single_supplement_paise=0,
        )
        for d, price in departures
    ]
    pkg.images = [
        PackageImage(url=f"https://blob.test/{n}.jpg", width=1600, height=1000, position=n)
        for n in range(images)
    ]
    return pkg


def rule(rules: Sequence[PublishRule], key: str) -> PublishRule:
    return next(r for r in rules if r.key == key)


def test_publish_rules_all_pass_for_a_complete_package() -> None:
    pkg = built_package(departures=[(soon(), 1_499_900)])
    rules = svc.publish_rules(pkg, image_count=1, today=dt.date.today())
    assert [r.key for r in rules] == ["images", "itinerary", "departures", "prices"]
    assert all(r.ok for r in rules)
    assert svc.can_publish(rules) is True


def test_each_rule_fails_on_its_own() -> None:
    today = dt.date.today()

    no_image = built_package(departures=[(soon(), 1_499_900)], images=0)
    rules = svc.publish_rules(no_image, image_count=0, today=today)
    assert rule(rules, "images").ok is False
    assert rule(rules, "itinerary").ok is True
    assert svc.can_publish(rules) is False

    short = built_package(days_written=2, departures=[(soon(), 1_499_900)])
    rules = svc.publish_rules(short, image_count=1, today=today)
    assert rule(rules, "itinerary").ok is False
    assert rule(rules, "itinerary").detail == "2 of 4 days written"

    none_upcoming = built_package(departures=[(today - dt.timedelta(days=1), 1_499_900)])
    rules = svc.publish_rules(none_upcoming, image_count=1, today=today)
    assert rule(rules, "departures").ok is False
    assert rule(rules, "prices").ok is True  # the past departure still has prices

    unpriced = built_package(departures=[(soon(), 0)])
    rules = svc.publish_rules(unpriced, image_count=1, today=today)
    assert rule(rules, "prices").ok is False
    assert "1 departure" in rule(rules, "prices").detail


def test_a_departure_today_counts_as_upcoming() -> None:
    today = dt.date.today()
    pkg = built_package(departures=[(today, 1_499_900)])
    assert rule(svc.publish_rules(pkg, image_count=1, today=today), "departures").ok is True


def test_starting_price_is_the_cheapest_upcoming_double_and_zero_when_none_remain() -> None:
    today = dt.date.today()
    pkg = built_package(
        departures=[(soon(10), 1_749_900), (soon(60), 1_449_900), (today, 1_599_900)]
    )
    assert svc.recompute_starting_price(pkg, today=today) == 1_449_900

    past_only = built_package(departures=[(today - dt.timedelta(days=1), 1_000_000)])
    assert svc.recompute_starting_price(past_only, today=today) == 0
    assert svc.recompute_starting_price(built_package(), today=today) == 0


def test_an_unpriced_upcoming_departure_does_not_become_the_starting_price() -> None:
    """A parked departure (price 0) must not advertise the package as free."""
    today = dt.date.today()
    pkg = built_package(departures=[(soon(10), 0), (soon(60), 1_449_900)])
    assert svc.recompute_starting_price(pkg, today=today) == 1_449_900


def test_revalidate_tags_cover_the_old_slug_and_the_old_destination() -> None:
    assert svc.revalidate_tags("konkan-coast", "goa") == [
        "packages",
        "destinations",
        "home",
        "package:konkan-coast",
        "destination:goa",
    ]
    moved = svc.revalidate_tags(
        "konkan-coast", "maharashtra", old_slug="konkan", old_destination_slug="goa"
    )
    assert "package:konkan" in moved and "destination:goa" in moved


# --- reads ----------------------------------------------------------------------------------------


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_packages.revalidate", rec)
    return rec


async def seeded(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def package_by_slug(db: AsyncSession, slug: str) -> Package:
    return (await db.execute(select(Package).where(Package.slug == slug))).scalar_one()


async def goa_id(db: AsyncSession) -> str:
    return (await db.execute(select(Destination.id).where(Destination.slug == "goa"))).scalar_one()


@pytest.mark.db
async def test_list_returns_every_package_draft_included(db: AsyncSession) -> None:
    await seeded(db)
    rows = await svc.list_packages(db)
    assert {r.slug for r in rows} == {"north-goa-beaches", "goa-quiet-escape"}
    north = next(r for r in rows if r.slug == "north-goa-beaches")
    assert north.destination.name == "Goa"
    assert north.nights == 3 and north.days == 4
    assert north.status is PackageStatus.LIVE
    assert north.cover_url and north.cover_url.startswith("http")
    pkg = await package_by_slug(db, "north-goa-beaches")
    await db.refresh(pkg, ["departures"])
    assert north.departure_count == len([d for d in pkg.departures if d.date >= dt.date.today()])
    assert north.recent_enquiry_count == 0


@pytest.mark.db
async def test_list_counts_only_enquiries_from_the_last_30_days(db: AsyncSession) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    now = dt.datetime.now(dt.UTC)
    for age_days in (1, 10, 40):
        db.add(
            Enquiry(
                ref=f"TS-AGE{age_days:03d}",
                type=EnquiryType.STANDARD,
                name="Asha",
                phone="9845000000",
                email="asha@example.com",
                adults=2,
                children=0,
                status=EnquiryStatus.NEW,
                email_status=EmailStatus.SKIPPED,
                package_id=pkg.id,
                created_at=now - dt.timedelta(days=age_days),
            )
        )
    await db.commit()
    row = next(r for r in await svc.list_packages(db) if r.slug == "north-goa-beaches")
    assert row.recent_enquiry_count == 2


@pytest.mark.db
async def test_get_returns_the_whole_graph_with_past_departures(db: AsyncSession) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    db.add(
        Departure(
            package_id=pkg.id,
            date=dt.date.today() - dt.timedelta(days=90),
            seats_total=16,
            price_double_paise=1_299_900,
            price_triple_paise=1_199_900,
            price_child_paise=799_900,
            single_supplement_paise=500_000,
        )
    )
    await db.commit()

    out = await svc.get_package(db, pkg.id)
    assert out.slug == "north-goa-beaches" and out.destination.slug == "goa"
    assert len(out.itinerary) == 4 and out.itinerary[0].day_no == 1
    assert len(out.images) == 7 and out.cover_image_id is not None
    assert out.hotels[0].name == "Lemon Tree Amarante Beach Resort"
    assert len(out.faq) == 3
    dates = [d.date for d in out.departures]
    assert dates == sorted(dates), "soonest first, past included"
    assert any(d < dt.date.today() for d in dates)
    assert out.departures[0].seats_left >= 0
    assert out.can_publish is True
    assert out.enquiry_count == 0


@pytest.mark.db
async def test_get_raises_not_found_for_an_unknown_id(db: AsyncSession) -> None:
    await seeded(db)
    with pytest.raises(ApiError) as exc:
        await svc.get_package(db, "nope")
    assert exc.value.code == "not_found"


# --- create / update ------------------------------------------------------------------------------


@pytest.mark.db
async def test_create_makes_a_draft_and_writes_the_nested_rows(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    out = await svc.create_package(db, payload(destinationId=await goa_id(db)))
    assert out.status is PackageStatus.DRAFT, "create never publishes"
    assert out.days == 4 and out.nights == 3
    assert [d.day_no for d in out.itinerary] == [1, 2, 3, 4]
    assert out.itinerary[0].meals.breakfast is True
    assert len(out.departures) == 1 and out.departures[0].id
    assert out.hotels[0].city == "Candolim" and out.faq[0].q.startswith("Is it")
    assert out.starting_price_paise == 1_499_900
    assert out.can_publish is False, "no images yet"
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:konkan-coast", "destination:goa"]
    ]


@pytest.mark.db
async def test_create_rejects_a_duplicate_slug_and_an_unknown_destination(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    with pytest.raises(ApiError) as exc:
        await svc.create_package(
            db, payload(slug="north-goa-beaches", destinationId=await goa_id(db))
        )
    assert exc.value.code == "conflict"
    assert exc.value.field_errors == {"slug": svc.DUPLICATE_SLUG}

    with pytest.raises(ApiError) as exc:
        await svc.create_package(db, payload(destinationId="nope"))
    assert exc.value.code == "validation"
    assert "destinationId" in (exc.value.field_errors or {})
    assert revalidated.calls == []


@pytest.mark.db
async def test_update_replaces_the_itinerary_and_keeps_departure_ids(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    before = await svc.get_package(db, pkg.id)
    kept = before.departures[-1]  # the furthest-out departure
    revalidated.calls.clear()

    body = payload(
        slug="north-goa-beaches",
        destinationId=await goa_id(db),
        name="North Goa Beaches",
        nights=3,
        itinerary=[day(1), day(2)],
        departures=[
            {**departure(id=kept.id, date=kept.date.isoformat()), "priceDoublePaise": 1_111_100},
            departure(date=soon(120).isoformat(), priceDoublePaise=1_999_900),
        ],
    )
    out = await svc.update_package(db, pkg.id, body)

    assert [d.day_no for d in out.itinerary] == [1, 2], "full replace, not a merge"
    ids = {d.id for d in out.departures}
    assert kept.id in ids, "an id sent back must survive — v2 bookings reference it"
    assert len(out.departures) == 2, "departures the payload omitted are deleted"
    assert next(d for d in out.departures if d.id == kept.id).price_double_paise == 1_111_100
    assert out.starting_price_paise == 1_111_100
    assert out.can_publish is False, "itinerary is now 2 of 4 days"


@pytest.mark.db
async def test_update_revalidates_the_old_slug_and_the_old_destination(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    kerala = Destination(
        slug="kerala",
        name="Kerala",
        tagline="Backwaters and tea hills",
        intro="A long enough intro to satisfy nothing in particular here.",
        cover_url="https://blob.test/kerala.jpg",
        region="South India",
        best_months=[11, 12],
    )
    db.add(kerala)
    await db.commit()
    pkg = await package_by_slug(db, "north-goa-beaches")
    revalidated.calls.clear()

    await svc.update_package(
        db, pkg.id, payload(slug="konkan-coast", destinationId=kerala.id, nights=3)
    )
    tags = revalidated.calls[0]
    assert "package:konkan-coast" in tags and "package:north-goa-beaches" in tags
    assert "destination:kerala" in tags and "destination:goa" in tags


@pytest.mark.db
async def test_update_rejects_a_slug_another_package_already_uses(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db, pkg.id, payload(slug="goa-quiet-escape", destinationId=await goa_id(db))
        )
    assert exc.value.code == "conflict" and exc.value.field_errors == {"slug": svc.DUPLICATE_SLUG}
    assert revalidated.calls == []


@pytest.mark.db
async def test_update_rejects_a_departure_id_from_another_package(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    """Otherwise a crafted payload could steal another package's departure row."""
    await seeded(db)
    mine = await package_by_slug(db, "north-goa-beaches")
    theirs = await svc.get_package(db, (await package_by_slug(db, "goa-quiet-escape")).id)
    revalidated.calls.clear()
    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db,
            mine.id,
            payload(
                slug="north-goa-beaches",
                destinationId=await goa_id(db),
                departures=[departure(id=theirs.departures[0].id)],
            ),
        )
    assert exc.value.code == "validation"
    assert "departures" in (exc.value.field_errors or {})
    assert revalidated.calls == []


@pytest.mark.db
async def test_update_can_reuse_a_date_freed_by_a_dropped_departure(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    """Regression: both child tables are unique per package (`day_no`, `date`) and the unit of
    work emits INSERTs before delete-orphan DELETEs, so the deletes have to be flushed first."""
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    before = await svc.get_package(db, pkg.id)
    freed = before.departures[0].date

    out = await svc.update_package(
        db,
        pkg.id,
        payload(
            slug="north-goa-beaches",
            destinationId=await goa_id(db),
            nights=3,
            itinerary=[day(1), day(2), day(3), day(4)],
            departures=[departure(date=freed.isoformat(), priceDoublePaise=1_234_500)],
        ),
    )
    assert [d.date for d in out.departures] == [freed]
    assert out.departures[0].id not in {d.id for d in before.departures}, "a fresh row, not a reuse"
    assert out.departures[0].price_double_paise == 1_234_500
    assert [d.day_no for d in out.itinerary] == [1, 2, 3, 4], "day numbers reused cleanly"


@pytest.mark.db
async def test_swapping_two_departure_dates_reports_the_dates_not_the_slug(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    """The intermediate state of a swap collides on `(package_id, date)`. The owner must be
    told which field is wrong — the old catch-all blamed the slug."""
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    before = await svc.get_package(db, pkg.id)
    a, b = before.departures[0], before.departures[1]

    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db,
            pkg.id,
            payload(
                slug="north-goa-beaches",
                destinationId=await goa_id(db),
                nights=3,
                departures=[
                    departure(id=a.id, date=b.date.isoformat()),
                    departure(id=b.id, date=a.date.isoformat()),
                ],
            ),
        )
    assert exc.value.code == "conflict"
    assert exc.value.field_errors == {"departures": svc.DUPLICATE_DEPARTURE}


# --- status / duplicate / delete --------------------------------------------------------------


@pytest.mark.db
async def test_publishing_is_blocked_until_every_rule_passes(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    draft = await svc.create_package(db, payload(destinationId=await goa_id(db)))
    revalidated.calls.clear()

    with pytest.raises(ApiError) as exc:
        await svc.set_status(db, draft.id, PackageStatus.LIVE)
    assert exc.value.code == "conflict"
    assert exc.value.field_errors == {"images": "At least one photo"}
    assert revalidated.calls == []

    db.add(
        PackageImage(package_id=draft.id, url="https://blob.test/a.jpg", width=1600, height=1000)
    )
    await db.commit()
    live = await svc.set_status(db, draft.id, PackageStatus.LIVE)
    assert live.status is PackageStatus.LIVE
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:konkan-coast", "destination:goa"]
    ]


@pytest.mark.db
async def test_unpublishing_is_always_allowed(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    out = await svc.set_status(db, pkg.id, PackageStatus.DRAFT)
    assert out.status is PackageStatus.DRAFT
    assert revalidated.calls


@pytest.mark.db
async def test_setting_the_status_it_already_has_is_a_no_op_that_still_revalidates(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    out = await svc.set_status(db, pkg.id, PackageStatus.LIVE)
    assert out.status is PackageStatus.LIVE
    assert revalidated.calls


@pytest.mark.db
async def test_duplicate_deep_copies_everything_as_a_draft(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    source = await package_by_slug(db, "north-goa-beaches")
    original = await svc.get_package(db, source.id)
    revalidated.calls.clear()

    copy = await svc.duplicate_package(db, source.id)
    assert copy.id != original.id
    assert copy.slug == "north-goa-beaches-copy"
    assert copy.name == "North Goa Beaches (copy)"
    assert copy.status is PackageStatus.DRAFT
    assert len(copy.itinerary) == len(original.itinerary)
    assert len(copy.departures) == len(original.departures)
    assert {d.id for d in copy.departures}.isdisjoint({d.id for d in original.departures})
    assert [i.url for i in copy.images] == [i.url for i in original.images], (
        "same blobs, no re-upload"
    )
    assert {i.id for i in copy.images}.isdisjoint({i.id for i in original.images})
    assert copy.cover_image_id in {i.id for i in copy.images}, "cover remapped to the copy"
    assert copy.hotels == original.hotels and copy.faq == original.faq
    assert copy.starting_price_paise == original.starting_price_paise

    again = await svc.duplicate_package(db, source.id)
    assert again.slug == "north-goa-beaches-copy-2"


@pytest.mark.db
async def test_delete_is_blocked_while_enquiries_reference_the_package(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    db.add(
        Enquiry(
            ref="TS-DEL001",
            type=EnquiryType.STANDARD,
            name="Asha",
            phone="9845000000",
            email="asha@example.com",
            adults=2,
            children=0,
            status=EnquiryStatus.NEW,
            email_status=EmailStatus.SKIPPED,
            package_id=pkg.id,
        )
    )
    await db.commit()
    revalidated.calls.clear()

    with pytest.raises(ApiError) as exc:
        await svc.delete_package(db, pkg.id)
    assert exc.value.code == "conflict"
    assert exc.value.message == "1 enquiry references this package — it cannot be deleted"
    assert revalidated.calls == []


@pytest.mark.db
async def test_delete_removes_the_package_and_its_children(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    draft = await svc.create_package(db, payload(destinationId=await goa_id(db)))
    revalidated.calls.clear()

    await svc.delete_package(db, draft.id)
    with pytest.raises(ApiError):
        await svc.get_package(db, draft.id)
    left = (
        await db.execute(select(func.count(Departure.id)).where(Departure.package_id == draft.id))
    ).scalar_one()
    assert left == 0, "ON DELETE CASCADE takes the departures with it"
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:konkan-coast", "destination:goa"]
    ]


# --- routes ---------------------------------------------------------------------------------


async def owner_cookie(db: AsyncSession, db_client: AsyncClient) -> dict[str, str]:
    await seeded_with_owner(db)
    res = await db_client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    return with_cookie(res.cookies["ts_session"])


@pytest.mark.db
async def test_admin_package_routes_require_the_owner(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    assert (await db_client.get("/admin/packages")).status_code == 401
    assert (await db_client.post("/admin/packages", json={})).status_code == 401
    assert (await db_client.get("/admin/packages/x")).status_code == 401
    assert (await db_client.put("/admin/packages/x", json={})).status_code == 401
    assert (await db_client.delete("/admin/packages/x")).status_code == 401
    assert (await db_client.post("/admin/packages/x/status", json={})).status_code == 401
    assert (await db_client.post("/admin/packages/x/duplicate")).status_code == 401
    assert (await db_client.get("/admin/packages")).headers["cache-control"] == "no-store"


@pytest.mark.db
async def test_admin_package_crud_round_trip(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    dest_id = await goa_id(db)
    body = payload(destinationId=dest_id).model_dump(by_alias=True, mode="json")

    created = await db_client.post("/admin/packages", json=body, headers=cookie)
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    new = created.json()
    assert new["status"] == "draft" and new["days"] == 4 and new["canPublish"] is False
    assert [r["key"] for r in new["publishRules"]] == [
        "images",
        "itinerary",
        "departures",
        "prices",
    ]

    listed = await db_client.get("/admin/packages", headers=cookie)
    assert listed.status_code == 200
    assert new["id"] in {r["id"] for r in listed.json()["items"]}

    one = await db_client.get(f"/admin/packages/{new['id']}", headers=cookie)
    assert one.status_code == 200 and one.json()["name"] == "Konkan Coast"
    assert (await db_client.get("/admin/packages/nope", headers=cookie)).status_code == 404

    updated = await db_client.put(
        f"/admin/packages/{new['id']}", json={**body, "name": "Konkan Coast Slow"}, headers=cookie
    )
    assert updated.status_code == 200 and updated.json()["name"] == "Konkan Coast Slow"

    dup_slug = await db_client.post(
        "/admin/packages", json={**body, "slug": "north-goa-beaches"}, headers=cookie
    )
    assert dup_slug.status_code == 409
    assert dup_slug.json()["error"]["fieldErrors"] == {"slug": svc.DUPLICATE_SLUG}

    invalid = await db_client.post("/admin/packages", json={**body, "nights": 0}, headers=cookie)
    assert invalid.status_code == 400 and "nights" in invalid.json()["error"]["fieldErrors"]

    gone = await db_client.delete(f"/admin/packages/{new['id']}", headers=cookie)
    assert gone.status_code == 204


@pytest.mark.db
async def test_status_and_duplicate_routes(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    pkg = await package_by_slug(db, "north-goa-beaches")

    duplicated = await db_client.post(f"/admin/packages/{pkg.id}/duplicate", headers=cookie)
    assert duplicated.status_code == 201, duplicated.text
    copy = duplicated.json()
    assert copy["slug"] == "north-goa-beaches-copy" and copy["status"] == "draft"

    down = await db_client.post(
        f"/admin/packages/{pkg.id}/status", json={"status": "draft"}, headers=cookie
    )
    assert down.status_code == 200 and down.json()["status"] == "draft"

    up = await db_client.post(
        f"/admin/packages/{pkg.id}/status", json={"status": "live"}, headers=cookie
    )
    assert up.status_code == 200 and up.json()["status"] == "live"

    bad = await db_client.post(
        f"/admin/packages/{pkg.id}/status", json={"status": "archived"}, headers=cookie
    )
    assert bad.status_code == 400


@pytest.mark.db
async def test_publishing_an_incomplete_package_is_a_conflict_naming_the_rules(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    body = payload(destinationId=await goa_id(db), itinerary=[], departures=[]).model_dump(
        by_alias=True, mode="json"
    )
    draft = (await db_client.post("/admin/packages", json=body, headers=cookie)).json()
    res = await db_client.post(
        f"/admin/packages/{draft['id']}/status", json={"status": "live"}, headers=cookie
    )
    assert res.status_code == 409
    assert set(res.json()["error"]["fieldErrors"]) == {"images", "itinerary", "departures"}
