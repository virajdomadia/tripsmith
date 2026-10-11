"""P12 (R55) — the owner's reports: the range rules, each section's arithmetic, the seeded demo
history (marked, idempotent, never near today), and the accept test: for the same From/To the
reports' booked, net and balances due are the desk CSV's Total, Paid and Balance due summed.
The db tests need TEST_DATABASE_URL."""

import csv
import datetime as dt
import io
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Booking, Departure, Enquiry, PackageView, Payment
from app.models.enums import BookingActor, BookingStatus
from app.schemas.reports import DiscountSource
from app.services import reports
from app.services.analytics import ist_today
from app.services.booking import refunds
from app.services.email.send import is_seed_address
from app.services.reports import Dep
from scripts.seed_history import NEWEST_BOOKING_DAYS, NEWEST_DEPARTURE_DAYS, seed_history
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_orders import SOON, seeded
from tests.test_booking_payments import callback, rzp
from tests.test_bookings_desk import hold, lapse, owner_cookie
from tests.test_deposits import book

__all__ = ["rzp"]

TODAY = dt.date(2026, 10, 11)
RICH = 14  # past dates on the one test package: enough bookings for every section


# --- pure ---------------------------------------------------------------------------------------


def test_the_default_range_is_this_indian_financial_year() -> None:
    assert reports.resolve_range(None, None, TODAY) == (dt.date(2026, 4, 1), dt.date(2027, 3, 31))
    assert reports.resolve_range(None, None, dt.date(2027, 3, 31))[0] == dt.date(2026, 4, 1)
    assert reports.resolve_range(None, None, dt.date(2027, 4, 1))[0] == dt.date(2027, 4, 1)


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (dt.date(2026, 5, 1), None),
        (None, dt.date(2026, 5, 1)),
        (dt.date(2026, 5, 2), dt.date(2026, 5, 1)),
        (dt.date(2023, 1, 1), dt.date(2026, 1, 1)),  # wider than three years
    ],
)
def test_a_half_open_backwards_or_huge_range_is_refused(
    start: dt.date | None, end: dt.date | None
) -> None:
    with pytest.raises(ApiError):
        reports.resolve_range(start, end, TODAY)


def test_the_previous_range_is_the_same_length_just_before() -> None:
    assert reports.previous_range(dt.date(2026, 10, 1), dt.date(2026, 10, 31)) == (
        dt.date(2026, 8, 31),
        dt.date(2026, 9, 30),
    )
    assert reports.months_between(dt.date(2025, 11, 20), dt.date(2026, 2, 1)) == [
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


def test_buckets() -> None:
    assert [reports.party_bucket(n) for n in (1, 2, 4, 5, 9)] == ["1", "2", "4", "5+", "5+"]
    assert [reports.lead_bucket(d) for d in (0, 6, 7, 29, 30, 89, 90, 400)] == [
        "Under 7 days",
        "Under 7 days",
        "7–29 days",
        "7–29 days",
        "30–89 days",
        "30–89 days",
        "90+ days",
        "90+ days",
    ]


def test_discounts_are_read_off_the_quote_snapshot() -> None:
    quote = {
        "lines": [
            {"kind": "double", "amountPaise": 40_000_00},
            {"kind": "deal", "amountPaise": -3_000_00},
            {"kind": "early_bird", "amountPaise": -2_000_00},
        ],
        "coupon": {"code": "WELCOME10", "offPaise": 1_500_00},
        "manual": {"offPaise": 500_00, "percent": None, "reason": "Regular"},
    }
    assert reports.discount_parts(quote) == [
        (DiscountSource.DEAL, "Deals", 3_000_00),
        (DiscountSource.EARLY_BIRD, "Early-bird", 2_000_00),
        (DiscountSource.COUPON, "WELCOME10", 1_500_00),
        (DiscountSource.MANUAL, "Manual (counter)", 500_00),
    ]
    assert reports.discount_parts({"lines": [{"kind": "double", "amountPaise": 1}]}) == []


def _dep(n: int, sold: int, *, total: int = 10, guaranteed: bool = False, live: bool = True) -> Dep:
    return Dep(
        id=f"d{n}",
        package_id="p",
        package_name="P",
        live=live,
        date=TODAY + dt.timedelta(days=n),
        seats_total=total,
        guaranteed=guaranteed,
        sold=sold,
        held=0,
        free=total - sold,
    )


def test_the_emptiest_skip_full_drafts_and_comfortable_guaranteed_dates() -> None:
    deps = [
        _dep(1, 9),
        _dep(2, 1),
        _dep(3, 1),  # same fill, later: after d2
        _dep(4, 10),  # sold out
        _dep(5, 0, live=False),  # a draft's date
        _dep(6, 8, guaranteed=True),  # 80 % and guaranteed: fine
        _dep(7, 3, guaranteed=True),  # 30 % even though guaranteed: a worry
        _dep(8, 5),
        _dep(9, 6),
    ]
    assert [d.id for d in reports.emptiest(deps)] == ["d2", "d3", "d7", "d8", "d9"]


def test_money_in_the_csv_is_whole_rupees_unless_there_are_paise() -> None:
    assert reports.rupees(12_345_00) == "12345"
    assert reports.rupees(1_234_56) == "1234.56"
    assert reports.percent(1, 3) == "33.3" and reports.percent(1, 0) == ""
    assert reports.cell(reports.rupees(-1_500_00)) == "-1500"  # a net-negative month stays a number
    assert reports.cell("-12.50") == "-12.50"
    assert reports.cell("=SUM(A1)") == "'=SUM(A1)" and reports.cell("-x") == "'-x"


# --- the database -------------------------------------------------------------------------------


def _csv(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))


