"""P13a — the one refund function (R51): newest-first split, row-before-call idempotency,
Razorpay's answers and webhooks (requested → processed | failed), "Send refund" and "Refund
made (offline)" on the desk, the daily tidy's resend, and 0012's backfill. The accept line —
a refund lands in Razorpay exactly once under replays and double clicks — is tested against
FakeRazorpay, which answers refunds the way test mode did when probed on our account. The db
tests need TEST_DATABASE_URL."""

import asyncio
import datetime as dt
import json
import os
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Payment, Refund
from app.models.enums import BookingActor, PaymentProvider, PaymentStatus, RefundStatus
from app.services.booking import refunds
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_history import kinds, one
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking, callback, rzp
from tests.test_booking_webhook import deliver, with_webhook_secret
from tests.test_bookings_desk import cron, hold, lapse, owner_cookie, run_daily
from tests.test_session_migration import API_DIR, _sql

__all__ = ["cron", "rzp"]

pytestmark = pytest.mark.db

REFUSED = "The payment has been fully refunded already"


async def released_and_paid(
    client: AsyncClient, owner: dict[str, str], departure_id: str, n: int, payment_id: str
) -> tuple[str, int]:
    """A hold the owner released, then paid anyway: money on a cancelled booking, refunded in
    full on its own (`surplus`). Returns the ref and the amount."""
    order = await hold(client, departure_id, 1, n)
    ref = str(order["bookingRef"])
    assert (await client.post(f"/admin/bookings/{ref}/release", headers=owner)).is_success
    res = await client.post(
        f"/bookings/{ref}/confirm", json=callback(str(order["orderId"]), payment_id)
    )
    assert res.status_code == 200, res.text
    return ref, int(order["amountPaise"])


async def rows_of(db: AsyncSession, ref: str) -> list[Refund]:
    db.expire_all()
    return list(
        (
            await db.execute(
                select(Refund)
                .join(Booking, Booking.id == Refund.booking_id)
                .where(Booking.ref == ref)
                .order_by(Refund.created_at, Refund.id)
            )
        ).scalars()
    )


def refund_event(kind: str, entity: dict[str, Any]) -> bytes:
    return json.dumps(
        {
            "entity": "event",
            "event": kind,
            "payload": {"refund": {"entity": entity}},
            "created_at": 1790000000,
        }
    ).encode()


# --- the happy path and replays -----------------------------------------------------------------


