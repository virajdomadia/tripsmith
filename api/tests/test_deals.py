"""B12 deals (03 R20/R24): what every read shows while a deal runs, the owner's three fields
and their validation, and the daily job that clears ended deals off prerendered pages."""

import datetime as dt

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Package
from app.schemas.catalog import DealState, PackageInput, SearchParams, SortOrder
from app.services.analytics import ist_today
from app.services.catalog import admin_packages as svc
from app.services.catalog import deals
from app.services.catalog.home import get_home_data
from app.services.catalog.reads import get_package, list_destinations
from app.services.catalog.search import search_packages
from app.services.email.render import IST
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

NOW = dt.datetime.now(dt.UTC)
TODAY = ist_today(NOW)


def pkg(deal: int | None, ends: dt.datetime | None, starting: int = 20_000_00) -> Package:
    return Package(deal_price_paise=deal, deal_ends_at=ends, starting_price_paise=starting)


# --- pure -----------------------------------------------------------------------------------------


def test_the_end_date_is_stored_as_midnight_ist_after_it_and_reads_back() -> None:
    ends_at = deals.end_of_ist_day(dt.date(2026, 10, 2))
    assert ends_at == dt.datetime(2026, 10, 2, 18, 30, tzinfo=dt.UTC)  # 00:00 IST on the 3rd
    assert deals.ends_on(ends_at) == dt.date(2026, 10, 2)
    # 23:59 IST on the day is still inside it; 00:00 IST the next day is not.
    last_minute = dt.datetime(2026, 10, 2, 23, 59, tzinfo=IST)
    assert deals.state(pkg(15_000_00, ends_at), 20_000_00, last_minute) is DealState.ACTIVE
    assert deals.state(pkg(15_000_00, ends_at), 20_000_00, ends_at) is DealState.ENDED


def test_a_running_deal_shows_starting_minus_the_flat_amount_off() -> None:
    later = NOW + dt.timedelta(days=3)
    shown = deals.deal_for(pkg(17_000_00, later), 20_000_00, NOW)
    assert shown is not None
    assert (shown.off_paise, shown.price_paise) == (3_000_00, 17_000_00)
    # The cheapest date sold out: the card's starting price rose, the amount off did not.
    dearer = deals.deal_for(pkg(17_000_00, later, starting=22_000_00), 20_000_00, NOW)
    assert dearer is not None and dearer.price_paise == 19_000_00


@pytest.mark.parametrize(
    ("deal", "ends", "base", "starting", "state"),
    [
        (None, None, 20_000_00, 20_000_00, DealState.NONE),
        (17_000_00, NOW - dt.timedelta(seconds=1), 20_000_00, 20_000_00, DealState.ENDED),
        (20_000_00, NOW + dt.timedelta(days=1), 20_000_00, 20_000_00, DealState.INACTIVE),
        (17_000_00, NOW + dt.timedelta(days=1), 0, 0, DealState.INACTIVE),
        (17_000_00, NOW + dt.timedelta(days=1), 20_000_00, 0, DealState.ACTIVE),  # all sold out
    ],
)
def test_nothing_shows_unless_the_deal_runs_below_its_base_with_a_price_to_strike(
    deal: int | None, ends: dt.datetime | None, base: int, starting: int, state: DealState
) -> None:
    p = pkg(deal, ends, starting=starting)
    assert deals.deal_for(p, base, NOW) is None
    assert deals.state(p, base, NOW) is state


# --- reads ----------------------------------------------------------------------------------------


async def set_deal(
    db: AsyncSession,
    slug: str,
    deal: int | None,
    days: int = 5,
    label: str | None = None,
) -> None:
    ends = deals.end_of_ist_day(TODAY + dt.timedelta(days=days)) if deal else None
    await db.execute(
        update(Package)
        .where(Package.slug == slug)
        .values(deal_price_paise=deal, deal_ends_at=ends, deal_label=label)
    )
    await db.commit()


async def base(db: AsyncSession, slug: str) -> int:
    return (await deals.bases(db, TODAY))[(await package_by_slug(db, slug)).id]


