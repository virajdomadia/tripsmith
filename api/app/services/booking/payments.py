"""`confirmPayment`, and the capture path B6's webhook and B10's mark-paid reuse (04 v2 §5).

A captured payment is recorded against the booking with the departure row locked, then applied
with a guarded single-row UPDATE (§2). The hold decides what the money buys:

- still live → the seats are already counted for this party: `confirmed`;
- lapsed (Checkout's 10 minutes ran out, or a newer hold replaced it) → re-check the seats now:
  enough → `confirmed`; not enough → `cancelled` (`seats_gone`) with `refund_needed`, never
  confirmed (03-requirements-v2, "Late capture");
- cancelled by `/cron/daily` as `hold_expired` (B10) → the same as a lapsed hold: the sweep only
  tidies abandoned checkouts, so a payment that lands after it still gets its seats if they are
  free;
- the booking is otherwise no longer pending (cancelled, or confirmed by an earlier payment) →
  the payment is kept, and what the booking now owes back is refunded.

A booking made with a deposit (P5) is `partially_paid` once the deposit is in (the seats are
held from then on); each later part of the balance adds to what it holds, and the part that
clears the balance confirms it. Money beyond the total (two parts paid at once) goes back.

Either refund is planned here, in the capture's transaction (P13: `refunds.plan_refund`), and
sent to Razorpay after the commit (`on_new_capture` → `refunds.send_refunds`), so money with no
seat behind it goes back on its own — once, however often the capture is replayed.

Recording is idempotent on `razorpay_payment_id` (unique), so the Checkout callback, the webhook
and any replay of either apply a payment once.
"""

import logging
from typing import Any, Literal

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.razorpay import Razorpay, RazorpayError
from app.models import Booking, BookingTraveller, Payment
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.bookings import PaymentCallback, PaymentResult
from app.services.booking import history
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.extras import TAKES_EXTRAS, settle_extras
from app.services.booking.history import PaymentLog, money
from app.services.booking.locking import NOT_FOUND, lock_booking
from app.services.booking.refunds import plan_refund, refund_owed, refunding
from app.services.booking.settled import Capture, Settled
from app.services.gst.documents import issue_due_safely

CaptureVia = Literal["checkout", "sync", "webhook"]
# A payment in either state has been applied once; neither is ever applied or failed again.
SETTLED_PAYMENT = (PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)
NOT_VERIFIED = "We could not verify that payment — if money left your account, WhatsApp us"

log = logging.getLogger(__name__)


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


def awaiting_payment(booking: Booking) -> bool:
    """Pending, or swept as `hold_expired` — a lapsed checkout either way, which money can
    still confirm if the seats are free (B10: the sweep must not turn a late payment into a
    refund). Every other cancellation is final."""
    return booking.status == BookingStatus.PENDING or (
        booking.status == BookingStatus.CANCELLED
        and booking.cancel_reason == CancelReason.HOLD_EXPIRED
    )


