"""Razorpay Payment Links for the counter (R56, P18b).

A link booking is an ordinary `pending` booking whose hold runs 24 hours — capped at 00:00 IST on
the departure day — and the link's `expire_by` is the same instant, so the seats and the link end
together. Its `payments` row (`created`) keeps the link id; the link's notes carry that row's id.

Razorpay opens the link's order only when the payer opens the link, so the order id is learned
late. Every way the money comes back writes it onto the row first and then goes through
`capture_razorpay_payment` → `settle_capture`, the one capture function, idempotent on the
payment id:

- the webhook's `payment.captured` for an order we don't know yet: the notes name the row;
- the redirect back from the paid link (`callback_url`, signed with the key secret);
- the desk's Check payment (reads the link).

A payment that lands after the hold lapsed goes through the usual late-capture seat re-check. The
daily tidy logs an expired link and frees nothing more (the view already stopped counting it).
Cancel link cancels at Razorpay first; if Razorpay says it was paid, the payment is synced
instead of releasing the seats.
"""

import datetime as dt
import logging
from typing import Any

from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.errors import ApiError
from app.infra.razorpay import LinkAlreadyPaid, Razorpay, RazorpayError
from app.models import Booking, Enquiry, EnquiryNote, Payment
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancelReason,
    EnquiryStatus,
    PaymentStatus,
)
from app.schemas.admin_bookings import AdminPaymentLink
from app.schemas.bookings import PaymentResult
from app.services.booking import history
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.freshness import refresh_quietly
from app.services.booking.locking import lock_booking
from app.services.booking.payments import (
    SETTLED_PAYMENT,
    CaptureVia,
    capture_razorpay_payment,
)
from app.services.booking.pricing import start_of_ist_day
from app.services.booking.refunds import refunding
from app.services.booking.voucher import load_booking_facts
from app.services.email.links import ist_moment, send_payment_link

LINK_HOLD = dt.timedelta(hours=24)
LINK_MIN_LEFT = dt.timedelta(hours=1)
LINK_DOWN = "Razorpay couldn't create the payment link — the seats were released; try again"
NO_LINK = "This booking has no open payment link"

log = logging.getLogger(__name__)


def link_until(departs: dt.date, now: dt.datetime) -> dt.datetime | None:
    """When a link made now would end: 24 h, but never past 00:00 IST on the departure day.
    None when that leaves under an hour — take the payment at the counter instead."""
    end = min(now + LINK_HOLD, start_of_ist_day(departs))
    return end if end - now >= LINK_MIN_LEFT else None


def link_row(booking: Booking) -> Payment | None:
    """The booking's payment link row (the newest), or None."""
    rows = [p for p in booking.payments if p.razorpay_link_id]
    return rows[-1] if rows else None


def _link_raw(p: Payment) -> dict[str, Any]:
    raw = p.raw or {}
    link = raw.get("link")
    return link if isinstance(link, dict) else {}


def link_out(booking: Booking, *, live: bool) -> AdminPaymentLink | None:
    """How the desk shows the booking's link: open (seats held), paid, expired or cancelled."""
    p = link_row(booking)
    if p is None or not p.razorpay_link_id:
        return None
    raw = _link_raw(p)
    paid = p.status in SETTLED_PAYMENT or any(
        q.status in SETTLED_PAYMENT and q.razorpay_order_id == p.razorpay_order_id
        for q in booking.payments
        if p.razorpay_order_id  # a retry after a failed attempt is a new row on the same order
    )
    if paid:
        state = "paid"
    elif booking.status == BookingStatus.PENDING and live:
        state = "open"
    elif booking.cancel_reason == CancelReason.OWNER_RELEASED:
        state = "cancelled"
    else:
        state = "expired"
    url = raw.get("shortUrl")
    return AdminPaymentLink(
        id=p.razorpay_link_id,
        url=url if isinstance(url, str) and state == "open" else None,
        amount_paise=p.amount_paise,
        expires_at=booking.hold_expires_at,
        status=state,
        can_cancel=state == "open",
        can_check=state in ("open", "expired"),
    )


