"""The bookings part of `/cron/daily` (R22, B10).

1. A pending booking whose hold lapsed over an hour ago is an abandoned checkout: `cancelled`
   with `hold_expired`. Its seats were already free (the view stops counting a lapsed hold), so
   nothing public changes. The hour is slack for a payment still in flight; one that lands later
   anyway is still honoured — `settle_capture` treats `hold_expired` like a lapsed pending
   booking and confirms it if the seats are free.
   A counter booking held by a Razorpay Payment Link (P18b) is swept the same way, and its
   history says the link expired and when; the departures such links held are returned for
   P6's waitlist, which will offer those seats on.
2. A confirmed booking whose departure date has passed (IST) is `completed` — the state B13's
   review form waits for. Seats are unchanged: the view counts completed bookings too. A booking
   whose cancellation request is still open is skipped (B11): it stays confirmed until the owner
   decides — approving cancels it, rejecting lets the next night's sweep complete it.

Each is one guarded UPDATE. A capture in progress holds the booking's row lock; the UPDATE waits
for it and then re-checks its WHERE, so a booking confirmed a moment earlier is never swept.
"""

import datetime as dt
from typing import NamedTuple

from sqlalchemy import ColumnElement, exists, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingCancellation, Departure, Payment
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentStatus,
)
from app.services.booking import history
from app.services.email.links import ist_moment

LAPSED_FOR = text("interval '1 hour'")


class Swept(NamedTuple):
    holds_expired: int
    completed: int
    links_expired: int = 0
    freed_departures: tuple[str, ...] = ()  # P18b → P6: seats an expired link gave back


def _link_open() -> ColumnElement[bool]:
    return exists().where(
        Payment.booking_id == Booking.id,
        Payment.razorpay_link_id.is_not(None),
        Payment.status == PaymentStatus.CREATED,
    )


async def sweep_bookings(db: AsyncSession, *, today: dt.date) -> Swept:
    links = await db.execute(
        update(Booking)
        .where(
            Booking.status == BookingStatus.PENDING,
            Booking.hold_expires_at < func.now() - LAPSED_FOR,
            _link_open(),
        )
        .values(
            status=BookingStatus.CANCELLED,
            cancel_reason=CancelReason.HOLD_EXPIRED,
            updated_at=func.now(),
        )
        .returning(Booking.id, Booking.departure_id, Booking.hold_expires_at)
        .execution_options(synchronize_session=False)
    )
    link_rows = links.all()
    for booking_id, _departure, lapsed in link_rows:
        history.record(
            db,
            booking_id,
            "link.expired",
            actor=BookingActor.CRON,
            text=f"Payment link expired unpaid at {ist_moment(lapsed)} — seats released, "
            "booking cancelled by the daily tidy",
            customer="The payment link expired unpaid — the held seats were released",
            before={"status": BookingStatus.PENDING.value},
            after={"status": BookingStatus.CANCELLED.value, "cancelReason": "hold_expired"},
        )
    expired = await db.execute(
        update(Booking)
        .where(
            Booking.status == BookingStatus.PENDING,
            Booking.hold_expires_at < func.now() - LAPSED_FOR,
        )
        .values(
            status=BookingStatus.CANCELLED,
            cancel_reason=CancelReason.HOLD_EXPIRED,
            updated_at=func.now(),
        )
        .returning(Booking.id)
        .execution_options(synchronize_session=False)
    )
    expired_ids = list(expired.scalars())
    history.record_each(
        db,
        expired_ids,
        "hold.expired",
        actor=BookingActor.CRON,
        text="Cancelled by the daily tidy — the checkout was abandoned",
        customer="Not paid in time — the held seats were released",
        before={"status": BookingStatus.PENDING.value},
        after={"status": BookingStatus.CANCELLED.value, "cancelReason": "hold_expired"},
    )
    completed = await db.execute(
        update(Booking)
        .where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.departure_id.in_(select(Departure.id).where(Departure.date < today)),
            ~exists().where(
                BookingCancellation.booking_id == Booking.id,
                BookingCancellation.status == CancellationStatus.REQUESTED,
            ),
        )
        .values(status=BookingStatus.COMPLETED, updated_at=func.now())
        .returning(Booking.id)
        .execution_options(synchronize_session=False)
    )
    completed_ids = list(completed.scalars())
    history.record_each(
        db,
        completed_ids,
        "trip.completed",
        actor=BookingActor.CRON,
        text="Departed — marked completed by the daily tidy",
        customer="Trip completed — welcome back",
        before={"status": BookingStatus.CONFIRMED.value},
        after={"status": BookingStatus.COMPLETED.value},
    )
    await db.commit()
    return Swept(
        holds_expired=len(expired_ids) + len(link_rows),
        completed=len(completed_ids),
        links_expired=len(link_rows),
        freed_departures=tuple(sorted({str(d) for _, d, _ in link_rows})),
    )
