"""Seed the database from the typed content in api/content/ (04 §4, 06). Safe to re-run: every
row is upserted by its natural key (slug / date / file), children are replaced in place.

    uv run python scripts/seed.py --database-url postgresql+asyncpg://…          # Blob photos
    uv run python scripts/seed.py --local --database-url postgresql+asyncpg://…  # file URLs
    uv run python scripts/seed.py --only old-goa-weekend --database-url …        # just one

`--only SLUG` (repeatable) writes just those packages: their destinations must already exist and
are read, not rewritten, and the owner, testimonials and every other package are left alone — so
a new trip can be added to production without resetting what the owner has edited there.

`--demo-traveller` (B13) writes only the demo customer and their two completed trips — one with
a published review, one waiting for one — so the review loop can be shown end to end:

    uv run python scripts/seed.py --demo-traveller --database-url …

It needs both packages in `DEMO_TRIPS` to be live. Re-running it resets the unreviewed trip (a
review a visitor wrote there is deleted) and recomputes both packages' ratings. A full seed
never runs it.

A departure that has bookings is never deleted by a re-seed, even when the content no longer
lists it: bookings reference it (ON DELETE RESTRICT), and a past departure carries history.

The target is required: --database-url, or SEED_DATABASE_URL in the environment. There is no
fallback to DATABASE_URL, because api/.env.local holds production there (same rule as
alembic/env.py and ALEMBIC_URL).

The owner user comes from OWNER_EMAIL / OWNER_PASSWORD (skipped with a warning if unset).
"""

import argparse
import asyncio
import datetime as dt
import io
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Runnable both as `python scripts/seed.py` and `python -m scripts.seed` from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image  # noqa: E402
from sqlalchemy import delete, exists, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from app.config import Settings, get_settings  # noqa: E402
from app.infra.db import make_engine  # noqa: E402
from app.infra.storage import BlobStore, LocalStore, StorageNotConfigured, Store  # noqa: E402
from app.models import (  # noqa: E402
    Booking,
    BookingTraveller,
    Departure,
    Destination,
    ItineraryDay,
    Package,
    PackageImage,
    Payment,
    Review,
    Testimonial,
    User,
)
from app.models.enums import (  # noqa: E402
    BookingStatus,
    Occupancy,
    PackageStatus,
    PaymentProvider,
    PaymentStatus,
    UserRole,
)
from app.schemas.bookings import QuoteTraveller  # noqa: E402
from app.services.analytics import ist_today  # noqa: E402
from app.services.auth.passwords import hash_password  # noqa: E402
from app.services.booking.pricing import build_quote  # noqa: E402
from app.services.catalog.pricing import starting_price  # noqa: E402
from app.services.reviews import recompute_rating  # noqa: E402
from content import Content, load_content  # noqa: E402
from content._schema import DestinationContent, PackageContent, Photo  # noqa: E402


@dataclass
class SeedResult:
    counts: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _read_photo(photo: Photo) -> tuple[bytes, int, int]:
    data = photo.path.read_bytes()
    with Image.open(io.BytesIO(data)) as im:
        return data, im.width, im.height


async def _upload(store: Store, pathname: str, photo: Photo) -> tuple[str, int, int]:
    data, width, height = _read_photo(photo)
    url = await store.put(pathname, data, "image/jpeg")
    return url, width, height


async def _seed_owner(db: AsyncSession, settings: Settings, result: SeedResult) -> None:
    if not settings.owner_email or settings.owner_password is None:
        result.warnings.append("OWNER_EMAIL / OWNER_PASSWORD not set — owner user not created")
        return
    email = settings.owner_email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(email=email, name="Owner")
        db.add(user)
    user.role = UserRole.OWNER
    user.password_hash = hash_password(settings.owner_password.get_secret_value())
    await db.flush()
    result.counts["users"] = 1


async def _seed_destination(
    db: AsyncSession, content: DestinationContent, store: Store
) -> Destination:
    row = (
        await db.execute(select(Destination).where(Destination.slug == content.slug))
    ).scalar_one_or_none()
    if row is None:
        row = Destination(slug=content.slug)
        db.add(row)
    cover_url, _, _ = await _upload(
        store, f"destinations/{content.slug}/{Path(content.cover.file).name}", content.cover
    )
    row.name = content.name
    row.tagline = content.tagline
    row.intro = content.intro
    row.cover_url = cover_url
    row.region = content.region
    row.best_months = list(content.best_months)
    row.position = content.position
    await db.flush()
    return row


