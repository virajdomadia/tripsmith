"""Owner-side trip leaders (R41, P3): CRUD, switch on/off, and the photo check.

A leader leads a departure when the departure names them, or names nobody and its package's
default is them (`leads_departure`). That rule is read live everywhere — the voucher, the
desk, the public pages — so nothing is snapshotted and a change shows on the next read.
"""

import datetime as dt
from collections.abc import Iterable, Sequence

from sqlalchemy import ColumnElement, and_, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.models import Departure, Package, TripLeader
from app.schemas.leaders import AdminLeader, DeskLeader, LeaderInput, LeaderRef
from app.services.analytics import ist_today
from app.services.catalog.cover_url import cover_url_problem

NOT_FOUND = "Trip leader not found"
DUPLICATE_SLUG = "A trip leader with this slug already exists"
ASSIGNED = "This leader has led or is set to lead trips — switch them off instead"
UNKNOWN_LEADER = "Pick a trip leader that exists"
INACTIVE_LEADER = "This trip leader is switched off — switch them on or pick another"


def effective_leader_id() -> ColumnElement[str | None]:
    """The departure's own leader, else its package's default (join `Package` first)."""
    return func.coalesce(Departure.leader_id, Package.leader_id)


def leads_departure(leader_id: str) -> ColumnElement[bool]:
    return or_(
        Departure.leader_id == leader_id,
        and_(Departure.leader_id.is_(None), Package.leader_id == leader_id),
    )


async def departure_leader(db: AsyncSession, departure_id: str) -> DeskLeader | None:
    """Who leads this departure now: its own leader, else the package's default."""
    row = (
        await db.execute(
            select(Departure.leader_id, Package.leader_id)
            .join(Package, Package.id == Departure.package_id)
            .where(Departure.id == departure_id)
        )
    ).one_or_none()
    if row is None:
        return None
    own, default = row
    leader = await db.get(TripLeader, own or default) if (own or default) else None
    if leader is None:
        return None
    return DeskLeader(
        id=leader.id,
        slug=leader.slug,
        name=leader.name,
        photo_url=leader.photo_url,
        active=leader.active,
        phone=leader.phone,
        by_default=own is None,
    )


def ref(row: TripLeader) -> LeaderRef:
    return LeaderRef(
        id=row.id, slug=row.slug, name=row.name, photo_url=row.photo_url, active=row.active
    )


def revalidate_tags(slugs: Iterable[str], package_slugs: Iterable[str] = ()) -> list[str]:
    """The leaders index, each leader's page, and the package pages that show them."""
    tags = ["leaders", *(f"leader:{s}" for s in dict.fromkeys(slugs))]
    tags += [f"package:{s}" for s in dict.fromkeys(package_slugs)]
    return tags


async def slugs_of(db: AsyncSession, ids: Iterable[str | None]) -> list[str]:
    wanted = sorted({i for i in ids if i})
    if not wanted:
        return []
    rows = await db.execute(select(TripLeader.slug).where(TripLeader.id.in_(wanted)))
    return sorted(rows.scalars().all())


async def _package_slugs_led_by(db: AsyncSession, leader_id: str) -> list[str]:
    """Packages whose page can show this leader: their default, or any date of theirs — past
    ones too, since a review there says "Led by" them (P3b)."""
    on_a_date = exists().where(Departure.package_id == Package.id, Departure.leader_id == leader_id)
    rows = await db.execute(
        select(Package.slug).where(or_(Package.leader_id == leader_id, on_a_date))
    )
    return sorted(rows.scalars().all())


