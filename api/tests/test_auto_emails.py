"""P15 — automatic trip emails (R53): the ledger sends each email at most once (a cron re-run
sends nothing twice — the accept), a date change re-arms the stages, the owner's switches, the
details reminder, the trip pack with its PDF (not for a part-paid booking), the review request
and still-thinking with their unsubscribe link and one-click headers, the refund email from the
webhook, retries of a failed send, and the run's limit. The db tests need TEST_DATABASE_URL."""

import datetime as dt
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Booking,
    BookingEvent,
    Departure,
    EmailSend,
    EmailSuppression,
    Package,
    Payment,
    Refund,
    Review,
    User,
)
from app.models.enums import (
    BookingStatus,
    CancelReason,
    EmailSendState,
    EmailType,
    Occupancy,
    RefundStatus,
)
from app.services.analytics import ist_today
from app.services.booking.after_capture import Notify
from app.services.email import automatic, unsubscribe
from app.services.email.render import IST
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import OWNER_INBOX, deliver
from tests.test_bookings_desk import cron, run_emails
from tests.test_customer_accounts import EMAIL
from tests.test_refunds import refund_event
from tests.test_traveller_details import PARTY, booked

__all__ = ["cron", "rzp"]

SECRET = "unsubscribe-test-secret"


# --- pure ---------------------------------------------------------------------------------------


def test_the_latest_stage_whose_day_has_come() -> None:
    stages = (14, 5)
    assert automatic.latest_stage(15, stages) is None
    assert automatic.latest_stage(14, stages) == 14
    assert automatic.latest_stage(6, stages) == 14
    assert automatic.latest_stage(5, stages) == 5
    assert automatic.latest_stage(4, stages) == 5


def test_rooms_come_back_from_the_travellers() -> None:
    occ = [Occupancy.DOUBLE, Occupancy.DOUBLE, Occupancy.TRIPLE, Occupancy.TRIPLE,
           Occupancy.TRIPLE, Occupancy.SINGLE, Occupancy.CHILD, Occupancy.CHILD]  # fmt: skip
    assert automatic.rooms_of(occ) == (1, 1, 1, 2)


def test_keys_name_the_anchor_so_a_new_date_re_arms() -> None:
    a = automatic.key_of(EmailType.TRIP_PACK, "b1", 3, dt.date(2026, 11, 13))
    b = automatic.key_of(EmailType.TRIP_PACK, "b1", 3, dt.date(2026, 11, 20))
    assert a == "trip_pack:b1:3:2026-11-13" and a != b
    assert automatic.still_thinking_key("Asha@X.in", "p1") == "still_thinking:asha@x.in:p1"


def test_unsubscribe_tokens_are_signed_per_address_and_type() -> None:
    token = unsubscribe.token_for("Asha@Example.test", EmailType.REVIEW_REQUEST, SECRET)
    assert token is not None
    assert unsubscribe.read_token(token, SECRET) == ("asha@example.test", EmailType.REVIEW_REQUEST)
    assert unsubscribe.read_token(token, "another-secret") is None
    raw, _, sig = token.split(".")
    assert unsubscribe.read_token(f"{raw}.still_thinking.{sig}", SECRET) is None
    assert unsubscribe.read_token("not-a-token", SECRET) is None
    # Only the two promotional emails can be unsubscribed from; no secret → no link at all.
    assert unsubscribe.token_for("a@b.in", EmailType.TRIP_PACK, SECRET) is None
    assert unsubscribe.token_for("a@b.in", EmailType.REVIEW_REQUEST, None) is None
    assert unsubscribe.mask("asha@example.test") == "a***@example.test"
    headers = dict(unsubscribe.headers("https://t.in/", token))
    assert headers["List-Unsubscribe"] == f"<https://t.in/api/unsubscribe/{token}>"
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


# --- db helpers ---------------------------------------------------------------------------------


async def _set_departure(db: AsyncSession, departure_id: str, day: dt.date) -> None:
    await db.execute(update(Departure).where(Departure.id == departure_id).values(date=day))
    await db.commit()


async def _booked_long_ago(db: AsyncSession, ref: str) -> None:
    """A stage whose day came before the booking is never sent — make every stage eligible."""
    await db.execute(
        update(Booking)
        .where(Booking.ref == ref)
        .values(created_at=dt.datetime.now(dt.UTC) - dt.timedelta(days=60))
    )
    await db.commit()


async def _status(db: AsyncSession, ref: str, status: BookingStatus) -> None:
    await db.execute(update(Booking).where(Booking.ref == ref).values(status=status))
    await db.commit()


