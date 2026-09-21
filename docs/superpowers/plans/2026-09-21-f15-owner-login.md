# F15 Owner Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner signs in at `/admin/login` with the demo credentials, lands on a signed-in `/admin` placeholder, and can sign out; an unauthenticated visit to any `/admin/*` URL redirects to the sign-in page; the api enforces the session on its side through `require_owner`.

**Architecture:** api: own session auth on the existing `users` / `sessions` tables — `services/auth/` (`passwords.py` argon2 verify with a constant-time dummy, `sessions.py` opaque 30-day tokens, `cookie.py` the HttpOnly cookie recipe, `deps.py` the `require_owner` dependency) behind `routers/auth.py` (`POST /auth/login` rate-limited `login:{ip}` 10 / 10 min, `POST /auth/logout`, `GET /auth/session`). `client_ip` + `RateLimited` move out of the enquiries router into `infra/client_ip.py` so both routers share them. web: `middleware.ts` gates `/admin/:path*` by asking `GET ${API_URL}/auth/session` with the raw Cookie header; a plain HTML form posts to the web route handler `POST /api/auth/login`, which forwards the visitor's IP (Vercel rewrites `X-Forwarded-For` on the hop, as F9 found) and copies the api's `Set-Cookie` onto a 303; `POST /api/auth/logout` mirrors it. The sign-in page is mockup A1 on the K tokens; the footer's fine print gains "Owner sign in" + the demo credentials.

**Tech Stack:** FastAPI + pydantic v2 + SQLAlchemy async; `argon2-cffi` (already a runtime dep — used by the seed); Next.js 15.5 app router (`middleware.ts`, route handlers, `next/image`); vitest + pytest. `pnpm gen:api` regenerates the contract (three new paths under `/auth`). **No new dependencies, no migration.**

**Spec:** `docs/07-plan.md` row F15; `docs/04-technical-design.md` §Auth (lines 72–75: own implementation, argon2, cookie HttpOnly `SameSite=Lax` `Secure` in prod, `middleware.ts` gate, demo credentials from `NEXT_PUBLIC_DEMO_*`) and §Spam (`10 / 10 min / IP` on `POST /auth/login`); `docs/05-architecture.md` §Auth (lines 118–120: the web gate is UX only, api enforces); `docs/06-data-and-api.md` §A2 (sessions: opaque token = cookie value, expired rows deleted lazily on lookup), route table (`POST /auth/login` · `POST /auth/logout` · `GET /auth/session`), rate-limit key `login:{ip}`, `LoginRequest` / `SessionInfo` contract models; `mockups/screens.html` screen A1 (split login: photo + caption left, form right, "Demo:" pill, prefilled fields, "Forgot your password? Email …" help line) and the footer fine print ("Demo login: … / …").

## Global Constraints