async def settle_capture(
    db: AsyncSession,
    booking: Booking,
    *,
    hold_live: bool,
    amount_paise: int,
    entry: PaymentLog,
    extras: list[dict[str, Any]] | None = None,
    payment_id: str | None = None,
) -> Settled:
    """Apply newly captured money to a booking locked by `lock_booking`, and write it to the
    booking's history (`entry` + what the money did). The caller has recorded the payment row and
    commits; call once per payment, never on a replay.

    `extras` (P8b) = the payment was an Add extras order: on a confirmed booking its add-ons join
    the booking (`extras.settle_extras`); on any other it is money the booking does not take,
    refunded by the rule below."""
    if extras is not None and payment_id is not None and booking.status in TAKES_EXTRAS:
        return await settle_extras(
            db,
            booking,
            amount_paise=amount_paise,
            extras=extras,
            payment_id=payment_id,
            entry=entry,
        )
    before = {"status": booking.status.value, "paidPaise": booking.paid_paise}
    paid = booking.paid_paise + amount_paise
    values: dict[str, object] = {"paid_paise": paid, "updated_at": func.now()}
    expected = booking.status
    if booking.status == BookingStatus.PARTIALLY_PAID:  # P5: a part of the balance
        settled = Settled.BALANCE_PART
        if paid >= booking.total_paise:
            settled = Settled.PAID_IN_FULL
            values["status"] = BookingStatus.CONFIRMED
    elif not awaiting_payment(booking):
        settled = Settled.NOT_PENDING
        values["refund_needed"] = True
        if booking.cancel_reason == CancelReason.BALANCE_UNPAID:
            # A part paid after the tidy cancelled it (Checkout open at 01:00, a late webhook):
            # the policy's refund was settled on what was paid then, so this goes back in full.
            values["balance_refund_paise"] = (
                func.coalesce(Booking.balance_refund_paise, 0) + amount_paise
            )
        log.error(
            "Payment of %s paise captured on %s booking %s — flagged for a refund",
            amount_paise,
            booking.status.value,
            booking.ref,
        )
    elif paid < booking.total_paise and paid < (booking.deposit_paise or booking.total_paise):
        settled = Settled.PART_PAID  # less than was asked for: stays pending
    elif await seats_short(db, booking, hold_live=hold_live) == 0:
        if paid >= booking.total_paise:
            settled = Settled.CONFIRMED
            values |= {"status": BookingStatus.CONFIRMED, "cancel_reason": None}
        else:  # P5: the deposit holds the seats
            settled = Settled.DEPOSIT
            values |= {"status": BookingStatus.PARTIALLY_PAID, "cancel_reason": None}
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
    _log_capture(db, booking, settled, entry, amount_paise=amount_paise, before=before)
    if settled in (Settled.SEATS_GONE, Settled.NOT_PENDING) or (
        settled in (Settled.CONFIRMED, Settled.DEPOSIT, Settled.PAID_IN_FULL)
        and booking.paid_paise > booking.total_paise  # two parts at once: the extra goes back
    ):
        await plan_refund(
            db,
            booking,
            await refund_owed(db, booking),
            reason="seats_gone" if settled == Settled.SEATS_GONE else "surplus",
            actor=BookingActor.SYSTEM,
        )
    await issue_due_safely(db, booking)  # P13b: the receipt, and the invoice once paid in full
    return settled


def _log_capture(
    db: AsyncSession,
    booking: Booking,
    settled: Settled,
    entry: PaymentLog,
    *,
    amount_paise: int,
    before: dict[str, Any],
) -> None:
    amount = money(amount_paise)
    coupon = f" · coupon {booking.coupon_code} used" if booking.coupon_code else ""
    left = money(max(0, booking.total_paise - booking.paid_paise))
    due = history.day(booking.balance_due_on) if booking.balance_due_on else ""
    outcome = {
        Settled.CONFIRMED: " — booking confirmed" + coupon,
        Settled.PART_PAID: " — part paid",
        Settled.DEPOSIT: f" — deposit paid, booking confirmed{coupon} · {left} due by {due}",
        Settled.BALANCE_PART: f" — towards the balance · {left} left, due by {due}",
        Settled.PAID_IN_FULL: " — balance cleared, paid in full",
    }.get(settled, "")
    customer = {
        Settled.CONFIRMED: " — booking confirmed",
        Settled.DEPOSIT: f" — deposit paid, booking confirmed. {left} is due by {due}",
        Settled.BALANCE_PART: f" towards the balance — {left} left, due by {due}",
        Settled.PAID_IN_FULL: " — the balance is cleared and your trip is paid in full",
    }.get(settled, "")
    history.record(
        db,
        booking.id,
        entry.kind,
        actor=entry.actor,
        by=entry.by,
        text=entry.text + outcome,
        customer=f"Payment of {amount} received{customer}",
        before=before,
        after={"status": booking.status.value, "paidPaise": booking.paid_paise},
    )
    if settled == Settled.SEATS_GONE:
        history.record(
            db,
            booking.id,
            "cancelled.seats_gone",
            actor=BookingActor.SYSTEM,
            text="Cancelled — paid after the hold lapsed and the seats had gone · refunding "
            f"{amount} in full",
            customer="Your payment arrived after the hold ended and the seats had gone — the "
            f"booking is cancelled and {amount} will be refunded in full",
        )
    elif settled == Settled.NOT_PENDING:
        history.record(
            db,
            booking.id,
            "refund.flagged",
            actor=BookingActor.SYSTEM,
            text=f"Money arrived on a {before['status']} booking — refunding what it no longer "
            "needs",
        )


