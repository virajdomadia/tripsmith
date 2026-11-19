"""QA 2026-11-19 — a read-only owner (`DEMO_READ_ONLY_EMAILS`).

The demo owner login is printed on the site, so anyone could change live packages, prices and
refunds. An owner listed in `DEMO_READ_ONLY_EMAILS` still reads every `/admin/*` page, but every
POST/PUT/PATCH/DELETE there answers `403 forbidden` (`reason: demo_read_only`) from
`require_owner` — one check, so the sweep below covers every admin route, present and future.
"""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Destination
from app.routers.site.guards import UNSAFE
from app.services.auth.deps import READ_ONLY_MESSAGE, READ_ONLY_REASON
from scripts.create_owner import OwnerInputError, check, create_owner
from tests.settings import make_settings
from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie


def read_only(app: FastAPI, emails: str = f" {OWNER_EMAIL.upper()} , other@example.com") -> None:
    app.state.settings = app.state.settings.model_copy(update={"demo_read_only_emails": emails})


async def owner_cookie(client: AsyncClient) -> dict[str, str]:
    res = await client.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert res.status_code == 200, res.text
    return with_cookie(res.cookies["ts_session"])


def test_the_setting_is_a_trimmed_lower_cased_list() -> None:
    assert make_settings().read_only_emails() == frozenset()
    settings = make_settings(demo_read_only_emails=" Owner@Tripsmith.demo, ,b@x.com ")
    assert settings.read_only_emails() == {"owner@tripsmith.demo", "b@x.com"}


@pytest.mark.db
async def test_a_listed_owner_reads_but_cannot_write(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    read_only(db_app)
    headers = await owner_cookie(db_client)
    before = (await db.execute(select(func.count()).select_from(Destination))).scalar_one()

    session = await db_client.get("/auth/session", headers=headers)
    assert session.status_code == 200 and session.json()["readOnly"] is True
    assert (await db_client.get("/admin/destinations", headers=headers)).status_code == 200

    res = await db_client.post("/admin/destinations", json={"slug": "kerala"}, headers=headers)

    assert res.status_code == 403
    assert res.json() == {
        "error": {"code": "forbidden", "message": READ_ONLY_MESSAGE, "reason": READ_ONLY_REASON}
    }
    after = (await db.execute(select(func.count()).select_from(Destination))).scalar_one()
    assert after == before


@pytest.mark.db
async def test_every_admin_write_route_is_refused(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    """Swept from the app's own OpenAPI paths, so a route added later is covered too.
    (Not `app.routes`: FastAPI keeps included routers there as wrappers, not their routes.)"""
    await seeded_with_owner(db)
    read_only(db_app)
    headers = await owner_cookie(db_client)
    writes = [
        (method.upper(), path)
        for path, item in db_app.openapi()["paths"].items()
        if path.startswith("/admin")
        for method in sorted(item)
        if method.upper() in UNSAFE
    ]
    assert len(writes) > 30  # packages, coupons, destinations, refunds, mark-paid, …

    for method, path in writes:
        url = path
        for name in ("ref", "id", "slug", "image_id", "departure_id", "code"):
            url = url.replace(f"{{{name}}}", "x")
        url = url.replace("{", "").replace("}", "")
        res = await db_client.request(method, url, json={}, headers=headers)
        assert res.status_code == 403, (method, path, res.text)
        assert res.json()["error"]["reason"] == READ_ONLY_REASON, (method, path)


@pytest.mark.db
async def test_an_unlisted_owner_still_writes_and_is_not_read_only(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    read_only(db_app, "someone-else@example.com")
    headers = await owner_cookie(db_client)

    session = await db_client.get("/auth/session", headers=headers)
    assert session.json()["readOnly"] is False
    # Reaches the route itself: an invalid body is a 400 from validation, not the 403.
    res = await db_client.post("/admin/destinations", json={"slug": "kerala"}, headers=headers)
    assert res.status_code == 400, res.text


# --- scripts/create_owner.py: the real owner's private login ------------------------------------


@pytest.mark.db
async def test_create_owner_adds_a_private_owner_who_can_write(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    read_only(db_app)  # the demo owner is read-only; the new one is not listed
    password = "a-long-private-passphrase"

    assert await create_owner(db, " Real@Owner.in ", "Viraj", password) is True
    assert await create_owner(db, "real@owner.in", "Viraj", password + "!") is False  # reset

    res = await db_client.post(
        "/auth/login", json={"email": "real@owner.in", "password": password + "!"}
    )
    assert res.status_code == 200 and res.json()["user"]["role"] == "owner"
    assert res.json()["readOnly"] is False
    headers = with_cookie(res.cookies["ts_session"])
    write = await db_client.post("/admin/destinations", json={"slug": "kerala"}, headers=headers)
    assert write.status_code == 400  # past the read-only check, stopped by validation


def test_create_owner_refuses_a_short_password_or_a_bad_email() -> None:
    with pytest.raises(OwnerInputError):
        check("real@owner.in", "short")
    with pytest.raises(OwnerInputError):
        check("not-an-email", "a-long-private-passphrase")
    assert check(" A@B.in ", "a-long-private-passphrase") == "a@b.in"