async def _ledger(db: AsyncSession, ref: str) -> list[EmailSend]:
    db.expire_all()
    bid = (await db.execute(select(Booking.id).where(Booking.ref == ref))).scalar_one()
    rows = await db.execute(
        select(EmailSend).where(EmailSend.booking_id == bid).order_by(EmailSend.created_at)
    )
    return list(rows.scalars().all())


def _sent(report: dict[str, Any], kind: EmailType) -> int:
    return report["sent"].get(kind.value, 0)


def _to_customer(sender: Any) -> list[Any]:
    """Demo mode redirects the customer's copy to the owner, subject `[Test → <email>] …`."""
    return [m for m in sender.sent if m.subject.startswith(f"[Test → {EMAIL}]")]


async def _booked(db: AsyncSession, app: FastAPI, client: AsyncClient) -> tuple[str, Departure]:
    ref, _, departure = await booked(db, app, client)
    app.state.email_sender.sent.clear()
    return ref, departure


# --- the details reminder -----------------------------------------------------------------------


@pytest.mark.db
async def test_details_reminders_go_once_per_stage_and_again_after_a_date_change(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    today = ist_today()
    await _booked_long_ago(db, ref)
    await _set_departure(db, dep.id, today + dt.timedelta(days=14))
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 1
    # The accept: a re-run sends nothing twice.
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 0
    [mail] = _to_customer(sender)
    assert "Reminder: traveller details" in mail.subject and "#details" in mail.text
    assert "Mira Rao" in mail.text  # who still owes what
    # The trip moves: the key names the date, so the 14-day stage is due again for it.
    await _set_departure(db, dep.id, today + dt.timedelta(days=13))
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 1
    await _set_departure(db, dep.id, today + dt.timedelta(days=5))
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 1
    rows = await _ledger(db, ref)
    assert [(r.type, r.stage, r.state) for r in rows] == [
        (EmailType.DETAILS_REMINDER, 14, EmailSendState.HELD),
        (EmailType.DETAILS_REMINDER, 14, EmailSendState.HELD),
        (EmailType.DETAILS_REMINDER, 5, EmailSendState.HELD),
    ]
    # Every send is in the booking's history, by subject.
    b = (await db.execute(select(Booking.id).where(Booking.ref == ref))).scalar_one()
    logged = (
        (
            await db.execute(
                select(BookingEvent.text).where(
                    BookingEvent.booking_id == b, BookingEvent.kind.like("email.%")
                )
            )
        )
        .scalars()
        .all()
    )
    assert sum("Reminder: traveller details" in t for t in logged) == 3


@pytest.mark.db
async def test_no_reminder_for_a_stage_before_the_booking_or_while_switched_off(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    today = ist_today()
    # Booked 10 days out: the 14-day stage's day came before the booking — never sent.
    await _set_departure(db, dep.id, today + dt.timedelta(days=10))
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 0
    # Switched off: nothing, and nothing claimed — switched back on, the due stage goes.
    await _set_departure(db, dep.id, today + dt.timedelta(days=5))
    await automatic.set_switch(db, EmailType.DETAILS_REMINDER, False, by=None)
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 0
    assert await _ledger(db, ref) == []
    await automatic.set_switch(db, EmailType.DETAILS_REMINDER, True, by=None)
    assert _sent(await run_emails(db_client, db_app), EmailType.DETAILS_REMINDER) == 1


# --- the trip pack ------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_trip_pack_goes_three_days_out_with_the_pdf_once_paid_in_full(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    await _set_departure(db, dep.id, ist_today() + dt.timedelta(days=3))
    await _status(db, ref, BookingStatus.PARTIALLY_PAID)
    assert _sent(await run_emails(db_client, db_app), EmailType.TRIP_PACK) == 0
    # Paid the day after: the pack goes on the next run (catch-up), once.
    await _status(db, ref, BookingStatus.CONFIRMED)
    assert _sent(await run_emails(db_client, db_app), EmailType.TRIP_PACK) == 1
    assert _sent(await run_emails(db_client, db_app), EmailType.TRIP_PACK) == 0
    [mail] = [m for m in _to_customer(sender) if "trip pack" in m.subject]
    [pdf] = mail.attachments
    assert pdf.filename == f"Tripsmith-{ref}-trip-pack.pdf" and pdf.content.startswith(b"%PDF")
    assert "3 days to go" in mail.text and "#pack" in mail.text
    assert not mail.headers  # transactional: no unsubscribe


# --- the review request -------------------------------------------------------------------------


async def _back_two_days(db: AsyncSession, ref: str, dep: Departure) -> None:
    """Departed and back two days ago (return = departure + nights), completed by the tidy."""
    nights = (
        await db.execute(
            select(Package.nights)
            .join(Booking, Booking.package_id == Package.id)
            .where(Booking.ref == ref)
        )
    ).scalar_one()
    await _set_departure(db, dep.id, ist_today() - dt.timedelta(days=nights + 2))
    await _status(db, ref, BookingStatus.COMPLETED)


@pytest.mark.db
async def test_the_review_request_carries_a_one_click_unsubscribe_that_sticks(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    await _back_two_days(db, ref, dep)
    assert _sent(await run_emails(db_client, db_app), EmailType.REVIEW_REQUEST) == 1
    assert _sent(await run_emails(db_client, db_app), EmailType.REVIEW_REQUEST) == 0
    [mail] = _to_customer(sender)
    assert "How was " in mail.subject and mail.subject.endswith(", Asha?")
    assert f"/account/bookings/{ref}#review" in mail.text
    headers = dict(mail.headers)
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    link = headers["List-Unsubscribe"].strip("<>")
    token = link.rsplit("/", 1)[1]
    assert f"/unsubscribe?t={token}" in mail.text and f"/unsubscribe?t={token}" in mail.html

    page = await db_client.get(f"/unsubscribe/{token}")
    assert page.status_code == 200, page.text
    assert page.json() == {
        "email": "a***@example.test",
        "kind": "review_request",
        "label": "review requests",
        "unsubscribed": False,
    }
    # Gmail's one-click POSTs the form body; twice is fine.
    for _ in range(2):
        res = await db_client.post(
            f"/unsubscribe/{token}",
            content=b"List-Unsubscribe=One-Click",
            headers={"content-type": "application/x-www-form-urlencoded"},
        )
        assert res.status_code == 200 and res.json()["unsubscribed"] is True
    assert (await db_client.get(f"/unsubscribe/{token[:-2]}xx")).status_code == 404

    # A later trip by the same address: no review request now.
    await db.execute(delete(EmailSend))
    await db.commit()
    assert _sent(await run_emails(db_client, db_app), EmailType.REVIEW_REQUEST) == 0


@pytest.mark.db
async def test_no_review_request_once_reviewed(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    await _back_two_days(db, ref, dep)
    b = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    user = (await db.execute(select(User.id).where(User.email == EMAIL))).scalar_one()
    db.add(Review(booking_id=b.id, package_id=b.package_id, user_id=user, rating=5, text="Lovely"))
    await db.commit()
    assert _sent(await run_emails(db_client, db_app), EmailType.REVIEW_REQUEST) == 0


# --- still thinking -----------------------------------------------------------------------------


async def _lapse_yesterday(db: AsyncSession, ref: str) -> None:
    noon = dt.datetime.combine(ist_today() - dt.timedelta(days=1), dt.time(12), IST)
    await db.execute(
        update(Booking)
        .where(Booking.ref == ref)
        .values(
            status=BookingStatus.CANCELLED,
            cancel_reason=CancelReason.HOLD_EXPIRED,
            hold_expires_at=noon,
            created_at=noon - dt.timedelta(minutes=15),
        )
    )
    await db.commit()


@pytest.mark.db
async def test_still_thinking_goes_once_with_the_party_prefilled(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, _, dep = await booked(db, db_app, db_client, pay=False)
    sender = db_app.state.email_sender
    sender.sent.clear()
    await _lapse_yesterday(db, ref)
    assert _sent(await run_emails(db_client, db_app), EmailType.STILL_THINKING) == 1
    assert _sent(await run_emails(db_client, db_app), EmailType.STILL_THINKING) == 0
    [mail] = _to_customer(sender)
    assert mail.subject.startswith(f"[Test → {EMAIL}] Still thinking about ")
    url = next(w for w in mail.text.split() if "/packages/" in w)
    parts = urlsplit(url)
    assert parts.fragment == "book"
    assert parse_qs(parts.query) == {
        "date": [dep.date.isoformat()],
        "double": ["1"],
        "triple": ["0"],
        "single": ["0"],
        "children": ["1"],
    }
    assert len(PARTY) == 3 and "party of 3" in mail.text
    assert dict(mail.headers)["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    # Once per address per package, ever — even after a later lapse.
    rows = await _ledger(db, ref)
    assert rows[0].key == automatic.still_thinking_key(EMAIL, rows[0].package_id or "")


@pytest.mark.db
async def test_no_still_thinking_after_a_later_booking_or_unsubscribing(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, _, dep = await booked(db, db_app, db_client, pay=False)
    await _lapse_yesterday(db, ref)
    again = await db_client.post(
        "/bookings",
        json={
            "departureId": dep.id,
            "travellers": PARTY,
            "contact": {"name": "Asha Rao", "phone": "9000000081", "email": EMAIL},
        },
    )
    assert again.status_code == 201, again.text
    assert _sent(await run_emails(db_client, db_app), EmailType.STILL_THINKING) == 0
    # The later one lapses too: that doesn't count as booking — but an unsubscribe does.
    await _lapse_yesterday(db, again.json()["bookingRef"])
    db.add(EmailSuppression(email=EMAIL, type=EmailType.STILL_THINKING))
    await db.commit()
    assert _sent(await run_emails(db_client, db_app), EmailType.STILL_THINKING) == 0
    await db.execute(delete(EmailSuppression))
    await db.commit()
    assert _sent(await run_emails(db_client, db_app), EmailType.STILL_THINKING) == 1


# --- refunds ------------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_refund_email_goes_once_from_the_webhook(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, _ = await _booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    b = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    pay = (await db.execute(select(Payment).where(Payment.booking_id == b.id))).scalars().first()
    assert pay is not None
    refund = Refund(
        booking_id=b.id,
        payment_id=pay.id,
        amount_paise=5_000_00,
        reason="surplus",
        status=RefundStatus.PROCESSED,
        razorpay_refund_id="rfnd_P15Email0001",
    )
    db.add(refund)
    await db.commit()
    await db.execute(
        update(Refund).where(Refund.id == refund.id).values(processed_at=dt.datetime.now(dt.UTC))
    )
    await db.commit()
    entity = {"id": "rfnd_P15Email0001", "status": "processed", "notes": {"refund_id": refund.id}}
    for _ in range(2):  # a replay sends nothing more
        res = await deliver(db_client, refund_event("refund.processed", entity))
        assert res.status_code == 200, res.text
    mails = [m for m in _to_customer(sender) if "Refund of ₹5,000" in m.subject]
    assert len(mails) == 1 and "rfnd_P15Email0001" in mails[0].text
    assert "paid more than the booking needed" in mails[0].text
    assert _sent(await run_emails(db_client, db_app), EmailType.REFUND) == 0


# --- failures, retries and the limit ------------------------------------------------------------


@pytest.mark.db
async def test_a_failed_send_is_retried_up_to_three_attempts(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    await _set_departure(db, dep.id, ist_today() + dt.timedelta(days=14))
    sender.fail_for = frozenset({OWNER_INBOX})  # the demo copy goes to the owner's inbox
    first = await run_emails(db_client, db_app)
    assert (first["failed"], first["retried"]) == (1, 0)
    second = await run_emails(db_client, db_app)
    assert (second["failed"], second["retried"]) == (1, 1)
    [row] = await _ledger(db, ref)
    assert (row.state, row.attempts, row.error) == (EmailSendState.FAILED, 2, "send")
    sender.fail_for = frozenset()
    third = await run_emails(db_client, db_app)
    assert (_sent(third, EmailType.DETAILS_REMINDER), third["retried"]) == (1, 1)
    [row] = await _ledger(db, ref)
    assert (row.state, row.attempts) == (EmailSendState.HELD, 3)
    assert (await run_emails(db_client, db_app))["retried"] == 0


@pytest.mark.db
async def test_a_run_stops_at_its_limit_and_the_next_goes_on(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, dep = await _booked(db, db_app, db_client)
    await _lapse_other(db, db_client, dep)  # a still-thinking for another address
    await _set_departure(db, dep.id, ist_today() + dt.timedelta(days=3))  # and the pack is due
    notify = Notify.of(db_app.state)
    run = await automatic.run_due(db, notify, today=ist_today(), limit=1)
    assert (sum(run.sent.values()), run.more) == (1, True)
    run = await automatic.run_due(db, notify, today=ist_today(), limit=1)
    assert (sum(run.sent.values()), run.more) == (1, False)


async def _lapse_other(db: AsyncSession, client: AsyncClient, dep: Departure) -> None:
    res = await client.post(
        "/bookings",
        json={
            "departureId": dep.id,
            "travellers": [{"name": "Ravi Kumar", "age": 30, "occupancy": "single"}],
            "contact": {"name": "Ravi Kumar", "phone": "9000000082", "email": "ravi@example.test"},
        },
    )
    assert res.status_code == 201, res.text
    await _lapse_yesterday(db, res.json()["bookingRef"])
