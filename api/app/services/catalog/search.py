"""`search_packages` — the single filter function the site, the sitemap and (v3) the AI reuse.

S10/S11 slice: live packages, cheapest first, with the next upcoming departure's badge. F3 adds
the filter params (destination, budget, nights, themes, travel month) and sort.
"""

import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Package
from app.models.enums import PackageStatus
from app.schemas.catalog import PackageCard
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card


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
    upcoming = await next_departures(db, today)
    return [package_card(p, upcoming.get(p.id)) for p in packages]
