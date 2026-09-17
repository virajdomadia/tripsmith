"""Everything the home page renders in one read (06 C1 `getHomeData`)."""

import datetime as dt

from sqlalchemy import and_, func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Package, Testimonial
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.catalog import HomeData, HomeStats, TestimonialOut
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card
from app.services.catalog.reads import list_destinations

HOME_LIMIT = 6  # tiles and cards on the home page (07-plan F6)


async def _featured_first(db: AsyncSession) -> list[Package]:
    price = func.nullif(Package.starting_price_paise, 0)  # 0 = no upcoming date, not "cheapest"
    rows = await db.execute(
        select(Package)
        .where(Package.status == PackageStatus.LIVE)
        .options(selectinload(Package.destination), selectinload(Package.cover_image))
        .order_by(Package.featured.desc(), nulls_last(price.asc()), Package.name)
        .limit(HOME_LIMIT)
    )
    return list(rows.scalars().all())


async def _testimonials(db: AsyncSession) -> list[TestimonialOut]:
    # Outer join on a *live* package: a draft's testimonial stays but loses its link.
    rows = await db.execute(
        select(Testimonial, Package.slug, Package.name)
        .outerjoin(
            Package,
            and_(Package.id == Testimonial.package_id, Package.status == PackageStatus.LIVE),
        )
        .order_by(Testimonial.position, Testimonial.created_at)
    )
    return [
        TestimonialOut(
            name=t.name,
            city=t.city,
            text=t.text,
            rating=t.rating,
            package_slug=slug,
            package_name=name,
        )
        for t, slug, name in rows
    ]


async def _stats(db: AsyncSession, today: dt.date, destinations: int) -> HomeStats:
    packages = (
        await db.execute(select(func.count(Package.id)).where(Package.status == PackageStatus.LIVE))
    ).scalar_one()
    departures = (
        await db.execute(
            select(func.count(Departure.id))
            .join(Package, Package.id == Departure.package_id)
            .join(departure_availability, departure_availability.c.departure_id == Departure.id)
            .where(
                Package.status == PackageStatus.LIVE,
                Departure.date >= today,
                departure_availability.c.seats_left > 0,
            )
        )
    ).scalar_one()
    return HomeStats(destinations=destinations, packages=packages, departures=departures)


async def get_home_data(db: AsyncSession, *, today: dt.date | None = None) -> HomeData:
    """Destinations (display order), featured-first package cards, testimonials, live counts."""
    today = today or dt.date.today()
    destinations = await list_destinations(db)
    packages = await _featured_first(db)
    upcoming = await next_departures(db, today)
    return HomeData(
        destinations=destinations[:HOME_LIMIT],
        packages=[package_card(p, upcoming.get(p.id)) for p in packages],
        testimonials=await _testimonials(db),
        stats=await _stats(db, today, len(destinations)),
    )
