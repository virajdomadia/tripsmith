"""P16 — the per-booking history (R54): nothing can edit or delete an entry, every write path
logs exactly once (replays included), the customer sees only their wording, and 0010 rebuilds
entries for v2 bookings. The db tests need TEST_DATABASE_URL."""

import asyncio
import datetime as dt
import os
from collections import Counter

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingEvent, Departure, User
from app.models.enums import BookingActor, CouponKind
from app.services.analytics import ist_today
from app.services.booking.history import EmailLine, _email_entry, group_of
from scripts.seed import DemoTrip, seed_demo_traveller
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking, booking_body, callback, rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import cron, lapse, owner_cookie, run_daily
from tests.test_cancellation_resolve import NOTE, asked, resolve
from tests.test_coupons import add_coupon
from tests.test_customer_accounts import EMAIL, paid_booking, signed_in
from tests.test_session_migration import API_DIR, _sql

__all__ = ["cron", "rzp"]

TEXT = "Lovely trip, the houseboat night was the best part of it."


# --- pure ---------------------------------------------------------------------------------------


def test_kinds_fall_into_the_desk_chips() -> None:
    assert [group_of(k) for k in ("order.opened", "payment.failed", "refund.recorded")] == [
        "payment"
    ] * 3
    assert group_of("email.held") == "email"
    assert [group_of(k) for k in ("booked", "hold.expired", "review.sent")] == ["booking"] * 3


def test_only_emails_to_the_customer_that_really_went_are_theirs_to_see() -> None:
    sent = _email_entry(EmailLine("customer", "Booking TB-1 confirmed", "sent"))
    assert sent == (
        "email.sent",
        "Emailed the customer: “Booking TB-1 confirmed”",
        "We emailed you: “Booking TB-1 confirmed”",
    )
    for line in (
        EmailLine("owner", "New booking", "sent"),
        EmailLine("customer", "Booking confirmed", "held"),
        EmailLine("customer", "Booking confirmed", "skipped"),
        EmailLine("customer", "Booking confirmed", "failed"),
    ):
        assert _email_entry(line)[2] is None, line


# --- db helpers ---------------------------------------------------------------------------------


async def log_of(db: AsyncSession, ref: str) -> list[BookingEvent]:
    await db.rollback()  # a fresh snapshot: the app wrote in its own sessions
    rows = await db.execute(
        select(BookingEvent)
        .join(Booking, Booking.id == BookingEvent.booking_id)
        .where(Booking.ref == ref)
        .order_by(BookingEvent.at, BookingEvent.id)
    )
    return list(rows.scalars())


async def kinds(db: AsyncSession, ref: str) -> Counter[str]:
    return Counter(e.kind for e in await log_of(db, ref))


async def one(db: AsyncSession, ref: str, kind: str) -> BookingEvent:
    [entry] = [e for e in await log_of(db, ref) if e.kind == kind]
    return entry


async def hold(client: AsyncClient, departure_id: str, n: int, party: int = 1) -> dict[str, str]:
    res = await client.post(
        "/bookings",
        json=booking_body(
            departure_id, party, email=f"h{n}@example.test", phone=f"90000009{n:02d}"
        ),
    )
    assert res.status_code == 201, res.text
    return res.json()


# --- append-only --------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_trigger_refuses_every_update_and_delete(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=4)
    ref = (await hold(db_client, departure.id, 1))["bookingRef"]
    before = [(e.id, e.kind, e.text, e.customer_text) for e in await log_of(db, ref)]
    assert [k for _, k, _, _ in before] == ["booked", "order.opened"]
    first_id, second_id = before[0][0], before[1][0]

    for statement in (
        "update booking_events set text = 'edited'",
        "update booking_events set customer_text = null",
        "delete from booking_events",
        "delete from booking_events where kind = 'order.opened'",
    ):
        with pytest.raises(DBAPIError, match="booking_events is append-only"):
            await db.execute(text(statement))
        await db.rollback()
    # Through the ORM too: the flush hits the same trigger.
    entry = await db.get(BookingEvent, first_id)
    assert entry is not None
    entry.text = "edited"
    with pytest.raises(DBAPIError, match="append-only"):
        await db.flush()
    await db.rollback()
    await db.delete(await db.get(BookingEvent, second_id))
    with pytest.raises(DBAPIError, match="append-only"):
        await db.flush()
    await db.rollback()

    after = await log_of(db, ref)
    assert [(e.id, e.kind, e.text, e.customer_text) for e in after] == before
    # Appending still works.
    b = await booking(db, ref)
    db.add(BookingEvent(booking_id=b.id, kind="note", actor=BookingActor.OWNER, text="Called"))
    await db.commit()
    assert len(await log_of(db, ref)) == 3


