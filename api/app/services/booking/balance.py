"""Paying the balance (R43, P5): My trips' "Pay the balance", and the daily tidy's reminders and
overdue cancel. The rules themselves are in deposit.py.

**A part.** A booking on its deposit (`partially_paid`) can pay any part of its balance — at
least ₹1,000 unless less is left, in whole rupees unless it is all that is left — while no
cancellation request waits on it. The order's `payments` row is an ordinary one (no extras), and
the capture goes through `payments.settle_capture` like every payment: idempotent on the
Razorpay payment id, the part that clears the balance confirms the booking, and money beyond the
total (two parts paid at once) goes back.

**Reminders** go 7 and 3 days before the due day and on it (`deposit.reminder_stage`). Each is
claimed first — a `balance.reminder` history entry naming the stage and the due day, written
under the booking's lock and committed — and only then sent, so a re-run of the tidy sends
nothing twice (a lost email is logged, not retried). An owner extending the due day (P5b) arms
the reminders again, since the day is part of the claim.

**Owner (P5b).** The desk shows the balance and can record it paid offline (the whole
balance, as one `offline` payment through `settle_capture`, so the booking is confirmed and the
invoice issued like any clearing part) or move the due day later, up to the departure day
(logged; the reminders re-arm for the new day).

**Overdue.** The day after the 2-day grace, the tidy cancels the booking as `balance_unpaid`,
which frees its seats. The refund is the cancellation policy's tier applied to what was paid, as
of that day; it is kept on the booking (`balance_refund_paise`) so `refunds.refund_owed` stays
right after a failed refund, and sent through the one refund function. A booking whose customer
has asked to cancel is left for the owner to decide, like the completion sweep does.
"""

import datetime as dt
import logging
from typing import NamedTuple

import sentry_sdk
from sqlalchemy import Exists, exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import refund_tier, suggested_refund_paise
from app.errors import ApiError
from app.infra.razorpay import Razorpay, RazorpayError
from app.models import Booking, BookingCancellation, BookingEvent, Departure, Payment, User
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.account import AccountBalance, BalanceOrder
from app.schemas.admin_bookings import AdminBalance
from app.services.analytics import ist_today
from app.services.booking import deposit, history
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.freshness import refresh_quietly
from app.services.booking.history import PaymentLog, money
from app.services.booking.locking import lock_booking
from app.services.booking.payments import settle_capture
from app.services.booking.refunds import plan_refund, refund_owed, send_refunds
from app.services.booking.settled import Capture
from app.services.booking.voucher import load_booking_facts, offline_label
from app.services.email.balance import send_balance_cancelled, send_balance_reminder

NO_BALANCE = "This booking has no balance to pay"
ASKED = "You've asked to cancel this booking, so the balance is on hold until we reply"
PAYMENTS_DOWN = "Payments are not reachable right now — try again in a minute, or WhatsApp us"
REMINDER = "balance.reminder"

log = logging.getLogger(__name__)


# --- My trips -----------------------------------------------------------------------------------


def _open_request() -> Exists:
    return exists().where(
        BookingCancellation.booking_id == Booking.id,
        BookingCancellation.status == CancellationStatus.REQUESTED,
    )


def balance_out(booking: Booking, *, asked: bool) -> AccountBalance | None:
    """My trips' balance card; None for a booking made paying in full."""
    if booking.deposit_paise is None or booking.balance_due_on is None:
        return None
    left = max(0, booking.total_paise - booking.paid_paise)
    reason = None
    if booking.status != BookingStatus.PARTIALLY_PAID or left == 0:
        reason = NO_BALANCE
    elif asked:
        reason = ASKED
    return AccountBalance(
        deposit_paise=booking.deposit_paise,
        balance_paise=left if booking.status == BookingStatus.PARTIALLY_PAID else 0,
        due_on=booking.balance_due_on,
        last_day_on=deposit.overdue_after(booking.balance_due_on),
        min_part_paise=deposit.min_part(left),
        open=reason is None,
        reason=reason,
    )