def _paise(value: str) -> int:
    return round(float(value) * 100) if value else 0


async def _report(client: AsyncClient, owner: dict[str, str], **params: Any) -> dict[str, Any]:
    res = await client.get("/admin/reports", params=params, headers=owner)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.db
async def test_reports_are_owner_only(db_client: AsyncClient) -> None:
    for path in ("/admin/reports", "/admin/reports/money.csv"):
        assert (await db_client.get(path)).status_code == 401, path


@pytest.mark.db
async def test_a_bad_range_or_section_is_refused(db: AsyncSession, db_client: AsyncClient) -> None:
    owner = await owner_cookie(db)
    res = await db_client.get(
        "/admin/reports", params={"from": "2026-05-02", "to": "2026-05-01"}, headers=owner
    )
    assert res.status_code == 400
    assert (await db_client.get("/admin/reports/nope.csv", headers=owner)).status_code == 400


async def _real_bookings(
    db: AsyncSession, client: AsyncClient, owner: dict[str, str], rzp: FakeRazorpay
) -> dict[str, str]:
    """Every kind of booking the desk shows, made the real way: paid in full, on a deposit,
    paid then refunded in part, paid offline at the counter, a lapsed hold, a live hold."""
    pkg, departure = await seeded(db, seats=20)
    soon_id, far_id = departure.id, pkg.departures[1].id  # read before a commit expires them
    refs: dict[str, str] = {}
    for n, (name, party) in enumerate((("full", 2), ("refunded", 1)), start=1):
        h = await hold(client, soon_id, party, n)
        res = await client.post(
            f"/bookings/{h['bookingRef']}/confirm",
            json=callback(str(h["orderId"]), f"pay_Rpt{n:08d}"),
        )
        assert res.status_code == 200, res.text
        refs[name] = str(h["bookingRef"])
    await refunds.refund(
        db, refs["refunded"], 5_000_00, reason="owner", actor=BookingActor.OWNER, razorpay=rzp
    )
    offline = await hold(client, soon_id, 3, 3)
    await lapse(db, str(offline["bookingRef"]))
    res = await client.post(
        f"/admin/bookings/{offline['bookingRef']}/mark-paid",
        json={"reference": "UTR 5501"},
        headers=owner,
    )
    assert res.status_code == 200, res.text
    refs["offline"] = str(offline["bookingRef"])
    lapsed = await hold(client, soon_id, 1, 4)
    await lapse(db, str(lapsed["bookingRef"]))
    refs["live_hold"] = str((await hold(client, soon_id, 1, 5))["bookingRef"])
    order = await book(client, far_id)  # FAR: 37 days out, a deposit is offered
    res = await client.post(
        f"/bookings/{order['bookingRef']}/confirm",
        json=callback(str(order["orderId"]), "pay_RptDeposit1"),
    )
    assert res.status_code == 200, res.text
    refs["deposit"] = str(order["bookingRef"])
    return refs


