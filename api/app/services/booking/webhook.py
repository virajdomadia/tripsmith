"""Razorpay's webhook (04 v2 §5 step 4, R16): the third way a payment reaches a booking.

The Checkout callback (`confirm_payment`), the sync on close (`sync_payment`) and this webhook
all apply a capture through `capture_razorpay_payment`, idempotent on `razorpay_payment_id`:
whichever lands first confirms, the rest are no-ops. The router has verified the signature over
the raw body before anything here runs.

- `payment.captured` → the capture path; the whole event is kept on the payment row.
- `payment.failed` → the attempt is recorded as `failed`; the booking stays pending until its
  hold lapses, so the visitor can pay again from the same Checkout.
- `refund.processed` / `refund.failed` (P13) → the refund row moves on from `requested`, found by
  its Razorpay id or, when the call's answer was lost, by the `refund_id` note we sent. A failed
  refund's money goes back onto the booking, so the desk offers "Send refund" again. A refund
  made by hand in the Razorpay dashboard is not ours and is ignored.
- a paid Payment Link (P18b): its order is opened by Razorpay, so it is unknown here; the
  payment's notes name our link row, which learns the order id, and the capture goes on as above;
- anything else, or an order that is not one of ours (the dev api creates orders with the same
  test keys, but the webhook is registered on production only) → ignored, still a 200, so
  Razorpay does not retry it for a day.
"""

import logging
from typing import Any, Literal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Payment, Refund
from app.models.enums import BookingActor, PaymentProvider, PaymentStatus, RefundStatus
from app.services.booking import history
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.links import ref_for_link_event
from app.services.booking.payments import (
    SETTLED_PAYMENT,
    capture_razorpay_payment,
    lock_booking,
    map_link_order,
)
from app.services.booking.refunds import apply_refund, failure_reason
from app.services.email.automatic import send_refund_emails

Outcome = Literal["captured", "replayed", "failed", "refund", "ignored"]
REFUND_EVENTS = {"refund.processed": RefundStatus.PROCESSED, "refund.failed": RefundStatus.FAILED}

log = logging.getLogger(__name__)