async def test_a_double_clicked_send_refund_reaches_razorpay_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """Accept: replays and double clicks never refund twice. The automatic refund is refused,
    so the money is owed; two "Send refund" clicks race; one refund is made."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refuse_refunds = REFUSED
    ref, amount = await released_and_paid(db_client, owner, departure.id, 1, "pay_Double001")
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (b["refundNeeded"], b["refundToSendPaise"], b["paidPaise"]) == (True, amount, amount)
    [failed] = b["refunds"]
    assert (failed["status"], failed["error"]) == ("failed", REFUSED)

    rzp.refuse_refunds = None
    clicks = await asyncio.gather(
        *(db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner) for _ in "ab")
    )
    assert sorted(r.status_code for r in clicks) in ([200, 200], [200, 409])
    assert len(rzp.refunds) == 1, "one refund made in Razorpay"
    after = await rows_of(db, ref)
    assert [(r.status, r.amount_paise) for r in after] == [
        (RefundStatus.FAILED, amount),
        (RefundStatus.PROCESSED, amount),
    ]
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (b["refundNeeded"], b["refundToSendPaise"], b["paidPaise"]) == (False, 0, 0)
    got = await kinds(db, ref)
    assert (got["refund.requested"], got["refund.failed"], got["refund.processed"]) == (2, 1, 1)
    failed_entry = await one(db, ref, "refund.failed")
    assert REFUSED in failed_entry.text and failed_entry.customer_text
    assert failed_entry.after == {"paidPaise": amount}


async def test_a_lost_answer_is_retried_under_the_same_key(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """Razorpay unreachable: the row stays `requested` without an id and the flag stays up; the
    retry sends the same idempotency key, so even if the first call had landed, one refund."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refunds_down = True
    ref, amount = await released_and_paid(db_client, owner, departure.id, 2, "pay_Lost0001")
    [row] = await rows_of(db, ref)
    row_id = row.id
    assert (row.status, row.razorpay_refund_id, row.error) == (
        RefundStatus.REQUESTED,
        None,
        "Couldn't reach Razorpay",
    )
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (b["refundNeeded"], b["refundToSendPaise"], b["paidPaise"]) == (True, amount, 0)
    assert (await kinds(db, ref))["refund.error"] == 1

    # Say the first call did reach Razorpay: it made the refund under this key.
    rzp.refunds_down = False
    first_try = [c for c in rzp.refund_calls()]
    assert first_try and all(c.headers["X-Refund-Idempotency"] == row_id for c in first_try)
    rzp.refunds[row_id] = {
        "id": "rfnd_Landed00001",
        "payment_id": "pay_Lost0001",
        "amount": amount,
        "status": "processed",
        "notes": {"refund_id": row_id},
    }
    res = await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    assert res.status_code == 200, res.text
    assert len(rzp.refunds) == 1
    [row] = await rows_of(db, ref)
    assert (row.status, row.razorpay_refund_id, row.error) == (
        RefundStatus.PROCESSED,
        "rfnd_Landed00001",
        None,
    )
    assert res.json()["refundNeeded"] is False
    assert rzp.refund_calls()[-1].headers["X-Refund-Idempotency"] == row_id


