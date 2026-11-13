"""From chat to the Book-now sheet (v3 C3, R27 `startBooking`).

The concierge never takes payment: it checks the date can be booked for the party (the v2 quote,
no side effects) and hands back the package page's URL that opens the v2 Book-now sheet with the
date and party pre-filled — the same `?date=…&double=…#book` form the "still thinking" email
uses (R53, web/src/lib/booking.ts `prefillFromSearch`). The model's `startBooking` and the "Book"
buttons on a chat's departure list both come through `start_booking`, so a refusal reads the same
either way and both mark the conversation `booking_started`.
"""

import datetime as dt
from dataclasses import dataclass
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package
from app.models.enums import Occupancy
from app.schemas.bookings import QuoteRequest, QuoteTraveller
from app.services.booking.orders import quote_booking


@dataclass(frozen=True)
class Rooms:
    double: int = 0
    triple: int = 0
    single: int = 0

    @property
    def adults(self) -> int:
        return self.double * 2 + self.triple * 3 + self.single


def rooms_for(adults: int) -> Rooms:
    """Twin rooms for the party, and for an odd number one triple (cheaper per head than a single
    supplement) — a lone traveller takes a single. The sheet lets the visitor change it."""
    if adults <= 1:
        return Rooms(single=1)
    if adults % 2:
        return Rooms(double=(adults - 3) // 2, triple=1)
    return Rooms(double=adults // 2)


def travellers_for(rooms: Rooms, children: int) -> list[QuoteTraveller]:
    return [
        *[QuoteTraveller(occupancy=Occupancy.DOUBLE) for _ in range(rooms.double * 2)],
        *[QuoteTraveller(occupancy=Occupancy.TRIPLE) for _ in range(rooms.triple * 3)],
        *[QuoteTraveller(occupancy=Occupancy.SINGLE) for _ in range(rooms.single)],
        *[QuoteTraveller(occupancy=Occupancy.CHILD) for _ in range(children)],
    ]


def booking_url(slug: str, date: dt.date, rooms: Rooms, children: int) -> str:
    query = urlencode(
        {
            "date": date.isoformat(),
            "double": rooms.double,
            "triple": rooms.triple,
            "single": rooms.single,
            "children": children,
        }
    )
    return f"/packages/{slug}?{query}#book"


@dataclass(frozen=True)
class BookingStart:
    package_slug: str
    package_name: str
    departure_id: str
    date: dt.date
    adults: int
    children: int
    total_paise: int
    url: str


async def start_booking(
    db: AsyncSession,
    departure_id: str,
    *,
    adults: int,
    children: int,
    now: dt.datetime | None = None,
) -> BookingStart:
    """Quote the party on the date (404 gone, 409 with the reason) → where the sheet opens."""
    rooms = rooms_for(adults)
    quote = await quote_booking(
        db,
        QuoteRequest(departure_id=departure_id, travellers=travellers_for(rooms, children)),
        now=now,
    )
    name = (
        await db.execute(select(Package.name).where(Package.slug == quote.package_slug))
    ).scalar_one()
    return BookingStart(
        package_slug=quote.package_slug,
        package_name=name,
        departure_id=departure_id,
        date=quote.date,
        adults=adults,
        children=children,
        total_paise=quote.total_paise,
        url=booking_url(quote.package_slug, quote.date, rooms, children),
    )
