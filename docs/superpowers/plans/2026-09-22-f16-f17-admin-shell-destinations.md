# F16 + F17 Admin Shell + Destinations CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner signs in, lands in a sidebar shell (Dashboard · Packages · Destinations · Enquiries with a live new-enquiry badge), and can list, create, edit and delete destinations — cover upload included — with the public site updating within seconds of a save.

**Architecture:** The api gains its first `/admin/*` routes (`routers/admin/destinations.py`) behind the existing `require_owner` dependency, a `services/catalog/admin_destinations.py` service that writes rows and then calls `infra.revalidate` with cache tags, a shared image helper (`services/images.py`) that validates + resizes uploads before `app.state.store.put`, and `newEnquiries` on `SessionInfo`. The web installs shadcn/ui (Tailwind 4, mapped onto the K tokens), adds a nested `(admin)/admin/(shell)` layout with the hand-written sidebar (login stays chrome-free), and builds the destinations pages as server components for reads + one client form (react-hook-form + zod) that posts JSON straight through the existing `/api/:path*` rewrite — the session cookie rides along same-origin, so no route handlers are needed.

**Tech Stack:** FastAPI 0.141 · SQLAlchemy 2 async · pydantic v2 (camelCase aliases) · Pillow · python-multipart (new) · Next 15.5 App Router · React 19 · Tailwind 4 · shadcn/ui (new) · react-hook-form + @hookform/resolvers (new) · zod 4 · vitest · pytest.

**Spec:** `docs/07-plan.md` rows 75–76 (F16+F17), `docs/06-data-and-api.md` §A3 (destinations table) + §C-REST (`/admin/destinations`) + C3 (image upload proxy), `docs/04-ui-mockups.md` + `mockups/screens.html` (the `adm` shell, screen A5). Design decisions settled in chat on 2026-09-22 (see "Design decisions" below).

## Global Constraints

