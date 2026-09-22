"""F18 gallery ops: `/admin/packages/{id}/images` (06 §C3, §C4)."""

import io
from collections.abc import Sequence

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Package, PackageImage
from app.services.catalog import admin_package_images as svc
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_admin_packages import owner_cookie, package_by_slug
from tests.test_catalog import RecordingStore


def jpeg_bytes(width: int = 1200, height: int = 800) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (30, 80, 200)).save(buf, format="JPEG")
    return buf.getvalue()


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_package_images.revalidate", rec)
    return rec


@pytest.mark.db
async def test_upload_appends_and_the_first_image_becomes_the_cover(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    bare = Package(
        slug="bare-package",
        destination_id=(await package_by_slug(db, "north-goa-beaches")).destination_id,
        name="Bare package",
        summary="A package with no photos at all, used to prove the first upload wins cover.",
        nights=2,
        days=3,
    )
    db.add(bare)
    await db.commit()

    store = RecordingStore()
    first = await svc.add_image(db, store, bare.id, jpeg_bytes(), "image/jpeg")
    assert first.position == 0 and first.width == 1200
    await db.refresh(bare)
    assert bare.cover_image_id == first.id, "the first photo is the cover"

    second = await svc.add_image(db, store, bare.id, jpeg_bytes(), "image/jpeg")
    assert second.position == 1
    await db.refresh(bare)
    assert bare.cover_image_id == first.id, "a later upload does not steal the cover"
    assert all(p.startswith("packages/bare-package/uploads/") for p in store.puts), store.puts


@pytest.mark.db
async def test_upload_refuses_a_non_image(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pkg = await package_by_slug(db, "north-goa-beaches")
    with pytest.raises(ApiError) as exc:
        await svc.add_image(db, RecordingStore(), pkg.id, b"not an image", "application/pdf")
    assert exc.value.code == "validation" and "file" in (exc.value.field_errors or {})


@pytest.mark.db
async def test_reorder_rewrites_positions_and_moves_the_cover(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pkg = await package_by_slug(db, "north-goa-beaches")
    ids = [
        i.id
        for i in sorted(
            (await db.execute(select(PackageImage).where(PackageImage.package_id == pkg.id)))
            .scalars()
            .all(),
            key=lambda i: i.position,
        )
    ]
    reversed_ids = list(reversed(ids))
    out = await svc.reorder_images(db, pkg.id, reversed_ids, cover_id=reversed_ids[0])
    assert [i.id for i in out.images] == reversed_ids
    assert [i.position for i in out.images] == list(range(len(ids)))
    assert out.cover_image_id == reversed_ids[0]
    assert revalidated.calls


@pytest.mark.db
async def test_reorder_rejects_a_partial_order_or_a_foreign_cover(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pkg = await package_by_slug(db, "north-goa-beaches")
    ids = [
        i.id
        for i in (await db.execute(select(PackageImage).where(PackageImage.package_id == pkg.id)))
        .scalars()
        .all()
    ]
    with pytest.raises(ApiError) as exc:
        await svc.reorder_images(db, pkg.id, ids[:-1], cover_id=None)
    assert exc.value.code == "validation"
    with pytest.raises(ApiError):
        await svc.reorder_images(db, pkg.id, ids, cover_id="not-an-image-of-this-package")
    assert revalidated.calls == []


@pytest.mark.db
async def test_alt_text_and_delete_clear_the_cover_when_needed(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pkg = await package_by_slug(db, "north-goa-beaches")
    cover_id = pkg.cover_image_id
    assert cover_id

    updated = await svc.set_alt(db, pkg.id, cover_id, "Palms over Vagator beach at sunset")
    assert updated.alt == "Palms over Vagator beach at sunset"

    await svc.remove_image(db, pkg.id, cover_id)
    await db.refresh(pkg)
    assert pkg.cover_image_id != cover_id
    assert pkg.cover_image_id is not None, "the next photo takes over as cover"

    with pytest.raises(ApiError) as exc:
        await svc.remove_image(db, pkg.id, "nope")
    assert exc.value.code == "not_found"


@pytest.mark.db
async def test_image_routes_require_the_owner(db: AsyncSession, db_client: AsyncClient) -> None:
    assert (await db_client.post("/admin/packages/x/images")).status_code == 401
    assert (await db_client.patch("/admin/packages/x/images", json={})).status_code == 401
    assert (await db_client.patch("/admin/packages/x/images/y", json={})).status_code == 401
    assert (await db_client.delete("/admin/packages/x/images/y")).status_code == 401


@pytest.mark.db
async def test_upload_route_reports_unconfigured_storage(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    pkg = await package_by_slug(db, "north-goa-beaches")
    db_app.state.store = None
    res = await db_client.post(
        f"/admin/packages/{pkg.id}/images",
        files={"file": ("x.jpg", jpeg_bytes(), "image/jpeg")},
        headers=cookie,
    )
    assert res.status_code == 500 and res.json()["error"]["code"] == "internal"


@pytest.mark.db
async def test_image_routes_round_trip(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    pkg = await package_by_slug(db, "north-goa-beaches")
    db_app.state.store = RecordingStore()

    created = await db_client.post(
        f"/admin/packages/{pkg.id}/images",
        files={"file": ("x.jpg", jpeg_bytes(), "image/jpeg")},
        headers=cookie,
    )
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    image = created.json()

    alt = await db_client.patch(
        f"/admin/packages/{pkg.id}/images/{image['id']}",
        json={"alt": "A blue test image"},
        headers=cookie,
    )
    assert alt.status_code == 200 and alt.json()["alt"] == "A blue test image"

    detail = (await db_client.get(f"/admin/packages/{pkg.id}", headers=cookie)).json()
    order = list(reversed([i["id"] for i in detail["images"]]))
    moved = await db_client.patch(
        f"/admin/packages/{pkg.id}/images",
        json={"order": order, "coverId": order[0]},
        headers=cookie,
    )
    assert moved.status_code == 200
    assert [i["id"] for i in moved.json()["images"]] == order

    gone = await db_client.delete(f"/admin/packages/{pkg.id}/images/{image['id']}", headers=cookie)
    assert gone.status_code == 204
