"""Which GST documents a booking has, and issuing their numbers (R51, P13b).

A booking has:
- a **receipt** (`RC/…`) for every payment that brought money in;
- a **tax invoice** (`TS/…`) once it has been paid in full and taken up its seats — confirmed,
  completed, or cancelled by an approved request after it was (a late capture with no seats, or
  a hold released before it was paid, never bought anything, so nothing is invoiced). Its total
  is the booking's price, which is what was paid in full;
- a **credit note** (`CN/…`) for each processed refund that gives back part of an invoiced
  supply (a cancellation, a cheaper date, an unpaid balance). A refund of money the booking
  never needed (`surplus`, `seats_gone`) is not a credit against the invoice, and the credits
  together never exceed the invoice: a refund that also returns money paid beyond the price
  (an approved cancellation's surplus, a pre-P13 hand refund) is credited only up to what is
  left of the invoice.

Numbers are issued at the event, in its own transaction: `issue_due` runs where a payment is
captured (the receipt, and the invoice once paid in full) and where a refund is processed (the
credit note), inside a savepoint so a GST fault can never undo money. A document the event
missed (a booking from before this row) is issued on first download by `issue`. Either way the
(kind, FY) counter row is incremented in the transaction that inserts the document, under the
booking lock: a rollback returns the number, so numbers never skip or repeat under concurrency.
The FY and date are the event's (the capture, the full payment, the refund), in IST.
"""

import datetime as dt
import logging
from dataclasses import dataclass
from typing import Any, Literal

import sentry_sdk
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Booking, GstDocument, Payment, Refund
from app.models.enums import BookingStatus, CancelReason, PaymentStatus, RefundStatus
from app.schemas.account import GstDocumentOut
from app.services.booking.locking import lock_booking
from app.services.email.render import IST
from app.services.gst.tax import fy_of

Kind = Literal["receipt", "invoice", "credit_note"]
PREFIX: dict[str, str] = {"receipt": "RC", "invoice": "TS", "credit_note": "CN"}
TITLE: dict[str, str] = {
    "receipt": "Payment receipt",
    "invoice": "Tax invoice",
    "credit_note": "Credit note",
}
HOLDS_MONEY = (PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)
NOT_A_CREDIT = ("surplus", "seats_gone")  # money the booking never needed
NO_DOCUMENT = "This booking has no such document"

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DocRef:
    """One document a booking has — issued (`number` set) or not yet."""

    key: str  # receipt-<payment id> | invoice | credit-<refund id>
    kind: Kind
    amount_paise: int
    dated: dt.date
    number: str | None = None
    payment_id: str | None = None
    refund_id: str | None = None

    @property
    def title(self) -> str:
        return TITLE[self.kind]


def captured_at(p: Payment) -> dt.datetime:
    """When the payment's money arrived: `updated_at` while captured (P13 refunds never touch the
    payment row), the time kept in `raw.refund.capturedAt` on a pre-P13 hand-refunded one."""
    info: Any = (p.raw or {}).get("refund")
    if p.status == PaymentStatus.REFUNDED and isinstance(info, dict):
        value = info.get("capturedAt")
        if isinstance(value, str):
            try:
                return dt.datetime.fromisoformat(value)
            except ValueError:
                pass
    return p.updated_at


def _ist(moment: dt.datetime) -> dt.date:
    return moment.astimezone(IST).date()


def invoiced_on(booking: Booking, payments: list[Payment]) -> dt.date | None:
    """The IST day the booking was paid in full, if it took up its seats; else None."""
    took_seats = booking.status in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED) or (
        booking.status == BookingStatus.CANCELLED
        and booking.cancel_reason == CancelReason.CANCELLATION_APPROVED
    )
    if not took_seats:
        return None
    paid = 0
    for p in sorted(payments, key=captured_at):
        paid += p.amount_paise
        if paid >= booking.total_paise:
            return _ist(captured_at(p))
    return None