async def issue_link(
    db: AsyncSession,
    ref: str,
    razorpay: Razorpay,
    *,
    amount_paise: int,
    expires: dt.datetime,
    callback_url: str,
    by: str,
    enquiry_reverts: tuple[str, str] | None = None,
) -> None:
    """Create the link for a booking the counter just held (committed, its `created` payment
    row written), outside any lock. On failure the booking is released (and a converted enquiry
    put back) and the owner gets a 502."""
    booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    row = (
        await db.execute(
            select(Payment).where(
                Payment.booking_id == booking.id, Payment.status == PaymentStatus.CREATED
            )
        )
    ).scalar_one()
    customer = {
        "name": booking.contact_name,
        "contact": f"+91{booking.contact_phone}",
        "email": booking.contact_email,
    }
    row_id, booking_id, package_id = row.id, booking.id, booking.package_id
    await db.rollback()
    try:
        entity = await razorpay.create_payment_link(
            amount_paise=amount_paise,
            reference_id=row_id,
            expire_by=int(expires.timestamp()),
            description=f"Tripsmith booking {ref}",
            customer=customer,
            notes={"booking_ref": ref, "payment_row": row_id},
            callback_url=callback_url,
        )
    except RazorpayError:
        log.exception("Payment link for booking %s failed; releasing its seats", ref)
        await _undo(db, booking_id, ref, by=by, enquiry_reverts=enquiry_reverts)
        await refresh_quietly(db, {package_id}, after=f"releasing {ref}")
        raise ApiError("internal", LINK_DOWN, status=502) from None
    try:
        await _record_link(db, row_id, booking_id, entity, amount_paise, expires, by)
    except Exception:
        # The link exists but isn't ours on record: nothing could match its payment. Stop it,
        # then release the seats as for a link that was never made.
        log.exception("Recording the payment link for %s failed; cancelling it", ref)
        await db.rollback()
        try:
            await razorpay.cancel_payment_link(entity["id"])
        except RazorpayError:
            log.exception("Could not cancel the unrecorded link %s", entity["id"])
        await _undo(db, booking_id, ref, by=by, enquiry_reverts=enquiry_reverts)
        await refresh_quietly(db, {package_id}, after=f"releasing {ref}")
        raise ApiError("internal", LINK_DOWN, status=502) from None


async def _record_link(
    db: AsyncSession,
    row_id: str,
    booking_id: str,
    entity: dict[str, Any],
    amount_paise: int,
    expires: dt.datetime,
    by: str,
) -> None:
    try:
        await db.execute(
            update(Payment)
            .where(Payment.id == row_id)
            .values(
                razorpay_link_id=entity["id"],
                raw={
                    "link": {
                        "id": entity["id"],
                        "shortUrl": entity.get("short_url"),
                        "expireBy": entity.get("expire_by"),
                    }
                },
                updated_at=func.now(),
            )
        )
        history.record(
            db,
            booking_id,
            "link.created",
            actor=BookingActor.OWNER,
            by=by,
            text=f"Payment link {entity.get('short_url')} · {history.money(amount_paise)} · "
            f"seats held until {ist_moment(expires)}",
            customer=f"A payment link for {history.money(amount_paise)} — the seats are held "
            f"until {ist_moment(expires)}",
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


async def _undo(
    db: AsyncSession,
    booking_id: str,
    ref: str,
    *,
    by: str,
    enquiry_reverts: tuple[str, str] | None,
) -> None:
    try:
        await lock_booking(db, ref)
        await db.execute(
            update(Booking)
            .where(Booking.id == booking_id, Booking.status == BookingStatus.PENDING)
            .values(
                status=BookingStatus.CANCELLED,
                cancel_reason=CancelReason.OWNER_RELEASED,
                hold_expires_at=func.least(Booking.hold_expires_at, func.now()),
                updated_at=func.now(),
            )
        )
        history.record(
            db,
            booking_id,
            "link.failed",
            actor=BookingActor.SYSTEM,
            text="Razorpay couldn't create the payment link — cancelled at once, seats freed",
        )
        if enquiry_reverts is not None:
            enquiry_id, status = enquiry_reverts
            enquiry = await db.get(Enquiry, enquiry_id, with_for_update=True)
            if enquiry is not None:
                enquiry.status = EnquiryStatus(status)
                db.add(
                    EnquiryNote(
                        enquiry_id=enquiry_id,
                        body=f"Booking {ref} released — its payment link couldn't be created",
                    )
                )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


# --- the money coming back ----------------------------------------------------------------------


async def ref_for_link_event(
    db: AsyncSession, entity: dict[str, Any], order_id: str
) -> tuple[str, str] | None:
    """The webhook met an order it doesn't know: a paid link's, if its notes name one of our link
    rows and the amount is that row's. Returns (booking ref, row id); nothing is written here —
    the capture maps the order under the booking's lock."""
    notes = entity.get("notes")
    row_id = notes.get("payment_row") if isinstance(notes, dict) else None
    amount = entity.get("amount")
    if not isinstance(row_id, str) or not row_id or not isinstance(amount, int):
        return None
    ref = (
        await db.execute(
            select(Booking.ref)
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Payment.id == row_id,
                Payment.razorpay_link_id.is_not(None),
                Payment.amount_paise == amount,
                or_(Payment.razorpay_order_id.is_(None), Payment.razorpay_order_id == order_id),
            )
        )
    ).scalar_one_or_none()
    return (ref, row_id) if ref else None


