"""Trip leaders on the public site (R41, P3b): the package card and row avatars, `/leaders` and
`/leaders/{slug}`, and "Led by" on reviews. Read live — a departure's own leader, else its
package's default — and never the phone (that is the trip pack's, R48).

Switched-off leaders never show here as a card or a page; a past review still names them.
"""

import datetime as dt
from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Package, TripLeader
from app.models.enums import PackageStatus
from app.schemas.catalog import LeaderDetail, LeaderSummary, LeaderTrip
from app.schemas.public_leaders import LeaderCardOut, PublicLeaderRef
from app.services.catalog import deals, early_bird
from app.services.catalog.admin_leaders import effective_leader_id
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card


def ref(row: TripLeader) -> PublicLeaderRef:
    return PublicLeaderRef(slug=row.slug, name=row.name, photo_url=row.photo_url)


def card(row: TripLeader) -> LeaderCardOut:
    return LeaderCardOut(
        slug=row.slug,
        name=row.name,
        photo_url=row.photo_url,
        languages=list(row.languages),
        years_leading=row.years_leading,
        regions=list(row.regions),
        bio=row.bio,
        fun_fact=row.fun_fact,
    )


async def active_by_id(db: AsyncSession, ids: Iterable[str | None]) -> dict[str, TripLeader]:
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    rows = await db.execute(
        select(TripLeader).where(TripLeader.id.in_(wanted), TripLeader.active.is_(True))
    )
    return {r.id: r for r in rows.scalars()}


def _upcoming_led(today: dt.date):  # noqa: ANN202 — a Select of (leader id, departure date, package id)
    lead = effective_leader_id()
    return (
        select(lead.label("leader_id"), Departure.date, Departure.package_id)
        .select_from(Departure)
        .join(Package, Package.id == Departure.package_id)
        .where(Package.status == PackageStatus.LIVE, Departure.date >= today, lead.is_not(None))
    )


async def list_public(db: AsyncSession, today: dt.date) -> list[LeaderSummary]:
    """`/leaders`: switched-on leaders by name, with how many upcoming dates they lead."""
    rows = list(
        (
            await db.execute(
                select(TripLeader).where(TripLeader.active.is_(True)).order_by(TripLeader.name)
            )
        )
        .scalars()
        .all()
    )
    sub = _upcoming_led(today).subquery()
    grouped = await db.execute(select(sub.c.leader_id, func.count()).group_by(sub.c.leader_id))
    counts = {str(k): int(v) for k, v in grouped.tuples().all()}
    return [LeaderSummary(**card(r).model_dump(), upcoming=counts.get(r.id, 0)) for r in rows]


async def get_public(
    db: AsyncSession, slug: str, *, today: dt.date, now: dt.datetime
) -> LeaderDetail | None:
    """`/leaders/{slug}`: the card plus the live trips with upcoming dates they lead, soonest
    date first; `None` for an unknown or switched-off leader."""
    row = (
        await db.execute(
            select(TripLeader).where(TripLeader.slug == slug, TripLeader.active.is_(True))
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    sub = _upcoming_led(today).subquery()
    dates: dict[str, list[dt.date]] = {}
    led = await db.execute(
        select(sub.c.package_id, sub.c.date).where(sub.c.leader_id == row.id).order_by(sub.c.date)
    )
    for package_id, day in led.tuples().all():
        dates.setdefault(package_id, []).append(day)
    trips: list[LeaderTrip] = []
    if dates:
        packages = {
            p.id: p
            for p in (
                await db.execute(
                    select(Package)
                    .where(Package.id.in_(dates))
                    .options(selectinload(Package.destination), selectinload(Package.cover_image))
                )
            ).scalars()
        }
        upcoming = await next_departures(db, today)
        base = await deals.bases(db, today)
        savings = await early_bird.with_savings(db, today)
        for package_id, days in dates.items():  # insertion order = soonest date first
            p = packages[package_id]
            trips.append(
                LeaderTrip(
                    package=package_card(
                        p,
                        upcoming.get(p.id),
                        deal_base=base.get(p.id, 0),
                        early_bird=p.id in savings,
                        now=now,
                    ),
                    dates=days,
                )
            )
    return LeaderDetail(**card(row).model_dump(), trips=trips)
