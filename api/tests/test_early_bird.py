"""P17 early-bird (R47): the tier a booking day earns, flipping exactly at IST midnight; the
order deal → early-bird → coupon, per traveller, never below ₹1, never on add-ons; the price
ladder; the reads (package tiers, the card tag); the owner's fields; the daily revalidation."""

import datetime as dt

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Coupon, Departure, Package
from app.models.enums import AddonBasis, CouponKind, Occupancy
from app.schemas.bookings import Quote, QuoteAddon, QuoteTraveller
from app.schemas.catalog import EarlyBirdInput
from app.services.analytics import ist_today
from app.services.booking.pricing import (
    apply_coupon,
    build_quote,
    early_bird_for,
    price_ladder,
    start_of_ist_day,
)
from app.services.catalog import admin_packages as svc
from app.services.catalog import early_bird
from app.services.catalog.reads import get_package
from app.services.catalog.search import search_packages
from content._schema import EarlyBirdTier
from scripts.seed import seed_early_bird
from tests.settings import fixture_content
from tests.test_admin_packages import (
    RecordingRevalidate,
    as_payload,
    owner_cookie,
    package_by_slug,
    seeded,
)
from tests.test_admin_packages import revalidated as revalidated  # fixture
from tests.test_search import GQE, KER, NGB
from tests.test_search import catalog as catalog  # fixture

D, T, S, C = Occupancy.DOUBLE, Occupancy.TRIPLE, Occupancy.SINGLE, Occupancy.CHILD
DATE = dt.date(2027, 2, 12)  # the departure; tier 1 = 90 days (book by 14 Nov), tier 2 = 45
TIERS = {
    "early_bird_on": True,
    "eb1_days": 90,
    "eb1_off_paise": 1_500_00,
    "eb2_days": 45,
    "eb2_off_paise": 750_00,
}
DEAL = {
    "deal_price_paise": 21_999_00,
    "deal_label": "Monsoon deal",
    "deal_ends_at": dt.datetime(2030, 1, 1, tzinfo=dt.UTC),
}


def departure(**overrides: object) -> Departure:
    fields: dict[str, object] = {
        "id": "dep1",
        "date": DATE,
        "seats_total": 12,
        "price_double_paise": 22_999_00,
        "price_triple_paise": 20_999_00,
        "price_child_paise": 12_999_00,
        "single_supplement_paise": 7_999_00,
    }
    return Departure(**(fields | overrides))


def package(**overrides: object) -> Package:
    return Package(**({"slug": "munnar", "early_bird_on": False} | overrides))


def ist(day: dt.date, *, before_midnight: bool = False) -> dt.datetime:
    """00:00 IST on `day`, or the last microsecond of the IST day before it."""
    start = start_of_ist_day(day)
    return start - dt.timedelta(microseconds=1) if before_midnight else start


def quote(
    party: list[Occupancy],
    now: dt.datetime,
    dep: Departure | None = None,
    *,
    addons: list[QuoteAddon] | None = None,
    **pkg: object,
) -> Quote:
    return build_quote(
        dep or departure(),
        package(**pkg),
        [QuoteTraveller(occupancy=o) for o in party],
        seats_left=12,
        deal_base=24_999_00,
        now=now,
        addons=addons or [],
    )


def eb_lines(q: Quote) -> list[tuple[str, int, int]]:
    return [
        (li.occupancy.value, li.count, li.amount_paise)
        for li in q.lines
        if li.kind.value == "early_bird"
    ]


def coupon(percent: int = 10, cap: int | None = None) -> Coupon:
    return Coupon(code="WELCOME10", kind=CouponKind.PERCENT, percent=percent, cap_paise=cap)