# --- holds and orders ---------------------------------------------------------------------------


@pytest.mark.db
async def test_a_hold_its_order_and_the_hold_it_replaces_each_log_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    await add_coupon(db, code="HIST500", kind=CouponKind.FLAT, percent=None, amount_paise=500_00)
    _, departure = await seeded(db, seats=6)
    body = booking_body(departure.id, 1, email="same@example.test", phone="9000000901")
    first = (await db_client.post("/bookings", json=body)).json()["bookingRef"]
    second = (
        await db_client.post(
            "/bookings",
            json={
                **booking_body(departure.id, 2, email="same@example.test", phone="9000000901"),
                "couponCode": "hist500",
            },
        )
    ).json()["bookingRef"]

    assert await kinds(db, first) == Counter({"booked": 1, "order.opened": 1, "hold.replaced": 1})
    assert await kinds(db, second) == Counter({"booked": 1, "order.opened": 1})
    booked = await one(db, second, "booked")
    assert booked.actor == BookingActor.CUSTOMER and booked.source == "live"
    assert booked.text.startswith("Booked online · 2 travellers · ₹")
    assert "coupon HIST500 (−₹500)" in booked.text and "HIST500" not in (booked.customer_text or "")
    opened = await one(db, second, "order.opened")
    assert opened.customer_text is None and "order_" in opened.text
    replaced = await one(db, first, "hold.replaced")
    assert replaced.customer_text and replaced.actor == BookingActor.CUSTOMER


@pytest.mark.db
async def test_razorpay_down_logs_the_undone_hold_and_the_restored_one(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=4)
    body = booking_body(departure.id, 1, email="down@example.test", phone="9000000902")
    first = (await db_client.post("/bookings", json=body)).json()["bookingRef"]
    rzp.down = True
    assert (await db_client.post("/bookings", json=body)).status_code == 502

    assert await kinds(db, first) == Counter(
        {"booked": 1, "order.opened": 1, "hold.replaced": 1, "hold.restored": 1}
    )
    [other] = (await db.execute(select(Booking.ref).where(Booking.ref != first))).scalars().all()
    assert await kinds(db, other) == Counter({"booked": 1, "hold.undone": 1})


# --- payments -----------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_confirm_and_its_replays_log_one_capture_and_each_email_once(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender = mailing(db_app)  # live mode: example.test is a real-looking address
    await add_coupon(db, code="HIST10")
    _, departure = await seeded(db, seats=4)
    res = await db_client.post(
        "/bookings",
        json={
            **booking_body(departure.id, 2, email="h2@example.test", phone="9000000902"),
            "couponCode": "HIST10",
        },
    )
    order = res.json()
    ref = order["bookingRef"]
    for _ in range(3):
        res = await db_client.post(
            f"/bookings/{ref}/confirm", json=callback(order["orderId"], "pay_Hist000001")
        )
        assert res.json()["status"] == "confirmed"

    assert len(sender.sent) == 2  # the customer's confirmation and the owner's alert
    assert await kinds(db, ref) == Counter(
        {"booked": 1, "order.opened": 1, "payment.captured": 1, "email.sent": 2}
    )
    paid = await one(db, ref, "payment.captured")
    assert paid.actor == BookingActor.CUSTOMER
    assert paid.text.endswith("via Checkout — booking confirmed · coupon HIST10 used")
    assert (paid.before or {})["status"] == "pending"
    assert (paid.after or {})["status"] == "confirmed"
    assert paid.customer_text is not None and "pay_" not in paid.customer_text
    emails = [e for e in await log_of(db, ref) if e.kind == "email.sent"]
    assert sorted(e.customer_text is not None for e in emails) == [False, True]
    assert all("@" not in e.text for e in emails)  # subjects, never addresses