def _entity(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("payload")
    payment = payload.get("payment") if isinstance(payload, dict) else None
    entity = payment.get("entity") if isinstance(payment, dict) else None
    return entity if isinstance(entity, dict) else {}


def _payment_entity(event: dict[str, Any]) -> tuple[str, str] | None:
    """`(order_id, payment_id)` from `payload.payment.entity`, or None when either is missing."""
    entity = _entity(event)
    if not entity:
        return None
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    if not (isinstance(order_id, str) and order_id.startswith("order_")):
        return None
    if not (isinstance(payment_id, str) and payment_id.startswith("pay_")):
        return None
    return order_id, payment_id


async def handle_razorpay_event(
    db: AsyncSession, event: dict[str, Any], notify: Notify | None = None
) -> Outcome:
    kind = event.get("event")
    if kind in REFUND_EVENTS:
        return await _refund_event(db, event, REFUND_EVENTS[kind], notify)
    if kind not in ("payment.captured", "payment.failed"):
        return "ignored"
    ids = _payment_entity(event)
    if ids is None:
        log.warning("Razorpay %s without an order and payment id — ignored", kind)
        return "ignored"
    order_id, payment_id = ids
    ref = (
        await db.execute(
            select(Booking.ref)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(Payment.razorpay_order_id == order_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    link_row: str | None = None
    if ref is None:  # P18b: a paid link's order, named by the link's notes
        found = await ref_for_link_event(db, _entity(event), order_id)
        if found is not None:
            ref, link_row = found
    if ref is None:
        log.warning("Razorpay %s for order %s, which is not ours — ignored", kind, order_id)
        await db.rollback()
        return "ignored"

    try:
        if kind == "payment.failed":
            await record_failed_payment(
                db, ref, order_id=order_id, payment_id=payment_id, raw=event, link_row=link_row
            )
            await db.commit()
            return "failed"
        booking, capture = await capture_razorpay_payment(
            db,
            ref,
            order_id=order_id,
            payment_id=payment_id,
            via="webhook",
            raw=event,
            link_row=link_row,
        )
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if capture is None:
        return "replayed"
    await on_new_capture(
        db, ref, capture, package_id=package_id, after=f"webhook payment on {ref}", notify=notify
    )
    return "captured"


async def _refund_event(
    db: AsyncSession, event: dict[str, Any], status: RefundStatus, notify: Notify | None = None
) -> Outcome:
    payload = event.get("payload")
    holder = payload.get("refund") if isinstance(payload, dict) else None
    entity = holder.get("entity") if isinstance(holder, dict) else None
    if not isinstance(entity, dict):
        log.warning("Razorpay %s without a refund entity — ignored", event.get("event"))
        return "ignored"
    rzp_id = entity.get("id") if isinstance(entity.get("id"), str) else None
    notes = entity.get("notes")
    ours = notes.get("refund_id") if isinstance(notes, dict) else None
    conds = []
    if rzp_id:
        conds.append(Refund.razorpay_refund_id == rzp_id)
    if isinstance(ours, str) and ours:
        conds.append(Refund.id == ours)
    found = (
        (await db.execute(select(Refund.id, Refund.booking_id).where(or_(*conds)).limit(1))).first()
        if conds
        else None
    )
    await db.rollback()
    refund_id, booking_id = found if found else (None, None)
    if refund_id is None or booking_id is None:
        log.info("Razorpay refund %s is not one of ours — ignored", rzp_id)
        return "ignored"
    changed = await apply_refund(
        db,
        refund_id,
        status=status,
        actor=BookingActor.WEBHOOK,
        razorpay_refund_id=rzp_id,
        raw=event,
        error=failure_reason(entity, failed=status == RefundStatus.FAILED),
    )
    if status == RefundStatus.PROCESSED and notify is not None:
        # P15 (R53): "your refund is on its way", once per refund (the ledger) — also when the
        # call's own answer already marked it processed and this event changes nothing.
        await send_refund_emails(db, notify, booking_id)
    return "refund" if changed else "replayed"


async def record_failed_payment(
    db: AsyncSession,
    ref: str,
    *,
    order_id: str,
    payment_id: str,
    raw: dict[str, Any],
    link_row: str | None = None,
) -> None:
    """Keep a failed attempt on record without touching the booking (R16). It fills the order's
    `created` row, or a new one when that is taken; a replay updates the same row. A payment
    already captured stays captured — a failure event never undoes money received."""
    booking, _ = await lock_booking(db, ref)  # serialises with a capture on the same order
    if link_row is not None:  # P18b: a link's order, learned now
        await map_link_order(db, booking.id, link_row, order_id)
    rows = (
        (
            await db.execute(
                select(Payment)
                .where(Payment.booking_id == booking.id, Payment.razorpay_order_id == order_id)
                .order_by(Payment.created_at)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    payment = next((p for p in rows if p.razorpay_payment_id == payment_id), None)
    if payment is not None and payment.status in SETTLED_PAYMENT:
        log.warning("payment.failed for %s after it was captured — kept as it is", payment_id)
        return
    if payment is None or payment.status != PaymentStatus.FAILED:  # a replay is logged once
        history.record(
            db,
            booking.id,
            "payment.failed",
            actor=BookingActor.WEBHOOK,
            text=f"Payment {payment_id} failed",
            customer="A payment attempt didn't go through",
        )
    payment = payment or next((p for p in rows if p.razorpay_payment_id is None), None)
    if payment is None:
        payment = Payment(
            booking_id=booking.id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id=order_id,
            amount_paise=rows[0].amount_paise,
            extras=next((p.extras for p in rows if p.extras is not None), None),  # P8b
            date_change_id=next(  # P7: a late authorisation on this row still pays the change
                (p.date_change_id for p in rows if p.date_change_id is not None), None
            ),
        )
        db.add(payment)
    payment.razorpay_payment_id = payment_id
    payment.status = PaymentStatus.FAILED
    payment.raw = raw
    await db.flush()