async def _counts(
    db: AsyncSession, ids: Sequence[str], today: dt.date
) -> tuple[dict[str, int], dict[str, int], set[str]]:
    """(packages defaulting to each, upcoming departures each leads, ids assigned anywhere)."""
    if not ids:
        return {}, {}, set()
    defaults = dict(
        (
            await db.execute(
                select(Package.leader_id, func.count())
                .where(Package.leader_id.in_(ids))
                .group_by(Package.leader_id)
            )
        )
        .tuples()
        .all()
    )
    lead = effective_leader_id()
    upcoming = dict(
        (
            await db.execute(
                select(lead, func.count())
                .select_from(Departure)
                .join(Package, Package.id == Departure.package_id)
                .where(Departure.date >= today, lead.in_(ids))
                .group_by(lead)
            )
        )
        .tuples()
        .all()
    )
    overrides = set(
        (
            await db.execute(
                select(Departure.leader_id).where(Departure.leader_id.in_(ids)).distinct()
            )
        )
        .scalars()
        .all()
    )
    assigned = {str(i) for i in defaults} | {str(i) for i in overrides if i}
    return (
        {str(k): int(v) for k, v in defaults.items()},
        {str(k): int(v) for k, v in upcoming.items() if k},
        assigned,
    )


def _to_admin(
    row: TripLeader, defaults: dict[str, int], upcoming: dict[str, int], assigned: set[str]
) -> AdminLeader:
    return AdminLeader(
        id=row.id,
        slug=row.slug,
        name=row.name,
        photo_url=row.photo_url,
        languages=list(row.languages),
        years_leading=row.years_leading,
        regions=list(row.regions),
        bio=row.bio,
        fun_fact=row.fun_fact,
        phone=row.phone,
        active=row.active,
        default_for=defaults.get(row.id, 0),
        upcoming=upcoming.get(row.id, 0),
        deletable=row.id not in assigned,
        updated_at=row.updated_at,
    )


async def _admin(db: AsyncSession, row: TripLeader) -> AdminLeader:
    return _to_admin(row, *await _counts(db, [row.id], ist_today()))


async def list_leaders(db: AsyncSession) -> list[AdminLeader]:
    rows = list(
        (await db.execute(select(TripLeader).order_by(TripLeader.active.desc(), TripLeader.name)))
        .scalars()
        .all()
    )
    counts = await _counts(db, [r.id for r in rows], ist_today())
    return [_to_admin(r, *counts) for r in rows]


async def _load(db: AsyncSession, id: str, *, lock: bool = False) -> TripLeader:
    q = select(TripLeader).where(TripLeader.id == id).execution_options(populate_existing=True)
    if lock:
        q = q.with_for_update()
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise ApiError("not_found", NOT_FOUND)
    return row


async def get_leader(db: AsyncSession, id: str) -> AdminLeader:
    return await _admin(db, await _load(db, id))


async def _assert_slug_free(db: AsyncSession, slug: str, *, except_id: str | None) -> None:
    q = select(TripLeader.id).where(TripLeader.slug == slug)
    if except_id is not None:
        q = q.where(TripLeader.id != except_id)
    if (await db.execute(q)).scalar_one_or_none() is not None:
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG})


async def _commit_or_conflict(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG}) from None


def check_photo_url(url: str | None, settings: Settings, *, on_vercel: bool) -> None:
    """The destination-cover rules (cover_url.py), filed under `fieldErrors.photoUrl`."""
    if url is None:
        return
    problem = cover_url_problem(url, settings, on_vercel=on_vercel)
    if problem:
        problem = problem.replace("cover image", "photo")
        raise ApiError("validation", problem, field_errors={"photoUrl": problem})


def _apply(row: TripLeader, payload: LeaderInput) -> None:
    row.slug = payload.slug
    row.name = payload.name
    row.photo_url = payload.photo_url
    row.languages = list(payload.languages)
    row.years_leading = payload.years_leading
    row.regions = list(payload.regions)
    row.bio = payload.bio
    row.fun_fact = payload.fun_fact
    row.phone = payload.phone


