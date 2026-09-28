"""The one refund function (R51, P13): every rupee that goes back leaves through here.

Two steps, so a refund can never happen twice:

1. `plan_refund` — inside the caller's transaction, with the booking locked (`lock_booking`):
   split the amount across the booking's payments **newest first**, write one `refunds` row per
   payment (`requested`), take the amount off `paid_paise` and raise `refund_needed`, and log it.
   The caller commits. From here on `refund_owed` no longer counts the money, so a double click,
   a replayed webhook or a second trigger finds nothing more to refund.
2. `send_refunds` — after the commit, with no transaction open: every Razorpay row still
   `requested` and without a Razorpay id is sent, its own id as the `X-Refund-Idempotency` key.
   A retry after a lost answer gets the same refund back (checked in test mode). The answer is
   applied in a short transaction of its own (`apply_refund`), as is Razorpay's `refund.*`
   webhook later.

Where a refund can end up:
- **processed** — done.
- **failed** — Razorpay refused it (below ₹1, nothing left to refund…), or its webhook said so:
  the amount goes back onto `paid_paise`, so `refund_owed` counts it again and the desk offers
  "Send refund".
- still **requested** without a Razorpay id — Razorpay could not be reached, or the process died
  mid-call. `refund_needed` stays up, and the desk's "Send refund" (or the daily tidy) sends it
  again under the same key.
- **by hand** — an offline payment's share: `requested` until the owner records "Refund made
  (offline)".

`refund_needed` is the owner's flag: it is up while anything is owed, stuck or waiting for a
by-hand refund, and `_settle_flag` recomputes it after every step.

Amounts, never timestamps (the P0 concurrency fix): what is owed is
`agreed + max(0, captured_ever − total) − (captured_ever − paid)`, capped at `paid`.
"""

import datetime as dt
import logging
from collections.abc import Sequence
from typing import Literal

import sentry_sdk
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.razorpay import Razorpay, RazorpayError, RefundRefused
from app.models import Booking, BookingCancellation, Payment, Refund
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
    RefundStatus,
)
from app.services.booking.history import money, record
from app.services.booking.locking import lock_booking
from app.services.gst.documents import issue_due_safely

log = logging.getLogger(__name__)

Reason = Literal[
    "cancellation", "seats_gone", "surplus", "owner", "date_change", "balance", "addon"
]
# A payment holds money that can go back while it is captured; `refunded` = legacy B10/B11
# hand-recorded refunds (0012 turned each into a by-hand row, so its room is what is left).
HOLDS_MONEY = (PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)
CUSTOMER_STARTED = "Refund of {amount} started — banks take 5–7 working days to show it"
CUSTOMER_BY_HAND = "Refund of {amount} agreed — we'll hand it back the way you paid"
NOTHING_TO_SEND = "This booking has no refund to send"
NOTHING_BY_HAND = "This booking has no offline refund to record"


# --- what is owed -------------------------------------------------------------------------------


async def refund_owed(db: AsyncSession, booking: Booking) -> int:
    """What is still owed back and not yet sent. A cancellation the owner approved owes the
    refund agreed then (a policy tier may keep part) plus any money beyond the price in full; any
    other cancelled booking everything it holds; a live one only what it holds beyond its total
    (a second payment). A refund in flight or done is already off `paid_paise`; a failed one is
    back on it."""
    agreed = (
        await db.execute(
            select(BookingCancellation.refund_paise).where(
                BookingCancellation.booking_id == booking.id,
                BookingCancellation.status == CancellationStatus.APPROVED,
            )
        )
    ).one_or_none()
    if booking.cancel_reason == CancelReason.CANCELLATION_APPROVED and agreed is not None:
        # Everything owed since the approval, less what was already given back: the refund
        # agreed, plus in full any money captured beyond the booking's price (a second
        # payment has no seat behind it, whenever it landed). Amounts, not timestamps: a
        # capture racing the approval is stamped with its transaction's start, which can
        # fall on either side of the approval's.
        ever = (
            await db.execute(
                select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(
                    Payment.booking_id == booking.id, Payment.status.in_(HOLDS_MONEY)
                )
            )
        ).scalar_one()
        given_back = ever - booking.paid_paise
        surplus = max(0, ever - booking.total_paise)
        return min(booking.paid_paise, max(0, (agreed[0] or 0) + surplus - given_back))
    elif booking.status == BookingStatus.CANCELLED:
        return booking.paid_paise
    else:
        return max(0, booking.paid_paise - booking.total_paise)


