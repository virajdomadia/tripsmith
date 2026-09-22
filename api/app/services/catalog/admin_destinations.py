"""Owner-side destination CRUD (F17, 06 §A3). Every write revalidates the public pages."""

from collections.abc import Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.models import Destination, Package
from app.models.enums import PackageStatus
from app.schemas.catalog import AdminDestination, DestinationInput

DUPLICATE_SLUG = "A destination with this slug already exists"


def revalidate_tags(
    slug: str, old_slug: str | None = None, package_slugs: Sequence[str] = ()
) -> list[str]:
    """`packages` too: package cards embed the destination name (06 C1). Each package's own
    detail page embeds it too, under `package:<slug>`, so a rename must bust those as well."""
    tags = ["destinations", "packages", "home", f"destination:{slug}"]
    if old_slug and old_slug != slug:
        tags.append(f"destination:{old_slug}")
    tags += [f"package:{s}" for s in package_slugs]
    return tags


def _counts_query() -> Select[tuple[Destination, int, int]]:
    return (
        select(
            Destination,
            func.count(Package.id),
            func.count(Package.id).filter(Package.status == PackageStatus.LIVE),
        )
        .outerjoin(Package, Package.destination_id == Destination.id)
        .group_by(Destination.id)
    )


def _to_admin(row: Destination, package_count: int, live_package_count: int) -> AdminDestination:
    return AdminDestination(
        id=row.id,
        slug=row.slug,
        name=row.name,
        tagline=row.tagline,
        intro=row.intro,
        cover_url=row.cover_url,
        region=row.region,
        best_months=list(row.best_months),
        position=row.position,
        package_count=package_count,
        live_package_count=live_package_count,
        updated_at=row.updated_at,
    )


async def list_destinations(db: AsyncSession) -> list[AdminDestination]:
    rows = await db.execute(_counts_query().order_by(Destination.position, Destination.name))
    return [_to_admin(d, total, live) for d, total, live in rows.all()]


async def _load(db: AsyncSession, id: str) -> tuple[Destination, int, int]:
    row = (await db.execute(_counts_query().where(Destination.id == id))).one_or_none()
    if row is None:
        raise ApiError("not_found", "Destination not found")
    d, total, live = row
    return d, int(total), int(live)


async def get_destination(db: AsyncSession, id: str) -> AdminDestination:
    return _to_admin(*await _load(db, id))


async def _assert_slug_free(db: AsyncSession, slug: str, *, except_id: str | None) -> None:
    q = select(Destination.id).where(Destination.slug == slug)
    if except_id is not None:
        q = q.where(Destination.id != except_id)
    if (await db.execute(q)).scalar_one_or_none() is not None:
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG})


async def _commit_or_conflict(db: AsyncSession) -> None:
    """`_assert_slug_free` gives the friendly error on the common path; this is the safety net
    for a concurrent insert/update that wins the race and hits the DB `unique` constraint."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG}) from None


def _apply(row: Destination, payload: DestinationInput) -> None:
    row.slug = payload.slug
    row.name = payload.name
    row.tagline = payload.tagline
    row.intro = payload.intro
    row.cover_url = payload.cover_url
    row.region = payload.region
    row.best_months = payload.best_months
    row.position = payload.position


async def create_destination(db: AsyncSession, payload: DestinationInput) -> AdminDestination:
    await _assert_slug_free(db, payload.slug, except_id=None)
    row = Destination()
    _apply(row, payload)
    db.add(row)
    await _commit_or_conflict(db)
    await db.refresh(row)
    await revalidate(revalidate_tags(row.slug))
    return _to_admin(row, 0, 0)


async def update_destination(
    db: AsyncSession, id: str, payload: DestinationInput
) -> AdminDestination:
    row, total, live = await _load(db, id)
    await _assert_slug_free(db, payload.slug, except_id=id)
    old_slug = row.slug
    _apply(row, payload)
    await _commit_or_conflict(db)
    await db.refresh(row)
    package_slugs = (
        (
            await db.execute(
                select(Package.slug).where(Package.destination_id == id).order_by(Package.slug)
            )
        )
        .scalars()
        .all()
    )
    await revalidate(revalidate_tags(row.slug, old_slug, package_slugs))
    return _to_admin(row, total, live)


async def delete_destination(db: AsyncSession, id: str) -> None:
    row, total, _ = await _load(db, id)
    if total:
        noun = "package uses" if total == 1 else "packages use"
        raise ApiError("conflict", f"{total} {noun} this destination — delete or move them first")
    slug = row.slug
    await db.delete(row)
    await db.commit()
    await revalidate(revalidate_tags(slug))
