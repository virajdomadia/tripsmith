"""Gallery ops for a package (F18, 06 §C3/§C4). Every change revalidates the public pages.

Separate from `admin_packages` because these are immediate, single-row writes made while the
form is open — not part of the package's transactional save.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.infra.storage import Store
from app.models import PackageImage
from app.models.base import new_id
from app.schemas.catalog import AdminImage, AdminPackage
from app.services.analytics import ist_today
from app.services.catalog.admin_packages import (
    assert_live_rules_hold,
    load,
    publish_rules,
    revalidate_tags,
    to_admin,
)
from app.services.images import ImageError, prepare_image

BAD_ORDER = "The gallery order must list every photo of this package exactly once"
BAD_COVER = "The cover must be one of this package's photos"
NOT_FOUND = "Photo not found"


def _to_admin_image(row: PackageImage) -> AdminImage:
    return AdminImage(
        id=row.id,
        url=row.url,
        alt=row.alt,
        width=row.width,
        height=row.height,
        position=row.position,
    )


async def _revalidate_for(db: AsyncSession, package_id: str) -> AdminPackage:
    out = await to_admin(db, await load(db, package_id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def add_image(
    db: AsyncSession, store: Store, package_id: str, data: bytes, content_type: str
) -> AdminImage:
    pkg = await load(db, package_id)
    try:
        image = await asyncio.to_thread(prepare_image, data, content_type)
    except ImageError as exc:
        raise ApiError("validation", str(exc), field_errors={"file": str(exc)}) from exc
    pathname = f"packages/{pkg.slug}/uploads/{new_id()}.{image.ext}"
    url = await store.put(pathname, image.data, image.content_type)
    # Lock only now — not across the upload — and re-read: the position and the cover below
    # must see any photo another request added or removed while the bytes were in flight.
    pkg = await load(db, package_id, lock=True)
    row = PackageImage(
        package_id=pkg.id,
        url=url,
        alt="",
        width=image.width,
        height=image.height,
        position=max((i.position for i in pkg.images), default=-1) + 1,
    )
    db.add(row)
    await db.flush()
    if pkg.cover_image_id is None:
        pkg.cover_image_id = row.id
    await db.commit()
    await db.refresh(row)
    await _revalidate_for(db, package_id)
    return _to_admin_image(row)


async def reorder_images(
    db: AsyncSession, package_id: str, order: list[str], cover_id: str | None
) -> AdminPackage:
    """One call carries the whole gallery order — a partial order is a bug, not a patch."""
    pkg = await load(db, package_id, lock=True)
    by_id = {i.id: i for i in pkg.images}
    if len(order) != len(set(order)) or set(order) != by_id.keys():
        raise ApiError("validation", BAD_ORDER, field_errors={"order": BAD_ORDER})
    if cover_id is not None and cover_id not in by_id:
        raise ApiError("validation", BAD_COVER, field_errors={"coverId": BAD_COVER})
    for position, image_id in enumerate(order):
        by_id[image_id].position = position
    if cover_id is not None:
        pkg.cover_image_id = cover_id
    await db.commit()
    return await _revalidate_for(db, package_id)


async def _image_of(db: AsyncSession, package_id: str, image_id: str) -> PackageImage:
    row = (
        await db.execute(
            select(PackageImage).where(
                PackageImage.id == image_id, PackageImage.package_id == package_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise ApiError("not_found", NOT_FOUND)
    return row


async def set_alt(db: AsyncSession, package_id: str, image_id: str, alt: str) -> AdminImage:
    row = await _image_of(db, package_id, image_id)
    row.alt = alt
    await db.commit()
    await db.refresh(row)
    await _revalidate_for(db, package_id)
    return _to_admin_image(row)


async def remove_image(db: AsyncSession, package_id: str, image_id: str) -> None:
    """The FK is `SET NULL`, so deleting the cover would leave the package coverless — hand the
    role to the next photo instead. The Blob object is left behind (portfolio scale).

    A live package keeps its publish rules: its last photo cannot go until it is unpublished.
    The row lock serialises this with a publish and with other deletes, so two requests can
    never each remove "not the last" photo and leave a live trip with none.
    """
    pkg = await load(db, package_id, lock=True)
    row = await _image_of(db, package_id, image_id)
    remaining = [i for i in sorted(pkg.images, key=lambda i: i.position) if i.id != image_id]
    before = publish_rules(pkg, image_count=len(pkg.images), today=ist_today())
    assert_live_rules_hold(pkg, before, image_count=len(remaining))
    if pkg.cover_image_id == image_id:
        pkg.cover_image_id = remaining[0].id if remaining else None
    await db.delete(row)
    for position, image in enumerate(remaining):
        image.position = position
    await db.commit()
    await _revalidate_for(db, package_id)
