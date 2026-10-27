"""Saved trips — the ♡ (R39, P1).

An account keeps at most `MAX_SAVED` packages. Every write takes the user's row lock first, so
two tabs saving at once cannot push an account past the cap, and a merge sees a stable list.

Only live packages can be saved. A saved package that is later taken down keeps its row (it
counts towards the cap) but is left out of every list until it is live again.

A guest's browser list is merged on sign-in: unknown and non-live slugs are skipped, a trip
already on the account keeps the older of the two save times, and when the account would pass
the cap the browser's oldest saves are left out (and counted, so the page can say so).
"""

import datetime as dt
from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import Departure, Package, SavedPackage, User
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.dashboard import TOP_N, SavedCount
from app.schemas.errors import ErrorReason
from app.schemas.saved import (
    MAX_SAVED,
    NextDeparture,
    SavedMerge,
    SavedMergeItem,
    SavedSlugs,
    SavedTrip,
    SavedTrips,
)
from app.services.admin_enquiries import ist_day_start
from app.services.catalog import deals, early_bird, urgency
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card

OLDEST_SAVE = dt.timedelta(days=365)


def save_time(at: dt.datetime | None, now: dt.datetime) -> dt.datetime:
    """The browser's save time, trusted only inside the last year (a clock or a forged value
    outside it becomes `now`). A time without a zone is read as UTC."""
    if at is None:
        return now
    if at.tzinfo is None:
        at = at.replace(tzinfo=dt.UTC)
    return at if now - OLDEST_SAVE <= at <= now else now


async def _lock_user(db: AsyncSession, user_id: str) -> None:
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())


async def slugs(db: AsyncSession, user_id: str) -> SavedSlugs:
    rows = await db.execute(
        select(Package.slug)
        .join(SavedPackage, SavedPackage.package_id == Package.id)
        .where(SavedPackage.user_id == user_id, Package.status == PackageStatus.LIVE)
        .order_by(SavedPackage.created_at.desc(), Package.slug)
    )
    return SavedSlugs(slugs=list(rows.scalars()))


async def _live_package_id(db: AsyncSession, slug: str) -> str:
    package_id = (
        await db.execute(
            select(Package.id).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if package_id is None:
        raise ApiError("not_found", "That trip is not on the site any more")
    return package_id


async def _count(db: AsyncSession, user_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(SavedPackage)
                .where(SavedPackage.user_id == user_id)
            )
        ).scalar_one()
    )


