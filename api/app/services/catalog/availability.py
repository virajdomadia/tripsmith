"""Upcoming-departure availability (seats from the `departure_availability` view)."""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure
from app.models.catalog import departure_availability
from app.services.catalog import urgency


@dataclass
class Availability:
    """Satisfies `pricing.DepartureLike`."""

    seats_left: int
    guaranteed: bool
    price_double_paise: int
    likely: bool = False  # P2: passes "Likely to sell out" (urgency.likely_to_sell_out)


async def next_departures(db: AsyncSession, today: dt.date) -> dict[str, Availability]:
    """Per package id, the earliest departure on/after `today` that still has seats — the card
    badge's source. A sold-out first date must not badge the card while a later one is open;
    only when every upcoming departure is full does the earliest (sold-out) one stand in."""
    rows = await db.execute(
        select(
            Departure.id,
            Departure.package_id,
            Departure.guaranteed,
            Departure.price_double_paise,
            departure_availability.c.seats_left,
        )
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.date >= today)
        .order_by(Departure.package_id, Departure.date)
    )
    open_: dict[str, tuple[str, Availability]] = {}
    earliest: dict[str, tuple[str, Availability]] = {}
    for departure_id, package_id, guaranteed, price, seats_left in rows:
        availability = Availability(seats_left, guaranteed, price)
        earliest.setdefault(package_id, (departure_id, availability))
        if seats_left > 0:
            open_.setdefault(package_id, (departure_id, availability))
    chosen = earliest | open_
    likely = await urgency.likely_to_sell_out(db, [id for id, _ in chosen.values()], today)
    return {
        package_id: Availability(a.seats_left, a.guaranteed, a.price_double_paise, id in likely)
        for package_id, (id, a) in chosen.items()
    }