async def create_leader(db: AsyncSession, payload: LeaderInput) -> AdminLeader:
    await _assert_slug_free(db, payload.slug, except_id=None)
    row = TripLeader(active=True)
    _apply(row, payload)
    db.add(row)
    await _commit_or_conflict(db)
    await db.refresh(row)
    out = await _admin(db, row)
    await revalidate(revalidate_tags([out.slug]))
    return out


async def update_leader(db: AsyncSession, id: str, payload: LeaderInput) -> AdminLeader:
    row = await _load(db, id, lock=True)
    await _assert_slug_free(db, payload.slug, except_id=id)
    old_slug = row.slug
    _apply(row, payload)
    row.updated_at = dt.datetime.now(dt.UTC)
    await _commit_or_conflict(db)
    await db.refresh(row)
    out = await _admin(db, row)
    packages = await _package_slugs_led_by(db, id)
    await revalidate(revalidate_tags([out.slug, old_slug], packages))
    return out


async def leading_upcoming(db: AsyncSession, leader_id: str, today: dt.date) -> list[str]:
    """Package names this leader is the default of, or leads a date from today on."""
    on_a_date = exists().where(
        Departure.package_id == Package.id,
        Departure.leader_id == leader_id,
        Departure.date >= today,
    )
    rows = await db.execute(
        select(Package.name)
        .where(or_(Package.leader_id == leader_id, on_a_date))
        .order_by(Package.name)
    )
    return list(rows.scalars().all())


async def set_active(db: AsyncSession, id: str, active: bool) -> AdminLeader:
    """Switching off is refused while the leader is a package's default or leads an upcoming
    date: the owner reassigns those first, so no page or voucher ever names a leader who is
    off. Past departures keep them — reviews still say who led the trip."""
    row = await _load(db, id, lock=True)
    if not active and row.active:
        names = await leading_upcoming(db, id, ist_today())
        if names:
            shown = ", ".join(names[:3]) + (f" and {len(names) - 3} more" if len(names) > 3 else "")
            msg = f"{row.name} still leads {shown} — pick another leader there first"
            raise ApiError("conflict", msg, field_errors={"active": msg})
    row.active = active
    row.updated_at = dt.datetime.now(dt.UTC)
    slug = row.slug
    await db.commit()
    await db.refresh(row)
    out = await _admin(db, row)
    # Their past trips' reviews link to them (or stop linking): those package pages too.
    await revalidate(revalidate_tags([slug], await _package_slugs_led_by(db, id)))
    return out


async def delete_leader(db: AsyncSession, id: str) -> None:
    row = await _load(db, id, lock=True)
    _, _, assigned = await _counts(db, [id], ist_today())
    if id in assigned:
        raise ApiError("conflict", ASSIGNED)
    slug = row.slug
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:  # assigned between the check and the delete
        await db.rollback()
        raise ApiError("conflict", ASSIGNED) from None
    await revalidate(revalidate_tags([slug]))


async def check_assignable(
    db: AsyncSession, wanted: Sequence[tuple[str, str, str | None]]
) -> dict[str, str]:
    """`wanted` = (form field, picked leader id, the id saved on that row before). Each pick
    must exist and be switched on — unless it is what the row already had: a past departure
    keeps the leader who led it even after they are switched off. Returns field errors."""
    ids = {picked for _, picked, _ in wanted}
    if not ids:
        return {}
    # FOR SHARE: a concurrent switch-off (`set_active` locks the row FOR UPDATE) waits for this
    # save, or this save sees them already off — never "off but still picked".
    rows = await db.execute(
        select(TripLeader.id, TripLeader.active)
        .where(TripLeader.id.in_(ids))
        .with_for_update(read=True)
    )
    state = {str(i): bool(a) for i, a in rows.tuples().all()}
    errors: dict[str, str] = {}
    for field, picked, saved in wanted:
        if picked not in state:
            errors[field] = UNKNOWN_LEADER
        elif not state[picked] and picked != saved:
            errors[field] = INACTIVE_LEADER
    return errors
