"""Owner-side package CRUD (F18, 06 §A3 §C4). Every write revalidates the public pages.

The rule and price functions at the top are pure over a loaded `Package` graph so the same
logic serves the read, the write and the status endpoints — and tests them without a session.
"""

import datetime as dt
from collections.abc import Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import Departure, Destination, Enquiry, ItineraryDay, Package, PackageImage
from app.models.catalog import departure_availability
from app.schemas.catalog import (
    AdminDeparture,
    AdminImage,
    AdminPackage,
    AdminPackageRow,
    DestinationRef,
    FaqItem,
    HotelOut,
    ItineraryDayOut,
    Meals,
    PublishRule,
)

DUPLICATE_SLUG = "A package with this slug already exists"
ENQUIRY_WINDOW_DAYS = 30
NOT_FOUND = "Package not found"


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
    pkg = (await db.execute(_loaded().where(Package.id == id))).scalar_one_or_none()
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