@pytest.mark.db
async def test_the_totals_reconcile_with_the_desk_csv(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    refs = await _real_bookings(db, db_client, owner, rzp)
    seeded_result = await seed_history(db, per_package=RICH)
    assert seeded_result.counts["history_bookings"] > 50
    today = ist_today()
    params = {
        "from": (today - dt.timedelta(days=400)).isoformat(),
        "to": (SOON + dt.timedelta(days=60)).isoformat(),
    }
    r = await _report(db_client, owner, **params)
    desk = _csv((await db_client.get("/admin/bookings.csv", params=params, headers=owner)).text)
    assert len(desk) > 50 and {refs["deposit"], refs["refunded"]} <= {d["Ref"] for d in desk}

    holding = {"Confirmed", "Deposit paid", "Completed"}
    booked = sum(_paise(d["Total (₹)"]) for d in desk if d["Status"] in holding)
    paid = sum(_paise(d["Paid (₹)"]) for d in desk)
    balance = sum(_paise(d["Balance due (₹)"]) for d in desk)
    money = r["money"]
    assert (money["bookedPaise"], money["netPaise"], money["balancePaise"]) == (
        booked,
        paid,
        balance,
    )
    assert balance > 0 and money["refundedPaise"] >= 5_000_00
    assert money["collectedPaise"] - money["refundedPaise"] == money["netPaise"]
    assert r["kpis"]["bookings"] == sum(1 for d in desk if d["Status"] in holding)
    # Every breakdown adds back up to the same bookings.
    months = money["months"]
    assert sum(m["bookedPaise"] for m in months) == booked
    assert sum(m["netPaise"] for m in months) == paid
    assert sum(m["gstPaise"] for m in months) == money["gstPaise"] > 0
    assert sum(c["bookings"] for c in r["channels"]) == r["kpis"]["bookings"]
    assert sum(c["bookedPaise"] for c in r["channels"]) == booked
    assert sum(p["bookedPaise"] for p in r["packages"]) == booked
    assert sum(b["bookings"] for b in r["customers"]["party"]) == r["kpis"]["bookings"]
    assert sum(b["bookings"] for b in r["customers"]["lead"]) == r["kpis"]["bookings"]
    c = r["cancellations"]
    assert c["cancelled"] == sum(x["bookings"] for x in c["reasons"]) > 0
    assert sum(x["bookings"] for x in c["lapsed"]) > 0
    assert r["addons"]["withAny"] <= r["addons"]["bookings"] == r["kpis"]["bookings"]
    assert {s["source"] for s in r["discounts"]["sources"]} >= {"deal", "coupon", "manual"}
    assert r["funnel"]["views"] > 0 and r["funnel"]["holds"] >= r["funnel"]["paid"] > 0
    assert r["range"]["demo"] is True and r["range"]["demoBookings"] > 50

    # The money CSV's Total row says the same.
    res = await db_client.get("/admin/reports/money.csv", params=params, headers=owner)
    assert res.status_code == 200
    assert res.headers["content-disposition"].endswith(
        f'tripsmith-money_{params["from"]}_{params["to"]}.csv"'
    )
    total = _csv(res.text)[-1]
    assert total["Departure month"] == "Total"
    assert (_paise(total["Booked (₹)"]), _paise(total["Net (₹)"])) == (booked, paid)


@pytest.mark.db
async def test_without_the_demo_history_only_real_bookings_count(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    await _real_bookings(db, db_client, owner, rzp)
    await seed_history(db, per_package=RICH)
    today = ist_today()
    params = {
        "from": (today - dt.timedelta(days=400)).isoformat(),
        "to": (SOON + dt.timedelta(days=60)).isoformat(),
        "demo": "false",
    }
    r = await _report(db_client, owner, **params)
    real = (
        await db.execute(
            select(func.coalesce(func.sum(Booking.total_paise), 0)).where(
                Booking.status.in_(
                    (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID, BookingStatus.COMPLETED)
                ),
                Booking.contact_email.not_like("history-seed-%"),
            )
        )
    ).scalar_one()
    assert r["money"]["bookedPaise"] == real
    assert r["range"]["demo"] is False and r["range"]["demoBookings"] > 0
    assert r["occupancy"]["past"] == []  # every past date here is the seed's own
    assert r["funnel"]["enquiries"] == 0  # the seed's enquiries are its own too
    assert r["cancellations"]["cancelled"] == 0


@pytest.mark.db
async def test_the_history_seed_is_marked_far_from_today_and_runs_once(db: AsyncSession) -> None:
    pkg, _ = await seeded(db, seats=20)
    future_before = (
        await db.execute(
            select(func.count()).select_from(Departure).where(Departure.date >= ist_today())
        )
    ).scalar_one()
    first = await seed_history(db)
    assert first.counts["history_departures"] == 4
    today = ist_today()
    rows = (
        await db.execute(
            select(Booking.ref, Booking.contact_email, Booking.created_at, Departure.date).join(
                Departure, Departure.id == Booking.departure_id
            )
        )
    ).all()
    assert len(rows) == first.counts["history_bookings"]
    for ref, email, created, departs in rows:
        assert ref.startswith("TB-H") and is_seed_address(email)
        assert departs <= today - dt.timedelta(days=NEWEST_DEPARTURE_DAYS)
        assert reports.ist_date(created) <= today - dt.timedelta(days=NEWEST_BOOKING_DAYS)
    enquiries = (await db.execute(select(Enquiry.email))).scalars().all()
    assert enquiries and all(is_seed_address(e) for e in enquiries)
    views = (
        await db.execute(select(func.max(PackageView.day)).where(PackageView.package_id == pkg.id))
    ).scalar_one()
    assert views <= today - dt.timedelta(days=NEWEST_BOOKING_DAYS)
    future_after = (
        await db.execute(select(func.count()).select_from(Departure).where(Departure.date >= today))
    ).scalar_one()
    assert future_after == future_before  # no date anyone can buy changes

    again = await seed_history(db)
    assert again.counts["history_bookings"] == 0 and again.warnings
    assert (await db.execute(select(func.count()).select_from(Booking))).scalar_one() == len(rows)


@pytest.mark.db
async def test_every_section_exports_a_csv(db: AsyncSession, db_client: AsyncClient) -> None:
    owner = await owner_cookie(db)
    await seeded(db, seats=20)
    await seed_history(db, per_package=RICH)
    for section in reports.ReportSection:
        res = await db_client.get(f"/admin/reports/{section.value}.csv", headers=owner)
        assert res.status_code == 200, section
        assert res.text.startswith("﻿") and res.headers["content-type"].startswith("text/csv")
        assert len(_csv(res.text)) >= 1, section


@pytest.mark.db
async def test_cash_counts_a_payment_on_the_day_it_was_captured(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """An order opened late one IST day and paid the next is the next day's money."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    h = await hold(db_client, departure.id, 1, 9)
    res = await db_client.post(
        f"/bookings/{h['bookingRef']}/confirm", json=callback(str(h["orderId"]), "pay_RptCash01")
    )
    assert res.status_code == 200, res.text
    opened = dt.datetime(2026, 1, 31, 23, 50, tzinfo=reports.IST)
    paid = dt.datetime(2026, 2, 1, 0, 5, tzinfo=reports.IST)
    booking_id = (
        await db.execute(select(Booking.id).where(Booking.ref == h["bookingRef"]))
    ).scalar_one()
    await db.execute(
        update(Payment)
        .where(Payment.booking_id == booking_id)
        .values(created_at=opened, updated_at=paid)
    )
    await db.commit()
    r = await _report(db_client, owner, **{"from": "2026-01-01", "to": "2026-02-28"})
    cash = {m["month"]: m["inPaise"] for m in r["money"]["cash"]["months"]}
    assert cash["2026-01"] == 0 and cash["2026-02"] == int(h["amountPaise"])