def _refusal(booking: Booking, amount: int, *, asked: bool) -> ApiError | None:
    left = booking.total_paise - booking.paid_paise
    if booking.status != BookingStatus.PARTIALLY_PAID or left <= 0:
        return ApiError("conflict", NO_BALANCE, reason="balance_closed")
    if asked:
        return ApiError("conflict", ASKED, reason="balance_closed")
    least = deposit.min_part(left)
    if amount > left:
        message = f"That's more than the {money(left)} left to pay"
    elif amount < least:
        message = f"Pay at least {money(least)} at a time"
    elif amount != left and amount % 100:
        message = "Pay whole rupees — or the exact balance"
    else:
        return None
    return ApiError("validation", message, field_errors={"amountPaise": message})


async def create_balance_order(
    db: AsyncSession, user: User, ref: str, amount_paise: int, razorpay: Razorpay
) -> BalanceOrder:
    """Check the part, then open a Razorpay order for it and record its `created` payment row.
    The Razorpay call is made with no transaction open."""
    from app.services.account import owned_by  # account imports this module for My trips

    try:
        row = (
            await db.execute(
                select(Booking, _open_request()).where(Booking.ref == ref, owned_by(user))
            )
        ).one_or_none()
        if row is None:
            raise ApiError("not_found", "No booking with that reference on your account")
        booking, asked = row
        if refused := _refusal(booking, amount_paise, asked=bool(asked)):
            raise refused
        booking_id, left = booking.id, booking.total_paise - booking.paid_paise
    finally:
        await db.rollback()
    try:
        order_id = await razorpay.create_order(amount_paise=amount_paise, receipt=ref)
    except RazorpayError:
        log.exception("Razorpay order for a balance part on %s failed", ref)
        raise ApiError("internal", PAYMENTS_DOWN, status=502) from None
    try:
        db.add(
            Payment(
                booking_id=booking_id,
                provider=PaymentProvider.RAZORPAY,
                razorpay_order_id=order_id,
                amount_paise=amount_paise,
                status=PaymentStatus.CREATED,
            )
        )
        history.record(
            db,
            booking_id,
            "order.balance",
            actor=BookingActor.CUSTOMER,
            text=f"Balance payment started · {money(amount_paise)} of {money(left)} left · "
            f"Razorpay order {order_id}",
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return BalanceOrder(
        booking_ref=ref,
        order_id=order_id,
        key_id=razorpay.key_id,
        amount_paise=amount_paise,
        balance_paise=left,
    )


# --- the owner (P5b) ---------------------------------------------------------------------------

NOT_ON_DEPOSIT = "Only a booking on its deposit has a balance to settle"
DUE_NOT_LATER = "Pick a day after the current due day"
DUE_AFTER_DEPARTURE = "The balance can be due on the departure day at the latest"


def admin_balance(
    booking: Booking, departs: dt.date, today: dt.date | None = None
) -> AdminBalance | None:
    """The desk's balance block; None for a booking paid in full at booking."""
    if booking.deposit_paise is None or booking.balance_due_on is None:
        return None
    today = today or ist_today()
    open_ = booking.status == BookingStatus.PARTIALLY_PAID
    return AdminBalance(
        deposit_paise=booking.deposit_paise,
        balance_paise=max(0, booking.total_paise - booking.paid_paise) if open_ else 0,
        due_on=booking.balance_due_on,
        last_day_on=deposit.overdue_after(booking.balance_due_on),
        days_left=(booking.balance_due_on - today).days,
        can_mark_paid=open_,
        can_extend=open_ and booking.balance_due_on < departs,
        extend_until=departs,
    )


async def mark_balance_paid(
    db: AsyncSession,
    ref: str,
    reference: str | None,
    notify: Notify | None,
    *,
    by: str | None = None,
) -> None:
    """Record the whole balance paid offline (cash, UPI, bank) and apply it like any part: the
    booking is confirmed, the invoice issued, and the customer gets the paid-in-full email."""
    try:
        booking, live = await lock_booking(db, ref)
        left = booking.total_paise - booking.paid_paise
        if booking.status != BookingStatus.PARTIALLY_PAID or left <= 0:
            raise ApiError("conflict", NOT_ON_DEPOSIT, reason="not_on_deposit")
        payment = Payment(
            booking_id=booking.id,
            provider=PaymentProvider.OFFLINE,
            amount_paise=left,
            status=PaymentStatus.CAPTURED,
            raw={"reference": reference} if reference else None,
        )
        db.add(payment)
        await db.flush()
        entry = PaymentLog(
            "payment.offline",
            BookingActor.OWNER,
            f"Balance marked paid offline · {money(left)}"
            + (f" · {reference}" if reference else ""),
            by=by,
        )
        settled = await settle_capture(db, booking, hold_live=live, amount_paise=left, entry=entry)
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    capture = Capture(settled, offline_label(reference), left, offline=True)
    await on_new_capture(
        db, ref, capture, package_id=package_id, after=f"offline balance on {ref}", notify=notify
    )


async def extend_due(db: AsyncSession, ref: str, due_on: dt.date, *, by: str | None = None) -> None:
    """Move one booking's due day later, up to its departure day (logged)."""
    try:
        booking, _ = await lock_booking(db, ref)
        if booking.status != BookingStatus.PARTIALLY_PAID or booking.balance_due_on is None:
            raise ApiError("conflict", NOT_ON_DEPOSIT, reason="not_on_deposit")
        departs = (
            await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
        ).scalar_one()
        if due_on <= booking.balance_due_on:
            raise ApiError("validation", DUE_NOT_LATER, field_errors={"dueOn": DUE_NOT_LATER})
        if due_on > departs:
            raise ApiError(
                "validation", DUE_AFTER_DEPARTURE, field_errors={"dueOn": DUE_AFTER_DEPARTURE}
            )
        before = booking.balance_due_on
        booking.balance_due_on = due_on
        history.record(
            db,
            booking.id,
            "balance.extended",
            actor=BookingActor.OWNER,
            by=by,
            text=f"Balance due day moved from {history.day(before)} to {history.day(due_on)}",
            customer=f"Your balance is now due by {history.day(due_on)}",
            before={"balanceDueOn": before.isoformat()},
            after={"balanceDueOn": due_on.isoformat()},
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


# --- the daily tidy -----------------------------------------------------------------------------


class BalanceSweep(NamedTuple):
    cancelled: int
    reminded: int


async def _reminded(db: AsyncSession, booking_id: str, stage: int, due: dt.date) -> bool:
    return (
        await db.execute(
            select(BookingEvent.id).where(
                BookingEvent.booking_id == booking_id,
                BookingEvent.kind == REMINDER,
                BookingEvent.after.contains({"stage": stage, "dueOn": due.isoformat()}),
            )
        )
    ).first() is not None


async def _claim_reminder(db: AsyncSession, ref: str, today: dt.date) -> int | None:
    """Claim today's reminder for `ref` (committed) and return its stage — or None when there is
    none to send: paid, cancelled, asked to cancel, outside the window, or already sent."""
    try:
        booking, _ = await lock_booking(db, ref)
        due = booking.balance_due_on
        stage = deposit.reminder_stage(due, today) if due else None
        asked = (
            await db.execute(select(_open_request()).where(Booking.id == booking.id))
        ).scalar_one()
        if (
            booking.status != BookingStatus.PARTIALLY_PAID
            or due is None
            or stage is None
            or asked
            or await _reminded(db, booking.id, stage, due)
        ):
            await db.rollback()
            return None
        when = "on the due day" if stage == 0 else f"{stage} days before the due day"
        history.record(
            db,
            booking.id,
            REMINDER,
            actor=BookingActor.CRON,
            text=f"Balance reminder ({when}, {history.day(due)}) · "
            f"{money(booking.total_paise - booking.paid_paise)} left",
            after={"stage": stage, "dueOn": due.isoformat()},
        )
        await db.commit()
        return stage
    except BaseException:
        await db.rollback()
        raise


async def _cancel_overdue(
    db: AsyncSession, ref: str, today: dt.date
) -> tuple[int, int, int] | None:
    """Cancel one overdue booking (committed): (paid before, refund, days out) — or None when it
    no longer qualifies (paid meanwhile, extended, or a request came in)."""
    try:
        booking, _ = await lock_booking(db, ref)
        due = booking.balance_due_on
        asked = (
            await db.execute(select(_open_request()).where(Booking.id == booking.id))
        ).scalar_one()
        if (
            booking.status != BookingStatus.PARTIALLY_PAID
            or due is None
            or today <= deposit.overdue_after(due)
            or asked
        ):
            await db.rollback()
            return None
        departs = (
            await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
        ).scalar_one()
        days_out = (departs - today).days
        paid = booking.paid_paise
        agreed = suggested_refund_paise(days_out, paid_paise=paid, total_paise=booking.total_paise)
        before = {"status": booking.status.value, "paidPaise": paid}
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id, Booking.status == BookingStatus.PARTIALLY_PAID)
            .values(
                status=BookingStatus.CANCELLED,
                cancel_reason=CancelReason.BALANCE_UNPAID,
                balance_refund_paise=agreed,
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )
        await db.refresh(booking)
        keeps = f"refunding {money(agreed)}" if agreed else "no refund under the policy"
        history.record(
            db,
            booking.id,
            "cancelled.balance_unpaid",
            actor=BookingActor.CRON,
            text=f"Cancelled by the daily tidy — the balance of "
            f"{money(booking.total_paise - paid)} was due {history.day(due)} and the grace "
            f"ended · {days_out} days before departure, {keeps}",
            customer="Cancelled — the balance wasn't paid by the end of the grace period · "
            + (f"{money(agreed)} will be refunded" if agreed else "no refund under the policy"),
            before=before,
            after={"status": BookingStatus.CANCELLED.value, "cancelReason": "balance_unpaid"},
        )
        await plan_refund(
            db, booking, await refund_owed(db, booking), reason="balance", actor=BookingActor.CRON
        )
        await db.commit()
        return paid, agreed, days_out
    except BaseException:
        await db.rollback()
        raise


async def sweep_balances(db: AsyncSession, notify: Notify, *, today: dt.date) -> BalanceSweep:
    """`/cron/daily`: cancel the overdue bookings first (so none of them is reminded), then send
    today's reminders. One booking's failure is logged and never stops the rest."""
    last_due = today - dt.timedelta(days=deposit.GRACE_DAYS + 1)
    overdue = (
        await db.execute(
            select(Booking.ref, Booking.package_id).where(
                Booking.status == BookingStatus.PARTIALLY_PAID,
                Booking.balance_due_on <= last_due,
            )
        )
    ).all()
    await db.rollback()
    cancelled = 0
    for ref, package_id in overdue:
        try:
            done = await _cancel_overdue(db, ref, today)
        except Exception as exc:
            log.exception("Could not cancel overdue booking %s", ref)
            sentry_sdk.capture_exception(exc)
            continue
        if done is None:
            continue
        cancelled += 1
        paid, agreed, days_out = done
        await send_refunds(db, ref, notify.razorpay)
        await refresh_quietly(db, {package_id}, after=f"cancelling {ref} (balance unpaid)")
        await _email(db, ref, notify, cancelled=(paid, agreed, days_out))

    window = (
        (
            await db.execute(
                select(Booking.ref).where(
                    Booking.status == BookingStatus.PARTIALLY_PAID,
                    Booking.balance_due_on >= today - dt.timedelta(days=deposit.GRACE_DAYS),
                    Booking.balance_due_on <= today + dt.timedelta(days=deposit.REMINDER_DAYS[0]),
                )
            )
        )
        .scalars()
        .all()
    )
    await db.rollback()
    reminded = 0
    for ref in window:
        try:
            stage = await _claim_reminder(db, ref, today)
        except Exception as exc:
            log.exception("Could not claim the balance reminder for %s", ref)
            sentry_sdk.capture_exception(exc)
            continue
        if stage is None:
            continue
        reminded += 1
        await _email(db, ref, notify, today=today)
    return BalanceSweep(cancelled=cancelled, reminded=reminded)


async def _email(
    db: AsyncSession,
    ref: str,
    notify: Notify,
    *,
    today: dt.date | None = None,
    cancelled: tuple[int, int, int] | None = None,
) -> None:
    """Read the booking's facts in a short transaction, then send. Never raises."""
    try:
        facts = await load_booking_facts(db, ref)
    except Exception as exc:
        log.exception("Could not load booking %s for its balance email", ref)
        sentry_sdk.capture_exception(exc)
        return
    finally:
        await db.rollback()
    if facts is None:
        return
    if cancelled is not None:
        paid, agreed, days_out = cancelled
        await send_balance_cancelled(
            notify.sender,
            notify.settings,
            facts,
            paid_before_paise=paid,
            refund_paise=agreed,
            days_out=days_out,
            tier=refund_tier(days_out),
            db=db,
        )
    elif today is not None:
        await send_balance_reminder(notify.sender, notify.settings, facts, today=today, db=db)
