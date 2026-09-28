"""A booking's history (R54, P16): the one place anything writes to `booking_events`.

Every change to a booking calls `record` inside the transaction that makes the change, before
its commit — so an entry exists exactly when the change does: a rolled-back change leaves no
entry, and a replay that changes nothing (a second webhook, a repeated moderation) writes none.
Emails are the one exception: they go out after the change has committed, so `record_emails`
logs them in a short transaction of their own.

The table is append-only (a trigger in 0010 refuses UPDATE and DELETE). Each entry carries the
owner's wording and, when the customer may see it, the customer's (`customer`): their money and
their asks yes; Razorpay ids, offline references, refund flags, owner emails and moderation no.
"""

import contextlib
import datetime as dt
import logging
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Literal

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingEvent, User
from app.models.enums import BookingActor
from app.schemas.account import ActivityEntry
from app.schemas.admin_bookings import BookingHistory, HistoryEntry, HistoryGroup
from app.schemas.bookings import QuoteAddon
from app.services.booking.addons import from_quote, summary
from app.services.format import inr, short_name

log = logging.getLogger(__name__)

Values = dict[str, Any]

ACTOR_LABEL = {
    BookingActor.CUSTOMER: "Customer",
    BookingActor.WEBHOOK: "Razorpay",
    BookingActor.CRON: "Daily tidy",
    BookingActor.SYSTEM: "System",
}
PAYMENT_KINDS = ("order.", "payment.", "refund.")


def group_of(kind: str) -> HistoryGroup:
    if kind.startswith(PAYMENT_KINDS):
        return "payment"
    return "email" if kind.startswith("email.") else "booking"


