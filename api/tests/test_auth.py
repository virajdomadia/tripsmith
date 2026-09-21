"""Own session auth (04 §Auth, 06 §A2): login, cookie, session lookup, logout, require_owner."""

import datetime as dt

import pytest
from fastapi import Depends, FastAPI, Response
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session, User
from app.models.enums import UserRole
from app.services.auth.cookie import COOKIE_NAME, clear_session_cookie, set_session_cookie
from app.services.auth.deps import require_owner
from app.services.auth.passwords import hash_password
from app.services.auth.sessions import (
    SESSION_TTL,
    delete_session,
    find_session,
    login,
    new_token,
)
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_enquiries import CountingLimiter

OWNER_EMAIL = "owner@tripsmith.demo"
OWNER_PASSWORD = "demo-fd8c57c3"
COOKIE = "ts_session"


async def seeded_with_owner(db: AsyncSession) -> None:
    settings = make_settings(owner_email=OWNER_EMAIL, owner_password=OWNER_PASSWORD)
    await seed(db, fixture_content(), RecordingStore(), settings)


async def session_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(Session))).scalar_one()


async def owner(db: AsyncSession) -> User:
    return (await db.execute(select(User).where(User.email == OWNER_EMAIL))).scalar_one()


# --- service ------------------------------------------------------------------------------------


def test_tokens_are_long_urlsafe_and_unique() -> None:
    tokens = {new_token() for _ in range(20)}
    assert len(tokens) == 20
    assert all(len(t) >= 40 and t.isascii() and " " not in t for t in tokens)


@pytest.mark.db
async def test_login_creates_a_session_row(db: AsyncSession) -> None:
    await seeded_with_owner(db)
    before = dt.datetime.now(dt.UTC)
    session = await login(db, OWNER_EMAIL, OWNER_PASSWORD, ip="1.2.3.4", user_agent="UA")
    assert session is not None
    assert session.user.email == OWNER_EMAIL and session.user.role == UserRole.OWNER
    assert session.ip == "1.2.3.4" and session.user_agent == "UA"
    assert before + SESSION_TTL - dt.timedelta(seconds=5) <= session.expires_at
    assert await session_count(db) == 1


@pytest.mark.db
async def test_login_rejects_wrong_password_and_unknown_email(db: AsyncSession) -> None:
    await seeded_with_owner(db)
    assert await login(db, OWNER_EMAIL, "nope", ip=None, user_agent=None) is None
    assert await login(db, "ghost@tripsmith.demo", OWNER_PASSWORD, ip=None, user_agent=None) is None
    assert await session_count(db) == 0


@pytest.mark.db
async def test_find_session_prunes_expired_rows(db: AsyncSession) -> None:
    await seeded_with_owner(db)
    user = await owner(db)
    db.add(
        Session(
            user_id=user.id,
            token="expired",
            expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1),
        )
    )
    db.add(Session(user_id=user.id, token="live", expires_at=dt.datetime.now(dt.UTC) + SESSION_TTL))
    await db.commit()

    assert await find_session(db, "expired") is None
    assert await find_session(db, "missing") is None
    live = await find_session(db, "live")
    assert live is not None and live.user.email == OWNER_EMAIL
    assert await session_count(db) == 1  # the expired row is gone


@pytest.mark.db
async def test_delete_session_is_idempotent(db: AsyncSession) -> None:
    await seeded_with_owner(db)
    session = await login(db, OWNER_EMAIL, OWNER_PASSWORD, ip=None, user_agent=None)
    assert session is not None
    await delete_session(db, session.token)
    await delete_session(db, session.token)
    assert await session_count(db) == 0


# --- cookie + dependency --------------------------------------------------------------------------


def test_cookie_is_httponly_lax_and_secure_only_on_https() -> None:
    expires = dt.datetime.now(dt.UTC) + dt.timedelta(days=30)
    res = Response()
    set_session_cookie(res, "tok", expires, make_settings(site_url="http://localhost:3000"))
    header = res.headers["set-cookie"].lower()
    assert header.startswith(f"{COOKIE_NAME}=tok;")
    assert "httponly" in header and "samesite=lax" in header and "path=/" in header
    assert "max-age=259" in header  # ≈ 30 days, allowing for the seconds elapsed
    assert "secure" not in header and "domain" not in header

    res = Response()
    set_session_cookie(res, "tok", expires, make_settings(site_url="https://tripsmith.vercel.app"))
    assert "secure" in res.headers["set-cookie"].lower()

    res = Response()
    clear_session_cookie(res, make_settings())
    header = res.headers["set-cookie"].lower()
    assert header.startswith(f"{COOKIE_NAME}=") and "max-age=0" in header


def protect(app: FastAPI) -> None:
    """Mount a throwaway owner-only route — the first real `/admin/*` route lands in F16."""

    async def whoami(user: User = Depends(require_owner)) -> dict[str, str]:  # noqa: B008
        return {"email": user.email}

    app.add_api_route("/_test/owner", whoami, methods=["GET"])


