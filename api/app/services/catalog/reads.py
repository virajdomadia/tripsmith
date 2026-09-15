"""Catalog reads for the package page and destination pages (06 C1).

`get_package` / `get_departures_for_month` / `list_destinations` / `get_destination` return
pydantic models or `None` (the router turns `None` into the 404 envelope). Draft packages never
leave this module; `seats_left` always comes from the `departure_availability` view.
"""

import datetime as dt
from collections.abc import Iterable
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Package, PackageImage
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.catalog import (
    DepartureOut,
    DestinationRef,
    FaqItem,
    HotelOut,
    ImageOut,
    ItineraryDayOut,
    Meals,
    PackageCard,
    PackageDetail,
)
from app.services.catalog.availability import Availability, next_departures
from app.services.catalog.cards import package_card
from app.services.catalog.pricing import badge_for

RELATED_LIMIT = 3


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    """`'2026-12'` -> `(2026-12-01, 2027-01-01)`; the router validated the format."""
    year, mon = (int(part) for part in month.split("-"))
    start = dt.date(year, mon, 1)
    end = dt.date(year + 1, 1, 1) if mon == 12 else dt.date(year, mon + 1, 1)
    return start, end


class PackageLike(Protocol):
    id: str
    destination_id: str
    themes: list  # Theme enums or their string values
    starting_price_paise: int
    name: str


def related_order[TPackage: PackageLike](
    package: PackageLike, candidates: Iterable[TPackage]
) -> list[TPackage]:
    """R4 "same destination or theme": tier 0 same destination, 1 shares a theme, 2 anything
    else live; cheapest first within a tier, name as tiebreaker; the package itself excluded."""
    mine = set(package.themes)

    def tier(p: PackageLike) -> int:
        if p.destination_id == package.destination_id:
            return 0
        return 1 if mine & set(p.themes) else 2

    return sorted(
        (p for p in candidates if p.id != package.id),
        key=lambda p: (tier(p), p.starting_price_paise, p.name),
    )


def _image_out(image: PackageImage) -> ImageOut:
    return ImageOut(url=image.url, alt=image.alt, width=image.width, height=image.height)


def _departure_out(d: Departure, seats_left: int) -> DepartureOut:
    availability = Availability(seats_left, d.guaranteed, d.price_double_paise)
    return DepartureOut(
        id=d.id,
        date=d.date,
        seats_total=d.seats_total,
        seats_left=seats_left,
        guaranteed=d.guaranteed,
        price_double_paise=d.price_double_paise,
        price_triple_paise=d.price_triple_paise,
        price_child_paise=d.price_child_paise,
        single_supplement_paise=d.single_supplement_paise,
        badge=badge_for(availability),
    )


async def _upcoming_departures(
    db: AsyncSession, package_id: str, today: dt.date, month: str | None = None
) -> list[DepartureOut]:
    stmt = (
        select(Departure, departure_availability.c.seats_left)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.package_id == package_id, Departure.date >= today)
        .order_by(Departure.date)
    )
    if month:
        start, end = month_bounds(month)
        stmt = stmt.where(Departure.date >= start, Departure.date < end)
    rows = await db.execute(stmt)
    return [_departure_out(d, seats_left) for d, seats_left in rows]


async def _live_package(db: AsyncSession, slug: str) -> Package | None:
    return (
        await db.execute(
            select(Package)
            .where(Package.slug == slug, Package.status == PackageStatus.LIVE)
            .options(
                selectinload(Package.destination),
                selectinload(Package.itinerary),
                selectinload(Package.images),
                selectinload(Package.cover_image),
            )
        )
    ).scalar_one_or_none()


async def _related(db: AsyncSession, package: Package, today: dt.date) -> list[PackageCard]:
    candidates = (
        (
            await db.execute(
                select(Package)
                .where(Package.status == PackageStatus.LIVE, Package.id != package.id)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
            )
        )
        .scalars()
        .all()
    )
    upcoming = await next_departures(db, today)
    return [
        package_card(p, upcoming.get(p.id))
        for p in related_order(package, candidates)[:RELATED_LIMIT]
    ]


async def get_package(
    db: AsyncSession, slug: str, *, today: dt.date | None = None
) -> PackageDetail | None:
    """Everything the package page renders; `None` for drafts and unknown slugs (06 C1)."""
    today = today or dt.date.today()
    p = await _live_package(db, slug)
    if p is None:
        return None
    images = [_image_out(i) for i in p.images]
    return PackageDetail(
        slug=p.slug,
        name=p.name,
        summary=p.summary,
        destination=DestinationRef(slug=p.destination.slug, name=p.destination.name),
        themes=list(p.themes),
        nights=p.nights,
        days=p.days,
        departure_city=p.departure_city,
        starting_price_paise=p.starting_price_paise,
        highlights=list(p.highlights),
        inclusions=list(p.inclusions),
        exclusions=list(p.exclusions),
        hotels=[HotelOut.model_validate(h) for h in p.hotels],
        faq=[FaqItem.model_validate(f) for f in p.faq],
        itinerary=[
            ItineraryDayOut(
                day_no=d.day_no,
                title=d.title,
                description=d.description,
                meals=Meals(breakfast=d.meal_b, lunch=d.meal_l, dinner=d.meal_d),
                stay=d.stay,
            )
            for d in p.itinerary
        ],
        images=images,
        cover=_image_out(p.cover_image) if p.cover_image else (images[0] if images else None),
        departures=await _upcoming_departures(db, p.id, today),
        related=await _related(db, p, today),
        updated_at=p.updated_at,
    )
