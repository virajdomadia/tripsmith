"""P5b — the owner's side of deposits (R43): the desk's "Balance due" filter, column and CSV;
recording a balance paid offline (confirmed, invoiced, the customer emailed); moving a due day
later (logged, up to the departure day); and switching deposits off per package (omitted = left
alone). Needs TEST_DATABASE_URL."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BookingEvent, Payment
from app.models.enums import BookingStatus, PaymentProvider
from app.services.analytics import ist_today
from app.services.catalog import admin_packages as svc
from tests.razorpay_fake import FakeRazorpay
from tests.test_admin_packages import RecordingRevalidate, as_payload, package_by_slug
from tests.test_admin_packages import revalidated as revalidated  # fixture
from tests.test_admin_packages import seeded as seeded_catalog
from tests.test_booking_orders import SOON
from tests.test_booking_payments import rzp
from tests.test_bookings_desk import owner_cookie
from tests.test_deposits import BALANCE, DEPOSIT, FAR, TOTAL, on_deposit, row
from tests.test_search import NGB

__all__ = ["revalidated", "rzp"]
pytestmark = pytest.mark.db


async def test_the_desk_filters_shows_and_exports_balances_due(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await on_deposit(db, db_app, db_client)
    owner = await owner_cookie(db)
    listed = (await db_client.get("/admin/bookings?flag=balance", headers=owner)).json()
    assert listed["counts"]["balance"] == 1
    assert [r["ref"] for r in listed["items"]] == [ref]
    assert listed["items"][0]["balanceDueOn"] == (FAR - dt.timedelta(days=30)).isoformat()

    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    due = FAR - dt.timedelta(days=30)
    assert detail["balance"] == {
        "depositPaise": DEPOSIT,
        "balancePaise": BALANCE,
        "dueOn": due.isoformat(),
        "lastDayOn": (due + dt.timedelta(days=2)).isoformat(),
        "daysLeft": (due - ist_today()).days,
        "canMarkPaid": True,
        "canExtend": True,
        "extendUntil": FAR.isoformat(),
    }

    csv = (await db_client.get("/admin/bookings.csv?flag=balance", headers=owner)).text
    header, line = csv.splitlines()[:2]
    assert header.endswith('"Deposit (₹)","Balance due (₹)","Balance due by"')
    assert line.endswith(f'"{DEPOSIT // 100}","{BALANCE // 100}","{due.isoformat()}"')
    assert ',"Deposit paid",' in line


async def test_the_owner_records_the_balance_paid_offline(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, sender = await on_deposit(db, db_app, db_client)
    owner = await owner_cookie(db)
    res = await db_client.post(
        f"/admin/bookings/{ref}/balance-paid", json={"reference": "UTR 4471"}, headers=owner
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "confirmed" and body["balance"]["balancePaise"] == 0
    assert body["balance"]["canMarkPaid"] is False
    assert [d["kind"] for d in body["documents"]].count("invoice") == 1
    b = await row(db, ref)
    assert (b.status, b.paid_paise) == (BookingStatus.CONFIRMED, TOTAL)
    offline = (
        (
            await db.execute(
                select(Payment).where(
                    Payment.booking_id == b.id, Payment.provider == PaymentProvider.OFFLINE
                )
            )
        )
        .scalars()
        .all()
    )
    assert [(p.amount_paise, (p.raw or {}).get("reference")) for p in offline] == [
        (BALANCE, "UTR 4471")
    ]
    full = [m for m in sender.sent if "paid in full" in m.subject]
    assert len(full) == 1 and "the owner marked this booking paid offline" in full[0].text
    again = await db_client.post(f"/admin/bookings/{ref}/balance-paid", json={}, headers=owner)
    assert again.status_code == 409 and again.json()["error"]["reason"] == "not_on_deposit"


async def test_the_owner_moves_the_due_day_later_up_to_departure(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await on_deposit(db, db_app, db_client)
    owner = await owner_cookie(db)
    due = FAR - dt.timedelta(days=30)

    def move(day: dt.date):  # noqa: ANN202
        return db_client.post(
            f"/admin/bookings/{ref}/balance-due", json={"dueOn": day.isoformat()}, headers=owner
        )

    for bad, words in ((due, "after the current"), (FAR + dt.timedelta(days=1), "departure day")):
        res = await move(bad)
        assert res.status_code == 400, res.text
        assert words in res.json()["error"]["fieldErrors"]["dueOn"]
    later = due + dt.timedelta(days=10)
    res = await move(later)
    assert res.status_code == 200, res.text
    assert res.json()["balance"]["dueOn"] == later.isoformat()
    b = await row(db, ref)
    assert b.balance_due_on == later
    moved = (
        await db.execute(
            select(BookingEvent).where(
                BookingEvent.booking_id == b.id, BookingEvent.kind == "balance.extended"
            )
        )
    ).scalar_one()
    assert moved.before == {"balanceDueOn": due.isoformat()}
    assert moved.customer_text and later.strftime("%b") in moved.customer_text
    assert (await move(FAR)).json()["balance"]["canExtend"] is False  # on the departure day


async def test_deposits_switch_off_per_package_and_an_old_form_leaves_them_alone(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    await seeded_catalog(db)
    p = await package_by_slug(db, NGB)
    assert (await svc.get_package(db, p.id)).deposit_on is True  # on by default

    off = await svc.update_package(db, p.id, await as_payload(db, p.id, depositOn=False))
    assert off.deposit_on is False
    untouched = await svc.update_package(db, p.id, await as_payload(db, p.id))
    assert untouched.deposit_on is False, "a form without depositOn leaves it alone"
    rows = {r.slug: r for r in await svc.list_packages(db)}
    assert rows[NGB].deposit_on is False

    far = next(d for d in (await db.refresh(p, ["departures"]) or p.departures) if d.date > SOON)
    quote = await db_client.post(
        "/bookings/quote", json={"departureId": far.id, "travellers": [{"occupancy": "single"}]}
    )
    assert quote.status_code == 200, quote.text
    assert quote.json()["deposit"] is None
