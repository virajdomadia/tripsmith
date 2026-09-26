"""Razorpay's webhook (04 v2 §5 step 4, R16): the third way a payment reaches a booking.

The Checkout callback (`confirm_payment`), the sync on close (`sync_payment`) and this webhook
all apply a capture through `capture_razorpay_payment`, idempotent on `razorpay_payment_id`:
whichever lands first confirms, the rest are no-ops. The router has verified the signature over
the raw body before anything here runs.

- `payment.captured` → the capture path; the whole event is kept on the payment row.
- `payment.failed` → the attempt is recorded as `failed`; the booking stays pending until its
  hold lapses, so the visitor can pay again from the same Checkout.
- anything else, or an order that is not one of ours (the dev api creates orders with the same
  test keys, but the webhook is registered on production only) → ignored, still a 200, so
  Razorpay does not retry it for a day.
"""

import logging
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Payment
from app.models.enums import PaymentProvider, PaymentStatus
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.payments import (
    SETTLED_PAYMENT,
    capture_razorpay_payment,
    lock_booking,
)

Outcome = Literal["captured", "replayed", "failed", "ignored"]

log = logging.getLogger(__name__)


def _payment_entity(event: dict[str, Any]) -> tuple[str, str] | None:
    """`(order_id, payment_id)` from `payload.payment.entity`, or None when either is missing."""
    payload = event.get("payload")
    payment = payload.get("payment") if isinstance(payload, dict) else None
    entity = payment.get("entity") if isinstance(payment, dict) else None
    if not isinstance(entity, dict):
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
    if ref is None:
        log.warning("Razorpay %s for order %s, which is not ours — ignored", kind, order_id)
        await db.rollback()
        return "ignored"

    try:
        if kind == "payment.failed":
            await record_failed_payment(
                db, ref, order_id=order_id, payment_id=payment_id, raw=event
            )
            await db.commit()
            return "failed"
        booking, capture = await capture_razorpay_payment(
            db, ref, order_id=order_id, payment_id=payment_id, raw=event
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


async def record_failed_payment(
    db: AsyncSession, ref: str, *, order_id: str, payment_id: str, raw: dict[str, Any]
) -> None:
    """Keep a failed attempt on record without touching the booking (R16). It fills the order's
    `created` row, or a new one when that is taken; a replay updates the same row. A payment
    already captured stays captured — a failure event never undoes money received."""
    booking, _ = await lock_booking(db, ref)  # serialises with a capture on the same order
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
    payment = payment or next((p for p in rows if p.razorpay_payment_id is None), None)
    if payment is None:
        payment = Payment(
            booking_id=booking.id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id=order_id,
            amount_paise=rows[0].amount_paise,
        )
        db.add(payment)
    payment.razorpay_payment_id = payment_id
    payment.status = PaymentStatus.FAILED
    payment.raw = raw
    await db.flush()