@pytest.mark.db
async def test_webhook_replays_log_one_failure_and_one_capture(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 3)
    ref, order_id, amount = order["bookingRef"], order["orderId"], int(order["amountPaise"])
    for _ in range(2):
        body = event("payment.failed", order_id, "pay_HistFail01", amount)
        assert (await deliver(db_client, body)).status_code == 200
    for _ in range(5):
        body = event("payment.captured", order_id, "pay_HistPaid01", amount)
        assert (await deliver(db_client, body)).status_code == 200

    got = await kinds(db, ref)
    assert (got["payment.failed"], got["payment.captured"]) == (1, 1)
    failed = await one(db, ref, "payment.failed")
    assert failed.actor == BookingActor.WEBHOOK and failed.customer_text
    captured = await one(db, ref, "payment.captured")
    assert captured.actor == BookingActor.WEBHOOK and "via Razorpay's webhook" in captured.text


@pytest.mark.db
async def test_a_sync_and_its_repeat_log_one_capture_by_the_customer(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 4)
    ref = order["bookingRef"]
    rzp.payments[order["orderId"]] = [
        {"id": "pay_HistSync01", "status": "captured", "amount": order["amountPaise"]}
    ]
    for _ in range(2):
        assert (await db_client.post(f"/bookings/{ref}/sync")).json()["status"] == "confirmed"
    captured = await one(db, ref, "payment.captured")
    assert captured.actor == BookingActor.CUSTOMER and "via the payment check" in captured.text


@pytest.mark.db
async def test_a_late_capture_with_no_seats_logs_the_cancellation_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=1)
    late = await hold(db_client, departure.id, 5)
    await lapse(db, late["bookingRef"])
    await hold(db_client, departure.id, 6)  # takes the last seat
    for _ in range(2):
        await db_client.post(
            f"/bookings/{late['bookingRef']}/confirm",
            json=callback(late["orderId"], "pay_HistLate01"),
        )
    got = await kinds(db, late["bookingRef"])
    assert (got["payment.captured"], got["cancelled.seats_gone"]) == (1, 1)
    gone = await one(db, late["bookingRef"], "cancelled.seats_gone")
    assert gone.actor == BookingActor.SYSTEM and gone.customer_text


@pytest.mark.db
async def test_money_on_a_released_booking_is_refunded_and_logged_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 7)
    ref = order["bookingRef"]
    assert (await db_client.post(f"/admin/bookings/{ref}/release", headers=owner)).is_success
    assert (
        await db_client.post(f"/admin/bookings/{ref}/release", headers=owner)
    ).status_code == 409
    for _ in range(2):
        await db_client.post(
            f"/bookings/{ref}/confirm", json=callback(order["orderId"], "pay_HistFlag01")
        )
    got = await kinds(db, ref)
    assert (got["hold.released"], got["payment.captured"], got["refund.flagged"]) == (1, 1, 1)
    assert (await one(db, ref, "refund.flagged")).customer_text is None
    released = await one(db, ref, "hold.released")
    assert released.actor == BookingActor.OWNER and released.actor_user_id is not None

    # P13: the refund goes out on its own — started and processed, each logged once, the
    # customer told in their words without a Razorpay id; a second click finds nothing to send.
    got = await kinds(db, ref)
    assert (got["refund.requested"], got["refund.processed"]) == (1, 1)
    started = await one(db, ref, "refund.requested")
    assert started.actor == BookingActor.SYSTEM and started.customer_text
    assert started.after == {"paidPaise": 0, "refundNeeded": True}
    processed = await one(db, ref, "refund.processed")
    assert "rfnd_" in processed.text and processed.customer_text
    assert "rfnd_" not in processed.customer_text
    res = await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    assert res.status_code == 409
    assert (await kinds(db, ref))["refund.requested"] == 1


