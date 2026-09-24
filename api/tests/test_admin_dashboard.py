"""F22 dashboard: the aggregates behind `/admin` (06 §C-REST `getDashboard`, R12).

Every window is an IST one, so each test pins `today` rather than letting the clock decide.
"""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, PackageView
from app.models.enums import EnquiryStatus, PackageStatus
from app.schemas.admin_enquiries import EnquiryFilters
from app.schemas.meta import Badge
from app.services import admin_enquiries as inbox
from app.services import dashboard as svc
from app.services.email.render import IST
from tests.test_admin_enquiries import make_enquiry, make_package, owner_headers

# A Tuesday, so "this week" starts two days back and the weekend is in the window.
TODAY = dt.date(2026, 9, 22)
MONDAY = dt.date(2026, 9, 21)


def ist_at(day: dt.date, hour: int = 12) -> dt.datetime:
    """An aware UTC instant on `day`, mid-afternoon in India."""
    return dt.datetime.combine(day, dt.time(hour), tzinfo=IST).astimezone(dt.UTC)


async def seed_departure(
    db: AsyncSession, package_id: str, *, date: dt.date, seats: int = 20, guaranteed: bool = False
) -> Departure:
    row = Departure(
        package_id=package_id,
        date=date,
        seats_total=seats,
        guaranteed=guaranteed,
        price_double_paise=1_499_900,
        price_triple_paise=1_399_900,
        price_child_paise=899_900,
        single_supplement_paise=450_000,
    )
    db.add(row)
    await db.flush()
    return row


# --- windows --------------------------------------------------------------------------------------


def test_the_week_starts_on_monday() -> None:
    assert svc.week_start(dt.date(2026, 9, 22)) == MONDAY  # Tuesday
    assert svc.week_start(MONDAY) == MONDAY
    assert svc.week_start(dt.date(2026, 9, 27)) == MONDAY  # Sunday still belongs to it


def test_the_thirty_day_window_includes_today() -> None:
    assert svc.window_start(TODAY, 30) == dt.date(2026, 8, 24)
    assert (TODAY - svc.window_start(TODAY, 30)).days == 29


def test_a_forward_window_is_the_mirror_of_a_backward_one() -> None:
    """ "Next 30 days" has to mean 30 days, today included — the same count as the 30 behind."""
    assert svc.window_end(TODAY, 30) == dt.date(2026, 10, 21)
    assert (svc.window_end(TODAY, 30) - TODAY).days == 29


# --- enquiries ------------------------------------------------------------------------------------


@pytest.mark.db
async def test_this_week_and_last_week_split_on_the_ist_monday(db: AsyncSession) -> None:
    rows = {
        "TS-THIS11": ist_at(MONDAY, 0),  # midnight IST Monday: the first row of this week
        "TS-THIS22": ist_at(TODAY),
        "TS-LAST11": ist_at(MONDAY - dt.timedelta(days=1)),  # Sunday: last week
        "TS-LAST22": ist_at(MONDAY - dt.timedelta(days=7)),
        "TS-OLD111": ist_at(MONDAY - dt.timedelta(days=8)),  # older than both windows
    }
    for ref, when in rows.items():
        row = await make_enquiry(db, ref=ref)
        row.created_at = when
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert out.week_start == MONDAY
    assert out.enquiries_this_week == 2
    assert out.enquiries_last_week == 2


@pytest.mark.db
async def test_last_week_to_date_stops_at_the_same_weekday(db: AsyncSession) -> None:
    """TODAY is a Tuesday, so the comparison covers last Monday and Tuesday — not the whole week,
    which would make a two-day-old week look like a collapse."""
    for ref, when in {
        "TS-LMON11": ist_at(MONDAY - dt.timedelta(days=7)),  # last Monday
        "TS-LTUE11": ist_at(MONDAY - dt.timedelta(days=6)),  # last Tuesday: the last day counted
        "TS-LWED11": ist_at(MONDAY - dt.timedelta(days=5)),  # last Wednesday: after the cutoff
        "TS-LSUN11": ist_at(MONDAY - dt.timedelta(days=1)),  # last Sunday
    }.items():
        row = await make_enquiry(db, ref=ref)
        row.created_at = when
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert out.enquiries_last_week_to_date == 2
    assert out.enquiries_last_week == 4


@pytest.mark.db
async def test_by_status_is_the_same_query_the_inbox_tabs_use(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-NEW111", status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-NEW222", status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-CON111", status=EnquiryStatus.CONTACTED)
    await make_enquiry(db, ref="TS-CNV111", status=EnquiryStatus.CONVERTED)
    await make_enquiry(db, ref="TS-CLS111", status=EnquiryStatus.CLOSED)
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)
    inbox_counts = (await inbox.list_enquiries(db, EnquiryFilters())).counts

    assert out.by_status == inbox_counts
    assert (out.by_status.new, out.by_status.all) == (2, 5)