async def test_the_daily_tidy_resends_a_refund_stuck_for_an_hour(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refunds_down = True
    ref, _ = await released_and_paid(db_client, owner, departure.id, 3, "pay_Stuck001")
    rzp.refunds_down = False
    assert (await run_daily(db_client, db_app))["refundsResent"] == 0  # under an hour: waits
    [row] = await rows_of(db, ref)
    await db.execute(
        update(Refund)
        .where(Refund.id == row.id)
        .values(created_at=row.created_at - dt.timedelta(hours=2))
    )
    await db.commit()
    assert (await run_daily(db_client, db_app))["refundsResent"] == 1
    [row] = await rows_of(db, ref)
    assert row.status == RefundStatus.PROCESSED and len(rzp.refunds) == 1
    assert (await booking(db, ref)).refund_needed is False


# --- webhooks -----------------------------------------------------------------------------------


async def test_webhooks_move_a_pending_refund_on_once(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """Live mode answers `pending`: the row keeps its Razorpay id and waits (not the owner's
    job); `refund.processed` finishes it, and a replay changes nothing."""
    with_webhook_secret(db_app)
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refund_status = "pending"
    ref, amount = await released_and_paid(db_client, owner, departure.id, 4, "pay_Pend0001")
    [row] = await rows_of(db, ref)
    assert row.status == RefundStatus.REQUESTED and row.razorpay_refund_id
    entity = {**rzp.refunds[row.id], "status": "processed"}
    assert (await booking(db, ref)).refund_needed is False  # Razorpay has it

    for expected in ("refund", "replayed"):
        res = await deliver(db_client, refund_event("refund.processed", entity))
        assert res.status_code == 200 and res.json() == {"status": expected}
    [row] = await rows_of(db, ref)
    assert row.status == RefundStatus.PROCESSED and row.processed_at is not None
    done = await one(db, ref, "refund.processed")
    assert done.actor == BookingActor.WEBHOOK
    # A failure reported after it was processed is ignored.
    res = await deliver(db_client, refund_event("refund.failed", {**entity, "status": "failed"}))
    assert res.json() == {"status": "replayed"}
    assert (await rows_of(db, ref))[0].status == RefundStatus.PROCESSED
    assert (await booking(db, ref)).paid_paise == 0 and amount > 0


async def test_a_failed_refund_webhook_puts_the_money_back_on_the_desk(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refund_status = "pending"
    ref, amount = await released_and_paid(db_client, owner, departure.id, 5, "pay_Fail0001")
    [row] = await rows_of(db, ref)
    entity = {
        **rzp.refunds[row.id],
        "status": "failed",
        "error_description": "Bank account closed",
    }
    res = await deliver(db_client, refund_event("refund.failed", entity))
    assert res.json() == {"status": "refund"}
    [row] = await rows_of(db, ref)
    assert (row.status, row.error) == (RefundStatus.FAILED, "Bank account closed")
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (b["refundNeeded"], b["refundToSendPaise"], b["paidPaise"]) == (True, amount, amount)
    assert (await db_client.get("/auth/session", headers=owner)).json()["bookingsAttention"] == 1


async def test_a_webhook_finds_a_refund_whose_answer_was_lost_by_our_note(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refunds_down = True
    ref, amount = await released_and_paid(db_client, owner, departure.id, 6, "pay_Note0001")
    [row] = await rows_of(db, ref)
    entity = {
        "id": "rfnd_ByNote00001",
        "payment_id": "pay_Note0001",
        "amount": amount,
        "status": "processed",
        "notes": {"booking_ref": ref, "refund_id": row.id},
    }
    assert (await deliver(db_client, refund_event("refund.processed", entity))).json() == {
        "status": "refund"
    }
    [row] = await rows_of(db, ref)
    assert (row.status, row.razorpay_refund_id) == (RefundStatus.PROCESSED, "rfnd_ByNote00001")
    assert (await booking(db, ref)).refund_needed is False
    # A refund made by hand in the dashboard is not ours.
    stranger = {**entity, "id": "rfnd_Dashboard01", "notes": {}}
    res = await deliver(db_client, refund_event("refund.processed", stranger))
    assert res.json() == {"status": "ignored"}


# --- the split, the exposed function, offline ---------------------------------------------------


async def test_a_refund_splits_across_payments_newest_first(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """The function later rows call (a cheaper date change, an unpaid balance): a refund larger
    than the newest payment takes all of it, then the rest from the one before."""
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 1, 7)
    ref = str(order["bookingRef"])
    await db_client.post(
        f"/bookings/{ref}/confirm", json=callback(str(order["orderId"]), "pay_Split0001")
    )
    b = await booking(db, ref)
    older = b.paid_paise
    newer = 3_000_00
    db.add(
        Payment(
            booking_id=b.id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id="order_Split0002",
            razorpay_payment_id="pay_Split0002",
            amount_paise=newer,
            status=PaymentStatus.CAPTURED,
        )
    )
    await db.execute(
        update(Booking).where(Booking.id == b.id).values(paid_paise=Booking.paid_paise + newer)
    )
    await db.commit()

    ids = await refunds.refund(
        db,
        ref,
        newer + 1_000_00,
        reason="date_change",
        actor=BookingActor.CUSTOMER,
        razorpay=rzp,
    )
    assert len(ids) == 2
    calls = {
        (c.url.path.split("/")[3], json.loads(c.content)["amount"]) for c in rzp.refund_calls()
    }
    assert calls == {("pay_Split0002", newer), ("pay_Split0001", 1_000_00)}
    after = await booking(db, ref)
    assert after.paid_paise == older - 1_000_00 and after.refund_needed is False
    # More than the booking holds is refused before anything is written.
    with pytest.raises(Exception, match="can be refunded"):
        await refunds.refund(
            db, ref, after.paid_paise + 100, reason="owner", actor=BookingActor.OWNER, razorpay=rzp
        )
    assert len(await rows_of(db, ref)) == 2


async def test_an_offline_payment_is_refunded_by_hand(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """An offline payment's share is never sent to Razorpay: it waits for "Refund made
    (offline)", which records it once."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 1, 8)
    ref = str(order["bookingRef"])
    await lapse(db, ref)
    res = await db_client.post(
        f"/admin/bookings/{ref}/mark-paid", json={"reference": "UTR 4411"}, headers=owner
    )
    assert res.status_code == 200, res.text
    paid = res.json()["paidPaise"]

    await refunds.refund(
        db, ref, paid, reason="owner", actor=BookingActor.OWNER, razorpay=rzp, note="Goodwill"
    )
    assert rzp.refund_calls() == []
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (b["refundNeeded"], b["refundOfflinePaise"], b["refundToSendPaise"]) == (True, paid, 0)
    [r] = b["refunds"]
    assert (r["status"], r["byHand"]) == ("requested", True)
    assert (
        await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    ).status_code == 409  # nothing for Razorpay

    for expected in (200, 409):
        res = await db_client.post(
            f"/admin/bookings/{ref}/refund-made", json={"note": "Cash back"}, headers=owner
        )
        assert res.status_code == expected
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (b["refundNeeded"], b["refundOfflinePaise"], b["paidPaise"]) == (False, 0, 0)
    assert b["refunds"][0]["status"] == "processed"
    recorded = await one(db, ref, "refund.recorded")
    assert recorded.text.endswith("· Cash back") and "Cash back" not in (
        recorded.customer_text or ""
    )


async def test_the_money_desk_lists_an_offline_refund_to_hand_back(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 1, 9)
    ref = str(order["bookingRef"])
    await lapse(db, ref)
    paid = (
        await db_client.post(f"/admin/bookings/{ref}/mark-paid", json={}, headers=owner)
    ).json()["paidPaise"]
    await refunds.refund(db, ref, paid, reason="owner", actor=BookingActor.OWNER, razorpay=rzp)
    money = (await db_client.get("/admin/money", headers=owner)).json()
    [owed] = money["owed"]
    assert (owed["ref"], owed["amountPaise"], owed["offline"]) == (ref, paid, True)
    assert money["refundedPaise"] == 0  # not money out until it is handed back


# --- 0012 ---------------------------------------------------------------------------------------


def test_0012_turns_hand_recorded_refunds_into_rows(migrated_database_url: str) -> None:
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    try:
        command.downgrade(cfg, "0011")
        asyncio.run(
            _sql(
                url,
                "truncate table bookings, departures, packages, destinations cascade",
                "insert into destinations (id, slug, name, tagline, intro, cover_url, region, "
                "best_months) values ('dst', 'goa', 'Goa', 't', 'i', 'c', 'r', '{1}')",
                "insert into packages (id, slug, destination_id, name, summary, nights, days) "
                "values ('pkg', 'p', 'dst', 'P', 'S', 2, 3)",
                "insert into departures (id, package_id, date, seats_total, price_double_paise, "
                "price_triple_paise, price_child_paise, single_supplement_paise) "
                "values ('dep', 'pkg', current_date + 30, 10, 1, 1, 1, 1)",
                "insert into bookings (id, ref, package_id, departure_id, hold_expires_at, "
                "contact_name, contact_phone, contact_email, quote, total_paise) values "
                "('bk', 'TB-MIGR12', 'pkg', 'dep', now(), 'A', '9000000000', 'a@x.test', "
                "'{}', 1000)",
                # B10: a whole payment refunded, no amount stored; B11: part of one; a live one.
                "insert into payments (id, booking_id, provider, razorpay_payment_id, "
                "amount_paise, status, raw) values "
                "('p1', 'bk', 'razorpay', 'pay_M1', 600, 'refunded', "
                """'{"refund": {"at": "2026-09-20T10:00:00+00:00", "note": "rfnd_1"}}'), """
                "('p2', 'bk', 'razorpay', 'pay_M2', 400, 'refunded', "
                """'{"refund": {"at": "2026-09-21T10:00:00+00:00", "amountPaise": 150}}'), """
                "('p3', 'bk', 'razorpay', 'pay_M3', 900, 'captured', null)",
            )
        )
        command.upgrade(cfg, "0012")
        rows = asyncio.run(
            _sql(
                url,
                "select payment_id, amount_paise, status::text, by_hand, reason, note, "
                "to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') "
                "from refunds order by payment_id",
            )
        )
        assert rows == [
            ("p1", 600, "processed", True, "owner", "rfnd_1", "2026-09-20"),
            ("p2", 150, "processed", True, "owner", None, "2026-09-21"),
        ]
        command.downgrade(cfg, "0011")
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(
            _sql(url, "truncate table bookings, departures, packages, destinations cascade")
        )


# --- review fixes -------------------------------------------------------------------------------


async def test_a_refusal_for_a_refund_that_landed_is_not_believed(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """The first call landed but its answer was lost; by the retry the key has expired, so
    Razorpay refuses "fully refunded already". The refund is found under our note, not failed
    — and nothing is refunded twice."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refunds_down = True
    ref, amount = await released_and_paid(db_client, owner, departure.id, 10, "pay_Expired01")
    [row] = await rows_of(db, ref)
    row_id = row.id
    rzp.refunds_down = False
    rzp.captured["pay_Expired01"] = amount
    rzp.refunds[row_id] = {
        "id": "rfnd_Landed00002",
        "payment_id": "pay_Expired01",
        "amount": amount,
        "status": "processed",
        "receipt": row_id,
        "notes": {"refund_id": row_id},
    }
    rzp.keys_expired = True
    res = await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    assert res.status_code == 200, res.text
    [row] = await rows_of(db, ref)
    assert (row.status, row.razorpay_refund_id) == (RefundStatus.PROCESSED, "rfnd_Landed00002")
    assert len(rzp.refunds) == 1
    b = res.json()
    assert (b["refundNeeded"], b["paidPaise"], b["refundToSendPaise"]) == (False, 0, 0)


async def test_a_refund_failed_on_a_refusal_comes_back_when_razorpay_reports_it_made(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refuse_refunds = REFUSED
    ref, amount = await released_and_paid(db_client, owner, departure.id, 11, "pay_Revive01")
    [row] = await rows_of(db, ref)
    row_id = row.id
    assert row.status == RefundStatus.FAILED
    assert (await booking(db, ref)).paid_paise == amount
    entity = {
        "id": "rfnd_Revived0001",
        "payment_id": "pay_Revive01",
        "amount": amount,
        "status": "processed",
        "notes": {"booking_ref": ref, "refund_id": row_id},
    }
    for expected in ("refund", "replayed"):
        res = await deliver(db_client, refund_event("refund.processed", entity))
        assert res.json() == {"status": expected}
    [row] = await rows_of(db, ref)
    assert (row.status, row.razorpay_refund_id) == (RefundStatus.PROCESSED, "rfnd_Revived0001")
    after = await booking(db, ref)
    assert (after.paid_paise, after.refund_needed) == (0, False)


async def test_a_flag_with_nothing_left_to_give_back_clears(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """A booking flagged before P13 with nothing owed: "Send refund" clears the flag instead of
    refusing, and the desk has nothing left to show."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 1, 12)
    ref = str(order["bookingRef"])
    await db_client.post(
        f"/bookings/{ref}/confirm", json=callback(str(order["orderId"]), "pay_Stale0001")
    )
    await db.execute(update(Booking).where(Booking.ref == ref).values(refund_needed=True))
    await db.commit()
    res = await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    assert res.status_code == 200, res.text
    assert res.json()["refundNeeded"] is False and rzp.refund_calls() == []
    again = await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    assert again.status_code == 409


async def test_the_money_desk_counts_a_stuck_refund_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    rzp.refunds_down = True
    ref, amount = await released_and_paid(db_client, owner, departure.id, 13, "pay_StuckM01")
    money = (await db_client.get("/admin/money", headers=owner)).json()
    assert (money["refundedPaise"], money["toRecordPaise"]) == (0, amount)
    today = money["days"][-1]
    assert (today["outPaise"], today["owePaise"]) == (0, amount)
    [owed] = money["owed"]
    assert (owed["ref"], owed["offline"], owed["offlinePaise"]) == (ref, False, 0)
