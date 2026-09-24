"""Seed the database from the typed content in api/content/ (04 §4, 06). Safe to re-run: every
row is upserted by its natural key (slug / date / file), children are replaced in place.

    uv run python scripts/seed.py            # uploads photos to Vercel Blob, needs the token
    uv run python scripts/seed.py --local    # file URLs served by the dev server instead
    uv run python scripts/seed.py --database-url postgresql+asyncpg://…   # another target

The owner user comes from OWNER_EMAIL / OWNER_PASSWORD (skipped with a warning if unset).
"""

import argparse
import asyncio
import datetime as dt
import io
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Runnable both as `python scripts/seed.py` and `python -m scripts.seed` from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker  # noqa: E402

from app.config import Settings, get_settings  # noqa: E402
from app.infra.db import make_engine  # noqa: E402
from app.infra.storage import BlobStore, LocalStore, StorageNotConfigured, Store  # noqa: E402
from app.models import (  # noqa: E402
    Departure,
    Destination,
    ItineraryDay,
    Package,
    PackageImage,
    Testimonial,
    User,
)
from app.models.enums import UserRole  # noqa: E402
from app.services.analytics import ist_today  # noqa: E402
from app.services.auth.passwords import hash_password  # noqa: E402
from app.services.catalog.pricing import starting_price  # noqa: E402
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
    for date, dep in existing.items():
        if date not in wanted:
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
) -> SeedResult:
    today = today or ist_today()
    result = SeedResult()
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


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--local", action="store_true", help="no Blob upload; file URLs instead")
    parser.add_argument("--database-url", help="override DATABASE_URL")
    parser.add_argument(
        "--local-base-url",
        default="http://localhost:8000/seed-photos",
        help="URL prefix for --local photo URLs",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    url = args.database_url or (
        settings.database_url.get_secret_value() if settings.database_url else None
    )
    if not url:
        print(
            "DATABASE_URL is not set (api/.env.local) and --database-url not given", file=sys.stderr
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
            result = await seed(db, content, store, settings)
    finally:
        await engine.dispose()
    for key, value in result.counts.items():
        print(f"{key:16} {value}")
    for warning in result.warnings:
        print(f"warning: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