async def save(db: AsyncSession, user_id: str, slug: str, *, now: dt.datetime) -> SavedSlugs:
    """Idempotent: saving a saved trip changes nothing. 404 for a trip that is not live, 409
    `saved_full` past the cap."""
    package_id = await _live_package_id(db, slug)
    await _lock_user(db, user_id)
    exists = (
        await db.execute(
            select(SavedPackage.package_id).where(
                SavedPackage.user_id == user_id, SavedPackage.package_id == package_id
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        if await _count(db, user_id) >= MAX_SAVED:
            raise ApiError(
                "conflict",
                f"You can keep {MAX_SAVED} saved trips — remove one first",
                reason=ErrorReason.SAVED_FULL,
            )
        db.add(SavedPackage(user_id=user_id, package_id=package_id, created_at=now))
    await db.commit()
    return await slugs(db, user_id)


async def unsave(db: AsyncSession, user_id: str, slug: str) -> SavedSlugs:
    """Idempotent, and works for a trip that has since been taken down."""
    package_ids = select(Package.id).where(Package.slug == slug).scalar_subquery()
    await db.execute(
        delete(SavedPackage).where(
            SavedPackage.user_id == user_id, SavedPackage.package_id == package_ids
        )
    )
    await db.commit()
    return await slugs(db, user_id)


async def merge(
    db: AsyncSession, user_id: str, items: Sequence[SavedMergeItem], *, now: dt.datetime
) -> SavedMerge:
    # One time per slug: the oldest the browser holds.
    wanted: dict[str, dt.datetime] = {}
    for item in items:
        at = save_time(item.at, now)
        wanted[item.slug] = min(at, wanted.get(item.slug, at))
    live = {}
    if wanted:
        live = {
            slug: package_id
            for slug, package_id in (
                await db.execute(
                    select(Package.slug, Package.id).where(
                        Package.slug.in_(wanted), Package.status == PackageStatus.LIVE
                    )
                )
            ).tuples()
        }
    await _lock_user(db, user_id)
    have = {
        package_id: created_at
        for package_id, created_at in (
            await db.execute(
                select(SavedPackage.package_id, SavedPackage.created_at).where(
                    SavedPackage.user_id == user_id
                )
            )
        ).tuples()
    }
    fresh: list[tuple[str, dt.datetime]] = []
    for slug, package_id in live.items():
        at = wanted[slug]
        if package_id in have:
            if at < have[package_id]:  # the older time wins
                row = await db.get(SavedPackage, (user_id, package_id))
                if row is not None:
                    row.created_at = at
        else:
            fresh.append((package_id, at))
    fresh.sort(key=lambda pair: pair[1], reverse=True)  # newest first: the oldest are left out
    room = max(0, MAX_SAVED - len(have))
    keep, left_out = fresh[:room], fresh[room:]
    if keep:
        await db.execute(
            insert(SavedPackage)
            .values([{"user_id": user_id, "package_id": p, "created_at": at} for p, at in keep])
            .on_conflict_do_nothing()
        )
    await db.commit()
    current = await slugs(db, user_id)
    return SavedMerge(slugs=current.slugs, added=len(keep), left_out=len(left_out))


async def _next_open(db: AsyncSession, package_ids: Sequence[str], today: dt.date):  # noqa: ANN202
    """Per package, the soonest date on/after `today` that still has seats."""
    rows = await db.execute(
        select(Departure.package_id, Departure.date, departure_availability.c.seats_left)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(
            Departure.package_id.in_(package_ids),
            Departure.date >= today,
            departure_availability.c.seats_left > 0,
        )
        .order_by(Departure.package_id, Departure.date)
    )
    out: dict[str, NextDeparture] = {}
    for package_id, day, seats_left in rows.tuples():
        out.setdefault(package_id, NextDeparture(date=day, seats_left=int(seats_left)))
    return out


async def trips(db: AsyncSession, user_id: str, *, today: dt.date, now: dt.datetime) -> SavedTrips:
    """The Saved tab: live packages as cards, newest save first."""
    rows = (
        await db.execute(
            select(Package, SavedPackage.created_at)
            .join(SavedPackage, SavedPackage.package_id == Package.id)
            .where(SavedPackage.user_id == user_id, Package.status == PackageStatus.LIVE)
            .order_by(SavedPackage.created_at.desc(), Package.slug)
            .options(selectinload(Package.destination), selectinload(Package.cover_image))
        )
    ).all()
    if not rows:
        return SavedTrips(items=[])
    ids = [p.id for p, _ in rows]
    upcoming = await next_departures(db, today)
    base = await deals.bases(db, today)
    savings = await early_bird.with_savings(db, today)
    proven = await urgency.proofs(db, today)
    nxt = await _next_open(db, ids, today)
    return SavedTrips(
        items=[
            SavedTrip(
                saved_at=saved_at,
                card=package_card(
                    p,
                    upcoming.get(p.id),
                    deal_base=base.get(p.id, 0),
                    early_bird=p.id in savings,
                    proof=proven.get(p.id),
                    now=now,
                ),
                next_departure=nxt.get(p.id),
            )
            for p, saved_at in rows
        ]
    )


async def top_saved(db: AsyncSession, since: dt.date) -> list[SavedCount]:
    """The dashboard's "Most saved": saves made since IST midnight on `since`, with each
    package's all-time count beside it. Guests' browser saves never reach the server."""
    recent = func.count(SavedPackage.package_id)
    rows = (
        await db.execute(
            select(Package.id, Package.slug, Package.name, recent.label("n"))
            .join(SavedPackage, SavedPackage.package_id == Package.id)
            .where(SavedPackage.created_at >= ist_day_start(since))
            .group_by(Package.id, Package.slug, Package.name)
            .order_by(recent.desc(), Package.name)
            .limit(TOP_N)
        )
    ).all()
    if not rows:
        return []
    totals: dict[str, int] = {
        package_id: int(n)
        for package_id, n in (
            await db.execute(
                select(SavedPackage.package_id, func.count())
                .where(SavedPackage.package_id.in_([r[0] for r in rows]))
                .group_by(SavedPackage.package_id)
            )
        ).tuples()
    }
    return [
        SavedCount(id=id, slug=slug, name=name, count=int(n), all_time=totals.get(id, int(n)))
        for id, slug, name, n in rows
    ]
