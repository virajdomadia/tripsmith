"""Owner-side package CRUD (F18, 06 §A3 §C4). Every write revalidates the public pages.

The rule and price functions at the top are pure over a loaded `Package` graph so the same
logic serves the read, the write and the status endpoints — and tests them without a session.
"""

import datetime as dt
from collections.abc import Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.models import Departure, Destination, Enquiry, ItineraryDay, Package, PackageImage
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.catalog import (
    AdminDeparture,
    AdminImage,
    AdminPackage,
    AdminPackageRow,
    DepartureInput,
    DestinationRef,
    FaqItem,
    HotelOut,
    ItineraryDayOut,
    Meals,
    PackageInput,
    PublishRule,
)

DUPLICATE_SLUG = "A package with this slug already exists"
ENQUIRY_WINDOW_DAYS = 30
NOT_FOUND = "Package not found"
UNKNOWN_DESTINATION = "Pick a destination that exists"
FOREIGN_DEPARTURE = "A departure in this payload belongs to another package"
DUPLICATE_DEPARTURE = "Two departures cannot share the same date"


def revalidate_tags(
    slug: str,
    destination_slug: str,
    old_slug: str | None = None,
    old_destination_slug: str | None = None,
) -> list[str]:
    """`destinations` too: the destination cards carry package counts and from-prices, and the
    destination page lists the package. A rename or a move has to bust the old keys as well."""
    tags = [
        "packages",
        "destinations",
        "home",
        f"package:{slug}",
        f"destination:{destination_slug}",
    ]
    if old_slug and old_slug != slug:
        tags.append(f"package:{old_slug}")
    if old_destination_slug and old_destination_slug != destination_slug:
        tags.append(f"destination:{old_destination_slug}")
    return tags


def recompute_starting_price(pkg: Package, *, today: dt.date) -> int:
    """Cheapest double-sharing price across upcoming departures; 0 when none remain.

    Unpriced departures (0 — a draft parking a date) are skipped: `reads.py` treats 0 as "no
    upcoming date", and a parked row must never advertise the package as free.
    """
    prices = [
        d.price_double_paise for d in pkg.departures if d.date >= today and d.price_double_paise > 0
    ]
    return min(prices) if prices else 0


def publish_rules(pkg: Package, *, image_count: int, today: dt.date) -> list[PublishRule]:
    """The four live-publish preconditions (06 §C4 `setPackageStatus`), in panel order."""
    written = len(pkg.itinerary)
    upcoming = [d for d in pkg.departures if d.date >= today]
    unpriced = [
        d
        for d in pkg.departures
        if not (d.price_double_paise > 0 and d.price_triple_paise > 0 and d.price_child_paise > 0)
    ]
    return [
        PublishRule(
            key="images",
            label="At least one photo",
            ok=image_count > 0,
            detail=f"{image_count} uploaded" if image_count else "No photos yet",
        ),
        PublishRule(
            key="itinerary",
            label="Full itinerary",
            ok=written == pkg.days,
            detail=f"{written} of {pkg.days} days written",
        ),
        PublishRule(
            key="departures",
            label="At least one upcoming departure",
            ok=bool(upcoming),
            detail=f"{len(upcoming)} upcoming" if upcoming else "No dates from today onwards",
        ),
        PublishRule(
            key="prices",
            label="Prices set for every departure",
            ok=not unpriced,
            detail=(
                "All departures priced"
                if not unpriced
                else f"{len(unpriced)} departure{'' if len(unpriced) == 1 else 's'} unpriced"
            ),
        ),
    ]


def can_publish(rules: Sequence[PublishRule]) -> bool:
    return all(r.ok for r in rules)


def _loaded() -> Select[tuple[Package]]:
    """Every write and every read needs the whole graph; load it in one round trip."""
    return select(Package).options(
        selectinload(Package.destination),
        selectinload(Package.itinerary),
        selectinload(Package.departures),
        selectinload(Package.images),
    )


