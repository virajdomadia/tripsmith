"""scripts/seed.py — upsert the typed content into the database, idempotently (S11)."""

import pytest
from argon2 import PasswordHasher
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import models  # models.Testimonial: a module-level "Test*" name would be collected
from app.config import Settings
from app.models import (
    Departure,
    Destination,
    ItineraryDay,
    Package,
    PackageImage,
    User,
)
from app.models.enums import PackageStatus, UserRole
from content import load_content
from scripts.seed import SeedResult, seed

pytestmark = pytest.mark.db


class RecordingStore:
    def __init__(self) -> None:
        self.puts: list[tuple[str, int, str]] = []

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        self.puts.append((pathname, len(data), content_type))
        return f"https://blob.test/{pathname}"


def owner_settings() -> Settings:
    return Settings.model_validate(
        {"owner_email": "owner@tripsmith.demo", "owner_password": SecretStr("demo-pass")}
    )


async def count(db: AsyncSession, model: type) -> int:  # type: ignore[type-arg]
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def test_seed_writes_the_whole_content_tree(db: AsyncSession) -> None:
    content = load_content()
    store = RecordingStore()

    result = await seed(db, content, store, owner_settings())

    assert isinstance(result, SeedResult)
    assert await count(db, Destination) == len(content.destinations) == 1
    assert await count(db, Package) == len(content.packages) == 2
    assert await count(db, ItineraryDay) == sum(p.days for p in content.packages)
    assert await count(db, Departure) == sum(len(p.departures) for p in content.packages)
    assert await count(db, PackageImage) == sum(len(p.photos) for p in content.packages)
    assert await count(db, models.Testimonial) == len(content.testimonials)
    assert await count(db, User) == 1


async def test_seed_twice_changes_nothing(db: AsyncSession) -> None:
    content = load_content()
    first = await seed(db, content, RecordingStore(), owner_settings())
    ids = {p.slug: p.id for p in (await db.execute(select(Package))).scalars()}

    second = await seed(db, content, RecordingStore(), owner_settings())

    assert first.counts == second.counts
    assert {p.slug: p.id for p in (await db.execute(select(Package))).scalars()} == ids
    assert await count(db, ItineraryDay) == sum(p.days for p in content.packages)
    assert await count(db, PackageImage) == sum(len(p.photos) for p in content.packages)
    assert await count(db, models.Testimonial) == len(content.testimonials)


async def test_seed_derives_price_cover_and_image_dimensions(db: AsyncSession) -> None:
    content = load_content()
    await seed(db, content, RecordingStore(), owner_settings())

    pkg = (
        await db.execute(select(Package).where(Package.slug == "north-goa-beaches"))
    ).scalar_one()
    source = next(p for p in content.packages if p.slug == "north-goa-beaches")
    assert pkg.starting_price_paise == min(d.price_double_inr for d in source.departures) * 100
    assert pkg.status is PackageStatus.LIVE
    assert pkg.days == source.nights + 1

    images = (
        (
            await db.execute(
                select(PackageImage)
                .where(PackageImage.package_id == pkg.id)
                .order_by(PackageImage.position)
            )
        )
        .scalars()
        .all()
    )
    assert [i.alt for i in images] == [p.alt for p in source.photos]
    assert pkg.cover_image_id == images[0].id
    assert all(i.width == 1400 and 700 < i.height < 1100 for i in images)
    assert images[0].url == "https://blob.test/packages/north-goa-beaches/vagator-palms-1.jpg"


async def test_seed_uploads_every_photo_to_a_stable_pathname(db: AsyncSession) -> None:
    content = load_content()
    store = RecordingStore()
    await seed(db, content, store, owner_settings())

    pathnames = sorted(p for p, _, _ in store.puts)
    assert pathnames == sorted(
        [f"packages/{p.slug}/{ph.file.split('/')[-1]}" for p in content.packages for ph in p.photos]
        + [f"destinations/{d.slug}/{d.cover.file.split('/')[-1]}" for d in content.destinations]
    )
    assert all(ct == "image/jpeg" and size > 10_000 for _, size, ct in store.puts)


async def test_seed_creates_the_owner_with_an_argon2_hash(db: AsyncSession) -> None:
    await seed(db, load_content(), RecordingStore(), owner_settings())

    owner = (await db.execute(select(User))).scalar_one()
    assert owner.email == "owner@tripsmith.demo"
    assert owner.role is UserRole.OWNER
    assert owner.password_hash and PasswordHasher().verify(owner.password_hash, "demo-pass")


async def test_seed_without_owner_env_skips_the_user(db: AsyncSession) -> None:
    result = await seed(db, load_content(), RecordingStore(), Settings.model_validate({}))
    assert await count(db, User) == 0
    assert "owner" in result.warnings[0]