async def map_link_order(db: AsyncSession, booking_id: str, row_id: str, order_id: str) -> None:
    """P18b: a Payment Link's order exists only once the payer opens the link — write it onto
    the link's row (once) so the capture below finds it. Called under the booking's lock, so every
    path (webhook, redirect back, Check payment) takes the locks in the same order."""
    await db.execute(
        update(Payment)
        .where(
            Payment.id == row_id,
            Payment.booking_id == booking_id,
            Payment.razorpay_link_id.is_not(None),
            Payment.razorpay_order_id.is_(None),
        )
        .values(razorpay_order_id=order_id, updated_at=func.now())
        .execution_options(synchronize_session=False)
    )


async def capture_razorpay_payment(
    db: AsyncSession,
    ref: str,
    *,
    order_id: str,
    payment_id: str,
    via: CaptureVia,
    raw: dict[str, Any] | None = None,
    link_row: str | None = None,
) -> tuple[Booking, Capture | None]:
    """Record a verified Razorpay capture on the booking and apply it. Returns the booking and
    what the new capture did — None on a replay, so the after-capture hook (emails included)
    runs exactly once per payment. The caller verified the signature and commits.

    The order must be one of this booking's; the payment fills the order's `created` row, or a
    new row when that one is taken (a failed attempt, or a second capture on the same order).
    `link_row` (P18b): the Payment Link row whose order this is, mapped first.
    """
    booking, hold_live = await lock_booking(db, ref)
    if link_row is not None:
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
    if not rows:
        log.warning("Order %s is not booking %s's — refusing the capture", order_id, ref)
        raise ApiError("validation", NOT_VERIFIED)
    payment = next((p for p in rows if p.razorpay_payment_id == payment_id), None)
    if payment is not None and payment.status in SETTLED_PAYMENT:
        # Already recorded: a replayed callback or webhook — including after the owner recorded
        # its refund (B10), which a late Razorpay retry must not undo.
        return booking, None
    # Recorded as failed earlier (B6) and captured after all — a late authorisation — or new.
    payment = payment or next((p for p in rows if p.razorpay_payment_id is None), None)
    if payment is None:
        payment = Payment(
            booking_id=booking.id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id=order_id,
            amount_paise=rows[0].amount_paise,
            # P8b: a retry after a failed attempt is still the Add extras order's money.
            extras=next((p.extras for p in rows if p.extras is not None), None),
        )
        db.add(payment)
    payment.razorpay_payment_id = payment_id
    payment.status = PaymentStatus.CAPTURED
    if raw is not None:
        payment.raw = raw
    await db.flush()
    settled = await settle_capture(
        db,
        booking,
        hold_live=hold_live,
        amount_paise=payment.amount_paise,
        entry=PaymentLog.razorpay(payment_id, payment.amount_paise, via),
        extras=payment.extras,
        payment_id=payment.id,
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
            db,
            ref,
            order_id=callback.razorpay_order_id,
            payment_id=callback.razorpay_payment_id,
            via="checkout",
        )
        result = PaymentResult(
            booking_ref=booking.ref,
            status=booking.status,
            refund_needed=await refunding(db, booking),
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
    `capture_razorpay_payment`, idempotent on the payment id. Only a booking still awaiting
    payment (pending, or swept as `hold_expired`), or a confirmed or part-paid one with an Add
    extras order (P8b) or a balance order (P5) not yet paid, makes the outbound call; any other
    answers from the database.
    """
    booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_FOUND)
    result = PaymentResult(
        booking_ref=booking.ref, status=booking.status, refund_needed=await refunding(db, booking)
    )
    # A booking awaiting payment checks all its orders; a confirmed or part-paid one only its
    # open later orders — Add extras (P8b) or a part of the balance (P5): Checkout can close
    # without a callback there too.
    orders = select(Payment.razorpay_order_id).where(Payment.booking_id == booking.id)
    if not awaiting_payment(booking):
        if booking.status not in TAKES_EXTRAS:
            return result
        orders = orders.where(
            Payment.status.not_in(SETTLED_PAYMENT),
            # An abandoned order stays `created` for good; the webhook covers a later capture.
            Payment.created_at > func.now() - text("interval '1 day'"),
        )
    rows = await db.execute(orders.distinct())
    order_ids = [o for o in rows.scalars().all() if o]
    if not order_ids:
        return result
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
            db, ref, order_id=order_id, payment_id=payment_id, via="sync", raw=raw
        )
        result = PaymentResult(
            booking_ref=booking.ref,
            status=booking.status,
            refund_needed=await refunding(db, booking),
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