# --- the threshold, in IST ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("now", "tier"),
    [
        (ist(DATE - dt.timedelta(days=90)), 1),  # the book-by day itself
        (ist(DATE - dt.timedelta(days=89), before_midnight=True), 1),  # 23:59:59.999999 IST
        (ist(DATE - dt.timedelta(days=89)), 2),  # 00:00 IST the next day
        (ist(DATE - dt.timedelta(days=45)), 2),
        (ist(DATE - dt.timedelta(days=44), before_midnight=True), 2),
        (ist(DATE - dt.timedelta(days=44)), None),
    ],
)
def test_the_tier_flips_exactly_at_ist_midnight(now: dt.datetime, tier: int | None) -> None:
    q = quote([D, D], now, **TIERS)
    assert (q.early_bird.tier if q.early_bird else None) == tier
    off = {1: 1_500_00, 2: 750_00, None: 0}[tier]
    assert q.discount_paise == 2 * off
    assert q.total_paise == 2 * 22_999_00 - 2 * off


def test_book_by_is_departure_minus_the_tier_days() -> None:
    today = dt.date(2026, 9, 28)
    eb = early_bird_for(package(**TIERS), date=DATE, today=today)
    assert eb is not None
    assert (eb.tier, eb.days, eb.per_traveller_paise, eb.book_by) == (
        1,
        90,
        1_500_00,
        dt.date(2026, 11, 14),
    )


def test_one_tier_only_and_switched_off_means_none() -> None:
    now = ist(dt.date(2026, 9, 28))
    one = {**TIERS, "eb2_days": None, "eb2_off_paise": None}
    assert quote([D], ist(DATE - dt.timedelta(days=60)), **one).early_bird is None
    assert quote([D], now, **{**TIERS, "early_bird_on": False}).early_bird is None
    assert quote([D], now).discount_paise == 0


# --- order and scope ----------------------------------------------------------------------------


def test_per_traveller_children_included_one_line_per_occupancy() -> None:
    q = quote([D, D, T, T, T, S, C], ist(dt.date(2026, 9, 28)), **TIERS)
    assert eb_lines(q) == [
        ("double", 2, -3_000_00),
        ("triple", 3, -4_500_00),
        ("single", 1, -1_500_00),
        ("child", 1, -1_500_00),
    ]
    assert q.discount_paise == 7 * 1_500_00


def test_deal_first_then_early_bird_then_coupon_on_the_fare() -> None:
    now = ist(dt.date(2026, 9, 28))
    q = quote([D, D], now, **TIERS, **DEAL)
    kinds = [li.kind.value for li in q.lines]
    assert kinds == ["double", "deal", "early_bird"]
    deal_off = 24_999_00 - 21_999_00
    fare = 2 * (22_999_00 - deal_off - 1_500_00)
    assert q.total_paise == fare

    with_coupon = apply_coupon(q, coupon(percent=10))
    assert with_coupon.coupon is not None
    assert with_coupon.coupon.off_paise == fare // 10 // 100 * 100
    assert with_coupon.total_paise == fare - with_coupon.coupon.off_paise


def test_never_below_one_rupee_per_traveller() -> None:
    now = ist(dt.date(2026, 9, 28))
    cheap = departure(price_child_paise=3_500_00)  # the deal (₹3,000) leaves the child ₹500
    q = quote([D, C], now, cheap, **TIERS, **DEAL)
    assert ("child", 1, -499_00) in eb_lines(q), "₹1 stays on the child"

    free = departure(price_child_paise=3_000_00)  # the deal takes the child to ₹0
    q = quote([C, C], now, free, **TIERS, **DEAL)
    assert eb_lines(q) == [] and q.early_bird is None


def test_add_ons_are_never_discounted() -> None:
    now = ist(dt.date(2026, 9, 28))
    boat = QuoteAddon(
        addon_id="a1",
        name="Premium houseboat",
        basis=AddonBasis.BOOKING,
        unit_paise=4_500_00,
        travellers=1,
        nights=1,
        amount_paise=4_500_00,
    )
    q = quote([D, D], now, addons=[boat], **TIERS)
    assert q.addons_paise == 4_500_00
    assert q.fare_paise == 2 * (22_999_00 - 1_500_00)
    assert q.total_paise == q.fare_paise + 4_500_00


