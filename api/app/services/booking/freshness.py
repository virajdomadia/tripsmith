"""Keep public pages honest after a booking event (04 v2 §3 "Freshness").

A hold, a confirmation or a cancellation moves a departure's seats, which can move the package's
"from ₹X" (a sold-out date drops out of it) and always moves the seat counts its pages show. One
helper recomputes `starting_price_paise` and posts the package's revalidate tags. Lapsed holds
fire no event — the Book-now panel reads availability uncached for that reason.
"""

from collections.abc import Iterable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infra.revalidate import revalidate
from app.models import Package
from app.services.analytics import ist_today
from app.services.catalog.admin_packages import (
    recompute_starting_price,
    revalidate_tags,
    seats_left_for,
)


async def refresh_packages(db: AsyncSession, package_ids: Iterable[str]) -> None:
    """Recompute and store each package's starting price, then revalidate its pages.

    Runs in its own transaction after the booking one has committed, so the view already counts
    the new hold. The package rows are locked in id order — the order `/cron/daily` and the
    owner's saves use — so a concurrent save is never overwritten with a stale price.
    """
    ids = sorted(set(package_ids))
    if not ids:
        return
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.id.in_(ids))
                .options(selectinload(Package.departures), selectinload(Package.destination))
                .order_by(Package.id)
                .with_for_update(of=Package)
            )
        )
        .scalars()
        .all()
    )
    seats = await seats_left_for(db, [d.id for p in packages for d in p.departures])
    today = ist_today()
    tags: list[str] = []
    for pkg in packages:
        price = recompute_starting_price(pkg, today=today, seats_left=seats)
        if price != pkg.starting_price_paise:
            await db.execute(
                update(Package)
                .where(Package.id == pkg.id)
                .values(starting_price_paise=price, updated_at=Package.updated_at)
                .execution_options(synchronize_session=False)
            )
        tags += [t for t in revalidate_tags(pkg.slug, pkg.destination.slug) if t not in tags]
    await db.commit()
    await revalidate(tags)
