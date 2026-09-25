"""`confirmPayment`, and the capture path B6's webhook and B10's mark-paid reuse (04 v2 §5).

A captured payment is recorded against the booking with the departure row locked, then applied
with a guarded single-row UPDATE (§2). The hold decides what the money buys:

- still live → the seats are already counted for this party: `confirmed`;
- lapsed (Checkout's 10 minutes ran out, or a newer hold replaced it) → re-check the seats now:
  enough → `confirmed`; not enough → `cancelled` (`seats_gone`) with `refund_needed`, never
  confirmed (03-requirements-v2, "Late capture");
- the booking is no longer pending (cancelled, or confirmed by an earlier payment) → the payment
  is kept and flagged `refund_needed`: money with no seat behind it goes back by hand.

Recording is idempotent on `razorpay_payment_id` (unique), so the Checkout callback, the webhook
and any replay of either apply a payment once. Refunds are made in the Razorpay dashboard.
"""

import logging
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.razorpay import Razorpay
from app.models import Booking, BookingTraveller, Departure, Payment
from app.models.catalog import departure_availability
from app.models.enums import BookingStatus, CancelReason, PaymentProvider, PaymentStatus
from app.schemas.bookings import PaymentCallback, PaymentResult
from app.services.booking.freshness import refresh_quietly

NOT_FOUND = "We could not find that booking"
NOT_VERIFIED = "We could not verify that payment — if money left your account, WhatsApp us"

log = logging.getLogger(__name__)


async def lock_booking(db: AsyncSession, ref: str) -> tuple[Booking, bool]:
    """Lock the booking's departure, then the booking, and say whether its hold is still live.

    The departure first — the order `create_booking_order` takes — so a capture and a new hold on
    the same date serialise, and a seat re-check here sees every hold committed before it. The
    hold is judged by the database clock, the one `departure_availability` compares against.
    """
    departure_id = (
        await db.execute(select(Booking.departure_id).where(Booking.ref == ref))
    ).scalar_one_or_none()
    if departure_id is None:
        raise ApiError("not_found", NOT_FOUND)
    await db.execute(select(Departure.id).where(Departure.id == departure_id).with_for_update())
    booking, live = (
        await db.execute(
            select(Booking, Booking.hold_expires_at > func.now())
            .where(Booking.ref == ref)
            .with_for_update(of=Booking)
            .execution_options(populate_existing=True)
        )
    ).one()
    return booking, bool(live)


async def seats_short(db: AsyncSession, booking: Booking, *, hold_live: bool) -> int:
    """How many of the party's seats are missing right now — 0 while the hold is live (the view
    already counts this party). Needs `lock_booking` first. B10's mark-paid refuses when > 0."""
    if hold_live:
        return 0
    party = (
        await db.execute(
            select(func.count())
            .select_from(BookingTraveller)
            .where(BookingTraveller.booking_id == booking.id)
        )
    ).scalar_one()
    left = (
        await db.execute(
            select(departure_availability.c.seats_left).where(
                departure_availability.c.departure_id == booking.departure_id
            )
        )
    ).scalar_one()
    return max(0, int(party) - int(left))


async def settle_capture(
    db: AsyncSession, booking: Booking, *, hold_live: bool, amount_paise: int
) -> None:
    """Apply newly captured money to a booking locked by `lock_booking`. The caller has recorded
    the payment row and commits; call once per payment, never on a replay."""
    paid = booking.paid_paise + amount_paise
    values: dict[str, object] = {"paid_paise": paid, "updated_at": func.now()}
    expected = booking.status
    if booking.status != BookingStatus.PENDING:
        values["refund_needed"] = True
        log.error(
            "Payment of %s paise captured on %s booking %s — flagged for a refund",
            amount_paise,
            booking.status.value,
            booking.ref,
        )
    elif paid < booking.total_paise:
        pass  # part-paid (add-on D's split): stays pending
    elif await seats_short(db, booking, hold_live=hold_live) == 0:
        values["status"] = BookingStatus.CONFIRMED
    else:
        values |= {
            "status": BookingStatus.CANCELLED,
            "cancel_reason": CancelReason.SEATS_GONE,
            "refund_needed": True,
        }
        log.error(
            "Late capture on booking %s found no seats — cancelled, refund needed", booking.ref
        )
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id, Booking.status == expected)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    await db.refresh(booking)


async def capture_razorpay_payment(
    db: AsyncSession, ref: str, *, order_id: str, payment_id: str, raw: dict[str, Any] | None = None
) -> tuple[Booking, bool]:
    """Record a verified Razorpay capture on the booking and apply it. Returns the booking and
    whether anything changed (False on a replay). The caller verified the signature and commits.

    The order must be one of this booking's; the payment fills the order's `created` row, or a
    new row when that one is taken (a failed attempt, or a second capture on the same order).
    """
    booking, hold_live = await lock_booking(db, ref)
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
    if not rows:
        log.warning("Order %s is not booking %s's — refusing the capture", order_id, ref)
        raise ApiError("validation", NOT_VERIFIED)
    payment = next((p for p in rows if p.razorpay_payment_id == payment_id), None)
    if payment is not None and payment.status == PaymentStatus.CAPTURED:
        return booking, False  # already recorded: a replayed callback or webhook
    # Recorded as failed earlier (B6) and captured after all — a late authorisation — or new.
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
    payment.status = PaymentStatus.CAPTURED
    if raw is not None:
        payment.raw = raw
    await db.flush()
    await settle_capture(db, booking, hold_live=hold_live, amount_paise=payment.amount_paise)
    return booking, True


async def confirm_payment(
    db: AsyncSession, ref: str, callback: PaymentCallback, razorpay: Razorpay
) -> PaymentResult:
    """Checkout's success handler posts here. A signature that does not verify is a 400 and a
    log line; a replay is a no-op that answers with where the booking stands."""
    if not razorpay.verify_payment_signature(
        order_id=callback.razorpay_order_id,
        payment_id=callback.razorpay_payment_id,
        signature=callback.razorpay_signature,
    ):
        log.warning(
            "Payment signature did not verify for booking %s (order %s, payment %s)",
            ref,
            callback.razorpay_order_id,
            callback.razorpay_payment_id,
        )
        raise ApiError("validation", NOT_VERIFIED)
    try:
        booking, changed = await capture_razorpay_payment(
            db, ref, order_id=callback.razorpay_order_id, payment_id=callback.razorpay_payment_id
        )
        result = PaymentResult(
            booking_ref=booking.ref, status=booking.status, refund_needed=booking.refund_needed
        )
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if changed:
        await refresh_quietly(db, {package_id}, after=f"payment on {ref}")
    return result