def test_a_snapshot_from_before_p17_still_reads() -> None:
    q = quote([D], ist(dt.date(2026, 9, 28)))
    old = q.model_dump(mode="json", by_alias=True)
    del old["earlyBird"], old["ladder"]
    back = Quote.model_validate(old)
    assert back.early_bird is None and back.ladder == []


# --- the ladder ---------------------------------------------------------------------------------


def ladder(
    now: dt.datetime, *, dep: Departure | None = None, cpn: Coupon | None = None, **pkg: object
):  # noqa: ANN201
    dep = dep or departure()
    p = package(**pkg)
    travellers = [QuoteTraveller(occupancy=D), QuoteTraveller(occupancy=D)]
    today_quote = build_quote(dep, p, travellers, seats_left=12, deal_base=24_999_00, now=now)
    if cpn is not None:
        today_quote = apply_coupon(today_quote, cpn)
    return price_ladder(dep, p, travellers, today_quote, deal_base=24_999_00, now=now, coupon=cpn)


def test_the_ladder_steps_up_the_day_after_each_tier_ends() -> None:
    rungs = ladder(ist(dt.date(2026, 9, 28)), **TIERS)
    assert [
        (r.from_on, r.early_bird.tier if r.early_bird else None, r.fare_paise) for r in rungs
    ] == [
        (None, 1, 2 * (22_999_00 - 1_500_00)),
        (dt.date(2026, 11, 15), 2, 2 * (22_999_00 - 750_00)),
        (dt.date(2026, 12, 30), None, 2 * 22_999_00),
    ]


def test_the_ladder_drops_tiers_already_ended_and_applies_the_coupon() -> None:
    rungs = ladder(ist(dt.date(2026, 12, 1)), cpn=coupon(percent=10, cap=1_000_00), **TIERS)
    assert [r.from_on for r in rungs] == [None, dt.date(2026, 12, 30)]
    assert rungs[0].fare_paise == 2 * (22_999_00 - 750_00) - 1_000_00
    assert rungs[1].fare_paise == 2 * 22_999_00 - 1_000_00


def test_the_ladder_is_empty_without_early_bird_and_skips_days_too_late_to_book() -> None:
    assert ladder(ist(dt.date(2026, 9, 28))) == []
    near = {**TIERS, "eb2_days": 3, "eb2_off_paise": 100_00}  # ends 3 days out: bookable to 2
    rungs = ladder(ist(DATE - dt.timedelta(days=10)), **near)
    assert [r.from_on for r in rungs] == [None, DATE - dt.timedelta(days=2)]
    two = {**TIERS, "eb2_days": 2, "eb2_off_paise": 100_00}  # the next day can't be booked
    assert [r.from_on for r in ladder(ist(DATE - dt.timedelta(days=10)), **two)] == [None]