@pytest.mark.db
async def test_awaiting_first_call_counts_new_and_reports_the_oldest_of_them(
    db: AsyncSession,
) -> None:
    oldest = await make_enquiry(db, ref="TS-WAIT11", status=EnquiryStatus.NEW)
    oldest.created_at = ist_at(TODAY - dt.timedelta(days=3))
    newer = await make_enquiry(db, ref="TS-WAIT22", status=EnquiryStatus.NEW)
    newer.created_at = ist_at(TODAY)
    handled = await make_enquiry(db, ref="TS-WAIT33", status=EnquiryStatus.CONTACTED)
    handled.created_at = ist_at(TODAY - dt.timedelta(days=9))
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert out.awaiting_first_call == 2
    assert out.oldest_new_at == oldest.created_at


@pytest.mark.db
async def test_nothing_new_leaves_the_oldest_unset(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-DONE11", status=EnquiryStatus.CLOSED)
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert out.awaiting_first_call == 0
    assert out.oldest_new_at is None


@pytest.mark.db
async def test_converted_counts_enquiries_received_inside_the_window(db: AsyncSession) -> None:
    """Received, not marked — the same date rule the inbox filters by, so the two reconcile."""
    inside = await make_enquiry(db, ref="TS-CNV222", status=EnquiryStatus.CONVERTED)
    inside.created_at = ist_at(TODAY - dt.timedelta(days=29))
    outside = await make_enquiry(db, ref="TS-CNV333", status=EnquiryStatus.CONVERTED)
    outside.created_at = ist_at(TODAY - dt.timedelta(days=30))
    await make_enquiry(db, ref="TS-CNV444", status=EnquiryStatus.NEW)
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert out.converted_last_30_days == 1
    # The tile reads "1 of 2 received": the same window, so the two numbers always agree.
    assert out.enquiries_last_30_days == 2


@pytest.mark.db
async def test_top_packages_by_enquiries_ranks_the_window_and_stops_at_five(
    db: AsyncSession,
) -> None:
    packages = [
        await make_package(db, slug=f"test-pkg-{i}", dest_slug=f"test-dest-{i}") for i in range(6)
    ]
    # Package i gets i + 1 enquiries, so the least popular one falls off the top five.
    for i, pkg in enumerate(packages):
        for n in range(i + 1):
            await make_enquiry(db, ref=f"TS-P{i}N{n}11", package_id=pkg.id)
    stale = await make_enquiry(db, ref="TS-STALE1", package_id=packages[0].id)
    stale.created_at = ist_at(TODAY - dt.timedelta(days=45))
    await make_enquiry(db, ref="TS-NOPKG1", package_id=None)  # a contact enquiry
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert [(r.slug, r.count) for r in out.top_by_enquiries] == [
        ("test-pkg-5", 6),
        ("test-pkg-4", 5),
        ("test-pkg-3", 4),
        ("test-pkg-2", 3),
        ("test-pkg-1", 2),
    ]


@pytest.mark.db
async def test_top_packages_by_views_sums_the_window_and_drops_older_days(
    db: AsyncSession,
) -> None:
    quiet = await make_package(db, slug="test-quiet", dest_slug="test-quiet-dest")
    busy = await make_package(db, slug="test-busy", dest_slug="test-busy-dest")
    db.add_all(
        [
            PackageView(package_id=busy.id, day=TODAY, count=40),
            PackageView(package_id=busy.id, day=TODAY - dt.timedelta(days=29), count=2),
            PackageView(package_id=busy.id, day=TODAY - dt.timedelta(days=30), count=900),
            PackageView(package_id=quiet.id, day=TODAY - dt.timedelta(days=1), count=7),
        ]
    )
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert [(r.slug, r.count) for r in out.top_by_views] == [("test-busy", 42), ("test-quiet", 7)]


@pytest.mark.db
async def test_the_view_tiles_compare_the_last_seven_days_with_the_previous_seven(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    db.add_all(
        [
            PackageView(package_id=pkg.id, day=TODAY, count=5),
            PackageView(package_id=pkg.id, day=TODAY - dt.timedelta(days=6), count=5),
            PackageView(package_id=pkg.id, day=TODAY - dt.timedelta(days=7), count=3),
            PackageView(package_id=pkg.id, day=TODAY - dt.timedelta(days=13), count=1),
            PackageView(package_id=pkg.id, day=TODAY - dt.timedelta(days=14), count=100),
        ]
    )
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert (out.views_last_7_days, out.views_previous_7_days) == (10, 4)


# --- departures -----------------------------------------------------------------------------------


@pytest.mark.db
async def test_upcoming_departures_take_seats_from_the_availability_view(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    await seed_departure(db, pkg.id, date=TODAY, seats=12, guaranteed=True)
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert len(out.upcoming_departures) == 1
    row = out.upcoming_departures[0]
    assert (row.date, row.seats_total, row.seats_left, row.guaranteed) == (TODAY, 12, 12, True)
    assert row.badge == Badge.GUARANTEED
    assert (row.package_slug, row.package_name) == ("test-goa-beaches", "North Goa Beaches")


@pytest.mark.db
async def test_upcoming_departures_are_the_next_thirty_days_oldest_first(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    await seed_departure(db, pkg.id, date=TODAY - dt.timedelta(days=1))  # gone
    await seed_departure(db, pkg.id, date=TODAY + dt.timedelta(days=29))  # the last one in
    await seed_departure(db, pkg.id, date=TODAY + dt.timedelta(days=30))  # the 31st day: out
    await seed_departure(db, pkg.id, date=TODAY + dt.timedelta(days=3))
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert [d.date for d in out.upcoming_departures] == [
        TODAY + dt.timedelta(days=3),
        TODAY + dt.timedelta(days=29),
    ]
    assert out.upcoming_departures_total == 2


@pytest.mark.db
async def test_a_long_departure_list_is_capped_but_reports_its_real_size(
    db: AsyncSession,
) -> None:
    """Twelve packages with a handful of dates each overflow the table; the owner has to be told
    the list stops rather than reading it as the whole month."""
    pkg = await make_package(db)
    for offset in range(svc.MAX_DEPARTURES + 4):
        await seed_departure(db, pkg.id, date=TODAY + dt.timedelta(days=offset))
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert len(out.upcoming_departures) == svc.MAX_DEPARTURES
    assert out.upcoming_departures_total == svc.MAX_DEPARTURES + 4


@pytest.mark.db
async def test_an_empty_database_answers_with_zeroes_rather_than_nulls(db: AsyncSession) -> None:
    out = await svc.get_dashboard(db, today=TODAY)

    assert (out.enquiries_this_week, out.enquiries_last_week, out.converted_last_30_days) == (
        0,
        0,
        0,
    )
    assert out.enquiries_last_30_days == 0
    assert (out.views_last_7_days, out.views_previous_7_days) == (0, 0)
    assert out.by_status.all == 0
    assert out.top_by_enquiries == [] and out.top_by_views == []
    assert out.upcoming_departures == [] and out.upcoming_departures_total == 0
    assert out.window_start == svc.window_start(TODAY, 30)


# --- route ----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_dashboard_route_is_owner_only(db_client: AsyncClient) -> None:
    res = await db_client.get("/admin/dashboard")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


@pytest.mark.db
async def test_the_dashboard_route_answers_no_store_and_the_camelcase_contract(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    pkg = await make_package(db)
    await make_enquiry(db, ref="TS-DASH11", package_id=pkg.id)
    await seed_departure(db, pkg.id, date=dt.date.today() + dt.timedelta(days=5))
    db.add(PackageView(package_id=pkg.id, day=dt.date.today(), count=3))
    await db.commit()

    res = await db_client.get("/admin/dashboard", headers=headers)

    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["enquiriesThisWeek"] >= 1
    assert body["byStatus"]["new"] >= 1
    assert body["topByEnquiries"][0]["slug"] == "test-goa-beaches"
    assert body["topByViews"][0]["count"] == 3
    assert body["upcomingDepartures"][0]["seatsLeft"] == 20
    assert body["upcomingDepartures"][0]["packageName"] == "North Goa Beaches"
    assert body["upcomingDepartures"][0]["badge"] is None  # 20 seats, not guaranteed


@pytest.mark.db
async def test_upcoming_departures_leave_out_drafts(db: AsyncSession) -> None:
    """A draft's dates are not on sale — a fresh duplicate of a live trip included — so they
    are not departures the owner has to get ready for, nor part of the total."""
    live = await make_package(db)
    draft = await make_package(db, slug="test-goa-beaches-copy", dest_slug="test-goa-2")
    draft.status = PackageStatus.DRAFT
    await seed_departure(db, live.id, date=TODAY + dt.timedelta(days=5))
    await seed_departure(db, draft.id, date=TODAY + dt.timedelta(days=5))
    await seed_departure(db, draft.id, date=TODAY + dt.timedelta(days=9))
    await db.commit()

    out = await svc.get_dashboard(db, today=TODAY)

    assert [d.package_id for d in out.upcoming_departures] == [live.id]
    assert out.upcoming_departures_total == 1