async def available(db: AsyncSession, booking: Booking) -> list[DocRef]:
    """Every document the booking has, in the order they happened (receipts, the invoice, credit
    notes), each with its number once issued."""
    payments = list(
        (
            await db.execute(
                select(Payment).where(
                    Payment.booking_id == booking.id, Payment.status.in_(HOLDS_MONEY)
                )
            )
        ).scalars()
    )
    issued = {
        (d.kind, d.payment_id or d.refund_id): d
        for d in (
            await db.execute(select(GstDocument).where(GstDocument.booking_id == booking.id))
        ).scalars()
    }
    out: list[DocRef] = []
    for p in sorted(payments, key=captured_at):
        d = issued.get(("receipt", p.id))
        out.append(
            DocRef(
                key=f"receipt-{p.id}",
                kind="receipt",
                amount_paise=d.amount_paise if d else p.amount_paise,
                dated=d.dated if d else _ist(captured_at(p)),
                number=d.number if d else None,
                payment_id=p.id,
            )
        )
    day = invoiced_on(booking, payments)
    invoice = issued.get(("invoice", None))
    if invoice is not None or day is not None:
        out.append(
            DocRef(
                key="invoice",
                kind="invoice",
                amount_paise=invoice.amount_paise if invoice else booking.total_paise,
                dated=invoice.dated if invoice else day,  # type: ignore[arg-type]
                number=invoice.number if invoice else None,
            )
        )
        refunds = (
            await db.execute(
                select(Refund)
                .where(
                    Refund.booking_id == booking.id,
                    Refund.status == RefundStatus.PROCESSED,
                    Refund.reason.not_in(NOT_A_CREDIT),
                )
                .order_by(Refund.processed_at, Refund.id)
            )
        ).scalars()
        room = invoice.amount_paise if invoice else booking.total_paise
        for r in refunds:
            d = issued.get(("credit_note", r.id))
            amount = d.amount_paise if d else min(r.amount_paise, room)
            if amount <= 0:
                continue  # the invoice is fully credited: the rest was money beyond the price
            room -= amount
            out.append(
                DocRef(
                    key=f"credit-{r.id}",
                    kind="credit_note",
                    amount_paise=amount,
                    dated=d.dated if d else _ist(r.processed_at or r.created_at),
                    number=d.number if d else None,
                    refund_id=r.id,
                )
            )
    return out


async def _next_number(db: AsyncSession, kind: str, fy: str) -> tuple[int, str]:
    """Increment the (kind, FY) counter — its row lock serialises every issuer of that kind —
    and return the sequence and the printed number. The caller's transaction owns both."""
    await db.execute(
        text(
            "INSERT INTO gst_counters (kind, fy, last) VALUES (:kind, :fy, 0) "
            "ON CONFLICT (kind, fy) DO NOTHING"
        ),
        {"kind": kind, "fy": fy},
    )
    seq = (
        await db.execute(
            text(
                "UPDATE gst_counters SET last = last + 1 WHERE kind = :kind AND fy = :fy "
                "RETURNING last"
            ),
            {"kind": kind, "fy": fy},
        )
    ).scalar_one()
    return seq, f"{PREFIX[kind]}/{fy}/{seq:04d}"


async def _issue_locked(db: AsyncSession, booking: Booking, key: str) -> DocRef:
    docs = {d.key: d for d in await available(db, booking)}
    ref = docs.get(key)
    if ref is None:
        raise ApiError("not_found", NO_DOCUMENT)
    if ref.number is not None:
        return ref
    if ref.kind == "credit_note" and docs["invoice"].number is None:
        await _issue_locked(db, booking, "invoice")  # a credit note always cites its invoice
    fy = fy_of(ref.dated)
    seq, number = await _next_number(db, ref.kind, fy)
    db.add(
        GstDocument(
            booking_id=booking.id,
            kind=ref.kind,
            fy=fy,
            seq=seq,
            number=number,
            payment_id=ref.payment_id,
            refund_id=ref.refund_id,
            amount_paise=ref.amount_paise,
            dated=ref.dated,
        )
    )
    await db.flush()
    return DocRef(
        key=ref.key,
        kind=ref.kind,
        amount_paise=ref.amount_paise,
        dated=ref.dated,
        number=number,
        payment_id=ref.payment_id,
        refund_id=ref.refund_id,
    )


async def issue(db: AsyncSession, ref: str, key: str) -> DocRef:
    """The document `key` of booking `ref`, numbered — issued now if the event missed it.
    Commits. An already-numbered document is read without taking the booking lock, so a
    re-download never queues behind a checkout on the same departure."""
    try:
        booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one_or_none()
        if booking is None:
            raise ApiError("not_found", NO_DOCUMENT)
        found = next((d for d in await available(db, booking) if d.key == key), None)
        if found is not None and found.number is not None:
            await db.rollback()
            return found
        booking, _ = await lock_booking(db, ref)
        doc = await _issue_locked(db, booking, key)
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return doc


async def issue_due(db: AsyncSession, booking: Booking) -> list[str]:
    """Number every document the booking now has and none yet — in the caller's transaction,
    which holds `lock_booking`. Returns the numbers issued, in the order the events happened."""
    issued: list[str] = []
    for d in await available(db, booking):
        if d.number is None:
            doc = await _issue_locked(db, booking, d.key)
            issued.append(doc.number or "")
    return issued


async def issue_due_safely(db: AsyncSession, booking: Booking) -> None:
    """`issue_due` inside a savepoint: a GST fault is logged and rolled back to here, never
    undoing the payment or refund around it — the document is then issued on first download."""
    try:
        async with db.begin_nested():
            await issue_due(db, booking)
    except Exception as exc:
        log.exception("GST documents for %s could not be issued now", booking.ref)
        sentry_sdk.capture_exception(exc)


async def documents_out(db: AsyncSession, booking: Booking) -> list[GstDocumentOut]:
    """The booking's documents as both booking pages list them."""
    return [
        GstDocumentOut(
            key=d.key,
            kind=d.kind,
            title=d.title,
            number=d.number,
            amount_paise=d.amount_paise,
            dated=d.dated,
        )
        for d in await available(db, booking)
    ]
