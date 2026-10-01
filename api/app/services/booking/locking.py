"""`lock_booking`: the one lock order every booking write takes — the departure row, then the
booking. Its own module so the capture path (payments.py) and the refund function (refunds.py)
can both use it without importing each other."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Booking, Departure

NOT_FOUND = "We could not find that booking"


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
    return await _lock_row(db, ref, {departure_id})


async def lock_change(db: AsyncSession, ref: str, other_departure_id: str) -> tuple[Booking, bool]:
    """`lock_booking` for a date change (P7): both departures — the booking's and the one it
    moves to — in id order, so two swaps between the same pair of dates never wait on each other
    in opposite orders, then the booking."""
    departure_id = (
        await db.execute(select(Booking.departure_id).where(Booking.ref == ref))
    ).scalar_one_or_none()
    if departure_id is None:
        raise ApiError("not_found", NOT_FOUND)
    ids = sorted({departure_id, other_departure_id})
    for i in ids:
        await db.execute(select(Departure.id).where(Departure.id == i).with_for_update())
    return await _lock_row(db, ref, set(ids))


async def _lock_row(db: AsyncSession, ref: str, locked: set[str]) -> tuple[Booking, bool]:
    booking, live = (
        await db.execute(
            select(Booking, Booking.hold_expires_at > func.now())
            .where(Booking.ref == ref)
            .with_for_update(of=Booking)
            .execution_options(populate_existing=True)
        )
    ).one()
    if booking.departure_id not in locked:
        # A date change (P7) moved the booking while this waited on its old departure: take the
        # new one too, so a seat re-check below still sees every hold committed before it. Out of
        # order, but only on that race — Postgres breaks the rare deadlock it could make.
        await db.execute(
            select(Departure.id).where(Departure.id == booking.departure_id).with_for_update()
        )
    return booking, bool(live)
