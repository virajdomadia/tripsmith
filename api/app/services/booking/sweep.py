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
from app.models.enums import BookingStatus, CancellationStatus, CancelReason

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
        .execution_options(synchronize_session=False)
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
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return Swept(
        holds_expired=expired.rowcount,  # type: ignore[attr-defined]
        completed=completed.rowcount,  # type: ignore[attr-defined]
    )
