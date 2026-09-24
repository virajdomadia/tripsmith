"""services/catalog/cover_url.py — the runtime half of COVER_URL_PATTERN: localhost only off
Vercel, and only this deployment's own Blob store once a token is configured. Settings are
passed in (the app's own), so nothing here reads the process env or api/.env.local."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.storage import public_host
from app.services.catalog.cover_url import (
    LOCALHOST_MESSAGE,
    OTHER_STORE_MESSAGE,
    check_cover_url,
    cover_url_problem,
)
from tests.settings import make_settings
from tests.test_admin_destinations import owner_cookie, payload, revalidated  # noqa: F401

OWN = "https://89fzkazlv3xxpipg.public.blob.vercel-storage.com/destinations/uploads/k.jpg"
OTHER = "https://someoneelse.public.blob.vercel-storage.com/destinations/uploads/k.jpg"
LOCAL = "http://localhost:8001/seed-photos/destinations/goa/x.jpg"
# Assembled at runtime so secret scanners don't flag a fake token; the store id is the public
# host prefix (not secret), the rest is made up and contains underscores on purpose.
TOKEN = "_".join(["vercel", "blob", "rw", "89FzKaZLV3xXpiPG", "fake", "secret", "part"])
WITH_STORE = make_settings(blob_read_write_token=TOKEN)
NO_STORE = make_settings()


def test_public_host_is_the_lower_cased_store_id() -> None:
    assert public_host(TOKEN) == "89fzkazlv3xxpipg.public.blob.vercel-storage.com"
    assert public_host("not-a-blob-token") is None
    assert public_host("vercel_blob_rw__secret") is None


def test_localhost_only_off_vercel() -> None:
    assert cover_url_problem(LOCAL, NO_STORE, on_vercel=False) is None
    assert cover_url_problem(LOCAL, WITH_STORE, on_vercel=False) is None
    assert cover_url_problem(LOCAL, NO_STORE, on_vercel=True) == LOCALHOST_MESSAGE


def test_with_a_token_only_the_own_store() -> None:
    assert cover_url_problem(OWN, WITH_STORE, on_vercel=True) is None
    assert cover_url_problem(OTHER, WITH_STORE, on_vercel=True) == OTHER_STORE_MESSAGE
    assert cover_url_problem(OTHER, NO_STORE, on_vercel=True) is None  # no token: any store


def test_check_raises_the_validation_envelope_on_cover_url() -> None:
    with pytest.raises(ApiError) as exc:
        check_cover_url(OTHER, WITH_STORE, on_vercel=False)
    assert exc.value.code == "validation"
    assert exc.value.field_errors == {"coverUrl": OTHER_STORE_MESSAGE}


@pytest.mark.db
@pytest.mark.usefixtures("revalidated")
async def test_the_admin_routes_use_the_apps_settings(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("VERCEL", "1")
    db_app.state.settings = WITH_STORE
    cookie = await owner_cookie(db, db_client)
    body = payload().model_dump(by_alias=True)

    for cover, message in ((LOCAL, LOCALHOST_MESSAGE), (OTHER, OTHER_STORE_MESSAGE)):
        res = await db_client.post(
            "/admin/destinations", json={**body, "coverUrl": cover}, headers=cookie
        )
        assert res.status_code == 400, res.text
        assert res.json()["error"]["fieldErrors"] == {"coverUrl": message}

    created = await db_client.post(
        "/admin/destinations", json={**body, "coverUrl": OWN}, headers=cookie
    )
    assert created.status_code == 201, created.text
    res = await db_client.put(
        f"/admin/destinations/{created.json()['id']}",
        json={**body, "coverUrl": OTHER},
        headers=cookie,
    )
    assert res.status_code == 400 and res.json()["error"]["fieldErrors"] == {
        "coverUrl": OTHER_STORE_MESSAGE
    }