async def sync_link(
    db: AsyncSession,
    ref: str,
    razorpay: Razorpay,
    notify: Notify | None,
    *,
    via: CaptureVia = "sync",
) -> bool:
    """Ask Razorpay whether the booking's link was paid and apply each captured payment through
    the one capture path. True when something new was applied."""
    settled = aliased(Payment)
    rows = (
        await db.execute(
            select(Payment.id, Payment.razorpay_link_id)
            .join(Booking, Booking.id == Payment.booking_id)
            .where(
                Booking.ref == ref,
                Payment.razorpay_link_id.is_not(None),
                Payment.status.not_in(SETTLED_PAYMENT),
                # A failed first attempt keeps the link row; a retry paid on the same order
                # is a new row — then the link is paid, and there is nothing left to ask.
                ~exists().where(
                    settled.booking_id == Payment.booking_id,
                    settled.razorpay_order_id == Payment.razorpay_order_id,
                    settled.status.in_(SETTLED_PAYMENT),
                ),
            )
        )
    ).all()
    await db.rollback()  # no transaction held open across the call to Razorpay
    applied = False
    for row_id, link_id in rows:
        try:
            link = await razorpay.payment_link(link_id)
        except RazorpayError as exc:
            log.warning("Link sync for %s: %s", ref, exc)
            raise ApiError(
                "internal", "Couldn't reach Razorpay just now — try again", status=502
            ) from exc
        order_id = link.get("order_id")
        paid = [
            p
            for p in link.get("payments") or []
            if isinstance(p, dict) and p.get("status") == "captured"
        ]
        if not (isinstance(order_id, str) and order_id.startswith("order_")) or not paid:
            continue
        for p in paid:
            payment_id = p.get("payment_id")
            if not isinstance(payment_id, str):
                continue
            try:
                booking, capture = await capture_razorpay_payment(
                    db, ref, order_id=order_id, payment_id=payment_id, via=via, link_row=row_id
                )
                package_id = booking.package_id
                await db.commit()
            except BaseException:
                await db.rollback()
                raise
            if capture:
                applied = True
                await on_new_capture(
                    db,
                    ref,
                    capture,
                    package_id=package_id,
                    after=f"link payment on {ref}",
                    notify=notify,
                )
    return applied