async def load(db: AsyncSession, id: str) -> Package:
    """`populate_existing` is load-bearing. Sessions are built with `expire_on_commit=False`
    (infra/db.py), so an instance already in the identity map keeps the relationships it loaded
    earlier and a plain re-query silently returns them — a package re-read after its images or
    its destination changed would answer with the stale set. This forces the refresh.
    """
    pkg = (
        await db.execute(
            _loaded().where(Package.id == id).execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if pkg is None:
        raise ApiError("not_found", NOT_FOUND)
    return pkg


async def _seats_left(db: AsyncSession, pkg: Package) -> dict[str, int]:
    """`seats_left` lives in the departure_availability view — never on the row (06 §A3)."""
    if not pkg.departures:
        return {}
    rows = await db.execute(
        select(departure_availability.c.departure_id, departure_availability.c.seats_left).where(
            departure_availability.c.departure_id.in_([d.id for d in pkg.departures])
        )
    )
    return {str(id_): int(left) for id_, left in rows.all()}


async def _enquiry_count(db: AsyncSession, package_id: str) -> int:
    return int(
        (
            await db.execute(select(func.count(Enquiry.id)).where(Enquiry.package_id == package_id))
        ).scalar_one()
    )


def _day_out(d: ItineraryDay) -> ItineraryDayOut:
    return ItineraryDayOut(
        day_no=d.day_no,
        title=d.title,
        description=d.description,
        meals=Meals(breakfast=d.meal_b, lunch=d.meal_l, dinner=d.meal_d),
        stay=d.stay,
    )


def _image_out(i: PackageImage) -> AdminImage:
    return AdminImage(
        id=i.id, url=i.url, alt=i.alt, width=i.width, height=i.height, position=i.position
    )


async def to_admin(db: AsyncSession, pkg: Package) -> AdminPackage:
    today = dt.date.today()
    left = await _seats_left(db, pkg)
    images = sorted(pkg.images, key=lambda i: i.position)
    rules = publish_rules(pkg, image_count=len(images), today=today)
    return AdminPackage(
        id=pkg.id,
        slug=pkg.slug,
        destination_id=pkg.destination_id,
        destination=DestinationRef(slug=pkg.destination.slug, name=pkg.destination.name),
        name=pkg.name,
        summary=pkg.summary,
        themes=list(pkg.themes),
        nights=pkg.nights,
        days=pkg.days,
        departure_city=pkg.departure_city,
        highlights=list(pkg.highlights),
        inclusions=list(pkg.inclusions),
        exclusions=list(pkg.exclusions),
        hotels=[HotelOut.model_validate(h) for h in pkg.hotels],
        faq=[FaqItem.model_validate(f) for f in pkg.faq],
        itinerary=[_day_out(d) for d in sorted(pkg.itinerary, key=lambda d: d.day_no)],
        departures=[
            AdminDeparture(
                id=d.id,
                date=d.date,
                seats_total=d.seats_total,
                seats_left=left.get(d.id, d.seats_total),
                guaranteed=d.guaranteed,
                price_double_paise=d.price_double_paise,
                price_triple_paise=d.price_triple_paise,
                price_child_paise=d.price_child_paise,
                single_supplement_paise=d.single_supplement_paise,
            )
            for d in sorted(pkg.departures, key=lambda d: d.date)
        ],
        images=[_image_out(i) for i in images],
        cover_image_id=pkg.cover_image_id,
        status=pkg.status,
        featured=pkg.featured,
        starting_price_paise=pkg.starting_price_paise,
        enquiry_count=await _enquiry_count(db, pkg.id),
        publish_rules=rules,
        can_publish=can_publish(rules),
        updated_at=pkg.updated_at,
    )


async def get_package(db: AsyncSession, id: str) -> AdminPackage:
    return await to_admin(db, await load(db, id))


async def list_packages(db: AsyncSession) -> list[AdminPackageRow]:
    """One aggregate subquery per count — the A3 table shows upcoming departures and 30-day
    enquiries next to every row, and there are a dozen packages, not a million."""
    today = dt.date.today()
    since = dt.datetime.now(dt.UTC) - dt.timedelta(days=ENQUIRY_WINDOW_DAYS)
    upcoming = (
        select(Departure.package_id, func.count(Departure.id).label("n"))
        .where(Departure.date >= today)
        .group_by(Departure.package_id)
        .subquery()
    )
    recent = (
        select(Enquiry.package_id, func.count(Enquiry.id).label("n"))
        .where(Enquiry.created_at >= since)
        .group_by(Enquiry.package_id)
        .subquery()
    )
    cover = PackageImage.__table__.alias("cover")
    rows = await db.execute(
        select(
            Package,
            Destination.slug,
            Destination.name,
            cover.c.url,
            func.coalesce(upcoming.c.n, 0),
            func.coalesce(recent.c.n, 0),
        )
        .join(Destination, Destination.id == Package.destination_id)
        .outerjoin(cover, cover.c.id == Package.cover_image_id)
        .outerjoin(upcoming, upcoming.c.package_id == Package.id)
        .outerjoin(recent, recent.c.package_id == Package.id)
        .order_by(Package.status, Package.name)
    )
    return [
        AdminPackageRow(
            id=p.id,
            slug=p.slug,
            name=p.name,
            cover_url=cover_url,
            destination=DestinationRef(slug=dest_slug, name=dest_name),
            nights=p.nights,
            days=p.days,
            starting_price_paise=p.starting_price_paise,
            departure_count=int(departures),
            enquiry_count_30d=int(enquiries),
            status=p.status,
            featured=p.featured,
            updated_at=p.updated_at,
        )
        for p, dest_slug, dest_name, cover_url, departures, enquiries in rows.all()
    ]


async def _assert_slug_free(db: AsyncSession, slug: str, *, except_id: str | None) -> None:
    q = select(Package.id).where(Package.slug == slug)
    if except_id is not None:
        q = q.where(Package.id != except_id)
    if (await db.execute(q)).scalar_one_or_none() is not None:
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG})


