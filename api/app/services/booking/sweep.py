"""The bookings part of `/cron/daily` (R22, B10).

1. A pending booking whose hold lapsed over an hour ago is an abandoned checkout: `cancelled`
   with `hold_expired`. Its seats were already free (the view stops counting a lapsed hold), so
   nothing public changes. The hour is slack for a payment still in flight; one that lands later
   anyway is still honoured — `settle_capture` treats `hold_expired` like a lapsed pending
   booking and confirms it if the seats are free.
2. A confirmed booking whose departure date has passed (IST) is `completed` — the state B13's
   review form waits for. Seats are unchanged: the view counts completed bookings too. A booking
   whose cancellation request is still open is skipped (B11): it stays confirmed until the owner
   decides — approving cancels it, rejecting lets the next night's sweep complete it.

Each is one guarded UPDATE. A capture in progress holds the booking's row lock; the UPDATE waits
for it and then re-checks its WHERE, so a booking confirmed a moment earlier is never swept.
"""

import datetime as dt
from typing import NamedTuple

from sqlalchemy import exists, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingCancellation, Departure
from app.models.enums import BookingActor, BookingStatus, CancellationStatus, CancelReason
from app.services.booking import history

LAPSED_FOR = text("interval '1 hour'")


class Swept(NamedTuple):
    holds_expired: int
    completed: int


async def sweep_bookings(db: AsyncSession, *, today: dt.date) -> Swept:
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
    return Swept(holds_expired=len(expired_ids), completed=len(completed_ids))
