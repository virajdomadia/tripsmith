"""`search_packages` — the single filter function the site, the sitemap and (v3) the AI reuse.

S10/S11 slice: live packages, cheapest first, with the next upcoming departure's badge. F3 adds
the filter params (destination, budget, nights, themes, travel month) and sort.
"""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Package
from app.models.enums import PackageStatus
from app.schemas.catalog import PackageCard
from app.services.catalog.pricing import badge_for


@dataclass
class _Availability:
    seats_left: int
    guaranteed: bool
    price_double_paise: int


async def _next_departures(db: AsyncSession, today: dt.date) -> dict[str, _Availability]:
    """The earliest departure on/after `today` per package, with seats_left from the view."""
    rows = await db.execute(
        select(
            Departure.package_id,
            Departure.date,
            Departure.guaranteed,
            Departure.price_double_paise,
            Departure.seats_total,  # v1 view: seats_left == seats_total (06 A3)
        )
        .where(Departure.date >= today)
        .order_by(Departure.package_id, Departure.date)
    )
    out: dict[str, _Availability] = {}
    for package_id, _date, guaranteed, price, seats in rows:
        out.setdefault(package_id, _Availability(seats, guaranteed, price))
    return out


async def search_packages(db: AsyncSession, *, today: dt.date | None = None) -> list[PackageCard]:
    today = today or dt.date.today()
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.status == PackageStatus.LIVE)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
                .order_by(Package.starting_price_paise, Package.name)
            )
        )
        .scalars()
        .all()
    )
    upcoming = await _next_departures(db, today)
    return [
        PackageCard(
            slug=p.slug,
            name=p.name,
            destination=p.destination.name,
            nights=p.nights,
            days=p.days,
            starting_price_paise=p.starting_price_paise,
            themes=list(p.themes),
            cover_url=p.cover_image.url if p.cover_image else None,
            highlights=list(p.highlights),
            badge=badge_for(upcoming[p.id]) if p.id in upcoming else None,
        )
        for p in packages
    ]