async def _assert_destination_exists(db: AsyncSession, destination_id: str) -> None:
    q = select(Destination.id).where(Destination.id == destination_id)
    if (await db.execute(q)).scalar_one_or_none() is None:
        raise ApiError(
            "validation", UNKNOWN_DESTINATION, field_errors={"destinationId": UNKNOWN_DESTINATION}
        )


async def _commit_or_conflict(db: AsyncSession) -> None:
    """The pre-checks give the friendly error on the common path; this is the safety net for a
    write that still reaches a `unique` constraint — a concurrent insert taking the slug, or two
    departures swapping dates (the intermediate state collides before the second row is updated).

    The constraint name decides the message: naming every failure a duplicate slug would send
    the owner hunting through the wrong field.
    """
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        constraint = str(getattr(exc.orig, "constraint_name", "") or exc.orig or "")
        if "uq_departures_package_id_date" in constraint:
            raise ApiError(
                "conflict", DUPLICATE_DEPARTURE, field_errors={"departures": DUPLICATE_DEPARTURE}
            ) from None
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG}) from None


def _apply_fields(pkg: Package, payload: PackageInput) -> None:
    pkg.slug = payload.slug
    pkg.destination_id = payload.destination_id
    pkg.name = payload.name
    pkg.summary = payload.summary
    pkg.themes = list(payload.themes)
    pkg.nights = payload.nights
    pkg.days = payload.days
    pkg.departure_city = payload.departure_city
    pkg.highlights = list(payload.highlights)
    pkg.inclusions = list(payload.inclusions)
    pkg.exclusions = list(payload.exclusions)
    pkg.hotels = [h.model_dump() for h in payload.hotels]
    pkg.faq = [f.model_dump() for f in payload.faq]
    pkg.featured = payload.featured


def _new_days(payload: PackageInput) -> list[ItineraryDay]:
    """`day_no` is the array order — the client never sends it."""
    return [
        ItineraryDay(
            day_no=n,
            title=d.title,
            description=d.description,
            meal_b=d.meals.breakfast,
            meal_l=d.meals.lunch,
            meal_d=d.meals.dinner,
            stay=d.stay,
        )
        for n, d in enumerate(payload.itinerary, start=1)
    ]


def _fill_departure(target: Departure, row: DepartureInput) -> Departure:
    target.date = row.date
    target.seats_total = row.seats_total
    target.guaranteed = row.guaranteed
    target.price_double_paise = row.price_double_paise
    target.price_triple_paise = row.price_triple_paise
    target.price_child_paise = row.price_child_paise
    target.single_supplement_paise = row.single_supplement_paise
    return target


async def _replace_children(db: AsyncSession, pkg: Package, payload: PackageInput) -> None:
    """Rewrite the itinerary and departures of an **existing** package.

    Both child tables carry a unique constraint (`(package_id, day_no)` and `(package_id,
    date)`) and SQLAlchemy's unit of work emits INSERTs before delete-orphan DELETEs — so
    reusing day 1, or a freed date, would collide with the row still in the table. Clearing
    and flushing first puts the DELETEs ahead of the INSERTs. A flush is not a commit, so the
    whole write is still the single transaction 06 §C4 asks for.
    """
    existing = {d.id: d for d in pkg.departures}
    sent_ids = {d.id for d in payload.departures if d.id}
    unknown = sent_ids - existing.keys()
    if unknown:
        raise ApiError(
            "validation", FOREIGN_DEPARTURE, field_errors={"departures": FOREIGN_DEPARTURE}
        )

    pkg.itinerary = []
    pkg.departures = [d for d in pkg.departures if d.id in sent_ids]
    await db.flush()

    pkg.itinerary = _new_days(payload)
    pkg.departures = [
        _fill_departure(existing[row.id] if row.id else Departure(), row)
        for row in payload.departures
    ]