@pytest.mark.db
async def test_search_sorts_filters_and_facets_by_the_price_the_card_shows(
    catalog: None, db: AsyncSession
) -> None:
    before = await search_packages(db)
    assert [c.slug for c in before.items] == [NGB, GQE, KER]
    kerala = next(c for c in before.items if c.slug == KER)
    assert kerala.deal is None

    await set_deal(db, KER, 9_999_00, label="Monsoon offer")
    after = await search_packages(db)

    assert after.items[0].slug == KER, "cheapest shown price first"
    deal = after.items[0].deal
    assert deal is not None
    assert (deal.label, deal.price_paise, deal.off_paise) == ("Monsoon offer", 9_999_00, 15_000_00)
    assert deal.ends_on == TODAY + dt.timedelta(days=5)
    assert after.items[0].starting_price_paise == 24_999_00, "struck through, unchanged"
    assert after.facets.budget.min == 9_000
    within = await search_packages(db, SearchParams(max_budget=10_000))
    assert [c.slug for c in within.items] == [KER]
    desc = await search_packages(db, SearchParams(sort=SortOrder.PRICE_DESC))
    assert desc.items[-1].slug == KER


@pytest.mark.db
async def test_an_ended_deal_is_gone_from_every_read_without_a_write(
    catalog: None, db: AsyncSession
) -> None:
    await set_deal(db, KER, 9_999_00)
    later = deals.end_of_ist_day(TODAY + dt.timedelta(days=5))

    assert (await get_package(db, KER, now=later - dt.timedelta(seconds=1))).deal is not None  # type: ignore[union-attr]
    detail = await get_package(db, KER, now=later)
    assert detail is not None and detail.deal is None
    assert all(c.deal is None for c in (await search_packages(db, now=later)).items)
    assert (await get_home_data(db, now=later)).deals == []


@pytest.mark.db
async def test_the_package_page_carries_the_deal_measured_from_its_base(
    catalog: None, db: AsyncSession
) -> None:
    b = await base(db, NGB)
    await set_deal(db, NGB, b - 2_000_00)
    detail = await get_package(db, NGB)
    assert detail is not None and detail.deal is not None
    assert detail.deal.off_paise == 2_000_00
    assert detail.deal.price_paise == detail.starting_price_paise - 2_000_00


@pytest.mark.db
async def test_home_strip_is_running_deals_ending_soonest_first(
    catalog: None, db: AsyncSession
) -> None:
    assert (await get_home_data(db)).deals == []
    await set_deal(db, KER, 20_000_00, days=9)
    await set_deal(db, NGB, await base(db, NGB) - 1_000_00, days=2)
    await set_deal(db, GQE, 999_999_00, days=1)  # not below its base: never shown

    home = await get_home_data(db)
    assert [c.slug for c in home.deals] == [NGB, KER]
    featured = {c.slug: c for c in home.packages}
    assert featured[KER].deal is not None, "the featured card agrees with the strip"


@pytest.mark.db
async def test_destination_tiles_start_from_the_shown_price(
    catalog: None, db: AsyncSession
) -> None:
    await set_deal(db, KER, 9_999_00)
    tiles = {d.slug: d for d in await list_destinations(db)}
    assert tiles["kerala"].starting_price_paise == 9_999_00


# --- the owner's fields -----------------------------------------------------------------------


