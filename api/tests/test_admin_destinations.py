"""F17 destination CRUD: service + `/admin/destinations` routes (06 §A3, §C-REST)."""

from collections.abc import Sequence
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Destination, Package
from app.schemas.catalog import DestinationInput
from app.services.catalog import admin_destinations as svc
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

INTRO = "Two paragraphs of markdown intro text that comfortably clears the minimum length rule."


def payload(**overrides: object) -> DestinationInput:
    fields: dict[str, object] = {
        "slug": "kerala",
        "name": "Kerala",
        "tagline": "Backwaters and tea hills",
        "intro": INTRO,
        "coverUrl": "https://blob.test/destinations/uploads/k.jpg",
        "region": "South India",
        "bestMonths": [10, 11, 12, 1],
        "position": 2,
    }
    fields.update(overrides)
    return DestinationInput.model_validate(fields)


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_destinations.revalidate", rec)
    return rec


# --- schema ---------------------------------------------------------------------------------------


def test_input_normalises_months_and_rejects_bad_slugs() -> None:
    assert payload(bestMonths=[12, 1, 1, 11]).best_months == [1, 11, 12]
    with pytest.raises(ValidationError):
        payload(slug="Kerala Hills")
    with pytest.raises(ValidationError):
        payload(bestMonths=[])
    with pytest.raises(ValidationError):
        payload(bestMonths=[13])
    with pytest.raises(ValidationError):
        payload(coverUrl="not-a-url")
    with pytest.raises(ValidationError):
        payload(intro="short")


def test_input_strips_before_checking_length() -> None:
    assert payload(name="  Kerala  ").name == "Kerala"
    padded_tagline = " " + "x" * 80 + " "
    assert payload(tagline=padded_tagline).tagline == "x" * 80
    with pytest.raises(ValidationError):
        payload(name="   ")


# --- service --------------------------------------------------------------------------------------


@pytest.mark.db
async def test_list_includes_destinations_without_live_packages(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    created = await svc.create_destination(db, payload())
    rows = await svc.list_destinations(db)
    assert [r.slug for r in rows] == ["goa", "kerala"]  # position, then name
    goa = rows[0]
    assert goa.package_count == 2 and goa.live_package_count == 2
    assert created.package_count == 0 and created.live_package_count == 0
    assert created.id and created.updated_at is not None
    assert revalidated.calls == [["destinations", "packages", "home", "destination:kerala"]]


@pytest.mark.db
async def test_create_rejects_a_duplicate_slug(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with pytest.raises(ApiError) as exc:
        await svc.create_destination(db, payload(slug="goa"))
    assert exc.value.code == "conflict" and exc.value.field_errors == {
        "slug": "A destination with this slug already exists"
    }
    assert revalidated.calls == []


@pytest.mark.db
async def test_create_maps_a_concurrent_duplicate_slug_to_conflict(
    db: AsyncSession, revalidated: RecordingRevalidate, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Bypasses the pre-check to prove the `IntegrityError` safety net, not `_assert_slug_free`."""
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    monkeypatch.setattr(svc, "_assert_slug_free", AsyncMock(return_value=None))
    with pytest.raises(ApiError) as exc:
        await svc.create_destination(db, payload(slug="goa"))
    assert exc.value.code == "conflict" and exc.value.field_errors == {
        "slug": "A destination with this slug already exists"
    }
    assert revalidated.calls == []


@pytest.mark.db
async def test_update_changes_fields_and_revalidates_the_old_slug(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    goa = (await db.execute(select(Destination).where(Destination.slug == "goa"))).scalar_one()
    out = await svc.update_destination(db, goa.id, payload(slug="goa-beaches", name="Goa beaches"))
    assert out.slug == "goa-beaches" and out.name == "Goa beaches" and out.package_count == 2
    assert revalidated.calls == [
        ["destinations", "packages", "home", "destination:goa-beaches", "destination:goa"]
    ]
    with pytest.raises(ApiError) as exc:
        await svc.update_destination(db, "nope", payload())
    assert exc.value.code == "not_found"


@pytest.mark.db
async def test_delete_is_blocked_while_packages_exist(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    goa = (await db.execute(select(Destination).where(Destination.slug == "goa"))).scalar_one()
    with pytest.raises(ApiError) as exc:
        await svc.delete_destination(db, goa.id)
    assert exc.value.code == "conflict"
    assert exc.value.message == "2 packages use this destination — delete or move them first"
    kerala = await svc.create_destination(db, payload())
    revalidated.calls.clear()
    await svc.delete_destination(db, kerala.id)
    with pytest.raises(ApiError):
        await svc.get_destination(db, kerala.id)
    assert [r.slug for r in await svc.list_destinations(db)] == ["goa"]
    assert revalidated.calls == [["destinations", "packages", "home", "destination:kerala"]]


@pytest.mark.db
async def test_delete_is_blocked_with_the_singular_noun_for_one_package(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    kerala = await svc.create_destination(db, payload())
    db.add(
        Package(
            slug="kerala-solo-package",
            destination_id=kerala.id,
            name="Kerala solo package",
            summary="One package to trip the singular-noun branch",
            nights=1,
            days=2,
        )
    )
    await db.commit()
    with pytest.raises(ApiError) as exc:
        await svc.delete_destination(db, kerala.id)
    assert exc.value.message == "1 package uses this destination — delete or move them first"