@pytest.mark.db
async def test_require_owner_rejects_missing_and_expired_sessions(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    protect(db_app)
    res = await db_client.get("/_test/owner")
    assert res.status_code == 401 and res.json()["error"]["code"] == "unauthorized"

    res = await db_client.get("/_test/owner", cookies={COOKIE_NAME: "garbage"})
    assert res.status_code == 401

    session = await login(db, OWNER_EMAIL, OWNER_PASSWORD, ip=None, user_agent=None)
    assert session is not None
    res = await db_client.get("/_test/owner", cookies={COOKIE_NAME: session.token})
    assert res.status_code == 200 and res.json() == {"email": OWNER_EMAIL}


@pytest.mark.db
async def test_require_owner_forbids_customers(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    protect(db_app)
    customer = User(
        name="Priya",
        email="priya@example.com",
        role=UserRole.CUSTOMER,
        password_hash=hash_password("pw"),
    )
    db.add(customer)
    await db.commit()
    session = await login(db, "priya@example.com", "pw", ip=None, user_agent=None)
    assert session is not None
    res = await db_client.get("/_test/owner", cookies={COOKIE_NAME: session.token})
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"


# --- routes ---------------------------------------------------------------------------------------


@pytest.mark.db
async def test_login_route_sets_cookie_and_returns_session_info(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    res = await db_client.post(
        "/auth/login",
        json={"email": " Owner@Tripsmith.demo ", "password": OWNER_PASSWORD},
        headers={"X-Forwarded-For": "1.2.3.4", "User-Agent": "UA"},
    )
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["user"]["email"] == OWNER_EMAIL and body["user"]["role"] == "owner"
    assert body["user"]["name"] == "Owner" and "expiresAt" in body
    cookie = res.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE_NAME}=") and "HttpOnly" in cookie
    row = (await db.execute(select(Session))).scalar_one()
    assert row.ip == "1.2.3.4" and row.user_agent == "UA"
    assert res.cookies[COOKIE_NAME] == row.token


@pytest.mark.db
async def test_login_route_rejects_bad_credentials_with_one_message(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    wrong = await db_client.post("/auth/login", json={"email": OWNER_EMAIL, "password": "x"})
    ghost = await db_client.post("/auth/login", json={"email": "a@b.co", "password": "x"})
    assert wrong.status_code == ghost.status_code == 401
    assert wrong.json() == ghost.json()
    assert wrong.json()["error"] == {"code": "unauthorized", "message": "Wrong email or password"}
    assert wrong.headers["cache-control"] == "no-store"
    assert "set-cookie" not in wrong.headers
    assert await session_count(db) == 0


@pytest.mark.db
async def test_login_route_validates_the_body(db: AsyncSession, db_client: AsyncClient) -> None:
    res = await db_client.post("/auth/login", json={"email": "o@x.io"})
    assert res.status_code == 400
    assert res.json()["error"]["fieldErrors"] == {"password": "Field required"}


@pytest.mark.db
async def test_login_is_rate_limited_per_ip(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    limiter = CountingLimiter(limit=10)
    db_app.state.rate_limiter = limiter
    for _ in range(10):
        res = await db_client.post(
            "/auth/login",
            json={"email": OWNER_EMAIL, "password": "wrong"},
            headers={"X-Forwarded-For": "9.9.9.9"},
        )
        assert res.status_code == 401
    res = await db_client.post(
        "/auth/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"X-Forwarded-For": "9.9.9.9"},
    )
    assert res.status_code == 429 and res.headers["retry-after"] == "600"
    assert res.headers["cache-control"] == "no-store"
    assert res.json()["error"]["code"] == "rate_limited"
    assert limiter.hits == ["login:9.9.9.9"] * 11
    # Another address is unaffected.
    other = await db_client.post(
        "/auth/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        headers={"X-Forwarded-For": "8.8.8.8"},
    )
    assert other.status_code == 200


@pytest.mark.db
async def test_session_route_round_trip_and_logout(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    no_cookie = await db_client.get("/auth/session")
    assert no_cookie.status_code == 401
    assert no_cookie.headers["cache-control"] == "no-store"
    assert (await db_client.get("/auth/session", cookies={COOKIE_NAME: "nope"})).status_code == 401

    login_res = await db_client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    token = login_res.cookies[COOKIE_NAME]
    res = await db_client.get("/auth/session", cookies={COOKIE_NAME: token})
    assert res.status_code == 200 and res.json()["user"]["email"] == OWNER_EMAIL
    assert res.headers["cache-control"] == "no-store"

    out = await db_client.post("/auth/logout", cookies={COOKIE_NAME: token})
    assert out.status_code == 204
    assert "max-age=0" in out.headers["set-cookie"].lower()
    assert await session_count(db) == 0
    assert (await db_client.get("/auth/session", cookies={COOKIE_NAME: token})).status_code == 401
    # Logging out again (or with no cookie) is still a 204.
    assert (await db_client.post("/auth/logout")).status_code == 204


@pytest.mark.db
async def test_expired_session_is_401_and_pruned_by_the_route(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    user = await owner(db)
    db.add(
        Session(
            user_id=user.id,
            token="stale",
            expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(seconds=1),
        )
    )
    await db.commit()
    res = await db_client.get("/auth/session", cookies={COOKIE_NAME: "stale"})
    assert res.status_code == 401
    assert await session_count(db) == 0