@dataclass
class _Priced:
    seats_left: int
    guaranteed: bool
    price_double_paise: int


async def _seed_package(
    db: AsyncSession,
    content: PackageContent,
    destinations: dict[str, Destination],
    store: Store,
    today: dt.date,
) -> Package:
    row = (
        await db.execute(select(Package).where(Package.slug == content.slug))
    ).scalar_one_or_none()
    if row is None:
        row = Package(slug=content.slug)
        db.add(row)
    row.destination_id = destinations[content.destination].id
    row.name = content.name
    row.summary = content.summary
    row.themes = list(content.themes)
    row.nights = content.nights
    row.days = content.days
    row.departure_city = content.departure_city
    row.highlights = list(content.highlights)
    row.inclusions = list(content.inclusions)
    row.exclusions = list(content.exclusions)
    row.hotels = [h.model_dump() for h in content.hotels]
    row.faq = [f.model_dump() for f in content.faq]
    row.status = content.status
    row.featured = content.featured
    # "min live-departure price": departures already gone do not set the "from ₹" figure.
    row.starting_price_paise = starting_price(
        _Priced(d.seats_total, d.guaranteed, d.price_double_inr * 100)
        for d in content.departures
        if d.date >= today
    )
    row.cover_image_id = None
    await db.flush()

    # Children are replaced wholesale — the content module is the source of truth.
    await db.execute(delete(ItineraryDay).where(ItineraryDay.package_id == row.id))
    for day_no, day in enumerate(content.itinerary, start=1):
        db.add(
            ItineraryDay(
                package_id=row.id,
                day_no=day_no,
                title=day.title,
                description=day.description,
                meal_b="B" in day.meals,
                meal_l="L" in day.meals,
                meal_d="D" in day.meals,
                stay=day.stay,
                location_name=day.location_name,
            )
        )

    existing = {
        d.date: d
        for d in (
            await db.execute(select(Departure).where(Departure.package_id == row.id))
        ).scalars()
    }
    wanted = {d.date for d in content.departures}
    booked = set(
        (
            await db.execute(
                select(Departure.id).where(
                    Departure.package_id == row.id,
                    exists().where(Booking.departure_id == Departure.id),
                )
            )
        ).scalars()
    )
    for date, dep in existing.items():
        if date not in wanted and dep.id not in booked:
            await db.delete(dep)
    for src in content.departures:
        dep = existing.get(src.date) or Departure(package_id=row.id, date=src.date)
        dep.seats_total = src.seats_total
        dep.guaranteed = src.guaranteed
        dep.price_double_paise = src.price_double_inr * 100
        dep.price_triple_paise = src.price_triple_inr * 100
        dep.price_child_paise = src.price_child_inr * 100
        dep.single_supplement_paise = src.single_supplement_inr * 100
        db.add(dep)

    await db.execute(delete(PackageImage).where(PackageImage.package_id == row.id))
    images: list[PackageImage] = []
    for position, photo in enumerate(content.photos):
        url, width, height = await _upload(
            store, f"packages/{content.slug}/{Path(photo.file).name}", photo
        )
        image = PackageImage(
            package_id=row.id, url=url, alt=photo.alt, width=width, height=height, position=position
        )
        db.add(image)
        images.append(image)
    await db.flush()
    row.cover_image_id = images[0].id
    await db.flush()
    return row


async def _seed_testimonials(
    db: AsyncSession, content: Content, packages: dict[str, Package]
) -> None:
    await db.execute(delete(Testimonial))
    for t in content.testimonials:
        db.add(
            Testimonial(
                name=t.name,
                city=t.city,
                text=t.text,
                rating=t.rating,
                package_id=packages[t.package].id if t.package else None,
                position=t.position,
            )
        )
    await db.flush()


async def seed(
    db: AsyncSession,
    content: Content,
    store: Store,
    settings: Settings,
    *,
    today: dt.date | None = None,
    only: set[str] | None = None,
) -> SeedResult:
    today = today or ist_today()
    result = SeedResult()
    if only:
        return await _seed_only(db, content, store, only, today, result)
    await _seed_owner(db, settings, result)
    destinations = {d.slug: await _seed_destination(db, d, store) for d in content.destinations}
    packages = {
        p.slug: await _seed_package(db, p, destinations, store, today) for p in content.packages
    }
    await _seed_testimonials(db, content, packages)
    await db.commit()
    result.counts.update(
        destinations=len(destinations),
        packages=len(packages),
        itinerary_days=sum(p.days for p in content.packages),
        departures=sum(len(p.departures) for p in content.packages),
        images=sum(len(p.photos) for p in content.packages),
        testimonials=len(content.testimonials),
    )
    return result


