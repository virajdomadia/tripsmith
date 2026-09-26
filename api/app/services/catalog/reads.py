"""Catalog reads for the package page and destination pages (06 C1).

`get_package` / `get_departures_for_month` / `list_destinations` / `get_destination` return
pydantic models or `None` (the router turns `None` into the 404 envelope). Draft packages never
leave this module; `seats_left` always comes from the `departure_availability` view.
"""

import datetime as dt
from collections.abc import Iterable, Mapping

from sqlalchemy import func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Destination, Package, PackageImage
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.catalog import (
    DepartureOut,
    DestinationCard,
    DestinationDetail,
    DestinationRef,
    FaqItem,
    HotelOut,
    ImageOut,
    ItineraryDayOut,
    Meals,
    PackageCard,
    PackageDetail,
)
from app.services.analytics import ist_today
from app.services.catalog import deals
from app.services.catalog.availability import Availability, next_departures
from app.services.catalog.cards import package_card
from app.services.catalog.pricing import badge_for
from app.services.reviews import list_public_reviews, rating_out

RELATED_LIMIT = 3


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    """`'2026-12'` -> `(2026-12-01, 2027-01-01)`; the router validated the format."""
    year, mon = (int(part) for part in month.split("-"))
    start = dt.date(year, mon, 1)
    end = dt.date(year + 1, 1, 1) if mon == 12 else dt.date(year, mon + 1, 1)
    return start, end


def related_order(
    package: Package, candidates: Iterable[Package], shown: Mapping[str, int] | None = None
) -> list[Package]:
    """R4 "same destination or theme": tier 0 same destination, 1 shares a theme, 2 anything
    else live; cheapest first within a tier, name as tiebreaker; the package itself excluded.
    `shown` = the price each card shows (a running deal's), by package id; the starting price
    when absent."""
    prices = shown or {}
    mine = set(package.themes)

    def tier(p: Package) -> int:
        if p.destination_id == package.destination_id:
            return 0
        return 1 if mine & set(p.themes) else 2

    # starting_price_paise is 0 when every departure has passed (seed / F18 recompute): that is
    # "no price", not "cheapest" — such packages go last within their tier.
    return sorted(
        (p for p in candidates if p.id != package.id),
        key=lambda p: (
            tier(p),
            prices.get(p.id, p.starting_price_paise) or float("inf"),
            p.name,
        ),
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


async def _related(
    db: AsyncSession, package: Package, today: dt.date, now: dt.datetime
) -> list[PackageCard]:
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
    base = await deals.bases(db, today)
    cards = {
        p.id: package_card(p, upcoming.get(p.id), deal_base=base.get(p.id, 0), now=now)
        for p in candidates
    }
    shown = {id: c.deal.price_paise for id, c in cards.items() if c.deal}
    return [cards[p.id] for p in related_order(package, candidates, shown)[:RELATED_LIMIT]]


async def get_package(
    db: AsyncSession,
    slug: str,
    *,
    today: dt.date | None = None,
    now: dt.datetime | None = None,
    with_related: bool = True,
) -> PackageDetail | None:
    """Everything the package page renders; `None` for drafts and unknown slugs (06 C1).

    `with_related=False` skips the related-cards query — the itinerary PDF does not draw them
    (nor does its cache key read them), so the PDF route, the enquiry attachment and the GC
    leave `related` empty.
    """
    now = now or dt.datetime.now(dt.UTC)
    today = today or ist_today(now)
    p = await _live_package(db, slug)
    if p is None:
        return None
    images = [_image_out(i) for i in p.images]
    departures = await _upcoming_departures(db, p.id, today)
    # The base from the rows just read: the same query `_deal_base` runs for the quote.
    base = min((d.price_double_paise for d in departures if d.price_double_paise), default=0)
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
        deal=deals.deal_for(p, base, now),
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
        departures=departures,
        related=await _related(db, p, today, now) if with_related else [],
        rating=rating_out(p.rating_avg, p.rating_count),
        reviews=(await list_public_reviews(db, p.id)).items if p.rating_count else [],
        updated_at=p.updated_at,
    )


async def get_departures_for_month(
    db: AsyncSession, slug: str, month: str | None, *, today: dt.date | None = None
) -> list[DepartureOut] | None:
    """Upcoming departures of a live package, optionally within one `YYYY-MM` (06 C1; the v3
    `checkAvailability` tool reuses it). `None` when the package is draft/unknown."""
    today = today or ist_today()
    package_id = (
        await db.execute(
            select(Package.id).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if package_id is None:
        return None
    return await _upcoming_departures(db, package_id, today, month)


async def list_destinations(
    db: AsyncSession, *, now: dt.datetime | None = None
) -> list[DestinationCard]:
    """Destinations with at least one live package, in display order (06 C1). The "from" price
    is the cheapest price a card there shows — a running deal's (03 R20)."""
    now = now or dt.datetime.now(dt.UTC)
    shown = deals.shown_price(now, ist_today(now))
    rows = await db.execute(
        select(
            Destination,
            func.count(Package.id),
            # 0 = no upcoming departure; it must not become the destination's "from" price.
            func.coalesce(func.min(func.nullif(shown, 0)), 0),
        )
        .join(Package, Package.destination_id == Destination.id)
        .where(Package.status == PackageStatus.LIVE)
        .group_by(Destination.id)
        .order_by(Destination.position, Destination.name)
    )
    return [
        DestinationCard(
            slug=d.slug,
            name=d.name,
            tagline=d.tagline,
            cover_url=d.cover_url,
            package_count=count,
            starting_price_paise=cheapest,
            best_months=list(d.best_months),
        )
        for d, count, cheapest in rows
    ]


async def get_destination(
    db: AsyncSession, slug: str, *, today: dt.date | None = None, now: dt.datetime | None = None
) -> DestinationDetail | None:
    """A destination with its live packages as cards; `None` if unknown or nothing is live."""
    now = now or dt.datetime.now(dt.UTC)
    today = today or ist_today(now)
    d = (await db.execute(select(Destination).where(Destination.slug == slug))).scalar_one_or_none()
    if d is None:
        return None
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.destination_id == d.id, Package.status == PackageStatus.LIVE)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
                # 0 is "on request", not the cheapest — the same ordering search and home use.
                .order_by(
                    nulls_last(func.nullif(deals.shown_price(now, today), 0).asc()), Package.name
                )
            )
        )
        .scalars()
        .all()
    )
    if not packages:
        return None
    upcoming = await next_departures(db, today)
    base = await deals.bases(db, today)
    return DestinationDetail(
        slug=d.slug,
        name=d.name,
        tagline=d.tagline,
        intro=d.intro,
        cover_url=d.cover_url,
        region=d.region,
        best_months=list(d.best_months),
        packages=[
            package_card(p, upcoming.get(p.id), deal_base=base.get(p.id, 0), now=now)
            for p in packages
        ],
    )
