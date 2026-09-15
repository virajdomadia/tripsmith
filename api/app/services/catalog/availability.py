"""Upcoming-departure availability (seats from the `departure_availability` view)."""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure
from app.models.catalog import departure_availability


@dataclass
class Availability:
    """Satisfies `pricing.DepartureLike`."""

    seats_left: int
    guaranteed: bool
    price_double_paise: int


async def next_departures(db: AsyncSession, today: dt.date) -> dict[str, Availability]:
    """The earliest departure on/after `today` per package id — the card badge's source."""
    rows = await db.execute(
        select(
            Departure.package_id,
            Departure.guaranteed,
            Departure.price_double_paise,
            departure_availability.c.seats_left,
        )
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.date >= today)
        .order_by(Departure.package_id, Departure.date)
    )
    out: dict[str, Availability] = {}
    for package_id, guaranteed, price, seats_left in rows:
        out.setdefault(package_id, Availability(seats_left, guaranteed, price))
    return out