# --- the owner's input --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "message"),
    [
        ({"on": True, "tiers": []}, "Add a tier, or switch early-bird off"),
        (
            {"tiers": [{"days": 60, "offPaise": 1_000_00}, {"days": 60, "offPaise": 500_00}]},
            "give it fewer days",
        ),
        (
            {"tiers": [{"days": 60, "offPaise": 1_000_00}, {"days": 30, "offPaise": 1_000_00}]},
            "take off less",
        ),
        ({"tiers": [{"days": 2, "offPaise": 1_000_00}]}, "greater than or equal to 3"),
        ({"tiers": [{"days": 30, "offPaise": 1_000_50}]}, "multiple of 100"),
    ],
)
def test_the_input_refuses_a_bad_shape(value: dict[str, object], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        EarlyBirdInput.model_validate(value)


# --- reads, the owner, the cron (database) -----------------------------------------------------


async def set_tiers(db: AsyncSession, slug: str, **values: object) -> None:
    await db.execute(update(Package).where(Package.slug == slug).values(**values))
    await db.commit()


async def first_open_date(db: AsyncSession, slug: str) -> dt.date:
    """KER's 5 Dec departure has seats; 9 Jan is sold out (the catalog fixture)."""
    p = await package_by_slug(db, slug)
    rows = await db.execute(
        select(Departure.date)
        .where(Departure.package_id == p.id, Departure.seats_total > 0)
        .order_by(Departure.date)
    )
    return rows.scalars().first()  # type: ignore[return-value]


@pytest.mark.db
async def test_the_package_page_carries_the_tiers_and_nothing_while_off(
    catalog: None, db: AsyncSession
) -> None:
    assert (await get_package(db, KER)).early_bird is None  # type: ignore[union-attr]
    await set_tiers(db, KER, **TIERS)
    detail = await get_package(db, KER)
    assert detail is not None and detail.early_bird is not None
    assert [(t.days, t.off_paise) for t in detail.early_bird.tiers] == [
        (90, 1_500_00),
        (45, 750_00),
    ]
    await set_tiers(db, KER, early_bird_on=False)
    assert (await get_package(db, KER)).early_bird is None  # type: ignore[union-attr]


@pytest.mark.db
async def test_the_card_tag_shows_only_while_an_open_date_still_earns_a_tier(
    catalog: None, db: AsyncSession
) -> None:
    date = await first_open_date(db, KER)  # 5 Dec, 8 seats; 9 Jan has none
    days = (date - ist_today()).days
    await set_tiers(db, KER, early_bird_on=True, eb1_days=days, eb1_off_paise=1_000_00)
    last_day = date - dt.timedelta(days=days)
    ker = (await package_by_slug(db, KER)).id

    assert ker in await early_bird.with_savings(db, last_day)
    assert ker not in await early_bird.with_savings(db, last_day + dt.timedelta(days=1)), (
        "the sold-out 9 Jan date must not keep the tag alive"
    )
    cards = {c.slug: c for c in (await search_packages(db)).items}
    assert cards[KER].early_bird and not cards[NGB].early_bird


@pytest.mark.db
async def test_owner_saves_switches_off_and_keeps_the_tiers(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    p = await package_by_slug(db, NGB)
    tiers = [{"days": 90, "offPaise": 1_500_00}, {"days": 45, "offPaise": 750_00}]

    out = await svc.update_package(
        db, p.id, await as_payload(db, p.id, earlyBird={"on": True, "tiers": tiers})
    )
    assert out.early_bird.on
    assert [(t.days, t.off_paise) for t in out.early_bird.tiers] == [(90, 1_500_00), (45, 750_00)]
    assert "package:north-goa-beaches" in revalidated.calls[-1]

    off = await svc.update_package(
        db, p.id, await as_payload(db, p.id, earlyBird={"on": False, "tiers": tiers})
    )
    assert not off.early_bird.on and len(off.early_bird.tiers) == 2

    untouched = await svc.update_package(db, p.id, await as_payload(db, p.id))
    assert len(untouched.early_bird.tiers) == 2, "a form without earlyBird leaves it alone"

    one = await svc.update_package(
        db, p.id, await as_payload(db, p.id, earlyBird={"on": True, "tiers": tiers[:1]})
    )
    assert [(t.days, t.off_paise) for t in one.early_bird.tiers] == [(90, 1_500_00)]
    rows = {r.slug: r for r in await svc.list_packages(db)}
    assert rows[NGB].early_bird_on


@pytest.mark.db
async def test_the_route_files_a_bad_tier_under_its_field(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    p = await package_by_slug(db, NGB)
    body = (await as_payload(db, p.id)).model_dump(mode="json", by_alias=True)
    body["earlyBird"] = {
        "on": True,
        "tiers": [{"days": 30, "offPaise": 500_00}, {"days": 60, "offPaise": 250_00}],
    }
    res = await db_client.put(f"/admin/packages/{p.id}", json=body, headers=cookie)
    assert res.status_code == 400, res.text
    errors = res.json()["error"]["fieldErrors"]
    assert "earlyBird.tiers" in errors and "fewer days" in errors["earlyBird.tiers"]


@pytest.mark.db
async def test_daily_revalidates_packages_whose_tier_ended_at_midnight(
    catalog: None, db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    date = await first_open_date(db, KER)
    days = (date - ist_today()).days
    # KER's tier 1 was last bookable yesterday; GQE's ended a week ago; NGB is switched off.
    await set_tiers(db, KER, early_bird_on=True, eb1_days=days + 1, eb1_off_paise=1_000_00)
    await set_tiers(db, GQE, early_bird_on=True, eb1_days=1, eb1_off_paise=1_000_00)
    assert await svc.revalidate_ended_early_birds(db, today=ist_today()) == 1
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:kerala-backwaters", "destination:kerala"]
    ]


@pytest.mark.db
async def test_the_quote_route_has_the_line_and_the_ladder(
    catalog: None, db: AsyncSession, db_client: AsyncClient
) -> None:
    date = await first_open_date(db, KER)
    days = (date - ist_today()).days
    await set_tiers(
        db,
        KER,
        early_bird_on=True,
        eb1_days=days,
        eb1_off_paise=2_000_00,
        eb2_days=days - 10,
        eb2_off_paise=1_000_00,
    )
    p = await package_by_slug(db, KER)
    dep_id = (
        await db.execute(
            select(Departure.id).where(Departure.package_id == p.id, Departure.date == date)
        )
    ).scalar_one()
    res = await db_client.post(
        "/bookings/quote",
        json={"departureId": dep_id, "travellers": [{"occupancy": "double"}] * 2},
    )
    assert res.status_code == 200, res.text
    q = res.json()
    assert q["earlyBird"]["tier"] == 1 and q["earlyBird"]["bookBy"] == ist_today().isoformat()
    assert [li for li in q["lines"] if li["kind"] == "early_bird"] == [
        {
            "kind": "early_bird",
            "occupancy": "double",
            "count": 2,
            "unitPaise": -2_000_00,
            "amountPaise": -4_000_00,
        }
    ]
    assert [r["fromOn"] for r in q["ladder"]] == [
        None,
        (ist_today() + dt.timedelta(days=1)).isoformat(),
        (ist_today() + dt.timedelta(days=11)).isoformat(),
    ]
    assert [r["farePaise"] for r in q["ladder"]] == [
        2 * (24_999_00 - 2_000_00),
        2 * (24_999_00 - 1_000_00),
        2 * 24_999_00,
    ]


@pytest.mark.db
async def test_the_early_bird_seed_writes_only_the_listed_packages(db: AsyncSession) -> None:
    await seeded(db)
    await set_tiers(db, GQE, early_bird_on=True, eb1_days=30, eb1_off_paise=500_00)  # owner's
    content = fixture_content()
    tiers = [EarlyBirdTier(days=90, off_inr=1_500), EarlyBirdTier(days=45, off_inr=750)]
    content.packages = [
        p.model_copy(update={"early_bird": tiers}) if p.slug == NGB else p for p in content.packages
    ] + [content.packages[0].model_copy(update={"slug": "not-here", "early_bird": tiers})]

    result = await seed_early_bird(db, content)
    assert result.counts == {"early_bird": 1}
    assert result.warnings == ["not-here: not in this database — skipped"]
    ngb, gqe = await package_by_slug(db, NGB), await package_by_slug(db, GQE)
    await db.refresh(ngb)
    await db.refresh(gqe)
    assert (ngb.early_bird_on, ngb.eb1_days, ngb.eb1_off_paise, ngb.eb2_days) == (
        True,
        90,
        1_500_00,
        45,
    )
    assert (gqe.early_bird_on, gqe.eb1_days) == (True, 30), "a package the seed lists no tiers for"