async def _seed_only(
    db: AsyncSession,
    content: Content,
    store: Store,
    only: set[str],
    today: dt.date,
    result: SeedResult,
) -> SeedResult:
    chosen = [p for p in content.packages if p.slug in only]
    if missing := only - {p.slug for p in chosen}:
        raise SystemExit(f"No such package in api/content: {', '.join(sorted(missing))}")
    destinations: dict[str, Destination] = {}
    for slug in {p.destination for p in chosen}:
        row = (
            await db.execute(select(Destination).where(Destination.slug == slug))
        ).scalar_one_or_none()
        if row is None:
            raise SystemExit(f"Destination {slug} is not in this database — run a full seed")
        destinations[slug] = row
    for p in chosen:
        await _seed_package(db, p, destinations, store, today)
    await db.commit()
    result.counts.update(
        packages=len(chosen),
        itinerary_days=sum(p.days for p in chosen),
        departures=sum(len(p.departures) for p in chosen),
        images=sum(len(p.photos) for p in chosen),
    )
    return result


@dataclass(frozen=True)
class DemoTrip:
    ref: str  # fixed, so a re-run finds the same booking
    slug: str
    days_ago: int  # where the departure lands on the first run; kept after that
    review: tuple[int, str] | None  # published; None = left for the visitor to write


DEMO_EMAIL = "traveller.demo@example.com"  # a reserved domain: sign-in shows the code on screen
DEMO_NAME = "Meera Iyer"
DEMO_PHONE = "9800000013"
DEMO_PARTY = ((DEMO_NAME, 34), ("Arjun Iyer", 36))
DEMO_TRIPS = (
    DemoTrip(
        "TB-DEMO01",
        "manali-kasol-tosh",
        60,
        (
            5,
            "The Parvati valley was the highlight: the walk up to Tosh, the cafés in Kasol and a "
            "driver who knew every bend of the road. Hotels were clean and warm, and the team "
            "answered on WhatsApp within minutes when our flight was late.",
        ),
    ),
    DemoTrip("TB-DEMO02", "munnar-alleppey-houseboat", 21, None),
)