async def link_callback(
    db: AsyncSession,
    ref: str,
    *,
    link_id: str,
    reference_id: str,
    status: str,
    payment_id: str,
    signature: str,
    razorpay: Razorpay,
    notify: Notify | None,
) -> None:
    """The customer's browser, back from a paid link: a signature that verifies (and a link
    that is this booking's) lets the booking sync at once, as the webhook would."""
    if not razorpay.verify_link_signature(
        link_id=link_id,
        reference_id=reference_id,
        status=status,
        payment_id=payment_id,
        signature=signature,
    ):
        log.warning("Link signature did not verify for booking %s (link %s)", ref, link_id)
        raise ApiError("validation", "We could not verify that payment")
    ours = (
        await db.execute(
            select(Payment.id)
            .join(Booking, Booking.id == Payment.booking_id)
            .where(Booking.ref == ref, Payment.razorpay_link_id == link_id)
        )
    ).scalar_one_or_none()
    if ours is None or ours != reference_id:
        raise ApiError("validation", "We could not verify that payment")
    await sync_link(db, ref, razorpay, notify, via="checkout")


async def payment_result(db: AsyncSession, ref: str) -> PaymentResult:
    booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", "No such booking")
    return PaymentResult(
        booking_ref=booking.ref,
        status=booking.status,
        refund_needed=await refunding(db, booking),
    )


# --- the owner's moves --------------------------------------------------------------------------


async def _open_link(db: AsyncSession, ref: str) -> tuple[Booking, Payment]:
    booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", "No such booking")
    row = (
        await db.execute(
            select(Payment)
            .where(
                Payment.booking_id == booking.id,
                Payment.razorpay_link_id.is_not(None),
                Payment.status.not_in(SETTLED_PAYMENT),
            )
            .order_by(Payment.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    lapsed = booking.hold_expires_at <= dt.datetime.now(dt.UTC)
    if row is None or booking.status != BookingStatus.PENDING or lapsed:
        raise ApiError("conflict", NO_LINK, reason="no_link")
    return booking, row


async def cancel_link(
    db: AsyncSession, ref: str, razorpay: Razorpay, notify: Notify | None, *, by: str
) -> None:
    """Cancel the link at Razorpay, then release the seats. Paid meanwhile → sync it instead."""
    _booking, row = await _open_link(db, ref)
    link_id = row.razorpay_link_id
    assert link_id is not None
    await db.rollback()
    try:
        await razorpay.cancel_payment_link(link_id)
    except LinkAlreadyPaid:
        await sync_link(db, ref, razorpay, notify)
        raise ApiError(
            "conflict",
            "The customer has just paid this link — the booking is confirmed instead",
            reason="link_paid",
        ) from None
    except RazorpayError as exc:
        raise ApiError(
            "internal", "Couldn't reach Razorpay just now — try again", status=502
        ) from exc
    try:
        booking, live = await lock_booking(db, ref)
        if booking.status != BookingStatus.PENDING:
            await db.rollback()
            return
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id, Booking.status == BookingStatus.PENDING)
            .values(
                status=BookingStatus.CANCELLED,
                cancel_reason=CancelReason.OWNER_RELEASED,
                hold_expires_at=func.least(Booking.hold_expires_at, func.now()),
                updated_at=func.now(),
            )
        )
        history.record(
            db,
            booking.id,
            "link.cancelled",
            actor=BookingActor.OWNER,
            by=by,
            text="Payment link cancelled — booking cancelled, seats freed",
            customer="The payment link was cancelled and the held seats released",
            before={"status": BookingStatus.PENDING.value},
            after={"status": BookingStatus.CANCELLED.value, "cancelReason": "owner_released"},
        )
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if live:
        await refresh_quietly(db, {package_id}, after=f"cancelling the link on {ref}")


async def email_link(db: AsyncSession, ref: str, notify: Notify) -> None:
    """Email the open link to the customer (the send lands in the booking's history)."""
    booking, row = await _open_link(db, ref)
    url = _link_raw(row).get("shortUrl")
    if not isinstance(url, str):
        raise ApiError("conflict", NO_LINK, reason="no_link")
    expires, amount = booking.hold_expires_at, row.amount_paise
    facts = await load_booking_facts(db, ref)
    assert facts is not None
    await send_payment_link(
        notify.sender, notify.settings, facts, url=url, amount_paise=amount, expires=expires, db=db
    )
    await db.commit()