async def refunding(db: AsyncSession, booking: Booking) -> bool:
    """The customer's view: is money going back to them — owed, on its way, or already back?
    (`refund_needed` alone drops once Razorpay processes the refund, and a replayed Checkout
    callback must still read "we couldn't hold your seat, your money comes back".)"""
    if booking.refund_needed:
        return True
    return (
        await db.execute(
            select(func.count())
            .select_from(Refund)
            .where(Refund.booking_id == booking.id, Refund.status != RefundStatus.FAILED)
        )
    ).scalar_one() > 0


def reason_for(booking: Booking) -> Reason:
    """Why a booking owes money back, for the refund rows the desk's "Send refund" writes."""
    if booking.cancel_reason == CancelReason.CANCELLATION_APPROVED:
        return "cancellation"
    if booking.cancel_reason == CancelReason.SEATS_GONE:
        return "seats_gone"
    return "surplus"


RESENT_AS_IS: tuple[Reason, ...] = ("addon", "owner", "date_change", "balance")


async def _resend_reason(db: AsyncSession, booking: Booking) -> Reason:
    """The reason for money the desk sends again after a failure: the failed refund's own when
    it was one that credits an invoice (P8b: an add-on taken off keeps its credit note), else
    what the booking's state says."""
    failed = (
        await db.execute(
            select(Refund.reason)
            .where(
                Refund.booking_id == booking.id,
                Refund.status == RefundStatus.FAILED,
                Refund.reason.in_(RESENT_AS_IS),
            )
            .order_by(Refund.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    for reason in RESENT_AS_IS:
        if failed == reason:
            return reason
    return reason_for(booking)


async def _room(db: AsyncSession, booking_id: str) -> list[tuple[Payment, int]]:
    """The booking's payments that still hold money, newest first, each with what is left to
    refund on it: its amount less every refund of it that has not failed."""
    given = (
        select(func.coalesce(func.sum(Refund.amount_paise), 0))
        .where(Refund.payment_id == Payment.id, Refund.status != RefundStatus.FAILED)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(Payment, Payment.amount_paise - given)
        .where(Payment.booking_id == booking_id, Payment.status.in_(HOLDS_MONEY))
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .with_for_update(of=Payment)
    )
    return [(p, int(left)) for p, left in rows.all() if left > 0]


async def refundable_by_payment(db: AsyncSession, booking_id: str) -> dict[str, int]:
    """Payment id → what can still go back from it (the desk's split preview)."""
    given = (
        select(func.coalesce(func.sum(Refund.amount_paise), 0))
        .where(Refund.payment_id == Payment.id, Refund.status != RefundStatus.FAILED)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(Payment.id, Payment.amount_paise - given).where(
            Payment.booking_id == booking_id, Payment.status.in_(HOLDS_MONEY)
        )
    )
    return {pid: max(0, int(left)) for pid, left in rows.all()}


# --- step 1: plan (inside the caller's transaction) --------------------------------------------


async def plan_refund(
    db: AsyncSession,
    booking: Booking,
    amount_paise: int,
    *,
    reason: Reason,
    actor: BookingActor,
    by: str | None = None,
    note: str | None = None,
) -> list[Refund]:
    """Write the refund rows for `amount_paise`, newest payment first, and take the amount off
    what the booking holds. The caller holds `lock_booking`, commits, and then calls
    `send_refunds`. Returns the rows (none for ₹0 — the flag is then settled, so a booking
    flagged with nothing left to give back does not stay flagged)."""
    if amount_paise <= 0:
        await _settle_flag(db, booking)
        return []
    left = amount_paise
    rows: list[Refund] = []
    for payment, room in await _room(db, booking.id):
        take = min(room, left)
        rows.append(
            Refund(
                booking_id=booking.id,
                payment_id=payment.id,
                amount_paise=take,
                reason=reason,
                by_hand=payment.provider == PaymentProvider.OFFLINE,
                requested_by=by,
                note=note,
            )
        )
        left -= take
        if left == 0:
            break
    if left > 0:
        # refund_owed never exceeds paid_paise, and paid_paise never exceeds what the payments
        # hold, so this is a bug — refuse rather than write a refund nobody can make.
        raise ApiError(
            "conflict",
            f"Only {money(amount_paise - left)} of {money(amount_paise)} can be refunded",
            reason="refund_exceeds_payments",
        )
    db.add_all(rows)
    await db.flush()
    before = {"paidPaise": booking.paid_paise, "refundNeeded": booking.refund_needed}
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(
            paid_paise=Booking.paid_paise - amount_paise,
            refund_needed=True,
            updated_at=func.now(),
        )
        .execution_options(synchronize_session=False)
    )
    await db.refresh(booking)
    online = sum(r.amount_paise for r in rows if not r.by_hand)
    offline = amount_paise - online
    parts = [
        f"{money(r.amount_paise)} from {'an offline payment' if r.by_hand else 'Razorpay'}"
        for r in rows
    ]
    record(
        db,
        booking.id,
        "refund.requested",
        actor=actor,
        by=by,
        text=f"Refund of {money(amount_paise)} started · "
        + " + ".join(parts)
        + (f" · {money(offline)} to hand back offline" if offline else ""),
        customer=(CUSTOMER_STARTED if online else CUSTOMER_BY_HAND).format(
            amount=money(amount_paise)
        ),
        before=before,
        after={"paidPaise": booking.paid_paise, "refundNeeded": True},
    )
    return rows


# --- step 2: send (after the commit) ------------------------------------------------------------


async def send_refunds(db: AsyncSession, ref: str, razorpay: Razorpay | None) -> None:
    """Send every Razorpay refund of the booking that is still `requested` without a Razorpay
    id, and apply each answer. No transaction is held across a call. Never raises: each row is
    already committed, and one that does not go through stays flagged for the desk."""
    try:
        pending = (
            await db.execute(
                select(Refund.id, Refund.amount_paise, Payment.razorpay_payment_id)
                .join(Payment, Payment.id == Refund.payment_id)
                .join(Booking, Booking.id == Refund.booking_id)
                .where(
                    Booking.ref == ref,
                    Refund.status == RefundStatus.REQUESTED,
                    Refund.by_hand.is_(False),
                    Refund.razorpay_refund_id.is_(None),
                )
                .order_by(Refund.created_at, Refund.id)
            )
        ).all()
        await db.rollback()
    except Exception as exc:
        await _swallow(db, exc, f"Could not read the refunds of {ref}")
        return
    for refund_id, amount, payment_id in pending:
        if razorpay is None or payment_id is None:
            await _note_error(db, ref, refund_id, "Razorpay isn't set up on this server")
            continue
        try:
            entity = await razorpay.refund(
                payment_id,
                amount_paise=amount,
                key=refund_id,
                notes={"booking_ref": ref, "refund_id": refund_id},
            )
        except RefundRefused as exc:
            log.warning("Refund %s on %s refused: %s", refund_id, ref, exc.description)
            await _refused(db, razorpay, ref, refund_id, payment_id, exc.description)
            continue
        except RazorpayError as exc:
            log.warning("Refund %s on %s not sent: %s", refund_id, ref, exc)
            await _note_error(db, ref, refund_id, "Couldn't reach Razorpay")
            continue
        except Exception as exc:  # never raise: the rows are committed and flagged
            log.exception("Refund %s on %s: unexpected error", refund_id, ref)
            sentry_sdk.capture_exception(exc)
            await _note_error(db, ref, refund_id, "Couldn't reach Razorpay")
            continue
        else:
            await apply_refund(
                db,
                refund_id,
                status=_status_of(entity.get("status")),
                razorpay_refund_id=str(entity["id"]),
                raw=entity,
                error=failure_reason(entity),
                actor=BookingActor.SYSTEM,
            )


async def _refused(
    db: AsyncSession,
    razorpay: Razorpay,
    ref: str,
    refund_id: str,
    payment_id: str,
    description: str,
) -> None:
    """A 4xx is believed only once Razorpay's own list shows no refund under our key: "fully
    refunded already" or "more than captured" can be our earlier call that landed (its answer
    lost, or its key expired before a retry). Unsure → the row stays queued."""
    try:
        made = await razorpay.find_refund(payment_id, refund_id)
    except RazorpayError as exc:
        log.warning("Refund %s on %s: could not check the refusal: %s", refund_id, ref, exc)
        await _note_error(db, ref, refund_id, "Couldn't reach Razorpay")
        return
    if made is not None:
        await apply_refund(
            db,
            refund_id,
            status=_status_of(made.get("status")),
            razorpay_refund_id=str(made.get("id")),
            raw=made,
            error=failure_reason(made),
            actor=BookingActor.SYSTEM,
        )
        return
    await apply_refund(
        db, refund_id, status=RefundStatus.FAILED, error=description, actor=BookingActor.SYSTEM
    )


def _status_of(value: object) -> RefundStatus:
    """Razorpay's refund status → ours: `pending` (live mode's usual first answer) and `created`
    stay requested until the webhook moves them on."""
    if value == "processed":
        return RefundStatus.PROCESSED
    if value == "failed":
        return RefundStatus.FAILED
    return RefundStatus.REQUESTED


def failure_reason(entity: dict[str, object], *, failed: bool = False) -> str | None:
    """Razorpay's words for why a refund failed; None unless it did."""
    if not failed and entity.get("status") != "failed":
        return None
    for key in ("error_description", "status_details"):
        value = entity.get(key)
        if isinstance(value, str) and value:
            return value
        if isinstance(value, dict) and isinstance(value.get("description"), str):
            return value["description"]
    return "Razorpay could not complete the refund"


async def apply_refund(
    db: AsyncSession,
    refund_id: str,
    *,
    status: RefundStatus,
    actor: BookingActor,
    razorpay_refund_id: str | None = None,
    raw: dict[str, object] | None = None,
    error: str | None = None,
) -> bool:
    """Move one refund on from `requested` — Razorpay's answer to the call, or its webhook.
    Idempotent: a refund already processed or failed is left as it is (a replayed webhook, or
    the webhook racing the call's answer) — except a row we failed on a refusal before it ever
    had a Razorpay id: if Razorpay then reports that refund made, the money did leave, so the
    row comes back (off `paid_paise` again) rather than being refunded a second time. Returns
    whether anything changed. Never raises."""
    try:
        ref = (
            await db.execute(
                select(Booking.ref)
                .join(Refund, Refund.booking_id == Booking.id)
                .where(Refund.id == refund_id)
            )
        ).scalar_one_or_none()
        if ref is None:
            await db.rollback()
            return False
        booking, _ = await lock_booking(db, ref)
        row = (
            await db.execute(
                select(Refund)
                .where(Refund.id == refund_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        changed = False
        if (
            row.status == RefundStatus.FAILED
            and row.razorpay_refund_id is None
            and razorpay_refund_id
            and status != RefundStatus.FAILED
        ):
            await _revive(db, booking, row, razorpay_refund_id, status, actor)
            changed = True
        elif razorpay_refund_id and row.razorpay_refund_id is None:
            row.razorpay_refund_id = razorpay_refund_id
            row.error = None  # it reached Razorpay after all
            changed = True
        if row.status == RefundStatus.REQUESTED:
            if raw is not None:
                row.raw = dict(raw)
            if status != RefundStatus.REQUESTED:
                row.status = status
                row.error = error if status == RefundStatus.FAILED else None
                changed = True
                if status == RefundStatus.PROCESSED:
                    row.processed_at = func.now()
                    _log_processed(db, booking, row, actor)
                else:
                    # The money never left: put it back, so refund_owed counts it again.
                    before = {"paidPaise": booking.paid_paise}
                    await db.execute(
                        update(Booking)
                        .where(Booking.id == booking.id)
                        .values(paid_paise=Booking.paid_paise + row.amount_paise)
                        .execution_options(synchronize_session=False)
                    )
                    await db.refresh(booking)
                    _log_failed(db, booking, row, actor, before)
        elif status not in (RefundStatus.REQUESTED, row.status):
            log.warning(
                "Refund %s is %s; ignoring a later %s", refund_id, row.status.value, status.value
            )
        await db.flush()
        await _settle_flag(db, booking)
        if changed and row.status == RefundStatus.PROCESSED:
            await issue_due_safely(db, booking)  # P13b: its credit note, if it credits one
        await db.commit()
        return changed
    except Exception as exc:
        await _swallow(db, exc, f"Could not apply refund {refund_id}")
        return False


async def _revive(
    db: AsyncSession,
    booking: Booking,
    row: Refund,
    razorpay_refund_id: str,
    status: RefundStatus,
    actor: BookingActor,
) -> None:
    """A refund we had marked failed that Razorpay did make: the money left after all."""
    before = {"paidPaise": booking.paid_paise}
    row.razorpay_refund_id = razorpay_refund_id
    row.status = status
    row.error = None
    if status == RefundStatus.PROCESSED:
        row.processed_at = func.now()
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(paid_paise=Booking.paid_paise - row.amount_paise)
        .execution_options(synchronize_session=False)
    )
    await db.refresh(booking)
    record(
        db,
        booking.id,
        "refund.processed" if status == RefundStatus.PROCESSED else "refund.requested",
        actor=actor,
        text=f"Razorpay made the {money(row.amount_paise)} refund we had marked failed · "
        f"{razorpay_refund_id}",
        customer=f"Refund of {money(row.amount_paise)} processed — it's on its way to your "
        "original payment method",
        before=before,
        after={"paidPaise": booking.paid_paise},
    )


async def _note_error(db: AsyncSession, ref: str, refund_id: str, error: str) -> None:
    """The call did not reach Razorpay (or got no clear answer): the row stays `requested` for a
    retry under the same key; the first such error per row is logged for the owner."""
    try:
        booking, _ = await lock_booking(db, ref)
        row = (
            await db.execute(
                select(Refund)
                .where(Refund.id == refund_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        if row.status == RefundStatus.REQUESTED and row.razorpay_refund_id is None:
            if row.error is None:
                record(
                    db,
                    booking.id,
                    "refund.error",
                    actor=BookingActor.SYSTEM,
                    text=f"{error} for the {money(row.amount_paise)} refund — it stays queued; "
                    "send it again from the desk",
                )
            row.error = error
        await db.commit()
    except Exception as exc:
        await _swallow(db, exc, f"Could not note the error on refund {refund_id}")


async def _settle_flag(db: AsyncSession, booking: Booking) -> None:
    """`refund_needed` = the owner has something to do: money owed and not sent, a Razorpay
    refund that never reached Razorpay, or an offline refund to hand back."""
    waiting = (
        await db.execute(
            select(func.count())
            .select_from(Refund)
            .where(
                Refund.booking_id == booking.id,
                Refund.status == RefundStatus.REQUESTED,
                or_(Refund.by_hand.is_(True), Refund.razorpay_refund_id.is_(None)),
            )
        )
    ).scalar_one()
    needed = waiting > 0 or await refund_owed(db, booking) > 0
    if needed != booking.refund_needed:
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id)
            .values(refund_needed=needed, updated_at=func.now())
            .execution_options(synchronize_session=False)
        )
        await db.refresh(booking)


def _log_processed(db: AsyncSession, booking: Booking, row: Refund, actor: BookingActor) -> None:
    record(
        db,
        booking.id,
        "refund.processed",
        actor=actor,
        text=f"Refund of {money(row.amount_paise)} processed by Razorpay"
        + (f" · {row.razorpay_refund_id}" if row.razorpay_refund_id else ""),
        customer=f"Refund of {money(row.amount_paise)} processed — it's on its way to your "
        "original payment method",
    )


def _log_failed(
    db: AsyncSession, booking: Booking, row: Refund, actor: BookingActor, before: dict[str, int]
) -> None:
    record(
        db,
        booking.id,
        "refund.failed",
        actor=actor,
        text=f"Refund of {money(row.amount_paise)} failed"
        + (f": {row.error}" if row.error else "")
        + " — send it again from the desk",
        customer=f"A refund of {money(row.amount_paise)} didn't go through — we'll send it again",
        before=before,
        after={"paidPaise": booking.paid_paise},
    )


async def _swallow(db: AsyncSession, exc: Exception, what: str) -> None:
    try:
        await db.rollback()
    except Exception:  # noqa: S110 — the original error is the one worth reporting
        pass
    log.exception(what)
    sentry_sdk.capture_exception(exc)


# --- the owner's buttons ------------------------------------------------------------------------


async def send_owed(
    db: AsyncSession,
    ref: str,
    razorpay: Razorpay | None,
    *,
    by: str | None,
    note: str | None = None,
) -> None:
    """The desk's "Send refund": refund whatever is owed now (after a failure, or a booking
    flagged before P13) and resend anything stuck under its own key. A double click finds
    nothing owed the second time, and the resend is idempotent."""
    try:
        booking, _ = await lock_booking(db, ref)
        owed = await refund_owed(db, booking)
        stuck = (
            await db.execute(
                select(func.count())
                .select_from(Refund)
                .where(
                    Refund.booking_id == booking.id,
                    Refund.status == RefundStatus.REQUESTED,
                    Refund.by_hand.is_(False),
                    Refund.razorpay_refund_id.is_(None),
                )
            )
        ).scalar_one()
        if owed <= 0 and stuck == 0:
            if booking.refund_needed:  # flagged with nothing left to give back: clear it
                await _settle_flag(db, booking)
                await db.commit()
                if not booking.refund_needed:
                    return
            raise ApiError("conflict", NOTHING_TO_SEND, reason="no_refund")
        await plan_refund(
            db,
            booking,
            owed,
            reason=await _resend_reason(db, booking),
            actor=BookingActor.OWNER,
            by=by,
            note=note,
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    await send_refunds(db, ref, razorpay)


async def record_by_hand(db: AsyncSession, ref: str, note: str | None, *, by: str | None) -> int:
    """ "Refund made (offline)": the owner handed back an offline payment's share. Every by-hand
    refund still waiting becomes processed. Returns the amount recorded."""
    try:
        booking, _ = await lock_booking(db, ref)
        rows: Sequence[Refund] = (
            (
                await db.execute(
                    select(Refund)
                    .where(
                        Refund.booking_id == booking.id,
                        Refund.status == RefundStatus.REQUESTED,
                        Refund.by_hand.is_(True),
                    )
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            raise ApiError("conflict", NOTHING_BY_HAND, reason="no_refund")
        now = dt.datetime.now(dt.UTC)
        total = 0
        for row in rows:
            row.status = RefundStatus.PROCESSED
            row.processed_at = now
            row.note = note or row.note
            total += row.amount_paise
        record(
            db,
            booking.id,
            "refund.recorded",
            actor=BookingActor.OWNER,
            by=by,
            text=f"Refund of {money(total)} handed back offline" + (f" · {note}" if note else ""),
            customer=f"Refund of {money(total)} made",
        )
        await db.flush()
        await _settle_flag(db, booking)
        await issue_due_safely(db, booking)  # P13b: credit notes for what went back
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return total


async def resend_stale(db: AsyncSession, razorpay: Razorpay | None, *, older_than_min: int) -> int:
    """The daily tidy's safety net: resend Razorpay refunds stuck `requested` without a Razorpay
    id (a process that died mid-call). Same key each time, so nothing is refunded twice."""
    refs = (
        (
            await db.execute(
                select(Booking.ref)
                .join(Refund, Refund.booking_id == Booking.id)
                .where(
                    Refund.status == RefundStatus.REQUESTED,
                    Refund.by_hand.is_(False),
                    Refund.razorpay_refund_id.is_(None),
                    Refund.created_at < func.now() - dt.timedelta(minutes=older_than_min),
                )
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    await db.rollback()
    for ref in refs:
        await send_refunds(db, ref, razorpay)
    return len(refs)


async def refund(
    db: AsyncSession,
    ref: str,
    amount_paise: int,
    *,
    reason: Reason,
    actor: BookingActor,
    razorpay: Razorpay | None,
    by: str | None = None,
    note: str | None = None,
) -> list[str]:
    """Plan, commit and send in one call — for later rows' triggers (a cheaper date change, an
    unpaid balance) that are not already inside a booking transaction. Returns the row ids."""
    try:
        booking, _ = await lock_booking(db, ref)
        rows = await plan_refund(
            db, booking, amount_paise, reason=reason, actor=actor, by=by, note=note
        )
        ids = [r.id for r in rows]
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    await send_refunds(db, ref, razorpay)
    return ids
