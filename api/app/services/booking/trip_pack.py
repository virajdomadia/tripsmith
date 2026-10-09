"""The trip pack (R48, P10): everything for the road, on the booking page and as a PDF.

It opens on departure − 7 days (IST) once the booking is paid in full — a `partially_paid`
booking never opens it, whatever the day — and stays readable while `confirmed` or `completed`
until 30 days after the trip (the day R49 deletes the traveller details). Booked inside the 7
days, it opens as soon as it is paid.

Inside: the meeting point and time with a Maps link (the departure's own set, else the
package's), the trip leader with their phone (read live, R41 — the only place the phone shows),
the hotels with address and phone, the day-by-day plan with dates, the owner's "Know before you
go" notes and the 24×7 number.

"Read" is the customer's first open of the unlocked coupon or the first PDF download; it is
recorded once and is one of the readiness parts (details.py).
"""

import datetime as dt
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.business import BUSINESS
from app.errors import ApiError
from app.models import Booking, Departure, Package, TripLeader
from app.models.enums import BookingActor, BookingStatus
from app.schemas.trip_pack import (
    KNOW_BEFORE,
    KnowBeforeNote,
    MeetingPoint,
    PackContent,
    PackDay,
    PackHotel,
    PackLeader,
    PackState,
    TripPack,
)
from app.services.booking import history
from app.services.booking.details import purge_on
from app.services.format import meals_label

OPEN_DAYS = 7
HAS_PACK = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID, BookingStatus.COMPLETED)
LOCKED = "The trip pack opens 7 days before departure, once the booking is paid in full"


def opens_on(departs: dt.date) -> dt.date:
    return departs - dt.timedelta(days=OPEN_DAYS)


def state_of(
    status: BookingStatus, departs: dt.date, returns: dt.date, today: dt.date
) -> PackState | None:
    """None = no pack at all (pending, cancelled)."""
    if status not in HAS_PACK:
        return None
    if today >= purge_on(returns):
        return "closed"
    if status == BookingStatus.PARTIALLY_PAID or today < opens_on(departs):
        return "locked"
    return "open"


def meeting_of(pkg: Package, dep: Departure) -> MeetingPoint | None:
    """The departure's own meeting point, else the package's — as a whole set."""
    src: Package | Departure = dep if dep.meet_place else pkg
    if not src.meet_place:
        return None
    return MeetingPoint(
        place=src.meet_place, time=src.meet_time, maps_url=src.meet_maps_url, note=src.meet_note
    )


def know_before_of(notes: dict[str, Any]) -> list[KnowBeforeNote]:
    return [
        KnowBeforeNote(key=key, label=label, text=text)
        for key, label in KNOW_BEFORE
        if (text := str(notes.get(key) or "").strip())
    ]


def hotels_of(hotels: Sequence[dict[str, Any]]) -> list[PackHotel]:
    return [
        PackHotel(
            name=str(h.get("name", "")),
            city=str(h.get("city", "")),
            stars=int(h.get("stars", 0) or 0),
            nights=int(h.get("nights", 0) or 0),
            address=str(h.get("address") or "").strip() or None,
            phone=str(h.get("phone") or "").strip() or None,
        )
        for h in hotels
    ]


async def leader_of(db: AsyncSession, pkg: Package, dep: Departure) -> PackLeader | None:
    """Read live: the departure's leader, else the package's default (R41)."""
    leader_id = dep.leader_id or pkg.leader_id
    row = await db.get(TripLeader, leader_id) if leader_id else None
    if row is None:
        return None
    return PackLeader(
        name=row.name,
        slug=row.slug,
        languages=list(row.languages),
        photo_url=row.photo_url,
        phone=row.phone or None,
    )


async def content_of(db: AsyncSession, pkg: Package, dep: Departure) -> PackContent:
    """`pkg.itinerary` must be loaded."""
    return PackContent(
        meeting=meeting_of(pkg, dep),
        leader=await leader_of(db, pkg, dep),
        hotels=hotels_of(pkg.hotels),
        days=[
            PackDay(
                day_no=d.day_no,
                date=dep.date + dt.timedelta(days=d.day_no - 1),
                title=d.title,
                description=d.description,
                stay=d.stay,
                meals=meals_label(d.meal_b, d.meal_l, d.meal_d),
            )
            for d in pkg.itinerary
        ],
        know_before=know_before_of(pkg.know_before),
        emergency_phone=BUSINESS["phone_display"],
        emergency_e164=BUSINESS["phone_e164"],
    )


def summary_of(booking: Booking, departs: dt.date, nights: int, today: dt.date) -> TripPack | None:
    """The pack without its content: enough for readiness (the desk uses this)."""
    state = state_of(booking.status, departs, departs + dt.timedelta(days=nights), today)
    if state is None:
        return None
    return TripPack(
        state=state,
        opens_on=opens_on(departs),
        needs_payment=booking.status == BookingStatus.PARTIALLY_PAID,
        read_at=booking.pack_read_at,
    )


async def pack_of(
    db: AsyncSession, booking: Booking, pkg: Package, dep: Departure, today: dt.date
) -> TripPack | None:
    """The booking page's block, with the content while open. `pkg.itinerary` must be
    loaded."""
    pack = summary_of(booking, dep.date, pkg.nights, today)
    if pack is None or pack.state != "open":
        return pack
    return pack.model_copy(update={"content": await content_of(db, pkg, dep)})


async def load(db: AsyncSession, ref: str) -> tuple[Booking, Package, Departure] | None:
    booking = (
        await db.execute(
            select(Booking).where(Booking.ref == ref).options(selectinload(Booking.travellers))
        )
    ).scalar_one_or_none()
    if booking is None:
        return None
    dep = await db.get(Departure, booking.departure_id)
    pkg = (
        await db.execute(
            select(Package)
            .where(Package.id == booking.package_id)
            .options(selectinload(Package.itinerary), selectinload(Package.destination))
        )
    ).scalar_one()
    assert dep is not None
    return booking, pkg, dep


async def mark_read(db: AsyncSession, ref: str, *, today: dt.date) -> None:
    """The customer opened the unlocked pack (the coupon or the PDF): recorded once, with one
    history entry. Refused while the pack is locked or closed."""
    try:
        found = await load(db, ref)
        if found is None:
            raise ApiError("not_found", "No booking with that reference")
        booking, pkg, dep = found
        returns = dep.date + dt.timedelta(days=pkg.nights)
        if state_of(booking.status, dep.date, returns, today) != "open":
            raise ApiError("conflict", LOCKED, reason="pack_locked")
        claimed = (
            await db.execute(
                update(Booking)
                .where(Booking.id == booking.id, Booking.pack_read_at.is_(None))
                .values(pack_read_at=dt.datetime.now(dt.UTC))
                .returning(Booking.id)
                .execution_options(synchronize_session=False)
            )
        ).scalar_one_or_none()
        if claimed:
            history.record(
                db,
                booking.id,
                "pack.read",
                actor=BookingActor.CUSTOMER,
                text="Customer opened the trip pack",
                customer="You opened the trip pack",
            )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