- Work in `.worktrees/f15-owner-login` on branch `feat/f15-owner-login` (created from `origin/main` = `b1ad19f`); one PR, squash-merged; never touch the main checkout; never bare `git stash`; never run `next build` while `next dev` shares `.next/`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (root) green; `pnpm gen:api` output committed (freshness tests both sides: `api/tests/test_openapi.py`, `web/tests/contract.test.ts`). Python: ruff line 100, rules E/F/I/B/UP; pyright basic. `uv` is not on the bash PATH — prepend `/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe`.
- Db tests use the `db` / `db_client` / `db_app` fixtures (need `TEST_DATABASE_URL`, a throwaway local Postgres — see Task 10 for the recipe); unit tests need no database. Tests seed `tests/fixture_content` and **never edit the fixture**. The default `make_settings()` has no `owner_email` / `owner_password`, so the seed creates **no user** — auth tests pass `make_settings(owner_email=…, owner_password=…)` to `seed()`. Tests never touch the network.
- Cookie: name `ts_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = seconds until `expires_at`, `Secure` only when `settings.site_url` starts with `https://` (prod is `https://tripsmith.vercel.app`; local `http://localhost:3000`). **No `Domain`** — the cookie is host-only on the site origin because the browser receives it through the web's `/api/*` rewrite / route handlers.
- Session: opaque `secrets.token_urlsafe(32)`, fixed 30 days, no sliding renewal; logout deletes the row; expired rows are deleted when they are looked up. Passwords: argon2id via `argon2-cffi` defaults; unknown email verifies against a fixed dummy hash so response time does not reveal which emails exist; a hash that `check_needs_rehash` flags is rehashed on successful login.
- Error envelope only (06 C0): bad credentials → `401 unauthorized` "Wrong email or password"; no/invalid/expired cookie → `401 unauthorized` "Sign in to continue"; wrong role → `403 forbidden` "Owner account required"; too many attempts → `429 rate_limited` with `Retry-After`.
- Web: the gate is UX only. `next` targets must start with `/admin` (never `//…`), otherwise `/admin`. Demo credentials come from `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` (both already set on Vercel and in `web/.env.local`); when either is unset nothing about a demo is rendered.
- UI on the K tokens (`web/src/app/globals.css`): primary button = `rounded-btn bg-primary px-5 py-3 font-bold text-white hover:bg-primary-ink`; inputs = `control` from `components/site/enquiry/Field.tsx`; demo pill = `rounded-[10px] bg-primary-soft px-3 py-2.5 text-[13px] font-semibold text-primary`; error banner = `rounded-[10px] bg-warn-soft px-3 py-2.5 text-sm font-semibold text-warn`; signed-out note = `bg-ok-soft text-ok`. Copy: short, concrete, Indian English.
- Secrets never logged; the password never appears in a URL (the login route handler echoes only the email back on failure).

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| Where the login form posts | A **web route handler** `POST /api/auth/login` (native `<form method="post">`, no client component, works without JS), not the `/api/:path*` rewrite: the api's per-IP limiter needs the visitor's address, which only reaches it under `X-Client-Ip` + `X-Internal-Secret` (`api/app/infra/client_ip.py`, moved from the enquiries router in Task 1). Every outcome is a 303: `next` on success (with the api's `Set-Cookie` copied verbatim), `/admin/login?error=<credentials\|rate_limited\|unavailable>&next=…&email=…` otherwise. |
| Logout | `POST /api/auth/logout` web route handler: forwards the cookie to the api (`204`, row deleted, ignored if it fails), then 303 → `/admin/login?signedout=1` with its own clearing `Set-Cookie: ts_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` — so the browser is signed out even when the api is unreachable. |
| Gate | `web/src/middleware.ts`, `config.matcher = ['/admin/:path*']`. No `ts_session` cookie → decision without a network call. With one → `GET ${API_URL}/auth/session` (raw Cookie header, `cache: 'no-store'`, any failure = signed out). Signed out on any admin page → 303 `/admin/login?next=<path+search>` and the dead cookie is cleared; signed in on `/admin/login` → 303 `/admin`. Pure decision logic lives in `lib/auth/gate.ts` (vitest). Next 15.5 → the file is `middleware.ts` (the `proxy.ts` rename is Next 16). |
| `require_owner` | `services/auth/deps.py`: reads the cookie, `find_session` (joins the user, prunes if expired), `401` when absent / unknown / expired, `403` when `user.role != owner`; returns the `User`. Tested by mounting a throwaway route on `db_app` in the test (no `/admin/*` route exists until F16). |
| `SessionInfo` | `{ user: { id, name, email, role }, expiresAt }` — F16 adds `newEnquiries` to it. `role` is `app.models.enums.UserRole` (a StrEnum; pydantic emits the `UserRole` enum in OpenAPI). |
| Login page location | `web/src/app/(admin)/admin/login/page.tsx`. `(admin)/layout.tsx` becomes a bare `<main>` (F16 builds the sidebar shell as a nested layout so the login page stays chrome-free). The signed-in `/admin` placeholder renders name + email + a Sign out form — the visible proof for this PR. |
| Photo | Mockup A1 uses Pangong lake. Copy `api/content/photos/ladakh/pangong-tso.jpg` (CC BY-SA 4.0, credited in `api/content/photos/CREDITS.md`) to `web/public/admin/login.jpg` (195 KB, 1400 px), like `web/public/home/hero.jpg` in F6. |
| Demo credentials | On the sign-in page (form prefilled + "Demo:" pill) **and** the footer fine print (`· Owner sign in · Demo: email / password`), both from `NEXT_PUBLIC_DEMO_*` via `lib/auth/demo.ts`. Public by design (portfolio). |
| Rate limit | Router-level dependency on `/auth/login` only (not logout/session): key `login:{client_ip}`, `LOGIN_LIMIT = 10`, `LOGIN_WINDOW_SECONDS = 600`. Same `RateLimited` class as enquiries with the message "Too many sign-in attempts — try again in a few minutes". |

---

## File map

**api**
- Create `app/infra/client_ip.py` — `client_ip(request)`, `RateLimited`, header constants (moved from `routers/site/enquiries.py`).
- Modify `app/routers/site/enquiries.py` — import from `infra.client_ip`.
- Create `app/schemas/auth.py` — `LoginRequest`, `SessionUser`, `SessionInfo`.
- Create `app/services/auth/__init__.py`, `passwords.py`, `sessions.py`, `cookie.py`, `deps.py`.
- Modify `scripts/seed.py` — `hash_password` from `services.auth.passwords` (one source of argon2 params).
- Create `app/routers/auth.py`; modify `app/main.py` (include router).
- Regenerate `api/openapi.json` → `web/src/lib/api-types.ts`.
- Tests: `tests/test_auth_passwords.py`, `tests/test_auth.py`; modify `tests/test_openapi.py`.

**web**
- Create `src/lib/auth/cookie.ts`, `gate.ts`, `forward.ts`, `session.ts`, `demo.ts`.
- Create `src/middleware.ts`.
- Create `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`.
- Create `src/app/(admin)/admin/login/page.tsx`; modify `src/app/(admin)/layout.tsx`, `src/app/(admin)/admin/page.tsx`.
- Create `public/admin/login.jpg`.
- Modify `src/components/site/SiteFooter.tsx`, `.env.example`.
- Tests: `tests/auth-gate.test.ts`, `tests/auth-routes.test.ts`.

**docs** — `docs/07-plan.md` F15 → 🟢; `web/.env.example` comment.

---

### Task 1: Share `client_ip` / `RateLimited` across routers

**Files:**
- Create: `api/app/infra/client_ip.py`
- Modify: `api/app/routers/site/enquiries.py:1-56`

**Interfaces:**
- Produces: `client_ip(request: Request) -> str`, `class RateLimited(ApiError)` with `retry_after: int`, `TRUSTED_IP_HEADER = "x-client-ip"`, `INTERNAL_SECRET_HEADER = "x-internal-secret"` — all importable from `app.infra.client_ip`. `RateLimited(retry_after, message=…)` gains an optional message (default = the enquiry copy) so login can use its own.

- [ ] **Step 1: Create `api/app/infra/client_ip.py`** with the two symbols moved verbatim from the enquiries router plus the message parameter:

```python
"""The visitor's address behind Vercel's rewrites, and the 429 every limited route raises."""

import secrets

from fastapi import Request

from app.errors import ApiError

TRUSTED_IP_HEADER = "x-client-ip"
INTERNAL_SECRET_HEADER = "x-internal-secret"


def client_ip(request: Request) -> str:
    """The visitor's address for rate limiting and abuse tracing.

    Submits come through the web's route handlers (`/api/enquiries`, `/enquire`,
    `/api/auth/login`), and Vercel rewrites `X-Forwarded-For` to the *web function's* egress
    address on that hop — so the web forwards the real address under `X-Client-Ip`, trusted
    only with the shared `REVALIDATE_SECRET`. Direct callers fall back to Vercel's own
    `X-Forwarded-For`.
    """
    settings = request.app.state.settings
    secret = settings.revalidate_secret.get_secret_value() if settings.revalidate_secret else None
    given = request.headers.get(INTERNAL_SECRET_HEADER, "")
    trusted = request.headers.get(TRUSTED_IP_HEADER, "").strip()
    if secret and trusted and secrets.compare_digest(given, secret):
        return trusted
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimited(ApiError):
    def __init__(
        self,
        retry_after: int,
        message: str = (
            "Too many enquiries from this connection — try again in a few minutes, or WhatsApp us"
        ),
    ) -> None:
        super().__init__("rate_limited", message)
        self.retry_after = retry_after
```

- [ ] **Step 2: Slim the enquiries router.** In `api/app/routers/site/enquiries.py` delete the `import secrets` line, the `TRUSTED_IP_HEADER` / `INTERNAL_SECRET_HEADER` constants, the `client_ip` function and the `RateLimited` class; add `from app.infra.client_ip import RateLimited, client_ip` and drop the now-unused `from app.errors import ApiError`. Everything else (`ENQUIRY_LIMIT`, `enquiry_rate_limit`, the route) stays.

- [ ] **Step 3: Run the enquiry tests (they cover `client_ip` through the trusted-header and XFF cases)**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest tests/test_enquiries.py -q` and `uv run ruff check . && uv run pyright`
Expected: all pass; ruff/pyright clean.

- [ ] **Step 4: Commit**

```bash
git add api/app/infra/client_ip.py api/app/routers/site/enquiries.py
git commit -m "refactor(api): move client_ip + RateLimited to infra for reuse by auth"
```

---

### Task 2: Contract models + password verification

**Files:**
- Create: `api/app/schemas/auth.py`, `api/app/services/auth/__init__.py`, `api/app/services/auth/passwords.py`
- Modify: `api/scripts/seed.py:22,75` (use `hash_password`)
- Test: `api/tests/test_auth_passwords.py`

**Interfaces:**
- Produces: `LoginRequest(email: str, password: str)` (email lower-cased + stripped), `SessionUser(id, name, email, role: UserRole)`, `SessionInfo(user: SessionUser, expires_at: datetime)`; `hash_password(password) -> str`, `verify_password(password_hash: str | None, password: str) -> bool`, `needs_rehash(password_hash) -> bool`.

- [ ] **Step 1: Write the failing tests** — `api/tests/test_auth_passwords.py`:

```python
"""argon2 verification: constant shape whether or not the user exists (04 §Auth)."""

from app.schemas.auth import LoginRequest
from app.services.auth.passwords import hash_password, needs_rehash, verify_password


def test_round_trip() -> None:
    h = hash_password("owner-pw-for-tests")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "owner-pw-for-tests")
    assert not verify_password(h, "owner-pw-for-tests2")
    assert not needs_rehash(h)