@pytest.mark.db
async def test_mark_paid_logs_once_in_the_owners_name(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    ref = (await hold(db_client, departure.id, 8))["bookingRef"]
    await lapse(db, ref)
    for expected in (200, 409):
        res = await db_client.post(
            f"/admin/bookings/{ref}/mark-paid", json={"reference": "UTR 99"}, headers=owner
        )
        assert res.status_code == expected, res.text
    paid = await one(db, ref, "payment.offline")
    assert paid.actor == BookingActor.OWNER
    assert paid.text.startswith("Marked paid offline · ₹") and "UTR 99" in paid.text
    assert paid.customer_text and "UTR" not in paid.customer_text

    desk = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()["history"]
    entry = next(e for e in desk["entries"] if e["kind"] == "payment.offline")
    assert (entry["actorLabel"], entry["group"], entry["customerVisible"]) == (
        "Meera N.",
        "payment",
        True,
    )
    assert desk["rebuiltOn"] is None and entry["rebuilt"] is False


@pytest.mark.db
async def test_a_rejected_request_logs_once_and_leaves_the_booking_standing(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref, owner, request_id = await asked(db, db_app, db_client)
    body = {"decision": "reject", "note": "The houseboat is already paid for."}
    assert (await resolve(db_client, request_id, owner, **body)).status_code == 200
    assert (await resolve(db_client, request_id, owner, **body)).status_code == 409
    rejected = await one(db, ref, "cancellation.rejected")
    assert rejected.actor == BookingActor.OWNER and rejected.customer_text
    assert "houseboat" in rejected.customer_text and rejected.after is None


# --- cancellations, reviews, sign-in ------------------------------------------------------------


@pytest.mark.db
async def test_a_cancellation_request_and_its_answer_log_once_each(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref, owner, request_id = await asked(db, db_app, db_client)
    requested = await one(db, ref, "cancellation.requested")
    assert requested.actor == BookingActor.CUSTOMER and requested.actor_user_id is not None

    body = {"decision": "approve", "note": NOTE, "refundPaise": 100}
    assert (await resolve(db_client, request_id, owner, **body)).status_code == 200
    assert (await resolve(db_client, request_id, owner, **body)).status_code == 409
    approved = await one(db, ref, "cancellation.approved")
    assert approved.before == {"status": "confirmed"}
    assert (approved.after or {})["status"] == "cancelled"
    assert approved.customer_text and NOTE in approved.customer_text
    # Demo mode: the customer's copy went to the owner — logged, but not as "we emailed you".
    held = [e for e in await log_of(db, ref) if e.kind == "email.held"]
    assert held and all(e.customer_text is None for e in held)


@pytest.mark.db
async def test_a_review_logs_once_and_moderation_only_when_it_changes(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    _, departure = await seeded(db, seats=4)
    ref = await paid_booking(db_client, departure.id, EMAIL, "9000000903", "pay_HistRev001")
    await db.execute(update(Booking).where(Booking.ref == ref).values(status="completed"))
    await db.commit()
    token = await signed_in(db_client)
    for expected in (201, 409):
        res = await db_client.post(
            f"/account/bookings/{ref}/review",
            json={"rating": 4, "text": TEXT},
            headers=with_cookie(token),
        )
        assert res.status_code == expected
    owner = await owner_cookie(db)
    review_id = (await db_client.get("/admin/reviews", headers=owner)).json()["items"][0]["id"]
    for move in ("publish", "publish", "hide", "hide"):
        res = await db_client.post(f"/admin/reviews/{review_id}/{move}", headers=owner)
        assert res.status_code == 200
    got = await kinds(db, ref)
    assert (got["review.sent"], got["review.published"], got["review.hidden"]) == (1, 1, 1)
    assert (await one(db, ref, "review.hidden")).customer_text is None
    assert (await one(db, ref, "account.linked")).customer_text  # the sign-in above


@pytest.mark.db
async def test_signing_in_links_and_logs_each_booking_once(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    _, departure = await seeded(db, seats=4)
    ref = await paid_booking(db_client, departure.id, EMAIL, "9000000904", "pay_HistLink01")
    await signed_in(db_client)
    await signed_in(db_client)
    linked = await one(db, ref, "account.linked")
    user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one()
    assert (linked.actor, linked.actor_user_id) == (BookingActor.CUSTOMER, user.id)


# --- the daily sweep ----------------------------------------------------------------------------


@pytest.mark.db
async def test_the_sweep_logs_each_booking_once_however_often_it_runs(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    _, departure = await seeded(db, seats=6)
    abandoned = (await hold(db_client, departure.id, 9))["bookingRef"]
    await lapse(db, abandoned)
    order = await hold(db_client, departure.id, 10)
    travelled = order["bookingRef"]
    await db_client.post(
        f"/bookings/{travelled}/confirm", json=callback(order["orderId"], "pay_HistTrip01")
    )
    await db.execute(
        update(Departure)
        .where(Departure.id == departure.id)
        .values(date=ist_today() - dt.timedelta(days=2))
    )
    await db.commit()
    for _ in range(2):
        await run_daily(db_client, db_app)

    expired = await one(db, abandoned, "hold.expired")
    assert expired.actor == BookingActor.CRON and expired.customer_text
    done = await one(db, travelled, "trip.completed")
    assert done.after == {"status": "completed"}


# --- the two views ------------------------------------------------------------------------------


@pytest.mark.db
async def test_my_trips_shows_only_the_customers_wording(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    _, departure = await seeded(db, seats=4)
    ref = await paid_booking(db_client, departure.id, EMAIL, "9000000905", "pay_HistView01")
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    token = await signed_in(db_client)
    mine = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    texts = [a["text"] for a in mine["activity"]]
    assert texts[0].startswith("You booked 1 traveller · ₹")
    assert any(t.startswith("Payment of ₹") and t.endswith("booking confirmed") for t in texts)
    assert any(t.startswith("We emailed you: “Booking") for t in texts)
    joined = " ".join(texts)
    for secret in ("order_", "pay_", "Razorpay order", "Emailed the owner", "@"):
        assert secret not in joined, secret

    owner = await owner_cookie(db)
    desk = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()["history"]
    groups = Counter(e["group"] for e in desk["entries"])
    assert groups["payment"] == 2 and groups["email"] == 2 and groups["booking"] >= 2
    assert len(desk["entries"]) > len(mine["activity"])
    labels = {e["actor"]: e["actorLabel"] for e in desk["entries"]}
    assert labels["webhook"] == "Razorpay" and labels["system"] == "System"


# --- seed ---------------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_demo_seed_logs_its_trips_once_and_each_reset(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, _ = await seeded(db, seats=8)
    trips = (
        DemoTrip("TB-DEMO01", pkg.slug, 60, (5, TEXT)),
        DemoTrip("TB-DEMO02", pkg.slug, 21, None),
    )
    await seed_demo_traveller(db, today=ist_today(), trips=trips)
    await seed_demo_traveller(db, today=ist_today(), trips=trips)
    assert await kinds(db, "TB-DEMO01") == Counter(
        {"booked": 1, "payment.offline": 1, "trip.completed": 1, "review.sent": 1}
    )
    assert await kinds(db, "TB-DEMO02") == Counter(
        {"booked": 1, "payment.offline": 1, "trip.completed": 1}
    )
    entries = await log_of(db, "TB-DEMO01")
    assert all(e.actor == BookingActor.SYSTEM for e in entries)
    assert [e.at for e in entries] == sorted(e.at for e in entries)
    assert entries[0].at < dt.datetime.now(dt.UTC) - dt.timedelta(days=60)

    token = await signed_in(db_client, "traveller.demo@example.com")
    res = await db_client.post(
        "/account/bookings/TB-DEMO02/review",
        json={"rating": 3, "text": TEXT},
        headers=with_cookie(token),
    )
    assert res.status_code == 201, res.text
    await seed_demo_traveller(db, today=ist_today(), trips=trips)
    await seed_demo_traveller(db, today=ist_today(), trips=trips)
    got = await kinds(db, "TB-DEMO02")
    assert (got["review.sent"], got["review.reset"]) == (1, 1)


# --- migration 0010 -----------------------------------------------------------------------------

V2_ROWS = (
    "truncate table bookings, departures, packages, destinations, users cascade",
    "insert into destinations (id, slug, name, tagline, intro, cover_url, region, best_months) "
    "values ('dst', 'goa', 'Goa', 't', 'i', 'c', 'r', '{1}')",
    "insert into packages (id, slug, destination_id, name, summary, nights, days) "
    "values ('pkg', 'p', 'dst', 'P', 'S', 2, 3)",
    "insert into departures (id, package_id, date, seats_total, price_double_paise, "
    "price_triple_paise, price_child_paise, single_supplement_paise) "
    "values ('dep', 'pkg', current_date - 5, 10, 1, 1, 1, 1)",
    "insert into users (id, name, email, role) values ('usr', 'A', 'a@x.test', 'customer')",
    # Confirmed by Checkout, asked to cancel, approved with a part refund, refund made.
    "insert into bookings (id, ref, package_id, departure_id, status, cancel_reason, "
    "hold_expires_at, contact_name, contact_phone, contact_email, quote, total_paise, "
    "paid_paise, created_at, updated_at) values ('b1', 'TB-BACK01', 'pkg', 'dep', 'cancelled', "
    "'cancellation_approved', '2026-09-01 10:10+00', 'A', '9000000000', 'a@x.test', "
    '\'{"coupon": {"code": "WELCOME10", "offPaise": 100000}}\', 1000000, 500000, '
    "'2026-09-01 10:00+00', '2026-09-20 09:00+00')",
    "insert into booking_travellers (id, booking_id, name, age, occupancy) values "
    "('t1', 'b1', 'A', 30, 'double'), ('t2', 'b1', 'B', 30, 'double')",
    "insert into payments (id, booking_id, provider, razorpay_order_id, razorpay_payment_id, "
    "amount_paise, status, raw, created_at, updated_at) values ('p0', 'b1', 'razorpay', "
    "'order_B1', 'pay_B1Fail', 1000000, 'failed', '{\"event\": \"payment.failed\"}', "
    "'2026-09-01 10:00+00', '2026-09-01 10:02+00'), ('p1', 'b1', 'razorpay', 'order_B1', "
    '\'pay_B1\', 1000000, \'refunded\', \'{"refund": {"at": "2026-09-20T09:00:00+00:00", '
    '"note": "rfnd_1", "capturedAt": "2026-09-01T10:05:00+00:00", '
    "\"amountPaise\": 500000}}', '2026-09-01 10:03+00', '2026-09-20 09:00+00')",
    "insert into booking_cancellations (id, booking_id, reason, status, refund_note, "
    "refund_paise, created_at, resolved_at) values ('c1', 'b1', 'Family reasons', 'approved', "
    "'Half back per policy', 500000, '2026-09-10 08:00+00', '2026-09-11 08:00+00')",
    # An abandoned checkout the sweep cancelled.
    "insert into bookings (id, ref, package_id, departure_id, status, cancel_reason, "
    "hold_expires_at, contact_name, contact_phone, contact_email, quote, total_paise, "
    "created_at, updated_at) values ('b2', 'TB-BACK02', 'pkg', 'dep', 'cancelled', "
    "'hold_expired', '2026-09-02 10:10+00', 'C', '9000000001', 'c@x.test', '{}', 1000, "
    "'2026-09-02 10:00+00', '2026-09-03 20:00+00')",
    # Paid offline, completed and reviewed.
    "insert into bookings (id, ref, package_id, departure_id, user_id, status, hold_expires_at, "
    "contact_name, contact_phone, contact_email, quote, total_paise, paid_paise, created_at, "
    "updated_at) values ('b3', 'TB-BACK03', 'pkg', 'dep', 'usr', 'completed', "
    "'2026-09-02 10:10+00', 'A', '9000000000', 'a@x.test', '{}', 2000, 2000, "
    "'2026-09-02 10:00+00', '2026-09-25 20:00+00')",
    "insert into payments (id, booking_id, provider, amount_paise, status, raw, created_at, "
    "updated_at) values ('p3', 'b3', 'offline', 2000, 'captured', '{\"reference\": \"UTR 7\"}', "
    "'2026-09-02 11:00+00', '2026-09-02 11:00+00')",
    "insert into reviews (id, booking_id, package_id, user_id, rating, text, approved, "
    "created_at, moderated_at) values ('r3', 'b3', 'pkg', 'usr', 5, 'Great trip overall.', "
    "true, '2026-09-26 08:00+00', '2026-09-26 09:00+00')",
)


def test_0010_rebuilds_v2_bookings_and_old_inserts_still_work(
    migrated_database_url: str,
) -> None:
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    try:
        command.downgrade(cfg, "0009")
        asyncio.run(_sql(url, *V2_ROWS))
        command.upgrade(cfg, "0010")
        rows = asyncio.run(
            _sql(
                url,
                "select b.ref, e.kind, e.actor::text, e.source, e.approx, "
                "e.customer_text is not null, e.text from booking_events e "
                "join bookings b on b.id = e.booking_id order by b.ref, e.at, e.id",
            )
        )
        by_ref: dict[str, list[tuple[object, ...]]] = {}
        for ref, *rest in rows:
            by_ref.setdefault(str(ref), []).append(tuple(rest))
        assert {r[3] for r in rows} == {"backfill"}
        assert [(k, a, x, c) for k, a, _, x, c, _ in by_ref["TB-BACK01"]] == [
            ("booked", "customer", False, True),
            ("order.opened", "system", False, False),
            ("payment.failed", "webhook", False, True),
            # The retry's row is on the same order: it was opened once.
            ("payment.captured", "customer", False, True),
            ("cancellation.requested", "customer", False, True),
            ("cancellation.approved", "owner", False, True),
            ("refund.recorded", "owner", False, True),
        ]
        texts = {k: t for k, *_, t in by_ref["TB-BACK01"]}
        assert "coupon WELCOME10 (−₹1,000)" in str(texts["booked"])
        assert str(texts["payment.captured"]).endswith("via Checkout — booking confirmed")
        assert str(texts["refund.recorded"]) == "Refund of ₹5,000 recorded · rfnd_1"
        assert [(k, a, x) for k, a, _, x, _, _ in by_ref["TB-BACK02"]] == [
            ("booked", "customer", False),
            ("hold.expired", "cron", True),
        ]
        assert [k for k, *_ in by_ref["TB-BACK03"]] == [
            "booked",
            "payment.offline",
            "trip.completed",
            "review.sent",
            "review.published",
        ]
        assert "UTR 7" in str(dict((k, t) for k, *_, t in by_ref["TB-BACK03"])["payment.offline"])

        # The deployed api (before this code merges) never names the table: its writes work.
        asyncio.run(
            _sql(
                url,
                "update bookings set updated_at = now() where id = 'b1'",
                "insert into payments (id, booking_id, provider, amount_paise) "
                "values ('p9', 'b2', 'offline', 1)",
            )
        )
        # Append-only from the moment it exists.
        with pytest.raises(Exception, match="append-only"):
            asyncio.run(_sql(url, "delete from booking_events"))
        command.downgrade(cfg, "0009")
        assert asyncio.run(_sql(url, "select to_regclass('booking_events')")) == [(None,)]
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(
            _sql(url, "truncate table bookings, departures, packages, destinations, users cascade")
        )
