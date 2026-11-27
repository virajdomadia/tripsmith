"""QA 2026-11-19 — a read-only owner (`DEMO_READ_ONLY_EMAILS`).

The demo owner login is printed on the site, so anyone could change live packages, prices and
refunds. An owner listed in `DEMO_READ_ONLY_EMAILS` still reads every `/admin/*` page, but every
POST/PUT/PATCH/DELETE there answers `403 forbidden` (`reason: demo_read_only`) from
`require_owner` — one check, so the sweep below covers every admin route, present and future.
"""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic_settings import SettingsConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import DEMO_OWNER_EMAIL, Settings
from app.models import Destination, GstDocument
from app.routers.site.guards import UNSAFE
from app.services.auth.deps import READ_ONLY_MESSAGE, READ_ONLY_REASON
from scripts.create_owner import OwnerInputError, check, create_owner
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import with_webhook_secret
from tests.test_bookings_desk import owner_cookie as desk_owner_cookie
from tests.test_email_send import FakeSender
from tests.test_gst_documents import paid
from tests.test_waitlist import SETTINGS as WAITLIST_SETTINGS
from tests.test_waitlist import join, lapse_holds, sold_out

__all__ = ["rzp"]


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


# --- review 2026-11-27 (C1/M1): the switch fails safe in production -----------------------------


class EnvOnlySettings(Settings):
    model_config = SettingsConfigDict(env_file=None)


@pytest.mark.parametrize(
    ("vercel_env", "demo", "emails", "read_only"),
    [
        ("production", None, None, {DEMO_OWNER_EMAIL}),  # lost on production: the demo login
        ("production", None, "", {DEMO_OWNER_EMAIL}),
        ("production", None, "a@b.in", {"a@b.in"}),  # an explicit list is used as given
        ("production", "false", None, set()),  # a private deployment, no published login
        ("preview", None, None, set()),
        (None, None, None, set()),  # local dev and CI
    ],
)
def test_the_read_only_list_defaults_to_the_demo_login_in_production(
    monkeypatch: pytest.MonkeyPatch,
    vercel_env: str | None,
    demo: str | None,
    emails: str | None,
    read_only: set[str],
) -> None:
    for key, value in (
        ("VERCEL_ENV", vercel_env),
        ("PUBLIC_DEMO_OWNER", demo),
        ("DEMO_READ_ONLY_EMAILS", emails),
    ):
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    assert EnvOnlySettings().read_only_emails() == read_only


# --- review 2026-11-27 (M2): no GET changes data for a read-only owner --------------------------


@pytest.mark.db
async def test_a_read_only_owner_reading_the_waitlist_does_not_walk_it(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    db_app.state.settings = WAITLIST_SETTINGS
    sender = FakeSender()
    db_app.state.email_sender = sender
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "bina", 2)
    owner = await desk_owner_cookie(db)
    read_only(db_app, DEMO_OWNER_EMAIL)
    await lapse_holds(db, dep_id)  # seats free up: a walk would offer them to Bina

    res = await db_client.get(f"/admin/departures/{dep_id}/waitlist", headers=owner)

    assert res.status_code == 200, res.text
    assert [e["state"] for e in res.json()["live"]] == ["waiting"]
    assert sender.sent == []


@pytest.mark.db
async def test_a_read_only_owner_cannot_number_a_gst_document_by_downloading_it(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    owner = await desk_owner_cookie(db)
    _, departure = await seeded(db, seats=8)
    ref = await paid(db_client, departure.id, 1)
    await db.execute(delete(GstDocument).where(GstDocument.kind == "invoice"))  # event missed it
    await db.commit()
    read_only(db_app, DEMO_OWNER_EMAIL)

    res = await db_client.get(f"/account/bookings/{ref}/documents/invoice.pdf", headers=owner)

    assert res.status_code == 403 and res.json()["error"]["reason"] == READ_ONLY_REASON
    kinds = (await db.execute(select(GstDocument.kind))).scalars().all()
    assert "invoice" not in kinds
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    receipt = b["documents"][0]["key"]  # already numbered: still downloads
    res = await db_client.get(f"/account/bookings/{ref}/documents/{receipt}.pdf", headers=owner)
    assert res.status_code == 200, res.text


# --- review 2026-11-27 (L1): /account writes too ------------------------------------------------


@pytest.mark.db
async def test_every_account_write_route_is_refused_for_a_read_only_owner(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    """The demo email is public, so a visitor's booking made with it must not be changeable
    by whoever holds the demo login."""
    await seeded_with_owner(db)
    read_only(db_app)
    headers = await owner_cookie(db_client)
    writes = [
        (method.upper(), path)
        for path, item in db_app.openapi()["paths"].items()
        if path.startswith("/account")
        for method in sorted(item)
        if method.upper() in UNSAFE
    ]
    assert len(writes) > 8  # change, cancellation, extras, travellers, saved, …

    for method, path in writes:
        url = path
        for name in ("ref", "traveller_id", "key", "slug"):
            url = url.replace(f"{{{name}}}", "TB-ABC123" if name == "ref" else "x")
        res = await db_client.request(method, url, json={}, headers=headers)
        assert res.status_code == 403, (method, path, res.text)
        assert res.json()["error"]["reason"] == READ_ONLY_REASON, (method, path)