def test_missing_or_broken_hash_never_verifies() -> None:
    assert not verify_password(None, "anything")
    assert not verify_password("", "anything")
    assert not verify_password("not-a-hash", "anything")


def test_login_request_normalises_email() -> None:
    req = LoginRequest.model_validate({"email": "  Owner@Tripsmith.DEMO ", "password": "x"})
    assert req.email == "owner@tripsmith.demo"
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && uv run pytest tests/test_auth_passwords.py -q`
Expected: FAIL — `ModuleNotFoundError: app.schemas.auth`.

- [ ] **Step 3: Create `api/app/schemas/auth.py`**

```python
"""Auth contract (06 §C-REST `/auth/*`): `LoginRequest` in, `SessionInfo` out."""

from datetime import datetime

from pydantic import Field, field_validator

from app.models.enums import UserRole
from app.schemas import ApiModel


class LoginRequest(ApiModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _normalise(cls, v: str) -> str:
        return v.strip().lower()


class SessionUser(ApiModel):
    id: str
    name: str
    email: str
    role: UserRole


class SessionInfo(ApiModel):
    """What `GET /auth/session` returns; F16 adds the new-enquiry count here."""

    user: SessionUser
    expires_at: datetime
```

- [ ] **Step 4: Create `api/app/services/auth/__init__.py`** (docstring only):

```python
"""Own session auth (04 §Auth, 06 §A2): argon2 passwords, opaque session tokens, the cookie
recipe and the `require_owner` dependency. No sign-up in v1 — the seed creates the owner."""
```

- [ ] **Step 5: Create `api/app/services/auth/passwords.py`**

```python
"""argon2id hashing (argon2-cffi defaults). Verification always runs the full argon2 cost — an
unknown email checks against `DUMMY_HASH` — so timing does not reveal which emails exist."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

hasher = PasswordHasher()

# Hashed once per process; verified whenever there is no real hash to check.
DUMMY_HASH = hasher.hash("tripsmith-no-such-user")


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """True only for a real hash that matches. CPU-bound (~50 ms): call via `asyncio.to_thread`."""
    try:
        hasher.verify(password_hash or DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return bool(password_hash)


def needs_rehash(password_hash: str) -> bool:
    try:
        return hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
```

- [ ] **Step 6: Point the seed at `hash_password`.** In `api/scripts/seed.py` replace `from argon2 import PasswordHasher  # noqa: E402` with `from app.services.auth.passwords import hash_password  # noqa: E402` (keep it in the same import block as the other `app.` imports) and change `user.password_hash = PasswordHasher().hash(settings.owner_password.get_secret_value())` to `user.password_hash = hash_password(settings.owner_password.get_secret_value())`.

- [ ] **Step 7: Run tests + lint**

Run: `cd api && uv run pytest tests/test_auth_passwords.py tests/test_seed.py -q && uv run ruff check . && uv run pyright`
Expected: PASS; clean.

- [ ] **Step 8: Commit**

```bash
git add api/app/schemas/auth.py api/app/services/auth api/scripts/seed.py api/tests/test_auth_passwords.py
git commit -m "feat(api): auth contract models + argon2 password verification"
```

---

### Task 3: Sessions service (`login`, `find_session`, `delete_session`)

**Files:**
- Create: `api/app/services/auth/sessions.py`
- Test: `api/tests/test_auth.py` (service part)

**Interfaces:**
- Consumes: `verify_password`, `needs_rehash`, `hash_password` (Task 2); models `User`, `Session` (`app.models`).
- Produces: `SESSION_TTL = timedelta(days=30)`; `new_token() -> str`; `async login(db, email, password, *, ip, user_agent) -> Session | None` (commits; `None` on bad credentials); `async find_session(db, token, *, now=None) -> Session | None` (user loaded; deletes + commits an expired row and returns `None`); `async delete_session(db, token) -> None` (commits; idempotent); `session_info(session) -> SessionInfo`.

- [ ] **Step 1: Write the failing service tests** — create `api/tests/test_auth.py`:

```python
"""Own session auth (04 §Auth, 06 §A2): login, cookie, session lookup, logout, require_owner."""

import datetime as dt

import pytest
from fastapi import Depends, FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session, User
from app.models.enums import UserRole
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
OWNER_PASSWORD = "owner-pw-for-tests"
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest tests/test_auth.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.auth.sessions`.

- [ ] **Step 3: Create `api/app/services/auth/sessions.py`**

```python
"""Opaque 30-day sessions in the `sessions` table (06 §A2). The token *is* the cookie value."""

import asyncio
import datetime as dt
import secrets

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Session, User
from app.schemas.auth import SessionInfo, SessionUser
from app.services.auth.passwords import hash_password, needs_rehash, verify_password

SESSION_TTL = dt.timedelta(days=30)
USER_AGENT_MAX = 300


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


async def login(
    db: AsyncSession, email: str, password: str, *, ip: str | None, user_agent: str | None
) -> Session | None:
    """Verify and open a session; `None` on a bad email or password (indistinguishable)."""
    user = (
        await db.execute(select(User).where(User.email == email.strip().lower()))
    ).scalar_one_or_none()
    stored = user.password_hash if user else None
    ok = await asyncio.to_thread(verify_password, stored, password)
    if not ok or user is None:
        return None
    if stored and needs_rehash(stored):
        user.password_hash = await asyncio.to_thread(hash_password, password)
    session = Session(
        user_id=user.id,
        token=new_token(),
        expires_at=_now() + SESSION_TTL,
        ip=ip,
        user_agent=(user_agent or "")[:USER_AGENT_MAX] or None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    session.user = user
    return session


async def find_session(
    db: AsyncSession, token: str, *, now: dt.datetime | None = None
) -> Session | None:
    """The live session for a cookie value, with its user loaded; expired rows are deleted here."""
    if not token:
        return None
    session = (
        await db.execute(
            select(Session).options(selectinload(Session.user)).where(Session.token == token)
        )
    ).scalar_one_or_none()
    if session is None:
        return None
    if session.expires_at <= (now or _now()):
        await db.delete(session)
        await db.commit()
        return None
    return session


async def delete_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(Session).where(Session.token == token))
    await db.commit()


def session_info(session: Session) -> SessionInfo:
    u = session.user
    return SessionInfo(
        user=SessionUser(id=u.id, name=u.name, email=u.email, role=u.role),
        expires_at=session.expires_at,
    )
```

- [ ] **Step 4: Run the tests**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest tests/test_auth.py -q && uv run ruff check . && uv run pyright`
Expected: 5 passed; clean.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/auth/sessions.py api/tests/test_auth.py
git commit -m "feat(api): session service — login, lookup with lazy expiry, logout"
```

---

### Task 4: Cookie recipe + `require_owner` dependency

**Files:**
- Create: `api/app/services/auth/cookie.py`, `api/app/services/auth/deps.py`
- Test: `api/tests/test_auth.py` (append)

**Interfaces:**
- Consumes: `find_session` (Task 3); `Settings.site_url`; `ApiError`.
- Produces: `COOKIE_NAME = "ts_session"`; `set_session_cookie(response, token, expires_at, settings)`; `clear_session_cookie(response, settings)`; `async current_session(request, db) -> Session | None`; `async require_owner(request, db) -> User`.

- [ ] **Step 1: Append the failing tests** to `api/tests/test_auth.py`:

```python
# --- cookie + dependency --------------------------------------------------------------------------

from fastapi import Response  # noqa: E402

from app.services.auth.cookie import (  # noqa: E402
    COOKIE_NAME,
    clear_session_cookie,
    set_session_cookie,
)
from app.services.auth.deps import require_owner  # noqa: E402


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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest tests/test_auth.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.auth.cookie`.

- [ ] **Step 3: Create `api/app/services/auth/cookie.py`**

```python
"""The session cookie (04 §Auth): HttpOnly, SameSite=Lax, Secure on https, host-only.

No `Domain`: the browser receives it from the site origin (the web's route handlers copy the
api's Set-Cookie through), so a host-only cookie is exactly right.
"""

import datetime as dt

from fastapi import Response

from app.config import Settings

COOKIE_NAME = "ts_session"


def _secure(settings: Settings) -> bool:
    return settings.site_url.startswith("https://")


def set_session_cookie(
    response: Response, token: str, expires_at: dt.datetime, settings: Settings
) -> None:
    max_age = max(0, int((expires_at - dt.datetime.now(dt.UTC)).total_seconds()))
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_secure(settings),
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=_secure(settings)
    )
```

- [ ] **Step 4: Create `api/app/services/auth/deps.py`**

```python
"""FastAPI dependencies: `current_session` (may be None) and `require_owner` (401 / 403 envelope).

Every `/admin/*` route depends on `require_owner` — the web's middleware gate is UX only (05 §Auth).
"""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.models import Session, User
from app.models.enums import UserRole
from app.services.auth.cookie import COOKIE_NAME
from app.services.auth.sessions import find_session


async def current_session(
    request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Session | None:
    token = request.cookies.get(COOKIE_NAME, "")
    return await find_session(db, token) if token else None


async def require_owner(
    session: Annotated[Session | None, Depends(current_session)],
) -> User:
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    if session.user.role != UserRole.OWNER:
        raise ApiError("forbidden", "Owner account required")
    return session.user
```

- [ ] **Step 5: Run the tests**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest tests/test_auth.py -q && uv run ruff check . && uv run pyright`
Expected: 8 passed; clean. (If ruff complains about the mid-file imports in the test, move them to the top import block instead — the `noqa` markers are only there so the appended snippet is self-contained.)

- [ ] **Step 6: Commit**

```bash
git add api/app/services/auth/cookie.py api/app/services/auth/deps.py api/tests/test_auth.py
git commit -m "feat(api): session cookie recipe + require_owner dependency"
```

---

### Task 5: `/auth` routes, rate limit, contract regeneration

**Files:**
- Create: `api/app/routers/auth.py`
- Modify: `api/app/main.py:17-18,55-61`, `api/tests/test_openapi.py:26`, `api/openapi.json`, `web/src/lib/api-types.ts` (generated)
- Test: `api/tests/test_auth.py` (append)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `POST /auth/login` (`operationId: login`, body `LoginRequest` → 200 `SessionInfo` + cookie, 401, 429), `POST /auth/logout` (`logout`, 204, clears cookie), `GET /auth/session` (`getSession`, 200 `SessionInfo` / 401). All `Cache-Control: no-store`. Web's `GetPath` then includes `'/auth/session'`.

- [ ] **Step 1: Append the failing route tests** to `api/tests/test_auth.py`:

```python
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
    assert "set-cookie" not in wrong.headers
    assert await session_count(db) == 0


async def test_login_route_validates_the_body(client: AsyncClient) -> None:
    res = await client.post("/auth/login", json={"email": "o@x.io"})
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
    assert (await db_client.get("/auth/session")).status_code == 401
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest tests/test_auth.py -q`
Expected: the six new tests FAIL with 404 envelopes (no `/auth` routes yet).

- [ ] **Step 3: Create `api/app/routers/auth.py`**

```python
"""`/auth/*` (06 §C-REST): login (rate-limited 10 / 10 min / IP), logout, session."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.models import Session
from app.schemas.auth import LoginRequest, SessionInfo
from app.services.auth.cookie import COOKIE_NAME, clear_session_cookie, set_session_cookie
from app.services.auth.deps import current_session
from app.services.auth.sessions import delete_session, login, session_info

LOGIN_LIMIT = 10
LOGIN_WINDOW_SECONDS = 600
NO_STORE = {"Cache-Control": "no-store"}


async def login_rate_limit(request: Request) -> None:
    """Runs before the body is parsed, like the enquiry limiter."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"login:{client_ip(request)}", limit=LOGIN_LIMIT, window_seconds=LOGIN_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(
            result.retry_after, "Too many sign-in attempts — try again in a few minutes"
        )


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    operation_id="login",
    response_model_by_alias=True,
    dependencies=[Depends(login_rate_limit)],
)
async def post_login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionInfo:
    response.headers.update(NO_STORE)
    session = await login(
        db,
        payload.email,
        payload.password,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    if session is None:
        raise ApiError("unauthorized", "Wrong email or password")
    set_session_cookie(response, session.token, session.expires_at, request.app.state.settings)
    return session_info(session)


@router.post(
    "/logout",
    operation_id="logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def post_logout(
    request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Response:
    token = request.cookies.get(COOKIE_NAME, "")
    if token:
        await delete_session(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
    clear_session_cookie(response, request.app.state.settings)
    return response


@router.get("/session", operation_id="getSession", response_model_by_alias=True)
async def get_session_route(
    response: Response, session: Annotated[Session | None, Depends(current_session)]
) -> SessionInfo:
    response.headers.update(NO_STORE)
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    return session_info(session)
```

- [ ] **Step 4: Register the router.** In `api/app/main.py` add `from app.routers import auth` next to the other router imports and `app.include_router(auth.router)` after `app.include_router(meta.router)`.

- [ ] **Step 5: Extend the OpenAPI test.** In `api/tests/test_openapi.py::test_document_exposes_the_v1_enums_and_operations` append:

```python
    assert doc["paths"]["/auth/login"]["post"]["operationId"] == "login"
    assert doc["paths"]["/auth/logout"]["post"]["operationId"] == "logout"
    assert doc["paths"]["/auth/session"]["get"]["operationId"] == "getSession"
    assert schemas["UserRole"]["enum"] == ["owner", "customer"]
```

- [ ] **Step 6: Regenerate the contract** (root): `pnpm gen:api`. Confirm `git diff --stat` shows `api/openapi.json` and `web/src/lib/api-types.ts` only.

- [ ] **Step 7: Run everything on the api + the web contract tests**

Run: `cd api && TEST_DATABASE_URL=<local> uv run pytest -q && uv run ruff check . && uv run pyright`, then `pnpm --filter web test -- --run tests/contract.test.ts tests/api.test.ts` and `pnpm --filter web typecheck`
Expected: pytest 266 + 14 new = ~280 passed; vitest green; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add api/app/routers/auth.py api/app/main.py api/tests/test_auth.py api/tests/test_openapi.py api/openapi.json web/src/lib/api-types.ts
git commit -m "feat(api): POST /auth/login (rate-limited), POST /auth/logout, GET /auth/session"
```

---

### Task 6: Web gate — `lib/auth/gate.ts` + `middleware.ts`

**Files:**
- Create: `web/src/lib/auth/cookie.ts`, `web/src/lib/auth/gate.ts`, `web/src/middleware.ts`
- Test: `web/tests/auth-gate.test.ts`

**Interfaces:**
- Produces: `SESSION_COOKIE = 'ts_session'`; `ADMIN_HOME = '/admin'`, `LOGIN_PATH = '/admin/login'`; `safeNext(raw): string`; `loginHref({ error?, next?, email?, signedOut? }): string`; `gateDecision(pathWithSearch, signedIn): { kind: 'allow' } | { kind: 'login'; next: string } | { kind: 'home' }`; `hasSessionCookie(cookieHeader): boolean`.

- [ ] **Step 1: Write the failing tests** — `web/tests/auth-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  gateDecision,
  hasSessionCookie,
  loginHref,
  safeNext,
} from '../src/lib/auth/gate';

describe('safeNext', () => {
  it('keeps admin paths and falls back to /admin for anything else', () => {
    expect(safeNext('/admin/enquiries?status=new')).toBe('/admin/enquiries?status=new');
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('/')).toBe('/admin');
    expect(safeNext('//evil.example/admin')).toBe('/admin');
    expect(safeNext('https://evil.example/admin')).toBe('/admin');
    expect(safeNext('/administrator')).toBe('/admin');
    expect(safeNext('/admin/login')).toBe('/admin'); // never bounce back to the form
    expect(safeNext(undefined)).toBe('/admin');
  });
});

describe('loginHref', () => {
  it('encodes only what is given', () => {
    expect(loginHref({})).toBe('/admin/login');
    expect(loginHref({ error: 'credentials', next: '/admin/packages', email: 'a+b@x.io' })).toBe(
      '/admin/login?error=credentials&next=%2Fadmin%2Fpackages&email=a%2Bb%40x.io',
    );
    expect(loginHref({ signedOut: true })).toBe('/admin/login?signedout=1');
  });
});

describe('gateDecision', () => {
  it('sends a signed-out visitor to the form with the target path', () => {
    expect(gateDecision('/admin/enquiries?status=new', false)).toEqual({
      kind: 'login',
      next: '/admin/enquiries?status=new',
    });
  });
  it('lets a signed-out visitor see the form', () => {
    expect(gateDecision('/admin/login', false)).toEqual({ kind: 'allow' });
    expect(gateDecision('/admin/login?error=credentials', false)).toEqual({ kind: 'allow' });
  });
  it('sends a signed-in owner from the form to the dashboard', () => {
    expect(gateDecision('/admin/login', true)).toEqual({ kind: 'home' });
    expect(gateDecision('/admin', true)).toEqual({ kind: 'allow' });
  });
});

describe('hasSessionCookie', () => {
  it('looks for the cookie name only', () => {
    expect(hasSessionCookie('theme=dark; ts_session=abc')).toBe(true);
    expect(hasSessionCookie('ts_session_old=abc')).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test -- --run tests/auth-gate.test.ts`
Expected: FAIL — cannot resolve `../src/lib/auth/gate`.

- [ ] **Step 3: Create `web/src/lib/auth/cookie.ts`**

```ts
/** Name of the api's session cookie (api/app/services/auth/cookie.py). Value is opaque. */
export const SESSION_COOKIE = 'ts_session';
```

- [ ] **Step 4: Create `web/src/lib/auth/gate.ts`**

```ts
import { SESSION_COOKIE } from './cookie';

/**
 * Pure decisions behind `middleware.ts` and the auth route handlers. The gate is UX only —
 * the api enforces `require_owner` on every `/admin/*` endpoint (05 §Auth).
 */

export const ADMIN_HOME = '/admin';
export const LOGIN_PATH = '/admin/login';

export type LoginError = 'credentials' | 'rate_limited' | 'unavailable';

/** A post-login target: an in-site `/admin…` path or the dashboard. Never an open redirect. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/admin') || raw.startsWith('//')) return ADMIN_HOME;
  const path = raw.split('?')[0];
  if (path !== '/admin' && !path.startsWith('/admin/')) return ADMIN_HOME;
  if (path === LOGIN_PATH) return ADMIN_HOME;
  return raw;
}

export function loginHref(opts: {
  error?: LoginError;
  next?: string;
  email?: string;
  signedOut?: boolean;
}): string {
  const q = new URLSearchParams();
  if (opts.error) q.set('error', opts.error);
  if (opts.next && opts.next !== ADMIN_HOME) q.set('next', opts.next);
  if (opts.email) q.set('email', opts.email);
  if (opts.signedOut) q.set('signedout', '1');
  const s = q.toString();
  return s ? `${LOGIN_PATH}?${s}` : LOGIN_PATH;
}

export type Gate = { kind: 'allow' } | { kind: 'login'; next: string } | { kind: 'home' };

export function gateDecision(pathWithSearch: string, signedIn: boolean): Gate {
  const path = pathWithSearch.split('?')[0];
  const isForm = path === LOGIN_PATH;
  if (isForm) return signedIn ? { kind: 'home' } : { kind: 'allow' };
  return signedIn ? { kind: 'allow' } : { kind: 'login', next: safeNext(pathWithSearch) };
}

export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
}
```

- [ ] **Step 5: Create `web/src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { ADMIN_HOME, gateDecision, hasSessionCookie, loginHref } from '@/lib/auth/gate';

/**
 * Gates `/admin/*` (04 §Auth). With no session cookie the answer needs no network; with one,
 * the api decides (`GET /auth/session` with the raw Cookie header — never re-encoded). Any
 * failure counts as signed out; the api still enforces `require_owner` on its own routes.
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

async function hasSession(cookie: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/session`, {
      headers: { cookie },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  const signedIn = hasSessionCookie(cookie) && cookie !== null && (await hasSession(cookie));
  const { pathname, search } = request.nextUrl;
  const decision = gateDecision(pathname + search, signedIn);

  if (decision.kind === 'allow') return NextResponse.next();
  const target = decision.kind === 'home' ? ADMIN_HOME : loginHref({ next: decision.next });
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  // A cookie the api no longer recognises is dead weight on every request — drop it.
  if (decision.kind === 'login' && hasSessionCookie(cookie)) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
```

- [ ] **Step 6: Run the tests + typecheck + lint**

Run: `pnpm --filter web test -- --run tests/auth-gate.test.ts && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: 8 passed; clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/auth/cookie.ts web/src/lib/auth/gate.ts web/src/middleware.ts web/tests/auth-gate.test.ts
git commit -m "feat(web): middleware gate on /admin/* via GET /auth/session"
```

---

### Task 7: Web route handlers — `POST /api/auth/login`, `POST /api/auth/logout`

**Files:**
- Create: `web/src/lib/auth/forward.ts`, `web/src/app/api/auth/login/route.ts`, `web/src/app/api/auth/logout/route.ts`
- Test: `web/tests/auth-routes.test.ts`

**Interfaces:**
- Consumes: `visitorIp` (`lib/enquiry-forward.ts`), `safeNext`, `loginHref`, `SESSION_COOKIE` (Task 6).
- Produces: `forwardAuth(path: '/auth/login' | '/auth/logout', request: Request, body?: unknown): Promise<Response | undefined>`; the two route handlers (form-encoded in, 303 out).

- [ ] **Step 1: Write the failing tests** — `web/tests/auth-routes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';

function formPost(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams(fields);
  return new Request(`http://web.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
  process.env.REVALIDATE_SECRET = 's3cret';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
  delete process.env.REVALIDATE_SECRET;
});

describe('POST /api/auth/login', () => {
  it('forwards JSON with the visitor address and copies Set-Cookie onto a 303', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"user":{}}', {
        status: 200,
        headers: { 'set-cookie': 'ts_session=tok; Path=/; HttpOnly; SameSite=lax' },
      }),
    );
    const res = await login(
      formPost(
        '/api/auth/login',
        { email: 'owner@tripsmith.demo', password: 'pw', next: '/admin/enquiries' },
        { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
      ),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin/enquiries');
    expect(res.headers.get('set-cookie')).toBe('ts_session=tok; Path=/; HttpOnly; SameSite=lax');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/auth/login');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Client-Ip']).toBe('1.2.3.4');
    expect(headers['X-Internal-Secret']).toBe('s3cret');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'owner@tripsmith.demo', password: 'pw' });
  });

  it('bounces back with the error code and the email, never the password', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const res = await login(formPost('/api/auth/login', { email: 'o@x.io', password: 'pw' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'http://web.test/admin/login?error=credentials&email=o%40x.io',
    );
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('maps 429 and an unreachable api', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
    let res = await login(formPost('/api/auth/login', { email: 'o@x.io', password: 'pw' }));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('rate_limited');

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    res = await login(formPost('/api/auth/login', { email: 'o@x.io', password: 'pw' }));
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('unavailable');
  });

  it('ignores an unsafe next', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await login(
      formPost('/api/auth/login', { email: 'o@x.io', password: 'pw', next: 'https://evil.example' }),
    );
    expect(res.headers.get('location')).toBe('http://web.test/admin');
  });
});

describe('POST /api/auth/logout', () => {
  it('forwards the cookie, clears it locally and lands on the form', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await logout(formPost('/api/auth/logout', {}, { cookie: 'ts_session=tok' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/admin/login?signedout=1');
    expect(res.headers.get('set-cookie')).toBe(
      'ts_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).cookie).toBe('ts_session=tok');
  });

  it('still signs out locally when the api is down', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await logout(formPost('/api/auth/logout', {}));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test -- --run tests/auth-routes.test.ts`
Expected: FAIL — cannot resolve the route modules.

- [ ] **Step 3: Create `web/src/lib/auth/forward.ts`**

```ts
import { visitorIp } from '@/lib/enquiry-forward';

/**
 * Server-side hop web → api for `/auth/*`. Same reason as enquiry-forward.ts: Vercel rewrites
 * `X-Forwarded-For` on this hop, so the visitor's address travels under `X-Client-Ip` with the
 * shared secret, and the api's `login:{ip}` limiter sees the real browser. The viewer's raw
 * Cookie header is forwarded untouched (never re-encoded — see api.ts).
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export async function forwardAuth(
  path: '/auth/login' | '/auth/logout',
  request: Request,
  body?: unknown,
): Promise<Response | undefined> {
  const headers: Record<string, string> = {
    'User-Agent': request.headers.get('user-agent') ?? 'tripsmith-web',
  };
  const cookie = request.headers.get('cookie');
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ip = visitorIp(request);
  const secret = process.env.REVALIDATE_SECRET;
  if (ip && secret) {
    headers['X-Client-Ip'] = ip;
    headers['X-Internal-Secret'] = secret;
  }
  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => undefined);
}

/** A 303 whose headers stay mutable (`Response.redirect` returns immutable ones). */
export function seeOther(location: URL): Response {
  return new Response(null, { status: 303, headers: { Location: location.toString() } });
}
```

- [ ] **Step 4: Create `web/src/app/api/auth/login/route.ts`**

```ts
import { forwardAuth, seeOther } from '@/lib/auth/forward';
import { type LoginError, loginHref, safeNext } from '@/lib/auth/gate';

/**
 * `POST /api/auth/login` — the sign-in form's target (a native form post; no JavaScript needed).
 * Success: the api's `Set-Cookie` is copied verbatim onto a 303 to `next`. Failure: 303 back to
 * the form with an error code and the email (never the password) in the query.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const back = (error: LoginError) =>
    seeOther(new URL(loginHref({ error, next, email }), request.url));

  const res = await forwardAuth('/auth/login', request, { email, password });
  if (!res) return back('unavailable');
  if (res.status === 200) {
    const out = seeOther(new URL(next, request.url));
    const cookie = res.headers.get('set-cookie');
    if (cookie) out.headers.set('set-cookie', cookie);
    return out;
  }
  if (res.status === 429) return back('rate_limited');
  if (res.status >= 500) return back('unavailable');
  return back('credentials'); // 401, or 400 for an empty field
}
```

- [ ] **Step 5: Create `web/src/app/api/auth/logout/route.ts`**

```ts
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { forwardAuth, seeOther } from '@/lib/auth/forward';
import { loginHref } from '@/lib/auth/gate';

/**
 * `POST /api/auth/logout` — the Sign out button. The api deletes the session row (best effort);
 * the browser is signed out regardless by expiring the host-only cookie here.
 */
export async function POST(request: Request): Promise<Response> {
  await forwardAuth('/auth/logout', request);
  const out = seeOther(new URL(loginHref({ signedOut: true }), request.url));
  out.headers.set('set-cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return out;
}
```

- [ ] **Step 6: Run the tests + typecheck + lint**

Run: `pnpm --filter web test -- --run tests/auth-routes.test.ts && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: 6 passed; clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/auth/forward.ts web/src/app/api/auth
git commit -m "feat(web): /api/auth/login + /api/auth/logout route handlers (form → 303)"
```

---

### Task 8: Sign-in page, bare admin layout, signed-in placeholder

**Files:**
- Create: `web/src/lib/auth/demo.ts`, `web/src/lib/auth/session.ts`, `web/src/app/(admin)/admin/login/page.tsx`, `web/public/admin/login.jpg`
- Modify: `web/src/app/(admin)/layout.tsx`, `web/src/app/(admin)/admin/page.tsx`

**Interfaces:**
- Consumes: `api()` + `ApiRequestError` (`lib/api.ts`), `Field` + `control` (`components/site/enquiry/Field.tsx`), `BrandMark`, `BUSINESS` (`lib/business.ts`), `loginHref`/`safeNext`/`LoginError` (Task 6), `GetResponse<'/auth/session'>` (Task 5 contract).
- Produces: `demoCredentials(): { email: string; password: string } | null`; `getSession(): Promise<SessionInfo | null>` (null on 401 only); the pages.

- [ ] **Step 1: Copy the photo.** From the worktree root: `cp api/content/photos/ladakh/pangong-tso.jpg web/public/admin/login.jpg` (create `web/public/admin/`). It is already credited in `api/content/photos/CREDITS.md` (Pangong Tso 2.jpg, CC BY-SA 4.0, KennyOMG) and the footer's generic Commons credit covers the site.

- [ ] **Step 2: Create `web/src/lib/auth/demo.ts`**

```ts
/** The shared demo owner login (portfolio demo only, 04 §Auth). Both vars or nothing. */
export function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL;
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
  return email && password ? { email, password } : null;
}
```

- [ ] **Step 3: Create `web/src/lib/auth/session.ts`**

```ts
import { api, ApiRequestError, type GetResponse } from '@/lib/api';

export type SessionInfo = GetResponse<'/auth/session'>;

/** The signed-in owner for a server component, or `null` when the api says 401. Other errors throw. */
export async function getSession(): Promise<SessionInfo | null> {
  try {
    return await api('/auth/session', { auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401) return null;
    throw e;
  }
}
```

- [ ] **Step 4: Replace `web/src/app/(admin)/layout.tsx`** with the bare wrapper (F16 adds the sidebar shell as a nested layout under `admin/(shell)/` so this login page stays chrome-free):

```tsx
// Owner area: always dynamic, fetched with cookies (04 §1). The sidebar shell lands in F16 as a
// nested layout; this one only sets the canvas so /admin/login renders edge to edge.
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-bg text-ink">{children}</main>;
}
```

- [ ] **Step 5: Create `web/src/app/(admin)/admin/login/page.tsx`** (mockup A1 on the K tokens):

```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BrandMark } from '@/components/site/BrandMark';
import { control, Field } from '@/components/site/enquiry/Field';
import { demoCredentials } from '@/lib/auth/demo';
import { type LoginError, safeNext } from '@/lib/auth/gate';
import { BUSINESS } from '@/lib/business';

type Search = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

const ERROR_COPY: Record<LoginError, string> = {
  credentials: 'Wrong email or password.',
  rate_limited: 'Too many attempts — wait a few minutes and try again.',
  unavailable: 'Could not reach the server. Try again in a moment.',
};

function isLoginError(v: string | undefined): v is LoginError {
  return v === 'credentials' || v === 'rate_limited' || v === 'unavailable';
}

/** A1. Single owner login, sign-up disabled; the demo login is prefilled for the portfolio. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const error = isLoginError(one('error')) ? (one('error') as LoginError) : undefined;
  const signedOut = one('signedout') === '1';
  const next = safeNext(one('next'));
  const demo = demoCredentials();
  const email = one('email') ?? demo?.email ?? '';

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative h-[220px] lg:h-auto">
        <Image
          src="/admin/login.jpg"
          alt="Pangong lake, Ladakh"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
        <p className="absolute bottom-6 left-6 text-white lg:bottom-8 lg:left-8">
          <b className="block text-[28px] font-extrabold tracking-[-0.03em]">Tripsmith admin</b>
          Packages, departures, enquiries.
        </p>
      </section>

      <section className="grid place-items-center p-6 sm:p-10">
        <form
          method="post"
          action="/api/auth/login"
          className="grid w-full max-w-[400px] gap-3.5"
          noValidate
        >
          <Link href="/" className="flex items-center gap-2 font-extrabold">
            <BrandMark size={28} />
            Tripsmith
          </Link>
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Sign in</h1>

          {demo && (
            <p className="rounded-[10px] bg-primary-soft px-3 py-2.5 text-[13px] font-semibold text-primary">
              Demo: {demo.email} / {demo.password}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-sm font-semibold text-warn">
              {ERROR_COPY[error]}
            </p>
          )}
          {signedOut && !error && (
            <p role="status" className="rounded-[10px] bg-ok-soft px-3 py-2.5 text-sm font-semibold text-ok">
              You’re signed out.
            </p>
          )}

          <Field label="Email" name="email">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={email}
              className={control}
            />
          </Field>
          <Field label="Password" name="password">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              defaultValue={demo?.password ?? ''}
              className={control}
            />
          </Field>
          <input type="hidden" name="next" value={next} />

          <button
            type="submit"
            className="rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink"
          >
            Sign in
          </button>
          <p className="text-xs text-mute">
            Forgot your password? Email{' '}
            <a href={`mailto:${BUSINESS.email}`} className="underline">
              {BUSINESS.email}
            </a>
            . · <Link href="/" className="underline">Back to the site</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Replace `web/src/app/(admin)/admin/page.tsx`** with the signed-in placeholder:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/site/BrandMark';
import { LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Admin' };

/** Signed-in landing until F16–F22 build the shell and dashboard. The middleware already gates
 *  this route; the redirect below is the belt to its braces (a session that expired mid-visit). */
export default async function AdminHome() {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);

  return (
    <section className="mx-auto grid max-w-[560px] gap-4 px-4 py-16">
      <span className="flex items-center gap-2 font-extrabold">
        <BrandMark size={28} />
        Tripsmith admin
      </span>
      <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">
        Signed in as {session.user.name}
      </h1>
      <p className="text-ink2">
        {session.user.email} · {session.user.role}. The dashboard, packages, destinations and
        enquiries inbox arrive with F16–F22.
      </p>
      <div className="flex flex-wrap gap-3">
        <form method="post" action="/api/auth/logout">
          <button
            type="submit"
            className="rounded-btn border-[1.5px] border-line bg-white px-5 py-3 font-bold text-ink transition-colors hover:border-ink"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="inline-flex items-center rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink"
        >
          View site
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Typecheck, lint, format, then eyeball it.** Run `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web exec prettier --check src`. Start the stack (Task 10's recipe) and open `http://localhost:<web>/admin/login` at 390 px and 1280 px: photo panel 220 px tall on the phone, split on desktop; demo pill visible; fields prefilled. Fix wrapping/spacing before committing. Note: local seed photos aside, `/admin/login.jpg` is a static file so it renders in every environment.

- [ ] **Step 8: Commit**

```bash
git add web/public/admin/login.jpg web/src/lib/auth/demo.ts web/src/lib/auth/session.ts "web/src/app/(admin)"
git commit -m "feat(web): /admin/login (A1) + signed-in /admin placeholder with sign out"
```

---

### Task 9: Footer fine print, env comment, plan row

**Files:**
- Modify: `web/src/components/site/SiteFooter.tsx:84`, `web/.env.example:16-18`, `docs/07-plan.md:74`

- [ ] **Step 1: Footer.** In `SiteFooter.tsx` import `Link` from `next/link` (if not already) and `demoCredentials` from `@/lib/auth/demo`; inside `SiteFooter` compute `const demo = demoCredentials();` and replace the fine-print span with:

```tsx
          <span>
            © {BUSINESS.legalName} · a portfolio project by Viraj Domadia ·{' '}
            <Link href="/admin/login" className="hover:text-white">
              Owner sign in
            </Link>
            {demo && ` · Demo: ${demo.email} / ${demo.password}`}
          </span>
```

- [ ] **Step 2: Env comment.** In `web/.env.example` change the `NEXT_PUBLIC_DEMO_*` comment to: `# Demo owner login, shown prefilled on /admin/login and in the footer fine print (portfolio demo); must equal api OWNER_EMAIL / OWNER_PASSWORD. Generated — set in S2f.`

- [ ] **Step 3: Plan row.** In `docs/07-plan.md` line 74 change F15's `🔴` to `🟢`.

- [ ] **Step 4: Full root checks**

Run (root): `pnpm lint && pnpm typecheck && pnpm test` (with `TEST_DATABASE_URL` exported for the api half).
Expected: all green — vitest ≈ 95 + 14 = 109, pytest ≈ 280.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/site/SiteFooter.tsx web/.env.example docs/07-plan.md
git commit -m "feat(F15): owner sign-in link + demo login in the footer; plan row green"
```

---

### Task 10: Local end-to-end, PR, prod verification

**Files:** none new (verification only). Plan doc `docs/superpowers/plans/2026-09-21-f15-owner-login.md` is committed with the first task.

- [ ] **Step 1: Local Postgres** (skip if `pg_isready -p 5499` already answers): in the scratchpad, `initdb -U tripsmith -A trust -D pg15 && pg_ctl -D pg15 -o "-p 5499" -w start` (background the start — it hangs the bash tool otherwise), then `createdb -p 5499 -U tripsmith tripsmith_test && createdb -p 5499 -U tripsmith tripsmith_dev`. `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_test`.

- [ ] **Step 2: Migrate + seed dev.** From `api/`: `ALEMBIC_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_dev uv run alembic upgrade head`, then `DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_dev uv run python scripts/seed.py --local` (`OWNER_EMAIL` / `OWNER_PASSWORD` come from `api/.env.local` — copy it into the worktree first; **its `DATABASE_URL` is Neon production, always override it on the command line**). Expect `users: 1` in the seed summary.

- [ ] **Step 3: Run both servers** on free ports (check `Get-NetTCPConnection -LocalPort 3000,8000` — they may be Zapigo's): `DATABASE_URL=… uv run uvicorn app.main:app --port 8004` and, from `web/`, `API_URL=http://localhost:8004 pnpm exec next dev -p 3004`.

- [ ] **Step 4: Walk the journey** (Chrome MCP or Playwright screenshot, both viewports):
  1. `GET /admin` → 303 `/admin/login` (no cookie; `curl -s -o /dev/null -D - http://localhost:3004/admin`).
  2. `/admin/login` renders A1 with the demo pill; submit with a wrong password → banner "Wrong email or password.", email kept.
  3. Submit the demo credentials → lands on `/admin` "Signed in as Owner"; `document.cookie` does **not** show `ts_session` (HttpOnly); `curl` with the cookie to `http://localhost:8004/auth/session` → 200.
  4. Visiting `/admin/login` while signed in → 303 `/admin`.
  5. Sign out → `/admin/login?signedout=1` with the green note; `/admin` → 303 login again; the `sessions` row is gone (`psql -p 5499 -U tripsmith tripsmith_dev -c 'select count(*) from sessions'`).
  6. Rate limit: `for i in $(seq 11); do curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8004/auth/login -H 'content-type: application/json' -d '{"email":"x@y.z","password":"p"}'; done` → ten `401` then `429` (needs Upstash env in the worktree's `api/.env.local`; with `NullRateLimiter` every one is 401 — say so in the PR).
  7. Footer on `/` shows "Owner sign in · Demo: …".

- [ ] **Step 5: Kill the dev servers by port**, `rm -rf web/.next` if a build is needed, then run the Turbopack production build once: `pnpm --filter web build` (middleware must compile for the edge runtime — no Node-only imports in `middleware.ts` / `lib/auth/gate.ts` / `lib/auth/cookie.ts`).

- [ ] **Step 6: PR.** `git push -u origin feat/f15-owner-login`, then `gh pr create --title "feat(F15): owner login — /admin/login, session cookie, middleware gate, require_owner" --body-file <scratchpad>/pr.md` (body: what/why, the decision table's headline rows, test counts, the manual journey checklist with results, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Run `/code-review <pr> high` from this worktree before merging; fix real findings, decline non-issues with a reason.

- [ ] **Step 7: After the squash-merge** (session policy: review → merge → verify prod → tracker): wait for both Vercel deploys (`vercel inspect <url>` → `status: Ready`; prod deploys can queue), then on prod: `curl -s -o /dev/null -D - https://tripsmith.vercel.app/admin` → 303 to `/admin/login`; sign in with the demo credentials in a browser → `/admin` placeholder; `curl -s -D - -X POST https://tripsmith-api.vercel.app/auth/login -H 'content-type: application/json' -d '{"email":"owner@tripsmith.demo","password":"wrong"}'` → 401 envelope, and the cookie from a real login carries `Secure`. If prod has no owner row (the seed only creates it when `OWNER_EMAIL`/`OWNER_PASSWORD` were set in the env it ran under), run `uv run python scripts/seed.py` from the worktree with the Neon prod URL + owner env once. Mark tracker row F15 done (artifact db `rows/F15`), update the `tripsmith-status` memory (main SHA, counts, gotchas), and note F16+F17 as next.

---

## Self-review

- **Spec coverage:** 07-plan F15 row — `/admin/login` form (T8) posting to `/api/auth/login` (T7); `middleware.ts` gate via `GET /api/auth/session` (T6); logout (T5, T7, T8); demo credentials on the public site (T8 page + T9 footer); `services/auth` users/sessions + argon2 (T2–T4); `POST /auth/login` rate-limited (T5 + T1); `POST /auth/logout`, `GET /auth/session` (T5); HttpOnly SameSite=Lax cookie (T4); `require_owner` (T4, tested with a mounted route). 04 §Spam `10 / 10 min / IP` (T5). 06 §A2 lazy expiry (T3). Exit criterion "unauthenticated `/admin` → login; owner journey starts" (T10 steps 1–5).
- **Placeholders:** none — every code step is complete; the only "see Task 10" references point at the local-DB recipe, which is written out there.
- **Type consistency:** `SessionInfo` (`user.{id,name,email,role}`, `expiresAt`) matches between `schemas/auth.py`, `session_info()`, the route tests and `lib/auth/session.ts`. `COOKIE_NAME` (api) = `SESSION_COOKIE` (web) = `ts_session`; the test constant `COOKIE` equals it. `RateLimited(retry_after, message)` signature is used identically in T1 and T5. `forwardAuth`/`seeOther` names match between T7's lib and routes. `loginHref` options (`error`, `next`, `email`, `signedOut`) match between T6 tests, T7 routes and T8's page reading `error`/`next`/`email`/`signedout`.