@pytest.mark.db
async def test_owner_sets_edits_and_clears_a_deal(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    p = await package_by_slug(db, NGB)
    b = await base(db, NGB)
    ends = TODAY + dt.timedelta(days=10)

    out = await svc.update_package(
        db,
        p.id,
        await as_payload(
            db, p.id, dealPricePaise=b - 1_500_00, dealLabel="  Diwali  ", dealEndsOn=ends
        ),
    )
    assert (out.deal_price_paise, out.deal_label, out.deal_ends_on) == (
        b - 1_500_00,
        "Diwali",
        ends,
    )
    assert out.deal_state is DealState.ACTIVE and out.deal_base_paise == b
    row = await package_by_slug(db, NGB)
    await db.refresh(row)
    assert row.deal_ends_at == deals.end_of_ist_day(ends)
    assert "package:north-goa-beaches" in revalidated.calls[-1]

    cleared = await svc.update_package(
        db, p.id, await as_payload(db, p.id, dealPricePaise=None, dealLabel="", dealEndsOn=None)
    )
    assert (cleared.deal_price_paise, cleared.deal_label, cleared.deal_ends_on) == (
        None,
        None,
        None,
    )
    assert cleared.deal_state is DealState.NONE


@pytest.mark.db
@pytest.mark.parametrize(
    ("fields", "errors"),
    [
        ({"dealPricePaise": 1_000_00}, {"dealEndsOn"}),
        ({"dealEndsOn": "+3"}, {"dealPricePaise"}),
        ({"dealLabel": "Sale"}, {"dealLabel"}),
        ({"dealPricePaise": "base", "dealEndsOn": "+3"}, {"dealPricePaise"}),
        ({"dealPricePaise": 1_000_00, "dealEndsOn": "-1"}, {"dealEndsOn"}),
    ],
)
async def test_the_deal_fields_are_validated_on_the_field_that_is_wrong(
    db: AsyncSession,
    revalidated: RecordingRevalidate,
    fields: dict[str, object],
    errors: set[str],
) -> None:
    await seeded(db)
    p = await package_by_slug(db, NGB)
    b = await base(db, NGB)
    values = {
        k: b if v == "base" else TODAY + dt.timedelta(days=int(str(v))) if k == "dealEndsOn" else v
        for k, v in fields.items()
    }
    with pytest.raises(ApiError) as exc:
        await svc.update_package(db, p.id, await as_payload(db, p.id, **values))
    assert exc.value.code == "validation"
    assert set(exc.value.field_errors or {}) == errors
    await db.rollback()
    row = await package_by_slug(db, NGB)
    await db.refresh(row)
    assert row.deal_price_paise is None, "nothing saved"


@pytest.mark.db
async def test_a_price_change_that_lifts_the_deal_to_its_base_switches_it_off_not_the_save(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    p = await package_by_slug(db, NGB)
    b = await base(db, NGB)
    body = await as_payload(
        db, p.id, dealPricePaise=b - 500_00, dealEndsOn=TODAY + dt.timedelta(days=4)
    )
    await svc.update_package(db, p.id, body)

    cheaper = await as_payload(db, p.id)
    cheaper = cheaper.model_copy(
        update={
            "departures": [
                d.model_copy(update={"price_double_paise": b - 1_000_00})
                for d in cheaper.departures
            ]
        }
    )
    out = await svc.update_package(db, p.id, cheaper)

    assert out.deal_state is DealState.INACTIVE
    assert out.deal_base_paise < out.deal_price_paise  # type: ignore[operator]
    rows = {r.slug: r for r in await svc.list_packages(db)}
    assert rows[NGB].deal_state is DealState.INACTIVE
    assert (await get_package(db, NGB)).deal is None  # type: ignore[union-attr]


@pytest.mark.db
async def test_an_ended_deal_saves_untouched_and_can_be_extended(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    p = await package_by_slug(db, NGB)
    b = await base(db, NGB)
    await db.execute(
        update(Package)
        .where(Package.id == p.id)
        .values(
            deal_price_paise=b - 500_00,
            deal_ends_at=deals.end_of_ist_day(TODAY - dt.timedelta(days=3)),
        )
    )
    await db.commit()

    out = await svc.update_package(db, p.id, await as_payload(db, p.id, name="Renamed"))
    assert out.deal_state is DealState.ENDED

    extended = await svc.update_package(db, p.id, await as_payload(db, p.id, dealEndsOn=TODAY))
    assert extended.deal_state is DealState.ACTIVE, "today is the last day, still running"


@pytest.mark.db
async def test_a_new_draft_can_carry_a_deal(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    p = await package_by_slug(db, NGB)
    body = await as_payload(
        db,
        p.id,
        slug="north-goa-deal",
        dealPricePaise=1_00,
        dealEndsOn=TODAY + dt.timedelta(days=1),
    )
    out = await svc.create_package(db, body)  # incoming departure ids are ignored on create
    assert out.deal_price_paise == 1_00 and out.deal_state is DealState.ACTIVE


@pytest.mark.db
async def test_the_route_answers_400_with_the_field(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    p = await package_by_slug(db, NGB)
    body = await as_payload(db, p.id, dealLabel="Sale")
    res = await db_client.put(
        f"/admin/packages/{p.id}",
        json=body.model_dump(mode="json", by_alias=True),
        headers=cookie,
    )
    assert res.status_code == 400, res.text
    assert res.json()["error"]["fieldErrors"] == {
        "dealLabel": "Add a deal price and end date, or clear the label"
    }


def test_the_label_is_capped_to_fit_the_stamp() -> None:
    with pytest.raises(ValidationError):
        PackageInput.model_validate(
            {
                "slug": "x",
                "destinationId": "d",
                "name": "X",
                "summary": "s" * 40,
                "nights": 1,
                "dealLabel": "x" * 25,
            }
        )


# --- cron -----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_daily_revalidates_pages_of_deals_that_ended_since_the_last_run(
    catalog: None, db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    now = NOW
    for slug, ended_ago in ((KER, dt.timedelta(hours=1)), (GQE, dt.timedelta(days=5))):
        await db.execute(
            update(Package)
            .where(Package.slug == slug)
            .values(deal_price_paise=1_00, deal_ends_at=now - ended_ago)
        )
    await set_deal(db, NGB, 1_00, days=3)  # still running

    assert await svc.revalidate_ended_deals(db, now=now) == 1
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:kerala-backwaters", "destination:kerala"]
    ]