async def create_package(db: AsyncSession, payload: PackageInput) -> AdminPackage:
    """A new package has no children to diff against, so the rows are simply built. Any `id`
    on an incoming departure is ignored — it cannot belong to a package that does not exist
    yet, and a fresh row is what the owner meant."""
    await _assert_destination_exists(db, payload.destination_id)
    await _assert_slug_free(db, payload.slug, except_id=None)
    pkg = Package(status=PackageStatus.DRAFT)
    _apply_fields(pkg, payload)
    pkg.itinerary = _new_days(payload)
    pkg.departures = [_fill_departure(Departure(), row) for row in payload.departures]
    pkg.starting_price_paise = recompute_starting_price(pkg, today=dt.date.today())
    db.add(pkg)
    await _commit_or_conflict(db)
    out = await to_admin(db, await load(db, pkg.id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def update_package(db: AsyncSession, id: str, payload: PackageInput) -> AdminPackage:
    pkg = await load(db, id)
    await _assert_destination_exists(db, payload.destination_id)
    await _assert_slug_free(db, payload.slug, except_id=id)
    old_slug, old_destination_slug = pkg.slug, pkg.destination.slug
    _apply_fields(pkg, payload)
    await _replace_children(db, pkg, payload)
    pkg.starting_price_paise = recompute_starting_price(pkg, today=dt.date.today())
    await _commit_or_conflict(db)
    out = await to_admin(db, await load(db, id))
    await revalidate(
        revalidate_tags(out.slug, out.destination.slug, old_slug, old_destination_slug)
    )
    return out


async def set_status(db: AsyncSession, id: str, status: PackageStatus) -> AdminPackage:
    """Going live runs the four rules; unpublishing is always allowed (06 §C4)."""
    pkg = await load(db, id)
    if status is PackageStatus.LIVE:
        rules = publish_rules(pkg, image_count=len(pkg.images), today=dt.date.today())
        failed = [r for r in rules if not r.ok]
        if failed:
            raise ApiError(
                "conflict",
                "This package is not ready to go live yet",
                field_errors={r.key: r.label for r in failed},
            )
    pkg.status = status
    await db.commit()
    out = await to_admin(db, await load(db, id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def _free_copy_slug(db: AsyncSession, slug: str) -> str:
    """`<slug>-copy`, then `-copy-2`, `-copy-3` — duplicating twice is normal."""
    base = f"{slug}-copy"
    candidate, n = base, 1
    while (
        await db.execute(select(Package.id).where(Package.slug == candidate))
    ).scalar_one_or_none() is not None:
        n += 1
        candidate = f"{base}-{n}"
        if n > 50:
            raise ApiError("conflict", "Too many copies of this package already exist")
    return candidate


async def duplicate_package(db: AsyncSession, id: str) -> AdminPackage:
    """Deep copy as a draft. Image rows are copied but the Blob URLs are shared — the bytes are
    identical, and re-uploading them would only cost storage."""
    source = await load(db, id)
    copy = Package(
        slug=await _free_copy_slug(db, source.slug),
        destination_id=source.destination_id,
        name=f"{source.name} (copy)",
        summary=source.summary,
        themes=list(source.themes),
        nights=source.nights,
        days=source.days,
        departure_city=source.departure_city,
        highlights=list(source.highlights),
        inclusions=list(source.inclusions),
        exclusions=list(source.exclusions),
        hotels=list(source.hotels),
        faq=list(source.faq),
        status=PackageStatus.DRAFT,
        featured=False,
        starting_price_paise=source.starting_price_paise,
    )
    copy.itinerary = [
        ItineraryDay(
            day_no=d.day_no,
            title=d.title,
            description=d.description,
            meal_b=d.meal_b,
            meal_l=d.meal_l,
            meal_d=d.meal_d,
            stay=d.stay,
        )
        for d in source.itinerary
    ]
    copy.departures = [
        Departure(
            date=d.date,
            seats_total=d.seats_total,
            guaranteed=d.guaranteed,
            price_double_paise=d.price_double_paise,
            price_triple_paise=d.price_triple_paise,
            price_child_paise=d.price_child_paise,
            single_supplement_paise=d.single_supplement_paise,
        )
        for d in source.departures
    ]
    # Keep the source order so the cover can be found again by position after the flush.
    source_images = sorted(source.images, key=lambda i: i.position)
    cover_position = next(
        (i.position for i in source_images if i.id == source.cover_image_id), None
    )
    copy.images = [
        PackageImage(url=i.url, alt=i.alt, width=i.width, height=i.height, position=i.position)
        for i in source_images
    ]
    db.add(copy)
    await db.flush()  # ids for the copied image rows, so the cover can point at one
    if cover_position is not None:
        copy.cover_image_id = next(i.id for i in copy.images if i.position == cover_position)
    await _commit_or_conflict(db)
    out = await to_admin(db, await load(db, copy.id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def delete_package(db: AsyncSession, id: str) -> None:
    """`enquiries.package_id` is ON DELETE SET NULL, so the guard has to live here (06 §C4):
    an enquiry that silently lost its package is worse than a refused delete."""
    pkg = await load(db, id)
    count = await _enquiry_count(db, id)
    if count:
        noun = "enquiry references" if count == 1 else "enquiries reference"
        raise ApiError("conflict", f"{count} {noun} this package — it cannot be deleted")
    slug, destination_slug = pkg.slug, pkg.destination.slug
    await db.delete(pkg)
    await db.commit()
    await revalidate(revalidate_tags(slug, destination_slug))
