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
from app.infra.razorpay import Razorpay, RazorpayError
from app.models import Booking, BookingTraveller, Departure, Payment
from app.models.catalog import departure_availability
from app.models.enums import BookingStatus, CancelReason, PaymentProvider, PaymentStatus
from app.schemas.bookings import PaymentCallback, PaymentResult
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.settled import Capture, Settled

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
) -> Settled:
    """Apply newly captured money to a booking locked by `lock_booking`. The caller has recorded
    the payment row and commits; call once per payment, never on a replay."""
    paid = booking.paid_paise + amount_paise
    values: dict[str, object] = {"paid_paise": paid, "updated_at": func.now()}
    expected = booking.status
    if booking.status != BookingStatus.PENDING:
        settled = Settled.NOT_PENDING
        values["refund_needed"] = True
        log.error(
            "Payment of %s paise captured on %s booking %s — flagged for a refund",
            amount_paise,
            booking.status.value,
            booking.ref,
        )
    elif paid < booking.total_paise:
        settled = Settled.PART_PAID  # add-on D's split: stays pending
    elif await seats_short(db, booking, hold_live=hold_live) == 0:
        settled = Settled.CONFIRMED
        values["status"] = BookingStatus.CONFIRMED
    else:
        settled = Settled.SEATS_GONE
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
    return settled


async def capture_razorpay_payment(
    db: AsyncSession, ref: str, *, order_id: str, payment_id: str, raw: dict[str, Any] | None = None
) -> tuple[Booking, Capture | None]:
    """Record a verified Razorpay capture on the booking and apply it. Returns the booking and
    what the new capture did — None on a replay, so the after-capture hook (emails included)
    runs exactly once per payment. The caller verified the signature and commits.

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
        return booking, None  # already recorded: a replayed callback or webhook
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
    settled = await settle_capture(
        db, booking, hold_live=hold_live, amount_paise=payment.amount_paise
    )
    return booking, Capture(settled, payment_id, payment.amount_paise)


async def confirm_payment(
    db: AsyncSession,
    ref: str,
    callback: PaymentCallback,
    razorpay: Razorpay,
    notify: Notify | None = None,
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
        booking, capture = await capture_razorpay_payment(
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
    if capture:
        await on_new_capture(
            db, ref, capture, package_id=package_id, after=f"payment on {ref}", notify=notify
        )
    return result


PROVIDER_DOWN = "We couldn't check your payment just now — try again in a minute, or WhatsApp us"


async def sync_payment(
    db: AsyncSession, ref: str, razorpay: Razorpay, notify: Notify | None = None
) -> PaymentResult:
    """B5: ask Razorpay whether a still-pending booking was paid, and apply it if so.

    Checkout can close without calling its success handler (a tab put to sleep, a popup that
    lost its opener). B6's webhook tells us too, but seconds later and only on production, so
    the visitor would otherwise watch a pending booking they have paid for. The web calls
    this whenever Checkout closes without a callback. The order's payments are read with the
    key secret, so a `captured` one (or an `authorized` one, captured here first) is applied
    exactly like a signed callback — through
    `capture_razorpay_payment`, idempotent on the payment id. Only a pending booking makes the
    outbound call; any other status answers from the database.
    """
    booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_FOUND)
    result = PaymentResult(
        booking_ref=booking.ref, status=booking.status, refund_needed=booking.refund_needed
    )
    if booking.status != BookingStatus.PENDING:
        return result
    rows = await db.execute(
        select(Payment.razorpay_order_id).where(Payment.booking_id == booking.id).distinct()
    )
    order_ids = [o for o in rows.scalars().all() if o]
    await db.rollback()  # no transaction held open across the call to Razorpay
    found: tuple[str, str, dict[str, Any]] | None = None
    for order_id in order_ids:
        try:
            items = await razorpay.order_payments(order_id)
        except RazorpayError as exc:
            log.warning("Payment sync for %s: %s", ref, exc)
            raise ApiError("internal", PROVIDER_DOWN, status=502) from exc
        for item in items:
            pay_id, status = item.get("id"), item.get("status")
            if not (isinstance(pay_id, str) and pay_id.startswith("pay_")):
                continue
            try:
                # Authorized = the money is taken but not yet captured (the moments before
                # Razorpay's auto-capture, or an account without it): capture it ourselves,
                # so a paid visitor is never offered Pay again.
                if status == "authorized":
                    amount = item.get("amount")
                    status = await razorpay.capture_payment(
                        pay_id, amount_paise=amount if isinstance(amount, int) else 0
                    )
            except RazorpayError as exc:
                log.warning("Capture during sync for %s: %s", ref, exc)
                raise ApiError("internal", PROVIDER_DOWN, status=502) from exc
            if status == "captured":
                found = (order_id, pay_id, item)
                break
        if found:
            break
    if found is None:
        return result
    order_id, payment_id, raw = found
    try:
        booking, capture = await capture_razorpay_payment(
            db, ref, order_id=order_id, payment_id=payment_id, raw=raw
        )
        result = PaymentResult(
            booking_ref=booking.ref, status=booking.status, refund_needed=booking.refund_needed
        )
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if capture:
        await on_new_capture(
            db, ref, capture, package_id=package_id, after=f"synced payment on {ref}", notify=notify
        )
    return result