- Branch `feat/f16-f17-admin-destinations` in worktree `.worktrees/f16-f17-admin-destinations` (already exists at main = `2ac8fda`). Never touch the main checkout (other sessions share it).
- One PR, squash-merged; Viraj's review→merge→next standing grant applies for this session.
- Contract: after any schema/route change run `pnpm gen:api` at the repo root and commit `api/openapi.json` + `web/src/lib/api-types.ts` (CI's `contract` job diffs them).
- Every `/admin/*` route has `dependencies=[Depends(require_owner)]` or takes `Depends(require_owner)` — the web middleware is UX only.
- Error envelope only: raise `ApiError(code, message, field_errors=...)` — never `HTTPException`.
- Every admin response sets `Cache-Control: no-store`.
- Public data must not vary by viewer; `api(..., { auth: true })` is only for `/admin/**` and `/auth/session`.
- Static assets never live under `/admin` (the middleware gates them).
- Copy: Indian English, sentence case, no exclamation marks; prices never appear here.
- Tests: pytest under `api/` (`uv run --directory api pytest`), vitest under `web/` (`pnpm --filter web test`); `db`-marked tests need `TEST_DATABASE_URL` (local PG on port 5499, database `tripsmith_test` — see Task 10 for bringing it up).
- Lint gates before the PR: `pnpm lint`, `pnpm typecheck`, `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`.
- Demo password in tests is always `owner-pw-for-tests` (GitGuardian flags the real demo password).
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Design decisions (settled — do not re-litigate)

1. **Cover upload is a standalone endpoint** `POST /admin/destinations/cover` (multipart field `file`) → `{ url, width, height }`. The form uploads first, then sends `coverUrl` in the JSON create/update. One endpoint serves New and Edit; orphaned blobs are accepted (portfolio scale).
2. **Upload limits:** `image/jpeg`, `image/png`, `image/webp`, **≤ 4 MB** (Vercel's function body cap is 4.5 MB — the plan's "≤ 5 MB" is trimmed), longest side resized to ≤ 2000 px, re-encoded in the same format (JPEG/WEBP quality 85). The helper lives in `services/images.py` so F20 reuses it.
3. **Edit is its own page** (`/admin/destinations/[id]`), not the mockup's inline panel — linkable, and the same shape F18's package form needs. Therefore the api also gets `GET /admin/destinations/{id}` (a doc-level addition to 06 §C-REST).
4. **`newEnquiries`** on `SessionInfo` = `count(enquiries where status = 'new')`, computed on every `GET /auth/session` and login. The shell reads it once per server render.
5. **Revalidate tags after every destination write:** `destinations`, `packages` (cards embed the destination name), `home`, `destination:<slug>`, plus `destination:<old slug>` when the slug changed. The api awaits the revalidate call (≤ 5 s, never raises) before answering — "public grid updates within seconds of a save".
6. **Delete guard:** 409 `conflict` when *any* package (draft or live) references the destination. The UI disables the button with the reason.
7. **Position** is a plain integer field; no drag-and-drop.
8. **shadcn/ui** is installed with `components.json` written by hand (style `new-york`, `baseColor` `neutral`, CSS variables on). Its variables are mapped onto the K tokens in `globals.css`; our `@theme` block is untouched (tokens.test.ts must keep passing) and `--color-primary` is **not** redeclared (ours is already the ocean blue shadcn's `bg-primary` should use).
9. **Client-side writes** go through `fetch('/api/admin/...')` (the Next rewrite) with `credentials: 'same-origin'`; SameSite=Lax + JSON bodies stop cross-site posts. No `X-Client-Ip` needed (admin writes are not rate-limited).
10. Images in admin render with `next/image` (`remotePatterns` already allow the Blob host and `localhost:8000`).

## File map

**api/**
- Modify `app/schemas/auth.py` — `SessionInfo.new_enquiries: int`.
- Modify `app/services/enquiries.py` — `count_new_enquiries(db)`.
- Modify `app/services/auth/sessions.py` — `session_info(session, *, new_enquiries)`.
- Modify `app/routers/auth.py` — pass the count on login + session.
- Modify `app/schemas/catalog.py` — `DestinationInput`, `AdminDestination`, `AdminDestinationList`, `UploadedImage`.
- Create `app/services/catalog/admin_destinations.py` — list/get/create/update/delete + `revalidate_tags`.
- Create `app/services/images.py` — `prepare_image(data, content_type) -> PreparedImage`.
- Create `app/routers/admin/__init__.py`, `app/routers/admin/destinations.py`.
- Modify `app/main.py` — include the admin router.
- Modify `pyproject.toml` (+ `uv.lock`) — `python-multipart`.
- Modify `tests/test_openapi.py` — new operation ids.
- Create `tests/test_admin_destinations.py`, `tests/test_images.py`; modify `tests/test_auth.py`.
- Regenerate `openapi.json`.

**web/**
- Create `components.json`; modify `package.json` (shadcn deps); create `src/lib/utils.ts` (`cn`), `src/components/ui/*` (generated).
- Modify `src/app/globals.css` — shadcn variable mapping + `tw-animate-css`.
- Create `src/lib/admin/client.ts` — `adminRequest`, `uploadCover`.
- Create `src/lib/admin/destination-schema.ts` — zod schema + `MONTHS`.
- Create `src/components/admin/Sidebar.tsx`, `src/components/admin/NavLink.tsx`, `src/components/admin/PageHead.tsx`.
- Create `src/app/(admin)/admin/(shell)/layout.tsx`; move `src/app/(admin)/admin/page.tsx` → `(shell)/page.tsx`; create `(shell)/packages/page.tsx`, `(shell)/enquiries/page.tsx` placeholders.
- Create `(shell)/destinations/page.tsx`, `(shell)/destinations/new/page.tsx`, `(shell)/destinations/[id]/page.tsx`.
- Create `src/components/admin/destinations/DestinationsTable.tsx`, `DestinationForm.tsx`, `CoverUploader.tsx`, `MonthPicker.tsx`, `DeleteDestination.tsx`.
- Create `tests/admin-client.test.ts`, `tests/destination-schema.test.ts`.
- Regenerated `src/lib/api-types.ts`.

**docs/** — `07-plan.md` rows 75–76 → 🟢; `06-data-and-api.md` §C-REST row gains `GET /admin/destinations/:id` and `POST /admin/destinations/cover`.

---

### Task 1: `newEnquiries` in the session payload

**Files:**
- Modify: `api/app/schemas/auth.py`
- Modify: `api/app/services/enquiries.py`
- Modify: `api/app/services/auth/sessions.py`
- Modify: `api/app/routers/auth.py`
- Test: `api/tests/test_auth.py`

**Interfaces:**
- Produces: `count_new_enquiries(db: AsyncSession) -> int` in `app.services.enquiries`; `session_info(session: Session, *, new_enquiries: int) -> SessionInfo`; wire field `newEnquiries: int` on `SessionInfo`.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_auth.py`:

```python
from app.models import Enquiry
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.services.enquiries import count_new_enquiries


async def add_enquiry(db: AsyncSession, status: EnquiryStatus) -> None:
    """A minimal `contact` enquiry row (the same columns tests/test_enquiries.py inserts)."""
    db.add(
        Enquiry(
            ref="TS-" + new_token()[:6].upper(),
            type=EnquiryType.CONTACT,
            name="Asha",
            phone="9845000000",
            email="asha@example.com",
            adults=1,
            children=0,
            status=status,
            email_status=EmailStatus.SKIPPED,
        )
    )
    await db.commit()


@pytest.mark.db
async def test_count_new_enquiries_counts_only_new(db: AsyncSession) -> None:
    await seeded_with_owner(db)
    assert await count_new_enquiries(db) == 0
    await add_enquiry(db, EnquiryStatus.NEW)
    await add_enquiry(db, EnquiryStatus.NEW)
    await add_enquiry(db, EnquiryStatus.CONTACTED)
    assert await count_new_enquiries(db) == 2


@pytest.mark.db
async def test_session_payload_carries_the_new_enquiry_count(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded_with_owner(db)
    await add_enquiry(db, EnquiryStatus.NEW)
    login_res = await db_client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    assert login_res.json()["newEnquiries"] == 1
    token = login_res.cookies[COOKIE_NAME]
    await add_enquiry(db, EnquiryStatus.NEW)
    res = await db_client.get("/auth/session", headers=with_cookie(token))
    assert res.status_code == 200 and res.json()["newEnquiries"] == 2
```

`Enquiry`'s required columns are `ref`, `type`, `name`, `phone`, `email`, `adults` (verified against `api/app/models/enquiries.py`); `status`/`email_status`/`children` have server defaults but are set explicitly so the row is complete before the commit.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --directory api pytest tests/test_auth.py -k "new_enquir" -v`
Expected: FAIL — `ImportError: cannot import name 'count_new_enquiries'`.

- [ ] **Step 3: Implement**

`api/app/services/enquiries.py` — add (near the top-level helpers, `func` import from sqlalchemy):

```python
async def count_new_enquiries(db: AsyncSession) -> int:
    """Rows still in `new` — the sidebar badge (F16); the inbox (F21) filters on the same status."""
    return (
        await db.execute(
            select(func.count()).select_from(Enquiry).where(Enquiry.status == EnquiryStatus.NEW)
        )
    ).scalar_one()
```

`api/app/schemas/auth.py`:

```python
class SessionInfo(ApiModel):
    """What `GET /auth/session` returns; `newEnquiries` feeds the admin sidebar badge (F16)."""

    user: SessionUser
    expires_at: datetime
    new_enquiries: int = Field(ge=0, description="Enquiries still in status `new`")
```

`api/app/services/auth/sessions.py`:

```python
def session_info(session: Session, *, new_enquiries: int) -> SessionInfo:
    u = session.user
    return SessionInfo(
        user=SessionUser(id=u.id, name=u.name, email=u.email, role=u.role),
        expires_at=session.expires_at,
        new_enquiries=new_enquiries,
    )
```

`api/app/routers/auth.py` — import `count_new_enquiries` from `app.services.enquiries`; in `post_login` return `session_info(session, new_enquiries=await count_new_enquiries(db))`; in `get_session_route` add `db: Annotated[AsyncSession, Depends(get_session)]` to the signature and return the same way.

- [ ] **Step 4: Run the auth tests**

Run: `uv run --directory api pytest tests/test_auth.py -v`
Expected: all PASS (existing tests still assert `expiresAt`; nothing else changes shape).

- [ ] **Step 5: Regenerate the contract and run web tests**

Run: `pnpm gen:api` (repo root) then `pnpm --filter web test` and `pnpm --filter web typecheck`.
Expected: `api/openapi.json` and `web/src/lib/api-types.ts` change (`newEnquiries` required on `SessionInfo`); web tests + typecheck green (`auth-routes.test.ts` builds a `SessionInfo` fixture — add `newEnquiries: 0` wherever typecheck complains).

- [ ] **Step 6: Commit**

```bash
git add api/app api/tests api/openapi.json web/src/lib/api-types.ts web/tests
git commit -m "feat(F16): newEnquiries on the session payload

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Destination admin schemas + service (list/get/create/update/delete + revalidate)

**Files:**
- Modify: `api/app/schemas/catalog.py`
- Create: `api/app/services/catalog/admin_destinations.py`
- Test: `api/tests/test_admin_destinations.py`

**Interfaces:**
- Consumes: `app.infra.revalidate.revalidate(tags)`, `app.models.Destination`, `app.models.Package`, `app.errors.ApiError`.
- Produces (all in `app.services.catalog.admin_destinations`):
  - `async list_destinations(db) -> list[AdminDestination]`
  - `async get_destination(db, id: str) -> AdminDestination` (raises `ApiError("not_found", ...)`)
  - `async create_destination(db, payload: DestinationInput) -> AdminDestination`
  - `async update_destination(db, id: str, payload: DestinationInput) -> AdminDestination`
  - `async delete_destination(db, id: str) -> None`
  - `def revalidate_tags(slug: str, old_slug: str | None = None) -> list[str]`
- Schemas in `app.schemas.catalog`: `DestinationInput`, `AdminDestination`, `AdminDestinationList`.

- [ ] **Step 1: Write the failing tests** — create `api/tests/test_admin_destinations.py`:

```python
"""F17 destination CRUD: service + `/admin/destinations` routes (06 §A3, §C-REST)."""

from collections.abc import Sequence

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Destination, Package
from app.schemas.catalog import DestinationInput
from app.services.catalog import admin_destinations as svc
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --directory api pytest tests/test_admin_destinations.py -v`
Expected: FAIL at import — `ImportError: cannot import name 'DestinationInput'`.

- [ ] **Step 3: Schemas** — append to `api/app/schemas/catalog.py` (reuse the file's existing imports; add `AnyHttpUrl`? No — keep `cover_url` a plain `str` validated by a regex so the wire type stays `string`):

```python
SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
HTTP_URL_PATTERN = r"^https?://\S+$"


class DestinationInput(ApiModel):
    """Owner create/update body (06 §A3). Months are de-duplicated and sorted."""

    slug: str = Field(pattern=SLUG_PATTERN, min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=80)
    tagline: str = Field(min_length=1, max_length=80)
    intro: str = Field(min_length=40, max_length=5000, description="Markdown, 2–3 paragraphs")
    cover_url: str = Field(pattern=HTTP_URL_PATTERN, max_length=1000)
    region: str = Field(min_length=1, max_length=80)
    best_months: list[Annotated[int, Field(ge=1, le=12)]] = Field(min_length=1, max_length=12)
    position: int = Field(ge=0, le=999, default=0)

    @field_validator("name", "tagline", "intro", "region")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("best_months")
    @classmethod
    def _unique_sorted(cls, v: list[int]) -> list[int]:
        return sorted(set(v))


class AdminDestination(ApiModel):
    """A destination row as the owner sees it — including ones the public list hides."""

    id: str
    slug: str
    name: str
    tagline: str
    intro: str
    cover_url: str
    region: str
    best_months: list[int]
    position: int
    package_count: int = Field(description="All packages, draft or live")
    live_package_count: int
    updated_at: datetime


class AdminDestinationList(ApiModel):
    items: list[AdminDestination]
```

(`Annotated`, `field_validator`, `datetime` — add to the file's imports if missing. Note `min_length` on a string field with `pattern` — pydantic applies both.)

- [ ] **Step 4: Service** — create `api/app/services/catalog/admin_destinations.py`:

```python
"""Owner-side destination CRUD (F17, 06 §A3). Every write revalidates the public pages."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.models import Destination, Package
from app.models.enums import PackageStatus
from app.schemas.catalog import AdminDestination, DestinationInput

DUPLICATE_SLUG = "A destination with this slug already exists"


def revalidate_tags(slug: str, old_slug: str | None = None) -> list[str]:
    """`packages` too: package cards embed the destination name (06 C1)."""
    tags = ["destinations", "packages", "home", f"destination:{slug}"]
    if old_slug and old_slug != slug:
        tags.append(f"destination:{old_slug}")
    return tags


def _counts_query():  # noqa: ANN202 — SQLAlchemy select type is unwieldy
    return (
        select(
            Destination,
            func.count(Package.id),
            func.count(Package.id).filter(Package.status == PackageStatus.LIVE),
        )
        .outerjoin(Package, Package.destination_id == Destination.id)
        .group_by(Destination.id)
    )


def _to_admin(row: Destination, package_count: int, live_package_count: int) -> AdminDestination:
    return AdminDestination(
        id=row.id,
        slug=row.slug,
        name=row.name,
        tagline=row.tagline,
        intro=row.intro,
        cover_url=row.cover_url,
        region=row.region,
        best_months=list(row.best_months),
        position=row.position,
        package_count=package_count,
        live_package_count=live_package_count,
        updated_at=row.updated_at,
    )


async def list_destinations(db: AsyncSession) -> list[AdminDestination]:
    rows = await db.execute(_counts_query().order_by(Destination.position, Destination.name))
    return [_to_admin(d, total, live) for d, total, live in rows.all()]


async def _load(db: AsyncSession, id: str) -> tuple[Destination, int, int]:
    row = (await db.execute(_counts_query().where(Destination.id == id))).one_or_none()
    if row is None:
        raise ApiError("not_found", "Destination not found")
    d, total, live = row
    return d, int(total), int(live)


async def get_destination(db: AsyncSession, id: str) -> AdminDestination:
    return _to_admin(*await _load(db, id))


async def _assert_slug_free(db: AsyncSession, slug: str, *, except_id: str | None) -> None:
    q = select(Destination.id).where(Destination.slug == slug)
    if except_id is not None:
        q = q.where(Destination.id != except_id)
    if (await db.execute(q)).scalar_one_or_none() is not None:
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG})


def _apply(row: Destination, payload: DestinationInput) -> None:
    row.slug = payload.slug
    row.name = payload.name
    row.tagline = payload.tagline
    row.intro = payload.intro
    row.cover_url = payload.cover_url
    row.region = payload.region
    row.best_months = payload.best_months
    row.position = payload.position


async def create_destination(db: AsyncSession, payload: DestinationInput) -> AdminDestination:
    await _assert_slug_free(db, payload.slug, except_id=None)
    row = Destination()
    _apply(row, payload)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await revalidate(revalidate_tags(row.slug))
    return _to_admin(row, 0, 0)


async def update_destination(
    db: AsyncSession, id: str, payload: DestinationInput
) -> AdminDestination:
    row, total, live = await _load(db, id)
    await _assert_slug_free(db, payload.slug, except_id=id)
    old_slug = row.slug
    _apply(row, payload)
    await db.commit()
    await db.refresh(row)
    await revalidate(revalidate_tags(row.slug, old_slug))
    return _to_admin(row, total, live)


async def delete_destination(db: AsyncSession, id: str) -> None:
    row, total, _ = await _load(db, id)
    if total:
        noun = "package uses" if total == 1 else "packages use"
        raise ApiError(
            "conflict", f"{total} {noun} this destination — delete or move them first"
        )
    slug = row.slug
    await db.delete(row)
    await db.commit()
    await revalidate(revalidate_tags(slug))
```

If `_counts_query` trips ruff's `ANN` rules or pyright, give it an explicit return type `Select[tuple[Destination, int, int]]` (from `sqlalchemy import Select`) instead of the noqa. `Destination.updated_at` — confirm `TimestampsMixin` sets it with `server_default`/`onupdate` (open `app/models/base.py`); `refresh` reloads it.

- [ ] **Step 5: Run the tests**

Run: `uv run --directory api pytest tests/test_admin_destinations.py -v`
Expected: all PASS. If the `db` tests are skipped, `TEST_DATABASE_URL` is unset — see Task 10 step 1 for the local PG and export it (`TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5499/tripsmith_test`).

- [ ] **Step 6: Lint + commit**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright`

```bash
git add api/app/schemas/catalog.py api/app/services/catalog/admin_destinations.py api/tests/test_admin_destinations.py
git commit -m "feat(F17): destination admin schemas + CRUD service with revalidation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `/admin/destinations` routes

**Files:**
- Create: `api/app/routers/admin/__init__.py`, `api/app/routers/admin/destinations.py`
- Modify: `api/app/main.py`, `api/tests/test_openapi.py`
- Test: `api/tests/test_admin_destinations.py` (append)

**Interfaces:**
- Consumes: Task 2 service functions; `require_owner` from `app.services.auth.deps`.
- Produces routes: `GET /admin/destinations` (`listAdminDestinations`) → `AdminDestinationList`; `GET /admin/destinations/{id}` (`getAdminDestination`); `POST /admin/destinations` (`createDestination`, 201); `PUT /admin/destinations/{id}` (`updateDestination`); `DELETE /admin/destinations/{id}` (`deleteDestination`, 204). The cover upload route is Task 4.

- [ ] **Step 1: Write the failing route tests** — append to `api/tests/test_admin_destinations.py`:

```python
# --- routes ---------------------------------------------------------------------------------------


async def owner_cookie(db: AsyncSession, db_client: AsyncClient) -> dict[str, str]:
    await seeded_with_owner(db)
    res = await db_client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    return with_cookie(res.cookies["ts_session"])


@pytest.mark.db
async def test_admin_destination_routes_require_the_owner(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    assert (await db_client.get("/admin/destinations")).status_code == 401
    assert (await db_client.post("/admin/destinations", json={})).status_code == 401
    assert (await db_client.put("/admin/destinations/x", json={})).status_code == 401
    assert (await db_client.delete("/admin/destinations/x")).status_code == 401
    res = await db_client.get("/admin/destinations")
    assert res.headers["cache-control"] == "no-store"


@pytest.mark.db
async def test_admin_destination_crud_round_trip(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    body = payload().model_dump(by_alias=True)

    created = await db_client.post("/admin/destinations", json=body, headers=cookie)
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    new = created.json()
    assert new["slug"] == "kerala" and new["packageCount"] == 0 and new["bestMonths"] == [1, 10, 11, 12]

    listed = await db_client.get("/admin/destinations", headers=cookie)
    assert [d["slug"] for d in listed.json()["items"]] == ["goa", "kerala"]

    one = await db_client.get(f"/admin/destinations/{new['id']}", headers=cookie)
    assert one.status_code == 200 and one.json()["name"] == "Kerala"
    assert (await db_client.get("/admin/destinations/nope", headers=cookie)).status_code == 404

    updated = await db_client.put(
        f"/admin/destinations/{new['id']}", json={**body, "name": "Kerala & Munnar"}, headers=cookie
    )
    assert updated.status_code == 200 and updated.json()["name"] == "Kerala & Munnar"

    dup = await db_client.post("/admin/destinations", json={**body, "slug": "goa"}, headers=cookie)
    assert dup.status_code == 409
    assert dup.json()["error"]["fieldErrors"] == {"slug": "A destination with this slug already exists"}

    invalid = await db_client.post(
        "/admin/destinations", json={**body, "bestMonths": []}, headers=cookie
    )
    assert invalid.status_code == 400 and "bestMonths" in invalid.json()["error"]["fieldErrors"]

    goa_id = next(d["id"] for d in listed.json()["items"] if d["slug"] == "goa")
    blocked = await db_client.delete(f"/admin/destinations/{goa_id}", headers=cookie)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "conflict"

    gone = await db_client.delete(f"/admin/destinations/{new['id']}", headers=cookie)
    assert gone.status_code == 204
    assert [d["slug"] for d in (await db_client.get("/admin/destinations", headers=cookie)).json()["items"]] == ["goa"]
    assert ["destinations", "packages", "home", "destination:kerala"] in revalidated.calls
```

And in `api/tests/test_openapi.py::test_document_exposes_the_v1_enums_and_operations` add:

```python
    admin = doc["paths"]["/admin/destinations"]
    assert admin["get"]["operationId"] == "listAdminDestinations"
    assert admin["post"]["operationId"] == "createDestination"
    one = doc["paths"]["/admin/destinations/{id}"]
    assert one["get"]["operationId"] == "getAdminDestination"
    assert one["put"]["operationId"] == "updateDestination"
    assert one["delete"]["operationId"] == "deleteDestination"
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --directory api pytest tests/test_admin_destinations.py tests/test_openapi.py -v`
Expected: route tests FAIL with 404s / `KeyError: '/admin/destinations'`.

- [ ] **Step 3: Router** — `api/app/routers/admin/__init__.py`:

```python
"""Owner-only routers: every route depends on `require_owner` (05 §Auth)."""
```

`api/app/routers/admin/destinations.py`:

```python
"""`/admin/destinations` (06 §C-REST): owner CRUD; the cover upload proxy lives here too (C3)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.schemas.catalog import AdminDestination, AdminDestinationList, DestinationInput
from app.services.auth.deps import require_owner
from app.services.catalog import admin_destinations as svc

NO_STORE = {"Cache-Control": "no-store"}

router = APIRouter(
    prefix="/admin/destinations", tags=["admin"], dependencies=[Depends(require_owner)]
)

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("", operation_id="listAdminDestinations", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminDestinationList:
    response.headers.update(NO_STORE)
    return AdminDestinationList(items=await svc.list_destinations(db))


@router.get("/{id}", operation_id="getAdminDestination", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminDestination:
    response.headers.update(NO_STORE)
    return await svc.get_destination(db, id)


@router.post(
    "",
    operation_id="createDestination",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(payload: DestinationInput, response: Response, db: Db) -> AdminDestination:
    response.headers.update(NO_STORE)
    return await svc.create_destination(db, payload)


@router.put("/{id}", operation_id="updateDestination", response_model_by_alias=True)
async def update_route(
    id: str, payload: DestinationInput, response: Response, db: Db
) -> AdminDestination:
    response.headers.update(NO_STORE)
    return await svc.update_destination(db, id, payload)


@router.delete(
    "/{id}",
    operation_id="deleteDestination",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, db: Db) -> Response:
    await svc.delete_destination(db, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
```

Important: the `require_owner` dependency raises 401 before the body is validated, so the "require the owner" test's `json={}` posts return 401, not 400. The 401 envelope already carries `Cache-Control: no-store` (`errors.envelope()`), which is what the header assertion checks. The router-level `dependencies=[...]` runs `require_owner` for the route tests via `db_client` because `get_session` is overridden on the app.

`api/app/main.py` — `from app.routers.admin import destinations as admin_destinations` and `app.include_router(admin_destinations.router)` after the auth router.

- [ ] **Step 4: Run the tests + regenerate the contract**

Run: `uv run --directory api pytest tests/test_admin_destinations.py tests/test_openapi.py -v` → PASS.
Run: `pnpm gen:api` → `openapi.json` and `api-types.ts` gain the five operations. Run `pnpm --filter web typecheck`.

- [ ] **Step 5: Lint + commit**

```bash
uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright
git add api/app api/tests api/openapi.json web/src/lib/api-types.ts
git commit -m "feat(F17): /admin/destinations routes behind require_owner

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Image helper + `POST /admin/destinations/cover`

**Files:**
- Modify: `api/pyproject.toml` (+ `uv.lock`) — `python-multipart`
- Create: `api/app/services/images.py`
- Modify: `api/app/schemas/catalog.py` (`UploadedImage`), `api/app/routers/admin/destinations.py`, `api/tests/test_openapi.py`
- Test: `api/tests/test_images.py`, `api/tests/test_admin_destinations.py` (append)

**Interfaces:**
- Produces: `prepare_image(data: bytes, content_type: str) -> PreparedImage` where `PreparedImage = dataclass(data: bytes, content_type: str, ext: str, width: int, height: int)`; raises `ImageError(message)`. Constants `MAX_BYTES = 4 * 1024 * 1024`, `MAX_SIDE = 2000`, `ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}`.
- Route `POST /admin/destinations/cover` (`uploadDestinationCover`), multipart field `file`, → `UploadedImage { url, width, height }` 201.

- [ ] **Step 1: Add the dependency**

Run: `uv add --directory api "python-multipart>=0.0.20"` (FastAPI needs it for `UploadFile`). Confirm `uv.lock` changed.

- [ ] **Step 2: Write the failing helper tests** — `api/tests/test_images.py`:

```python
"""services/images: validate + resize an upload before it goes to Blob (06 C3)."""

import io

import pytest
from PIL import Image

from app.services.images import MAX_BYTES, MAX_SIDE, ImageError, prepare_image


def png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 120, 40)).save(buf, format="PNG")
    return buf.getvalue()


def jpeg(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (20, 80, 200)).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_small_images_pass_through_in_their_own_format() -> None:
    out = prepare_image(png(300, 200), "image/png")
    assert (out.width, out.height, out.ext, out.content_type) == (300, 200, "png", "image/png")
    assert Image.open(io.BytesIO(out.data)).format == "PNG"
    out = prepare_image(jpeg(300, 200), "image/jpeg")
    assert out.ext == "jpg" and Image.open(io.BytesIO(out.data)).format == "JPEG"


def test_large_images_are_resized_to_the_longest_side() -> None:
    out = prepare_image(jpeg(4000, 1000), "image/jpeg")
    assert (out.width, out.height) == (MAX_SIDE, 500)


def test_rejects_wrong_type_size_and_garbage() -> None:
    with pytest.raises(ImageError, match="JPG, PNG or WEBP"):
        prepare_image(png(10, 10), "image/gif")
    with pytest.raises(ImageError, match="4 MB"):
        prepare_image(b"x" * (MAX_BYTES + 1), "image/png")
    with pytest.raises(ImageError, match="not an image"):
        prepare_image(b"definitely not an image", "image/png")
    # Declared PNG, actually JPEG bytes: the sniffed format wins the extension.
    out = prepare_image(jpeg(20, 20), "image/png")
    assert out.ext == "jpg" and out.content_type == "image/jpeg"
```

- [ ] **Step 3: Run to verify they fail**

Run: `uv run --directory api pytest tests/test_images.py -v` → `ModuleNotFoundError: app.services.images`.

- [ ] **Step 4: Implement the helper** — `api/app/services/images.py`:

```python
"""Validate and normalise an image upload before it reaches Blob (06 C3; F17 covers, F20 galleries).

Pure and synchronous — call it via `asyncio.to_thread` from a request.
"""

import io
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

MAX_BYTES = 4 * 1024 * 1024  # Vercel's function body cap is 4.5 MB
MAX_SIDE = 2000
ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_FORMAT_TO_TYPE = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
_SAVE_KWARGS = {"JPEG": {"quality": 85, "optimize": True}, "WEBP": {"quality": 85}, "PNG": {}}


class ImageError(ValueError):
    """A user-facing reason the upload was refused."""


@dataclass(frozen=True)
class PreparedImage:
    data: bytes
    content_type: str
    ext: str
    width: int
    height: int


def prepare_image(data: bytes, content_type: str) -> PreparedImage:
    if content_type not in ALLOWED:
        raise ImageError("Upload a JPG, PNG or WEBP image")
    if len(data) > MAX_BYTES:
        raise ImageError("Images must be 4 MB or smaller")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageError("That file is not an image") from exc
    fmt = im.format or ""
    if fmt not in _FORMAT_TO_TYPE:
        raise ImageError("Upload a JPG, PNG or WEBP image")
    if fmt == "JPEG" and im.mode != "RGB":
        im = im.convert("RGB")
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format=fmt, **_SAVE_KWARGS[fmt])
    real_type = _FORMAT_TO_TYPE[fmt]
    return PreparedImage(
        data=buf.getvalue(),
        content_type=real_type,
        ext=ALLOWED[real_type],
        width=im.width,
        height=im.height,
    )
```

(Pillow's `thumbnail` keeps aspect and rounds — `4000×1000 → 2000×500` exactly. If the test reports 499, replace `thumbnail` with an explicit `im.resize((MAX_SIDE, round(h * MAX_SIDE / w)))` computation on the longest side.)

- [ ] **Step 5: Run the helper tests** → PASS.

- [ ] **Step 6: Write the failing route test** — append to `api/tests/test_admin_destinations.py`:

```python
import io

from PIL import Image

from app.infra.storage import Store


class RecordingBlobStore:
    def __init__(self) -> None:
        self.puts: list[tuple[str, int, str]] = []

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        self.puts.append((pathname, len(data), content_type))
        return f"https://blob.test/{pathname}"


def small_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (640, 400), (1, 2, 3)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.mark.db
async def test_cover_upload_validates_resizes_and_stores(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    cookie = await owner_cookie(db, db_client)
    store = RecordingBlobStore()
    db_app.state.store = store

    res = await db_client.post(
        "/admin/destinations/cover",
        files={"file": ("photo.jpeg", small_jpeg(), "image/jpeg")},
        headers=cookie,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["width"] == 640 and body["height"] == 400
    pathname, size, content_type = store.puts[0]
    assert pathname.startswith("destinations/uploads/") and pathname.endswith(".jpg")
    assert content_type == "image/jpeg" and size > 0
    assert body["url"] == f"https://blob.test/{pathname}"
    assert res.headers["cache-control"] == "no-store"

    bad = await db_client.post(
        "/admin/destinations/cover",
        files={"file": ("x.gif", b"GIF89a", "image/gif")},
        headers=cookie,
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["fieldErrors"] == {"file": "Upload a JPG, PNG or WEBP image"}

    db_app.state.store = None
    off = await db_client.post(
        "/admin/destinations/cover",
        files={"file": ("photo.jpeg", small_jpeg(), "image/jpeg")},
        headers=cookie,
    )
    assert off.status_code == 500
    assert off.json()["error"]["message"] == "Image storage is not configured"

    assert (await db_client.post("/admin/destinations/cover")).status_code == 401
```

Add `from fastapi import FastAPI` to the test imports; `Store` import may be unused — drop it if ruff complains.

- [ ] **Step 7: Run to verify it fails** → 404 on `/admin/destinations/cover`... careful: the `GET /{id}` route does not catch POST, so FastAPI answers 405 or 404 — either is a fail.

- [ ] **Step 8: Implement the route** — `api/app/schemas/catalog.py`:

```python
class UploadedImage(ApiModel):
    url: str
    width: int
    height: int
```

`api/app/routers/admin/destinations.py` — add imports `asyncio`, `from fastapi import Request, UploadFile, File`, `from app.errors import ApiError`, `from app.models.base import new_id`, `from app.schemas.catalog import UploadedImage`, `from app.services.images import ImageError, prepare_image`, and **declare the route before `GET /{id}`** (path order does not matter for a different method, but keep the file readable):

```python
@router.post(
    "/cover",
    operation_id="uploadDestinationCover",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def upload_cover_route(
    request: Request, response: Response, file: Annotated[UploadFile, File()]
) -> UploadedImage:
    """Multipart proxy (06 C3): validate + resize in a thread, then one Blob PUT."""
    response.headers.update(NO_STORE)
    store = request.app.state.store
    if store is None:
        raise ApiError("internal", "Image storage is not configured")
    data = await file.read()
    try:
        image = await asyncio.to_thread(prepare_image, data, file.content_type or "")
    except ImageError as exc:
        raise ApiError("validation", str(exc), field_errors={"file": str(exc)}) from exc
    pathname = f"destinations/uploads/{new_id()}.{image.ext}"
    url = await store.put(pathname, image.data, image.content_type)
    return UploadedImage(url=url, width=image.width, height=image.height)
```

`new_id` is `cuid_wrapper()` in `app/models/base.py` (the same factory `IdMixin` uses). Add to `test_openapi.py`: `assert doc["paths"]["/admin/destinations/cover"]["post"]["operationId"] == "uploadDestinationCover"`.

- [ ] **Step 9: Run everything for the api**

Run: `uv run --directory api pytest -q` → all PASS (count goes up from 288). Run `pnpm gen:api`; `pnpm --filter web typecheck`.

- [ ] **Step 10: Lint + commit**

```bash
uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright
git add api web/src/lib/api-types.ts
git commit -m "feat(F17): destination cover upload proxy + shared image helper

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: shadcn/ui install, token mapping, admin client helper

**Files:**
- Create: `web/components.json`, `web/src/lib/utils.ts`, `web/src/components/ui/*` (generated), `web/src/lib/admin/client.ts`
- Modify: `web/package.json`, `pnpm-lock.yaml`, `web/src/app/globals.css`
- Test: `web/tests/admin-client.test.ts`, existing `web/tests/tokens.test.ts` must stay green

**Interfaces:**
- Produces: `cn(...inputs)` in `@/lib/utils`; shadcn components `button`, `input`, `textarea`, `label`, `table`, `badge`, `dialog`, `sonner`, `form`; `adminRequest<T>(path, { method, body? }): Promise<T>` and `uploadCover(file: File): Promise<UploadedImage>` in `@/lib/admin/client`.

- [ ] **Step 1: `components.json`** — create `web/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: Add the components**

Run from `web/`: `pnpm dlx shadcn@latest add button input textarea label table badge dialog sonner form --yes --overwrite`
Expected: files under `src/components/ui/`, `src/lib/utils.ts`, and `package.json` gains `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `radix-ui` (or `@radix-ui/*`), `sonner`, `react-hook-form`, `@hookform/resolvers`, `tw-animate-css` (dev or prod — leave as the CLI put them). Pin every new dependency to an exact version (the repo pins; run `pnpm --filter web add <pkg>@<version>` or edit `package.json` to remove `^`/`~` then `pnpm install`). Look at the `git diff -- web/src/app/globals.css`: the CLI may have injected a large `:root { --background … }` block and an `@theme inline` block. **Delete whatever it injected** and replace it with the block in Step 3, so the file keeps our `@theme` tokens exactly as they were.

- [ ] **Step 3: Map shadcn's variables onto the K tokens** — insert after the `@theme { … }` block in `web/src/app/globals.css`:

```css
@import 'tw-animate-css';

/*
 * shadcn/ui (admin primitives) reads these names. Each one is a K token from the block above;
 * `--color-primary` is deliberately not redeclared — ours is already the ocean blue shadcn's
 * `bg-primary` should use. Light only (html { color-scheme: light }).
 */
:root {
  --background: var(--color-bg);
  --foreground: var(--color-ink);
  --card: var(--color-bg);
  --card-foreground: var(--color-ink);
  --popover: var(--color-bg);
  --popover-foreground: var(--color-ink);
  --primary-foreground: #ffffff;
  --secondary: var(--color-bg2);
  --secondary-foreground: var(--color-ink);
  --muted: var(--color-bg2);
  --muted-foreground: var(--color-mute);
  --accent: var(--color-primary-soft);
  --accent-foreground: var(--color-primary-ink);
  --destructive: var(--color-warn);
  --border: var(--color-line);
  --input: var(--color-line);
  --ring: var(--color-primary);
  --radius: var(--radius-btn);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

`@import` rules must precede other rules in CSS — put `@import 'tw-animate-css';` on the line right after `@import 'tailwindcss';` at the top of the file, not mid-file.

- [ ] **Step 4: Verify nothing regressed**

Run: `pnpm --filter web test` (tokens.test.ts still green), `pnpm --filter web typecheck`, `pnpm --filter web lint`, and `pnpm --filter web build` (Turbopack; must compile the new ui components). Expected: all green. If eslint flags the generated ui files, fix the flagged lines (do not add ignores).

- [ ] **Step 5: Write the failing client tests** — `web/tests/admin-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';
import { adminRequest, uploadCover } from '../src/lib/admin/client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('adminRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts JSON through the /api rewrite with same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { id: 'd1' }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await adminRequest<{ id: string }>('/admin/destinations', {
      method: 'POST',
      body: { slug: 'goa' },
    });
    expect(out).toEqual({ id: 'd1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/destinations');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe('{"slug":"goa"}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('returns undefined on 204 and throws ApiRequestError with the envelope otherwise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(adminRequest('/admin/destinations/d1', { method: 'DELETE' })).resolves.toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(409, { error: { code: 'conflict', message: 'Taken', fieldErrors: { slug: 'Taken' } } }),
      ),
    );
    const err = await adminRequest('/admin/destinations', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(409);
    expect((err as ApiRequestError).body.fieldErrors).toEqual({ slug: 'Taken' });
  });
});

describe('uploadCover', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the file as multipart field "file" and returns the url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { url: 'https://b/x.jpg', width: 1, height: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' });
    const out = await uploadCover(file);
    expect(out.url).toBe('https://b/x.jpg');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/destinations/cover');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(new Headers(init.headers).has('content-type')).toBe(false); // the browser sets the boundary
  });
});
```

- [ ] **Step 6: Run to verify they fail** — `pnpm --filter web test -- admin-client` → cannot resolve `../src/lib/admin/client`.

- [ ] **Step 7: Implement** — `web/src/lib/admin/client.ts`:

```ts
import { errorFromResponse } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';

/**
 * Browser-side writes for the owner area. Requests go through the `/api/:path*` rewrite, so the
 * HttpOnly session cookie travels same-origin and the api's `require_owner` does the gating;
 * SameSite=Lax plus a JSON body is what stops a cross-site page from posting here. Reads stay in
 * server components via `api(..., { auth: true })`.
 */

export type UploadedImage = components['schemas']['UploadedImage'];

type Method = 'POST' | 'PUT' | 'DELETE';

export async function adminRequest<T = undefined>(
  path: `/admin/${string}`,
  init: { method: Method; body?: unknown },
): Promise<T> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return settle<T>(res);
}

export async function uploadCover(file: File): Promise<UploadedImage> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/admin/destinations/cover', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return settle<UploadedImage>(res);
}

async function settle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const raw = await res.json().catch(() => undefined);
  if (!res.ok) throw errorFromResponse(res.status, res.statusText, raw);
  return raw as T;
}
```

- [ ] **Step 8: Run the web suite** — `pnpm --filter web test` → PASS; `pnpm --filter web typecheck && pnpm --filter web lint` → green.

- [ ] **Step 9: Commit**

```bash
git add web/components.json web/package.json pnpm-lock.yaml web/src/lib/utils.ts web/src/components/ui web/src/app/globals.css web/src/lib/admin/client.ts web/tests/admin-client.test.ts
git commit -m "feat(F16): shadcn/ui on the K tokens + browser-side admin client

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Admin shell — nested layout, sidebar, placeholders

**Files:**
- Create: `web/src/app/(admin)/admin/(shell)/layout.tsx`, `web/src/components/admin/Sidebar.tsx`, `web/src/components/admin/NavLink.tsx`, `web/src/components/admin/PageHead.tsx`, `web/src/app/(admin)/admin/(shell)/packages/page.tsx`, `web/src/app/(admin)/admin/(shell)/enquiries/page.tsx`
- Move: `web/src/app/(admin)/admin/page.tsx` → `web/src/app/(admin)/admin/(shell)/page.tsx` (rewritten)
- Keep: `web/src/app/(admin)/layout.tsx` (bare canvas), `web/src/app/(admin)/admin/login/page.tsx` untouched

**Interfaces:**
- Consumes: `getSession()` (`@/lib/auth/session`), `LOGIN_PATH` (`@/lib/auth/gate`), `BrandMark`, shadcn `Toaster` (from `@/components/ui/sonner`).
- Produces: `<Sidebar session={session} />`, `<PageHead title subtitle actions? />`, `NAV` array `{ href, label, icon }`.

- [ ] **Step 1: Layout** — `web/src/app/(admin)/admin/(shell)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/admin/Sidebar';
import { Toaster } from '@/components/ui/sonner';
import { LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';

/**
 * The owner shell (mockup `adm`): dark sidebar + content column. Sits under `/admin` as a route
 * group so `/admin/login` stays chrome-free. The middleware already gates `/admin/*`; the redirect
 * here covers a session that expires mid-visit. `newEnquiries` comes with the session payload.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  return (
    <div className="grid min-h-dvh bg-bg2 lg:grid-cols-[240px_1fr]">
      <Sidebar session={session} />
      <div className="grid content-start gap-5 px-4 py-5 sm:px-7 sm:py-6">{children}</div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
```

- [ ] **Step 2: Sidebar (server) + NavLink (client)** — `web/src/components/admin/NavLink.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = { href: string; exact?: boolean; children: ReactNode; count?: number };

/** Sidebar item; active when the path is the href (or under it), like the mockup's `.on`. */
export function NavLink({ href, exact, children, count }: Props) {
  const path = usePathname();
  const on = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold text-[#B7C0C8] transition-colors hover:bg-white/[.06] hover:text-white',
        on && 'bg-primary text-white hover:bg-primary',
      )}
    >
      {children}
      {count ? (
        <span className="num ml-auto rounded-chip bg-action px-2 py-0.5 text-[11px] font-extrabold text-ink">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
```

`web/src/components/admin/Sidebar.tsx`:

```tsx
import { Eye, Inbox, LayoutGrid, LogOut, MapPin, Package } from 'lucide-react';
import Link from 'next/link';
import { BrandMark } from '@/components/site/BrandMark';
import type { SessionInfo } from '@/lib/auth/session';
import { NavLink } from './NavLink';

export const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid, exact: true },
  { href: '/admin/packages', label: 'Packages', icon: Package },
  { href: '/admin/destinations', label: 'Destinations', icon: MapPin },
  { href: '/admin/enquiries', label: 'Enquiries', icon: Inbox },
] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Mockup `.adm .sb`: ink background, cobalt active item, marigold count, owner card, sign out. */
export function Sidebar({ session }: { session: SessionInfo }) {
  const { user, newEnquiries } = session;
  return (
    <aside className="flex flex-row flex-wrap items-center gap-1 bg-ink p-3 text-[#B7C0C8] lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-stretch lg:px-3.5 lg:py-4.5">
      <Link href="/admin" className="mb-0 flex items-center gap-2 px-2 text-lg font-extrabold text-white lg:mb-4">
        <BrandMark size={24} />
        Tripsmith
      </Link>
      <nav className="flex flex-row flex-wrap gap-1 lg:flex-col" aria-label="Admin">
        {NAV.map(({ href, label, icon: Icon, ...rest }) => (
          <NavLink
            key={href}
            href={href}
            exact={'exact' in rest ? rest.exact : false}
            count={href === '/admin/enquiries' ? newEnquiries : undefined}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <span className="hidden flex-1 lg:block" />
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[.06] hover:text-white"
      >
        <Eye className="size-4" aria-hidden />
        View site
      </Link>
      <div className="hidden items-center gap-2.5 border-t border-[#2A3944] px-3 py-2.5 text-[13px] lg:flex">
        <span className="grid size-8 place-items-center rounded-full bg-action text-xs font-extrabold text-ink">
          {initials(user.name)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-white">{user.name}</b>
          <span className="block truncate">{user.email}</span>
        </span>
      </div>
      <form method="post" action="/api/auth/logout">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[.06] hover:text-white"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </form>
    </aside>
  );
}
```

`web/src/components/admin/PageHead.tsx`:

```tsx
import type { ReactNode } from 'react';

/** Mockup `.adm .hd`: title + one-line subtitle on the left, actions on the right. */
export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3.5">
      <div>
        <h1 className="text-[26px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 sm:ml-auto">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 3: Dashboard placeholder + section placeholders**

Delete `web/src/app/(admin)/admin/page.tsx`. Create `web/src/app/(admin)/admin/(shell)/page.tsx`:

```tsx
import { PageHead } from '@/components/admin/PageHead';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Dashboard' };

/** Signed-in landing until F22 builds the real dashboard. The layout already redirected a null session. */
export default async function AdminHome() {
  const session = await getSession();
  const name = session?.user.name ?? 'there';
  return (
    <>
      <PageHead title={`Hello, ${name}.`} subtitle="The dashboard arrives with F22 — destinations are live below." />
      <section className="rounded-card border border-line bg-bg p-5 text-ink2">
        Use the sidebar: <b>Destinations</b> is ready; Packages and Enquiries follow in F18 and F21.
      </section>
    </>
  );
}
```

`(shell)/packages/page.tsx` and `(shell)/enquiries/page.tsx` — same shape, `metadata.title` `'Packages'` / `'Enquiries'`, a `PageHead` with subtitle `"Arrives with F18."` / `"Arrives with F21."`, no other content.

- [ ] **Step 4: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`. Expected: green; the build's route list shows `/admin`, `/admin/packages`, `/admin/enquiries` as dynamic (ƒ) and `/admin/login` unchanged. `web/tests/middleware.test.ts` untouched and green.

`lg:py-4.5` is not a default Tailwind 4 step — if the build/lint flags it, use `lg:py-[18px]`.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/\(admin\) web/src/components/admin
git commit -m "feat(F16): admin shell — nested (shell) layout with sidebar and badge

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Destination form schema + `/admin/destinations` list page

**Files:**
- Create: `web/src/lib/admin/destination-schema.ts`, `web/src/components/admin/destinations/DestinationsTable.tsx`, `web/src/app/(admin)/admin/(shell)/destinations/page.tsx`
- Test: `web/tests/destination-schema.test.ts`

**Interfaces:**
- Produces: `destinationSchema` (zod), `DestinationFormValues` (`z.infer`), `MONTHS: { value: number; label: string }[]`, `toInput(values): DestinationInput` in `@/lib/admin/destination-schema`; `<DestinationsTable items={AdminDestination[]} />`.

- [ ] **Step 1: Failing schema tests** — `web/tests/destination-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { destinationSchema, MONTHS, toInput } from '../src/lib/admin/destination-schema';

const valid = {
  slug: 'kerala',
  name: 'Kerala',
  tagline: 'Backwaters and tea hills',
  intro: 'Two paragraphs of markdown intro text that comfortably clears the minimum length rule.',
  coverUrl: 'https://blob.test/destinations/uploads/k.jpg',
  region: 'South India',
  bestMonths: [12, 1, 11],
  position: 2,
};

describe('destinationSchema', () => {
  it('accepts a full record and normalises months', () => {
    const out = destinationSchema.parse(valid);
    expect(out.bestMonths).toEqual([1, 11, 12]);
    expect(toInput(out)).toEqual({ ...valid, bestMonths: [1, 11, 12] });
  });
  it('mirrors the api rules: slug pattern, lengths, at least one month, a cover', () => {
    expect(destinationSchema.safeParse({ ...valid, slug: 'Kerala Hills' }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, tagline: 'x'.repeat(81) }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, intro: 'short' }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, bestMonths: [] }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, coverUrl: '' }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, position: -1 }).success).toBe(false);
  });
  it('coerces the position field from the text input', () => {
    expect(destinationSchema.parse({ ...valid, position: '7' }).position).toBe(7);
  });
  it('lists twelve months', () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toEqual({ value: 1, label: 'Jan' });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter web test -- destination-schema` → module not found.

- [ ] **Step 3: Implement** — `web/src/lib/admin/destination-schema.ts`:

```ts
import { z } from 'zod';
import type { components } from '@/lib/api-types';

export type DestinationInput = components['schemas']['DestinationInput'];

/** Mirrors `DestinationInput` in api/app/schemas/catalog.py — the api is still the authority. */
export const destinationSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only'),
  name: z.string().trim().min(1, 'Required').max(80),
  tagline: z.string().trim().min(1, 'Required').max(80, 'Keep it to one line (80 characters)'),
  intro: z.string().trim().min(40, 'Write at least a couple of sentences').max(5000),
  coverUrl: z.string().url('Upload a cover photo'),
  region: z.string().trim().min(1, 'Required').max(80),
  bestMonths: z
    .array(z.number().int().min(1).max(12))
    .min(1, 'Pick at least one month')
    .transform((m) => [...new Set(m)].sort((a, b) => a - b)),
  position: z.coerce.number().int().min(0).max(999),
});

export type DestinationFormValues = z.infer<typeof destinationSchema>;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
  (label, i) => ({ value: i + 1, label }),
);

/** The exact wire body; a separate step so a schema tweak cannot silently send extra fields. */
export function toInput(v: DestinationFormValues): DestinationInput {
  return {
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    intro: v.intro,
    coverUrl: v.coverUrl,
    region: v.region,
    bestMonths: v.bestMonths,
    position: v.position,
  };
}
```

(zod 4: `z.string().url()` still exists as a deprecated alias of `z.url()`; if lint or types complain, use `z.url('Upload a cover photo')`.)

- [ ] **Step 4: Run the schema tests** → PASS.

- [ ] **Step 5: List page + table** — `web/src/components/admin/destinations/DestinationsTable.tsx`:

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { components } from '@/lib/api-types';
import { monthRange } from '@/lib/format';

type AdminDestination = components['schemas']['AdminDestination'];

const packages = (d: AdminDestination) => {
  const drafts = d.packageCount - d.livePackageCount;
  if (!d.packageCount) return '—';
  return drafts ? `${d.livePackageCount} live · ${drafts} draft` : `${d.livePackageCount} live`;
};

/** Mockup A5: thumb + name, tagline, best months, packages, order, View / Edit. */
export function DestinationsTable({ items }: { items: AdminDestination[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-bg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Destination</TableHead>
            <TableHead>Tagline</TableHead>
            <TableHead>Best months</TableHead>
            <TableHead>Packages</TableHead>
            <TableHead>Order</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-bold">
                <span className="flex items-center gap-2.5">
                  <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-line">
                    <Image src={d.coverUrl} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                  {d.name}
                </span>
              </TableCell>
              <TableCell className="max-w-[320px] truncate text-ink2">{d.tagline}</TableCell>
              <TableCell>{monthRange(d.bestMonths)}</TableCell>
              <TableCell className="num">{packages(d)}</TableCell>
              <TableCell className="num">{d.position}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-[13px] font-bold">
                {d.livePackageCount > 0 && (
                  <Link href={`/destinations/${d.slug}`} className="ml-3 text-primary" target="_blank">
                    View
                  </Link>
                )}
                <Link href={`/admin/destinations/${d.id}`} className="ml-3 text-primary">
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length === 0 && (
        <p className="p-6 text-center text-mute">No destinations yet — add the first one.</p>
      )}
    </div>
  );
}
```

`web/src/app/(admin)/admin/(shell)/destinations/page.tsx`:

```tsx
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { DestinationsTable } from '@/components/admin/destinations/DestinationsTable';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Destinations' };

export default async function DestinationsPage() {
  const { items } = await api('/admin/destinations', { auth: true });
  const hidden = items.filter((d) => d.livePackageCount === 0).length;
  return (
    <>
      <PageHead
        title="Destinations"
        subtitle={`${items.length} ${items.length === 1 ? 'destination' : 'destinations'}${hidden ? ` · ${hidden} hidden from the public grid (no live package)` : ''}`}
        actions={
          <Link href="/admin/destinations/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New destination
          </Link>
        }
      />
      <DestinationsTable items={items} />
    </>
  );
}
```

- [ ] **Step 6: Verify** — `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`. Then with the api running locally (Task 10 step 1 brings it up; if it is already up on :8000, use it) open `http://localhost:3000/admin/destinations` after signing in and confirm the Goa row renders with its thumb.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/admin/destination-schema.ts web/tests/destination-schema.test.ts web/src/components/admin/destinations/DestinationsTable.tsx "web/src/app/(admin)/admin/(shell)/destinations/page.tsx"
git commit -m "feat(F17): destinations list page + form schema

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Destination form — new / edit pages, cover upload, month picker, delete

**Files:**
- Create: `web/src/components/admin/destinations/DestinationForm.tsx`, `CoverUploader.tsx`, `MonthPicker.tsx`, `DeleteDestination.tsx`
- Create: `web/src/app/(admin)/admin/(shell)/destinations/new/page.tsx`, `web/src/app/(admin)/admin/(shell)/destinations/[id]/page.tsx`

**Interfaces:**
- Consumes: `adminRequest`, `uploadCover` (Task 5); `destinationSchema`, `toInput`, `MONTHS`, `DestinationFormValues` (Task 7); shadcn `Form*`, `Input`, `Textarea`, `Button`, `Dialog*`; `toast` from `sonner`; `ApiRequestError`.
- Produces: `<DestinationForm mode="create" />` and `<DestinationForm mode="edit" destination={AdminDestination} />`.

- [ ] **Step 1: MonthPicker** — `web/src/components/admin/destinations/MonthPicker.tsx`:

```tsx
'use client';

import { MONTHS } from '@/lib/admin/destination-schema';
import { cn } from '@/lib/utils';

type Props = { value: number[]; onChange: (months: number[]) => void; id?: string };

/** Twelve toggle chips (the mockup's `.status-sel`); order is normalised by the schema. */
export function MonthPicker({ value, onChange, id }: Props) {
  const toggle = (m: number) =>
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <div id={id} role="group" aria-label="Best months" className="flex flex-wrap gap-1.5">
      {MONTHS.map((m) => {
        const on = value.includes(m.value);
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(m.value)}
            className={cn(
              'rounded-chip border-[1.5px] border-line bg-bg px-3 py-1 text-[13px] font-semibold text-ink2 transition-colors hover:border-ink',
              on && 'border-primary bg-primary-soft text-primary-ink',
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: CoverUploader** — `web/src/components/admin/destinations/CoverUploader.tsx`:

```tsx
'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadCover } from '@/lib/admin/client';
import { ApiRequestError } from '@/lib/api-errors';

type Props = { value: string; onChange: (url: string) => void; id?: string };

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Mockup A5 `.gal.six`: the current cover (or an empty frame) and an Upload / Replace tile. */
export function CoverUploader({ value, onChange, id }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadCover(file);
      onChange(url);
      toast.success('Cover uploaded');
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.body.message : 'Upload failed — try again');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,240px)_140px] gap-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-line">
        {value ? (
          <Image src={value} alt="" fill sizes="240px" className="object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-sm text-mute">No cover yet</span>
        )}
      </div>
      <button
        type="button"
        id={id}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="grid aspect-[16/10] place-items-center rounded-card border-[1.5px] border-dashed border-line text-center text-[13px] font-semibold text-mute transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
      >
        <span>
          <Plus className="mx-auto size-5" aria-hidden />
          {busy ? 'Uploading…' : value ? 'Replace cover' : 'Upload'}
          <br />
          <span className="font-normal">JPG/PNG/WEBP ≤ 4 MB</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
```

- [ ] **Step 3: DeleteDestination** — `web/src/components/admin/destinations/DeleteDestination.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { adminRequest } from '@/lib/admin/client';
import { ApiRequestError } from '@/lib/api-errors';

type Props = { id: string; name: string; packageCount: number };

/** Danger zone: blocked (and explained) while packages reference the destination. */
export function DeleteDestination({ id, name, packageCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = packageCount > 0;

  async function confirm() {
    setBusy(true);
    try {
      await adminRequest(`/admin/destinations/${id}`, { method: 'DELETE' });
      toast.success(`${name} deleted`);
      router.push('/admin/destinations');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiRequestError ? e.body.message : 'Could not delete — try again');
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" size="sm" disabled={blocked}>
            Delete destination
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This removes the destination and its public page. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <small className="text-mute">
        {blocked
          ? `Delete is blocked while ${packageCount} ${packageCount === 1 ? 'package uses' : 'packages use'} this destination.`
          : 'No packages use this destination.'}
      </small>
    </div>
  );
}
```

- [ ] **Step 4: DestinationForm** — `web/src/components/admin/destinations/DestinationForm.tsx`:

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminRequest } from '@/lib/admin/client';
import {
  destinationSchema,
  type DestinationFormValues,
  toInput,
} from '@/lib/admin/destination-schema';
import { ApiRequestError } from '@/lib/api-errors';
import type { components } from '@/lib/api-types';
import { CoverUploader } from './CoverUploader';
import { DeleteDestination } from './DeleteDestination';
import { MonthPicker } from './MonthPicker';

type AdminDestination = components['schemas']['AdminDestination'];

type Props = { mode: 'create' } | { mode: 'edit'; destination: AdminDestination };

const EMPTY: DestinationFormValues = {
  slug: '',
  name: '',
  tagline: '',
  intro: '',
  coverUrl: '',
  region: '',
  bestMonths: [],
  position: 0,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const panel = 'grid gap-4 rounded-card border border-line bg-bg p-5';
const h3 = 'text-base font-extrabold';

/** Mockup A5's edit panel as a page: basics, cover, best months, danger zone. Server-side errors land on their field. */
export function DestinationForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === 'edit';
  const form = useForm<DestinationFormValues>({
    resolver: zodResolver(destinationSchema),
    defaultValues: editing
      ? {
          slug: props.destination.slug,
          name: props.destination.name,
          tagline: props.destination.tagline,
          intro: props.destination.intro,
          coverUrl: props.destination.coverUrl,
          region: props.destination.region,
          bestMonths: props.destination.bestMonths,
          position: props.destination.position,
        }
      : EMPTY,
  });

  async function onSubmit(values: DestinationFormValues) {
    const body = toInput(values);
    try {
      if (editing) {
        await adminRequest(`/admin/destinations/${props.destination.id}`, { method: 'PUT', body });
        toast.success('Saved — the public pages refresh in a few seconds');
      } else {
        await adminRequest('/admin/destinations', { method: 'POST', body });
        toast.success('Destination created');
      }
      router.push('/admin/destinations');
      router.refresh();
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) {
        for (const [field, message] of Object.entries(e.body.fieldErrors))
          form.setError(field as keyof DestinationFormValues, { message });
        return;
      }
      toast.error(e instanceof ApiRequestError ? e.body.message : 'Could not save — try again');
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-[860px] gap-4" noValidate>
        <section className={panel}>
          <h3 className={h3}>Basics</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!editing && !form.formState.dirtyFields.slug)
                          form.setValue('slug', slugify(e.target.value));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="goa" />
                  </FormControl>
                  <FormDescription>
                    {editing ? 'Changing this moves the public page; the old address stops working.' : 'The public address: /destinations/<slug>.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="tagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tagline</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={80} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="West India" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="intro"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Intro</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={7} />
                </FormControl>
                <FormDescription>Markdown, 2–3 paragraphs. **Bold** works; blank line = new paragraph.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <FormField
              control={form.control}
              name="bestMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Best months</FormLabel>
                  <FormControl>
                    <MonthPicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={0} max={999} inputMode="numeric" />
                  </FormControl>
                  <FormDescription>Lower shows first.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className={panel}>
          <h3 className={h3}>Cover</h3>
          <FormField
            control={form.control}
            name="coverUrl"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <CoverUploader value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create destination'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/admin/destinations')} disabled={busy}>
            Cancel
          </Button>
        </div>

        {editing && (
          <section className={panel}>
            <h3 className={h3}>Danger zone</h3>
            <DeleteDestination
              id={props.destination.id}
              name={props.destination.name}
              packageCount={props.destination.packageCount}
            />
          </section>
        )}
      </form>
    </Form>
  );
}
```

`position` with `type="number"`: react-hook-form gives a string; `z.coerce.number()` in the schema handles it (that is why Task 7 tests coercion). If `zodResolver` complains about the input/output type mismatch (`z.coerce` makes the input type `unknown`), type the hook as `useForm<z.input<typeof destinationSchema>, unknown, DestinationFormValues>` and adjust `EMPTY`/`defaultValues` accordingly.

- [ ] **Step 5: Pages** — `web/src/app/(admin)/admin/(shell)/destinations/new/page.tsx`:

```tsx
import { PageHead } from '@/components/admin/PageHead';
import { DestinationForm } from '@/components/admin/destinations/DestinationForm';

export const metadata = { title: 'New destination' };

export default function NewDestinationPage() {
  return (
    <>
      <PageHead title="New destination" subtitle="It appears on the public grid once it has a live package." />
      <DestinationForm mode="create" />
    </>
  );
}
```

`web/src/app/(admin)/admin/(shell)/destinations/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { DestinationForm } from '@/components/admin/destinations/DestinationForm';
import { api, ApiRequestError } from '@/lib/api';

export const metadata = { title: 'Edit destination' };

export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let destination;
  try {
    destination = await api('/admin/destinations/{id}', { params: { id }, auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const trips = destination.packageCount === 1 ? '1 package' : `${destination.packageCount} packages`;
  return (
    <>
      <PageHead
        title={destination.name}
        subtitle={`${trips} · ${destination.livePackageCount ? 'on the public grid' : 'hidden until a package goes live'}`}
      />
      <DestinationForm mode="edit" destination={destination} />
    </>
  );
}
```

- [ ] **Step 6: Verify by hand** (api + web running locally; Task 10 step 1 describes bringing them up)

1. Sign in with the demo login → sidebar shows, Enquiries badge equals the number of `new` enquiries in the local DB (0 on a fresh seed; submit one enquiry through the public form and reload to see `1`).
2. `/admin/destinations/new`: type a name → slug auto-fills; submit empty → inline errors, no request; upload a JPG → preview appears; pick months; Create → toast, list shows the row with "—" packages.
3. Edit it → change tagline → Save → toast; edit again → Delete enabled → confirm → gone.
4. Edit Goa → Delete disabled with "Delete is blocked while 2 packages use this destination."; change the slug to `goa-2` → Save → `http://localhost:3000/destinations/goa-2` renders and `/destinations/goa` is a 404 (needs `REVALIDATE_SECRET` set identically in `api/.env.local` and `web/.env.local`; otherwise wait for the 1 h ISR window — note which happened). Change it back to `goa`.
5. Post a duplicate slug → the error lands under the Slug field.

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/admin/destinations "web/src/app/(admin)/admin/(shell)/destinations"
git commit -m "feat(F17): destination form — create, edit, cover upload, delete guard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Docs — plan rows, contract doc, env comment

**Files:**
- Modify: `docs/07-plan.md` rows 75–76, `docs/06-data-and-api.md` §C-REST admin row + C3 note, `api/.env.example` (comment only if `BLOB_READ_WRITE_TOKEN` lacks the admin-upload mention)

- [ ] **Step 1: 07-plan** — change the status cell of both rows from 🔴 to 🟢 and append to the F17 row's api column: "`GET /admin/destinations/:id` · `POST /admin/destinations/cover` (multipart ≤ 4 MB → Blob)". Keep the table aligned (one line per row).

- [ ] **Step 2: 06 §C-REST** — the v1 destination CRUD row becomes:

`| v1 | `GET /admin/destinations` (all, unfiltered) · `GET /admin/destinations/:id` · `POST/PUT/DELETE /admin/destinations[/:id]` · `POST /admin/destinations/cover` (multipart ≤ 4 MB, resized ≤ 2000 px → Blob `destinations/uploads/`) | destination CRUD | owner |`

and under C3 (image upload) add one sentence: "Destination covers use the same validate-and-resize helper (`services/images.py`) through `POST /admin/destinations/cover`, which returns the Blob URL the form then stores in `coverUrl`."

- [ ] **Step 3: Commit**

```bash
git add docs/07-plan.md docs/06-data-and-api.md api/.env.example
git commit -m "docs(F16+F17): plan rows green, contract rows for the admin destination routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Local end-to-end, PR, merge, prod verification, tracker

**Files:** none new.

- [ ] **Step 1: Local services**

- Postgres 5499: check `netstat -ano | findstr :5499`. If nothing listens, start the cluster from an earlier session's scratchpad if it still exists, otherwise init a fresh one in this session's scratchpad (`initdb -U postgres -A trust -D <scratchpad>/pg && pg_ctl -D <scratchpad>/pg -o "-p 5499" start`, then `createdb -p 5499 -U postgres tripsmith_test` and `tripsmith_dev`).
- Ports 8000/3000: the previous session left the main checkout's dev servers running. Kill by port (`netstat -ano | findstr :8000` → `taskkill /PID <pid> /F`; same for 3000) — check the PID's command line first, 3000/8000 may be Zapigo processes.
- api from the worktree: `DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5499/tripsmith_dev uv run --directory api uvicorn app.main:app --reload --port 8000` (seed with `uv run --directory api python scripts/seed.py --local` if `tripsmith_dev` is empty). web: `pnpm --filter web dev`.
- Full suites: `TEST_DATABASE_URL=… uv run --directory api pytest -q` and `pnpm --filter web test`; record the counts.

- [ ] **Step 2: Gates** — `pnpm lint && pnpm typecheck && pnpm build` at the repo root; api `ruff check`, `ruff format --check`, `pyright`.

- [ ] **Step 3: PR** — push `feat/f16-f17-admin-destinations`; `gh pr create --title "feat(F16+F17): admin shell + destinations CRUD" --body` with: what shipped (api routes, upload proxy, session badge, shadcn install, shell, pages), the two design decisions, test counts, manual checks done, and the trailer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `/code-review <n> high` and fix what it finds.

- [ ] **Step 4: Merge + prod** — `gh pr merge <n> --squash --delete-branch` alone (ignore the harmless "'main' is already used by worktree" exit 1; confirm with `gh pr view <n> --json state`). Wait for both Vercel deploys (`vercel ls 2>&1 | grep Ready`); if the web deployment finished before the api, `vercel redeploy` the web one. Verify on `https://tripsmith.vercel.app`: sign in → `/admin/destinations` lists the six → open Goa → change the tagline → Save → `/destinations/goa` shows it → change it back. Confirm `BLOB_READ_WRITE_TOKEN` is set on the api project by uploading a cover on a throwaway destination, then delete that destination.

- [ ] **Step 5: Tracker + memory** — set artifact rows `F16` and `F17` to `done` in the Tripsmith tracker (`rows/<id>` in the artifact db); update the `tripsmith-status` memory (main sha, counts, gotchas, next = F18 Packages CRUD, plan first).

---

## Self-review

- **Spec coverage:** F16 row — `(admin)` layout with nav ✅ (Task 6), new-enquiry badge from the session payload ✅ (Tasks 1, 6), shadcn table/form/toast primitives ✅ (Task 5, used in 7–8). F17 row — `/admin/destinations` list + form with cover upload, intro, best months ✅ (Tasks 7–8), `GET /admin/destinations` all incl. hidden ✅ (Task 2–3), `POST/PUT/DELETE` with delete blocked if packages exist ✅ (Task 2–3), revalidate `destinations` + `destination:slug` ✅ (Task 2, plus `packages`/`home`). Exit criteria: badge reconciles with the inbox (count = status `new`, the same predicate F21 will filter on) ✅; public grid updates within seconds of a save (api awaits revalidate) ✅.
- **Placeholders:** none — every step carries code; the `Enquiry` columns (Task 1) and the `new_id` factory (Task 4) were verified against the models before writing.
- **Type consistency:** `AdminDestination` fields (`packageCount`, `livePackageCount`, `bestMonths`, `coverUrl`, `updatedAt`) match between the pydantic model (Task 2), the route tests (Task 3), the table (Task 7) and the form (Task 8). `adminRequest` path type `` `/admin/${string}` `` matches every call site. `uploadCover` returns `UploadedImage` = `components['schemas']['UploadedImage']` (Task 4 schema). `session_info(session, *, new_enquiries)` is used identically in both routes.