def money(paise: int) -> str:
    return inr(paise // 100)


def travellers(n: int) -> str:
    return f"{n} traveller{'s' if n != 1 else ''}"


def addons(lines: list[QuoteAddon]) -> str:
    """ " · with Kullu river rafting (2 travellers), …" for a booking's entry — or "" (P8)."""
    return f" · with {summary(from_quote(lines))}" if lines else ""


def record(
    db: AsyncSession,
    booking_id: str,
    kind: str,
    *,
    actor: BookingActor,
    text: str,
    customer: str | None = None,
    before: Values | None = None,
    after: Values | None = None,
    by: str | None = None,
    at: dt.datetime | None = None,
) -> None:
    """Add one entry to the open transaction; it is written with the change's commit. `at`
    defaults to the moment it is written; only the seed back-dates its demo trips."""
    entry = BookingEvent(
        booking_id=booking_id,
        kind=kind,
        actor=actor,
        actor_user_id=by,
        text=text,
        customer_text=customer,
        before=before,
        after=after,
    )
    if at is not None:  # an explicit None would insert NULL instead of the server's clock
        entry.at = at
    db.add(entry)


def record_each(
    db: AsyncSession,
    booking_ids: Iterable[str],
    kind: str,
    *,
    actor: BookingActor,
    text: str,
    customer: str | None = None,
    before: Values | None = None,
    after: Values | None = None,
    by: str | None = None,
) -> None:
    """The same entry on several bookings — a sweep, or bookings linked on sign-in."""
    for booking_id in booking_ids:
        record(
            db,
            booking_id,
            kind,
            actor=actor,
            text=text,
            customer=customer,
            before=before,
            after=after,
            by=by,
        )


# --- payments -----------------------------------------------------------------------------------

VIA = {"checkout": "Checkout", "sync": "the payment check", "webhook": "Razorpay's webhook"}


@dataclass(frozen=True)
class PaymentLog:
    """How a newly applied payment reads in the history; `settle_capture` adds what it did to
    the booking (confirmed, seats gone, refund needed) and writes the entry."""

    kind: str  # payment.captured | payment.offline
    actor: BookingActor
    text: str
    by: str | None = None

    @classmethod
    def razorpay(cls, payment_id: str, amount_paise: int, via: str) -> "PaymentLog":
        """Checkout's callback and the sync on close are the customer's own browser proving
        the payment; the webhook is Razorpay's."""
        return cls(
            "payment.captured",
            BookingActor.WEBHOOK if via == "webhook" else BookingActor.CUSTOMER,
            f"Payment {payment_id} captured · {money(amount_paise)} · via {VIA[via]}",
        )


# --- emails -------------------------------------------------------------------------------------


@dataclass(frozen=True)
class EmailLine:
    """What happened to one email about a booking (`services/email/bookings.deliver`)."""

    role: str  # "customer" | "owner"
    subject: str
    outcome: Literal["sent", "held", "skipped", "off", "failed"]


def _email_entry(line: EmailLine) -> tuple[str, str, str | None]:
    """(kind, owner wording, customer wording) for one email."""
    who = "the customer" if line.role == "customer" else "the owner"
    subject = f"“{line.subject}”"
    if line.outcome == "failed":
        return "email.failed", f"Email to {who} failed: {subject}", None
    if line.outcome == "off":
        return "email.failed", f"Email to {who} not sent — email delivery is off: {subject}", None
    if line.outcome == "skipped":
        return "email.held", f"Email to the customer held back (demo or test mode): {subject}", None
    if line.outcome == "held":
        return (
            "email.held",
            f"Email to the customer held back (demo or test mode) — the owner got the copy: "
            f"{subject}",
            None,
        )
    customer = f"We emailed you: {subject}" if line.role == "customer" else None
    return "email.sent", f"Emailed {who}: {subject}", customer


async def record_emails(db: AsyncSession, ref: str, lines: list[EmailLine]) -> None:
    """Log emails that went out after a change committed, in a transaction of their own.
    Never raises: the emails have already gone."""
    if not lines:
        return
    try:
        booking_id = (
            await db.execute(select(Booking.id).where(Booking.ref == ref))
        ).scalar_one_or_none()
        if booking_id is None:
            await db.rollback()
            return
        for line in lines:
            kind, text, customer = _email_entry(line)
            record(db, booking_id, kind, actor=BookingActor.SYSTEM, text=text, customer=customer)
        await db.commit()
    except Exception as exc:
        with contextlib.suppress(Exception):
            await db.rollback()
        log.exception("Could not log the emails for booking %s", ref)
        sentry_sdk.capture_exception(exc)


# --- reads --------------------------------------------------------------------------------------


async def _entries(db: AsyncSession, booking_id: str) -> list[tuple[BookingEvent, str | None]]:
    rows = await db.execute(
        select(BookingEvent, User.name)
        .outerjoin(User, User.id == BookingEvent.actor_user_id)
        .where(BookingEvent.booking_id == booking_id)
        .order_by(BookingEvent.at, BookingEvent.id)
    )
    return [(e, name) for e, name in rows.all()]


def actor_label(actor: BookingActor, name: str | None) -> str:
    if actor == BookingActor.OWNER:
        return short_name(name) if name else "Owner"
    return ACTOR_LABEL[actor]


async def booking_history(db: AsyncSession, booking_id: str) -> BookingHistory:
    """The desk's merged timeline: every entry — changes, payments and emails — oldest first."""
    rows = await _entries(db, booking_id)
    rebuilt = [e.logged_at for e, _ in rows if e.source == "backfill"]
    return BookingHistory(
        entries=[
            HistoryEntry(
                id=e.id,
                at=e.at,
                kind=e.kind,
                group=group_of(e.kind),
                actor=e.actor,
                actor_label=actor_label(e.actor, name),
                text=e.text,
                customer_visible=e.customer_text is not None,
                before=e.before,
                after=e.after,
                rebuilt=e.source == "backfill",
                approx=e.approx,
            )
            for e, name in rows
        ],
        rebuilt_on=min(rebuilt) if rebuilt else None,
    )


async def customer_activity(db: AsyncSession, booking_id: str) -> list[ActivityEntry]:
    """My trips' "Activity": the entries written with customer wording, oldest first."""
    rows = await db.execute(
        select(BookingEvent)
        .where(BookingEvent.booking_id == booking_id, BookingEvent.customer_text.is_not(None))
        .order_by(BookingEvent.at, BookingEvent.id)
    )
    return [
        ActivityEntry(
            at=e.at,
            kind=e.kind,
            group=group_of(e.kind),
            text=e.customer_text or "",
            approx=e.approx,
        )
        for e in rows.scalars()
    ]