async def seed_demo_traveller(
    db: AsyncSession,
    *,
    today: dt.date | None = None,
    trips: tuple[DemoTrip, ...] = DEMO_TRIPS,
) -> SeedResult:
    """The demo customer (B13): each trip a completed, fully paid booking for two on a past
    departure. Idempotent: bookings are found by their fixed refs and keep their departures;
    each trip's review is reset to the one in `trips` (or none)."""
    today = today or ist_today()
    now = dt.datetime.now(dt.UTC)
    user = (await db.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
    if user is None:
        user = User(email=DEMO_EMAIL, name=DEMO_NAME, role=UserRole.CUSTOMER)
        db.add(user)
        await db.flush()
    package_ids: list[str] = []
    for trip in trips:
        pkg = (
            await db.execute(
                select(Package).where(
                    Package.slug == trip.slug, Package.status == PackageStatus.LIVE
                )
            )
        ).scalar_one_or_none()
        if pkg is None:
            raise SystemExit(f"Package {trip.slug} is not live in this database — seed it first")
        package_ids.append(pkg.id)
        booking = (
            await db.execute(select(Booking).where(Booking.ref == trip.ref))
        ).scalar_one_or_none()
        if booking is None:
            booking = await _demo_booking(db, pkg, user, trip, today=today, now=now)
        await db.execute(delete(Review).where(Review.booking_id == booking.id))
        if trip.review is not None:
            rating, text = trip.review
            db.add(
                Review(
                    booking_id=booking.id,
                    package_id=pkg.id,
                    user_id=user.id,
                    rating=rating,
                    text=text,
                    approved=True,
                    moderated_at=now,
                )
            )
    await db.flush()
    for package_id in package_ids:
        await recompute_rating(db, package_id)
    await db.commit()
    result = SeedResult()
    result.counts.update(
        demo_bookings=len(trips), demo_reviews=sum(t.review is not None for t in trips)
    )
    return result


async def _demo_booking(
    db: AsyncSession,
    pkg: Package,
    user: User,
    trip: DemoTrip,
    *,
    today: dt.date,
    now: dt.datetime,
) -> Booking:
    """A past departure priced like the package's latest one, and a completed booking on it."""
    template = (
        (
            await db.execute(
                select(Departure)
                .where(Departure.package_id == pkg.id)
                .order_by(Departure.date.desc())
            )
        )
        .scalars()
        .first()
    )
    if template is None:
        raise SystemExit(f"Package {pkg.slug} has no departures to price the demo trip from")
    date = today - dt.timedelta(days=trip.days_ago)
    dep = (
        await db.execute(
            select(Departure).where(Departure.package_id == pkg.id, Departure.date == date)
        )
    ).scalar_one_or_none()
    if dep is None:
        dep = Departure(
            package_id=pkg.id,
            date=date,
            seats_total=template.seats_total,
            guaranteed=True,
            price_double_paise=template.price_double_paise,
            price_triple_paise=template.price_triple_paise,
            price_child_paise=template.price_child_paise,
            single_supplement_paise=template.single_supplement_paise,
        )
        db.add(dep)
        await db.flush()
    quote = build_quote(
        dep,
        pkg,
        [QuoteTraveller(occupancy=Occupancy.DOUBLE) for _ in DEMO_PARTY],
        seats_left=dep.seats_total,
        deal_base=0,
        now=now,
    )
    booked_at = dt.datetime.combine(date, dt.time(6), tzinfo=dt.UTC) - dt.timedelta(days=30)
    booking = Booking(
        ref=trip.ref,
        package_id=pkg.id,
        departure_id=dep.id,
        user_id=user.id,
        status=BookingStatus.COMPLETED,
        hold_expires_at=booked_at + dt.timedelta(minutes=10),
        contact_name=DEMO_NAME,
        contact_phone=DEMO_PHONE,
        contact_email=DEMO_EMAIL,
        quote=quote.model_dump(mode="json", by_alias=True),
        total_paise=quote.total_paise,
        paid_paise=quote.total_paise,
        created_at=booked_at,
    )
    db.add(booking)
    await db.flush()
    for position, (name, age) in enumerate(DEMO_PARTY):
        db.add(
            BookingTraveller(
                booking_id=booking.id,
                name=name,
                age=age,
                occupancy=Occupancy.DOUBLE,
                position=position,
            )
        )
    db.add(
        Payment(
            booking_id=booking.id,
            provider=PaymentProvider.OFFLINE,
            amount_paise=quote.total_paise,
            status=PaymentStatus.CAPTURED,
            # Paid when booked, not on the day the seed ran: the timeline reads these.
            created_at=booked_at + dt.timedelta(minutes=4),
            updated_at=booked_at + dt.timedelta(minutes=4),
        )
    )
    await db.flush()
    return booking


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--local", action="store_true", help="no Blob upload; file URLs instead")
    parser.add_argument("--database-url", help="target database (required, or SEED_DATABASE_URL)")
    parser.add_argument(
        "--local-base-url",
        default="http://localhost:8000/seed-photos",
        help="URL prefix for --local photo URLs",
    )
    parser.add_argument(
        "--demo-traveller",
        action="store_true",
        help="seed just the demo traveller, their two past trips and one review (B13)",
    )
    parser.add_argument(
        "--only",
        action="append",
        metavar="SLUG",
        help="seed just this package (repeatable); leaves everything else untouched",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    url = args.database_url or os.environ.get("SEED_DATABASE_URL")
    if not url:
        print(
            "No target database. Pass --database-url (or set SEED_DATABASE_URL); the seed never"
            " falls back to DATABASE_URL, which is production in api/.env.local.",
            file=sys.stderr,
        )
        return 2
    try:
        store: Store = LocalStore(args.local_base_url) if args.local else BlobStore(settings)
    except StorageNotConfigured as exc:
        print(f"{exc} — set it in api/.env.local or pass --local", file=sys.stderr)
        return 2

    content = load_content()
    engine = make_engine(url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            if args.demo_traveller:
                result = await seed_demo_traveller(db)
            else:
                result = await seed(
                    db, content, store, settings, only=set(args.only) if args.only else None
                )
    finally:
        await engine.dispose()
    for key, value in result.counts.items():
        print(f"{key:16} {value}")
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
