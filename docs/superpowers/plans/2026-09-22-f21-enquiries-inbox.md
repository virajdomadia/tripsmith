# F21 Enquiries Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner works the leads: `/admin/enquiries` lists every enquiry with status tabs, type / package / received-date filters and a name-or-phone search, 50 to a page; `/admin/enquiries/[id]` shows everything the visitor submitted, changes status in one click, keeps an append-only note timeline, offers call / WhatsApp / email links, and the whole filtered view exports as a CSV that opens correctly in Excel.

**Architecture:** The api gains `routers/admin/enquiries.py` behind the existing `require_owner` dependency and one service, `services/admin_enquiries.py`, holding the shared filter builder that the list, the status counts and the CSV all reuse. Unlike F18's packages table, filtering, searching and paging are **server-side** — enquiries grow without bound. There are no `revalidate` calls anywhere: nothing public reads enquiries. The web builds mockup **A6** (inbox) and **A7** (detail) as server components whose entire filter state lives in the URL, so the inbox is linkable, the back button works, and tabs, pager and search degrade to plain links and a GET form with JavaScript off. Only the status picker and the note composer are client components.

**Tech Stack:** FastAPI 0.141 · SQLAlchemy 2 async · pydantic v2 (camelCase aliases) · Python `csv` + `StreamingResponse` · Next 15.5 App Router · React 19 · Tailwind 4 · shadcn/ui · vitest + @testing-library/react · pytest.

**Spec:** `docs/07-plan.md` row F21 (line 78), `docs/06-data-and-api.md` §A4 (`enquiries`, `enquiry_notes`) + §C-REST line 287 + §C5 (what is deliberately deferred to v2), `docs/04-ui-mockups.md` + `mockups/screens.html` screens **A6** and **A7**. Design settled in chat on 2026-09-22 — see "Design decisions" below; the brainstorm is done, do not reopen it.

## Global Constraints

- Branch `feat/f21-enquiries-inbox` in worktree `.worktrees/f21-enquiries-inbox` (already created at `origin/main` = `d79673a`). Never touch the main checkout — other sessions share it.
- One PR, squash-merged. Ask once for the review → merge → next grant, then it holds for the session.
- Contract: after any schema/route change run `pnpm gen:api` **at the repo root** and commit `api/openapi.json` + `web/src/lib/api-types.ts` (CI's `contract` job diffs them).
- Every `/admin/*` route carries `dependencies=[Depends(require_owner)]`; the web middleware gate is UX only.
- Error envelope only: raise `ApiError(code, message, field_errors=...)` — never `HTTPException`.
- Every admin response sets `Cache-Control: no-store` via `response.headers.update(NO_STORE)` from `app.infra.cache` (the CSV sets it in its own headers dict).
- Public data must not vary by viewer; `api(..., { auth: true })` is only for `/admin/**` and `/auth/session`.
- Static assets never live under `/admin` — the middleware gates them.
- Copy: Indian English, sentence case, no exclamation marks.
- Money is **paise** on the wire and in the DB, everywhere, always. Render with `inr()` from `web/src/lib/format.ts`; never build a rupee string by hand. The CSV is the one exception and converts to whole rupees explicitly.
- Tests: `uv run --directory api pytest` and `pnpm --filter web test`. `db`-marked tests need `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test` (local PostgreSQL 18 on port 5499, role `tripsmith`, no password).
- `api/tests/fixture_content/` is a frozen fixture — **never edit it**. Tests needing other data insert rows themselves.
- Never hardcode a calendar date as "future" or "recent" in a test — derive from `dt.date.today()` / `dt.datetime.now(dt.UTC)`.
- Lint gates before the PR: `pnpm lint`, `pnpm typecheck`, `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`.
- A local `pnpm --filter web typecheck` after adding or moving routes needs `rm -rf web/.next` first — stale `.next/types` reference deleted route files.
- Demo password in tests is always `owner-pw-for-tests` (GitGuardian flags the real demo password).
- Baseline at branch point: **361 pytest**, **190 vitest**, both green.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Design decisions (settled — do not re-litigate)

1. **No migration.** `enquiries` and the append-only `enquiry_notes` already exist, with exactly the indexes this feature needs: `ix_enquiries_status_created_at` (tabs + default ordering), `ix_enquiries_package_id` (package filter), `ix_enquiries_phone_package_id_created_at` (A7's "other enquiries, same phone"). No model file changes at all.
2. **Server-side filtering, search and paging** — offset paging, 50 per page, numbered pager per A6. The opposite of F18's client-side packages table, and deliberately so: the catalogue is a dozen rows, the inbox grows forever.
3. **`from` / `to` filter the received date as an IST business day**, matching `analytics.ist_today`: `from` is midnight IST on that day, `to` is exclusive of midnight IST the following day. Travel month is a separate column and is never what the date filter means.
4. **Tab counts are computed with every filter applied except `status`**, so "New 3" means new *within the current view* (this package, this month, this search).
5. **No `revalidate` calls anywhere.** Nothing public depends on enquiries. The sidebar badge already comes from `SessionInfo.newEnquiries` (F16), so a `router.refresh()` after a status change updates it for free.
6. **A status change auto-appends an `EnquiryNote`** ("Status changed from New to Contacted") in the same transaction, so calls and status moves read as one timeline. Chosen over a separate history table. No `kind` column is added — auto notes are simply worded distinctly.
7. **Notes have no author column** and none is added: v1 is single-owner. The detail page renders the signed-in owner's name beside every note, from the session.
8. **`ip_hash` is never exposed.** It is a hash — useless to the owner and PII-adjacent. `user_agent` is surfaced as a derived "Mobile / Desktop / Unknown" plus the raw string on hover. Mockup A7's "Bengaluru" is dropped: there is no geo lookup and inventing one would be a lie.
9. **CSV is streamed, not written to Blob** (06 allows either; streaming needs no storage and no cleanup). It carries a **UTF-8 BOM** — without it Excel reads the file as ANSI and mangles ₹ and Indian names — uses CRLF, quotes every field, honours the current filters (ignoring `page`), and is named `tripsmith-enquiries-<date>.csv`.
10. **CSV injection is the real risk here.** `message`, `name` and `changes` come from a public form, so any field starting `=`, `+`, `-`, `@`, tab or CR gets a `'` prefix — otherwise `=cmd|'/c calc'!A0` in an enquiry executes when the owner opens the export. `csv_safe()` is a pure function with a table test.
11. **The CSV rows are materialised before streaming.** The `get_session` dependency closes when the handler returns, so a generator that queried lazily would run against a closed session. Bounded by `CSV_MAX_ROWS = 10_000`.
12. **Filter state lives in the URL**, not React state. Tabs and pager are `<Link>`s; search, type, package and dates are one GET `<form>`; nothing on the inbox page needs JavaScript.
13. **Unrecognised URL params are dropped, not forwarded.** `parseFilters` validates against the known enums so a hand-edited URL can never make the page throw a 400 from the api.
14. **Search is name-or-phone, exactly as A6 says.** A query made only of digits and phone punctuation is normalised the way the enquiry form normalises a submitted number (`+91 98450-22110` → `9845022110`) and matched as a substring of `phone`; anything else matches `name`. `%` and `_` in the query are escaped so they cannot act as wildcards.
15. **`replyToEnquiry` is v2** (06 §C5). F21 sends no email from the inbox. "Email" on the detail page is a `mailto:` link that opens the owner's own client.
16. **Status and note writes both return the full `AdminEnquiry`.** One response shape, one builder, and the client always has the fresh timeline without a second round-trip.

## File map

**api/**

- Create `app/schemas/admin_enquiries.py` — `EnquiryFilters`, `StatusCounts`, `EnquiryRow`, `EnquiryList`, `EnquiryNoteOut`, `RelatedEnquiry`, `EnquiryPackage`, `AdminEnquiry`, `EnquiryStatusInput`, `EnquiryNoteInput`, `PAGE_SIZE`. (The public `POST /enquiries` shapes stay in `app/schemas/enquiries.py`.)
- Create `app/services/admin_enquiries.py` — `ist_day_start`, `_filtered`, `list_enquiries`, `get_enquiry`, `set_status`, `add_note`, `csv_records`, `csv_lines`, `csv_safe`, `csv_filename`.
- Create `app/routers/admin/enquiries.py` — five routes under one `/admin` router.
- Modify `app/main.py` — include the router.
- Modify `tests/test_openapi.py` — the five new operation ids.
- Create `tests/test_admin_enquiries.py`, `tests/test_enquiries_csv.py`.
- Regenerate `api/openapi.json`.

**web/**

- Create `src/lib/admin/enquiry-filters.ts` — `Filters`, `parseFilters`, `toQuery`, `filterHref`, `csvHref`, `STATUSES`, `TYPES`, label maps.
- Create `src/lib/admin/enquiry-links.ts` — `telHref`, `waHref`, `mailtoHref`, `replyMessage`, `emailSubject`.
- Replace `src/app/(admin)/admin/(shell)/enquiries/page.tsx` (currently an F21 placeholder).
- Create `src/app/(admin)/admin/(shell)/enquiries/[id]/page.tsx`.
- Create `src/components/admin/enquiries/StatusBadge.tsx`, `InboxFilters.tsx`, `EnquiriesTable.tsx`, `Pager.tsx`, `StatusPicker.tsx`, `NotesPanel.tsx`, `EnquiryFacts.tsx`, `RelatedEnquiries.tsx`.
- Create `web/tests/enquiry-filters.test.ts`, `enquiry-links.test.ts`, `enquiries-table.test.tsx`, `status-picker.test.tsx`, `notes-panel.test.tsx`.
- Regenerated `src/lib/api-types.ts`.

**docs/** — `07-plan.md` row F21 turns 🟢; `06-data-and-api.md` §C-REST line 287 gains the query string the inbox actually takes.

---

## Task 1: Admin enquiry schemas

**Files:**

- Create: `api/app/schemas/admin_enquiries.py`
- Test: `api/tests/test_admin_enquiries.py` (create)

**Interfaces:**

- Consumes: `app.schemas.ApiModel`, `app.schemas.enquiries.PackageRef`, `app.schemas.meta.EnquiryType`, `app.models.enums.{EnquiryStatus, EmailStatus, PackageStatus}`.
- Produces, all in `app.schemas.admin_enquiries`: `PAGE_SIZE = 50`, `NOTE_MAX = 2000`, `EnquiryFilters`, `StatusCounts`, `EnquiryRow`, `EnquiryList`, `EnquiryNoteOut`, `RelatedEnquiry`, `EnquiryPackage`, `Device`, `AdminEnquiry`, `EnquiryStatusInput`, `EnquiryNoteInput`. Every later api task consumes these.

- [ ] **Step 1: Write the failing schema tests** — create `api/tests/test_admin_enquiries.py`:

```python
"""F21 enquiries inbox: schemas, service and `/admin/enquiries*` routes (06 §A4, §C-REST)."""

import datetime as dt

import pytest
from pydantic import ValidationError

from app.models.enums import EnquiryStatus
from app.schemas.admin_enquiries import EnquiryFilters, EnquiryNoteInput, EnquiryStatusInput

# --- filters --------------------------------------------------------------------------------------


def test_filters_default_to_the_unfiltered_first_page() -> None:
    f = EnquiryFilters()
    assert f.page == 1
    assert (f.status, f.type, f.package_id, f.from_, f.to, f.q) == (None,) * 6


def test_filters_read_the_wire_names() -> None:
    f = EnquiryFilters.model_validate(
        {"status": "new", "type": "custom", "packageId": "pkg_1", "from": "2026-09-01",
         "to": "2026-09-30", "q": "Priya", "page": "3"}
    )
    assert f.status == EnquiryStatus.NEW
    assert f.package_id == "pkg_1"
    assert f.from_ == dt.date(2026, 9, 1) and f.to == dt.date(2026, 9, 30)
    assert f.page == 3


def test_filters_reject_a_backwards_date_range_under_the_to_field() -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryFilters.model_validate({"from": "2026-09-30", "to": "2026-09-01"})
    assert exc.value.errors()[0]["loc"] == ("to",)


def test_filters_reject_nonsense_values() -> None:
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"status": "archived"})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"page": 0})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"q": "x" * 81})


# --- writes ---------------------------------------------------------------------------------------


def test_status_input_takes_the_four_v1_statuses() -> None:
    assert EnquiryStatusInput.model_validate({"status": "converted"}).status == (
        EnquiryStatus.CONVERTED
    )


def test_note_input_strips_and_refuses_an_empty_body() -> None:
    assert EnquiryNoteInput.model_validate({"body": "  Called back  "}).body == "Called back"
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "   "})
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "x" * 2001})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_admin_enquiries.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.admin_enquiries'`

- [ ] **Step 3: Write the schemas** — create `api/app/schemas/admin_enquiries.py`:

```python
"""Owner-side enquiry contract (06 §C-REST `/admin/enquiries*`, F21).

The public `POST /enquiries` shapes stay in app/schemas/enquiries.py. Nothing here is ever
served to a visitor, and `ip_hash` is deliberately absent from every model below: it is a hash,
useless to the owner and PII-adjacent.
"""

import datetime as dt
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import EmailStatus, EnquiryStatus, PackageStatus
from app.schemas import ApiModel
from app.schemas.enquiries import PackageRef
from app.schemas.meta import EnquiryType

PAGE_SIZE = 50
MAX_PAGE = 10_000
NOTE_MAX = 2000
SEARCH_MAX = 80

Device = Literal["Mobile", "Desktop", "Unknown"]


class EnquiryFilters(ApiModel):
    """`GET /admin/enquiries` and `GET /admin/enquiries.csv` query.

    Blank values never reach here — `BlankQueryParamsMiddleware` drops `?status=&q=` so the
    no-JS GET form on the inbox validates as "not provided" rather than as bad input.
    """

    status: EnquiryStatus | None = None
    type: EnquiryType | None = None
    package_id: str | None = Field(default=None, max_length=40)
    from_: dt.date | None = Field(
        default=None, alias="from", description="Received on or after this IST day"
    )
    to: dt.date | None = Field(default=None, description="Received on or before this IST day")
    q: str | None = Field(default=None, max_length=SEARCH_MAX, description="Name or phone")
    page: int = Field(default=1, ge=1, le=MAX_PAGE, description="1-based; ignored by the CSV")

    @field_validator("to")
    @classmethod
    def _not_before_from(cls, value: dt.date | None, info: ValidationInfo) -> dt.date | None:
        start = info.data.get("from_")
        if value is not None and start is not None and value < start:
            raise ValueError("must not be before `from`")
        return value


class StatusCounts(ApiModel):
    """Every status counted with the current filters applied **except** `status` itself, so
    "New 3" means new within the view the owner is looking at (A6 tabs)."""

    new: int
    contacted: int
    converted: int
    closed: int
    all: int


class EnquiryRow(ApiModel):
    """One line of the A6 table."""

    id: str
    ref: str
    type: EnquiryType
    status: EnquiryStatus
    name: str
    phone: str
    package: PackageRef | None
    travel_month: dt.date | None = Field(description="First of the month")
    adults: int
    children: int
    created_at: dt.datetime


class EnquiryList(ApiModel):
    items: list[EnquiryRow]
    page: int
    page_size: int
    total: int = Field(description="Rows matching every filter, including status")
    total_pages: int = Field(ge=1)
    counts: StatusCounts


class EnquiryNoteOut(ApiModel):
    """Append-only; no author column in v1 — the UI renders the signed-in owner."""

    id: str
    body: str
    created_at: dt.datetime


class RelatedEnquiry(ApiModel):
    """A7's "other enquiries · same phone" panel."""

    id: str
    ref: str
    status: EnquiryStatus
    package_name: str | None
    created_at: dt.datetime


class EnquiryPackage(ApiModel):
    slug: str
    name: str
    nights: int
    days: int
    starting_price_paise: int
    cover_url: str | None
    status: PackageStatus


class AdminEnquiry(ApiModel):
    """Everything the visitor submitted, plus the timeline (A7)."""

    id: str
    ref: str
    type: EnquiryType
    status: EnquiryStatus
    name: str
    phone: str
    email: str
    travel_month: dt.date | None
    adults: int
    children: int
    message: str | None
    preferred_dates: str | None = Field(description="Custom enquiries only")
    budget_paise: int | None = Field(description="Custom enquiries only; per person")
    changes: str | None = Field(description="Custom enquiries only")
    package: EnquiryPackage | None
    email_status: EmailStatus
    device: Device = Field(description="Derived from the user agent; no geo lookup exists")
    user_agent: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    notes: list[EnquiryNoteOut]
    related: list[RelatedEnquiry]


class EnquiryStatusInput(ApiModel):
    status: EnquiryStatus


class EnquiryNoteInput(ApiModel):
    body: str = Field(min_length=1, max_length=NOTE_MAX)

    @field_validator("body", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_admin_enquiries.py -q`
Expected: PASS (7 tests)

- [ ] **Step 5: Lint and commit**

```bash
uv run --directory api ruff format api/app/schemas/admin_enquiries.py api/tests/test_admin_enquiries.py
uv run --directory api ruff check . && uv run --directory api pyright
git add api/app/schemas/admin_enquiries.py api/tests/test_admin_enquiries.py
git commit -m "feat(F21): admin enquiry schemas — filters, rows, detail, writes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Filter builder and the paged list

**Files:**

- Create: `api/app/services/admin_enquiries.py`
- Test: `api/tests/test_admin_enquiries.py` (append)

**Interfaces:**

- Consumes: Task 1's schemas; `app.models.{Enquiry, EnquiryNote, Package}`, `app.services.email.render.IST`, `app.schemas.enquiries.normalise_phone`.
- Produces: `ist_day_start(day) -> dt.datetime`, `like_escape(value) -> str`, `search_clause(q) -> ColumnElement[bool]`, `_filtered(stmt, filters, *, with_status) -> Select`, `list_enquiries(db, filters) -> EnquiryList`. Tasks 3–5 reuse `_filtered` and `ist_day_start`.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_enquiries.py`:

```python
# --- service: list --------------------------------------------------------------------------------

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Destination, Enquiry, Package
from app.models.enums import EnquiryType, PackageStatus
from app.schemas.admin_enquiries import PAGE_SIZE
from app.services import admin_enquiries as svc
from app.services.email.render import IST


async def make_package(
    db: AsyncSession, *, slug: str = "test-goa-beaches", dest_slug: str = "test-goa"
) -> Package:
    """Slugs are prefixed `test-`: the route tests seed `tests/fixture_content/`, which already
    owns `goa` and `north-goa-beaches`, and both columns are unique."""
    dest = Destination(
        slug=dest_slug, name="Goa", tagline="Sun and sand",
        intro="A long enough intro paragraph for the destination record used by these tests.",
        cover_url="http://localhost:8000/seed-photos/goa.jpg", region="West India",
        best_months=[11, 12, 1], position=1,
    )
    db.add(dest)
    await db.flush()
    pkg = Package(
        slug=slug, name="North Goa Beaches", destination_id=dest.id, nights=3, days=4,
        summary="Three slow nights on the Konkan coast with one free beach day.",
        themes=[], starting_price_paise=1_499_900, status=PackageStatus.LIVE, featured=False,
    )
    db.add(pkg)
    await db.flush()
    return pkg


async def make_enquiry(db: AsyncSession, *, ref: str, **overrides: object) -> Enquiry:
    fields: dict[str, object] = {
        "ref": ref, "type": EnquiryType.STANDARD, "name": "Priya Sharma",
        "phone": "9845022110", "email": "priya.s@gmail.com", "adults": 2, "children": 0,
        "status": EnquiryStatus.NEW,
    }
    fields.update(overrides)
    row = Enquiry(**fields)
    db.add(row)
    await db.flush()
    return row


def at_ist(row: Enquiry, when: dt.datetime) -> None:
    """`created_at` has a server default, so a test that cares about the day sets it explicitly."""
    row.created_at = when


def test_ist_day_start_is_midnight_in_india_expressed_in_utc() -> None:
    start = svc.ist_day_start(dt.date(2026, 9, 22))
    assert start == dt.datetime(2026, 9, 21, 18, 30, tzinfo=dt.UTC)
    assert start.astimezone(IST).hour == 0


def test_like_escape_stops_a_wildcard_in_the_search_box() -> None:
    assert svc.like_escape("100%") == r"100\%"
    assert svc.like_escape("a_b") == r"a\_b"
    assert svc.like_escape(r"back\slash") == "back\\\\slash"


@pytest.mark.db
async def test_list_returns_newest_first_with_the_package_joined(db: AsyncSession) -> None:
    pkg = await make_package(db)
    older = await make_enquiry(db, ref="TS-OLD111", package_id=pkg.id)
    newer = await make_enquiry(db, ref="TS-NEW111", package_id=pkg.id, name="Anirudh S")
    at_ist(older, dt.datetime.now(dt.UTC) - dt.timedelta(days=2))
    await db.commit()

    out = await svc.list_enquiries(db, EnquiryFilters())

    assert [r.ref for r in out.items] == [newer.ref, older.ref]
    assert out.items[0].package is not None
    assert out.items[0].package.name == "North Goa Beaches"
    assert (out.total, out.page, out.page_size, out.total_pages) == (2, 1, PAGE_SIZE, 1)


@pytest.mark.db
async def test_a_contact_enquiry_has_no_package(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-CONT11", type=EnquiryType.CONTACT, package_id=None)
    await db.commit()
    out = await svc.list_enquiries(db, EnquiryFilters())
    assert out.items[0].package is None


@pytest.mark.db
async def test_counts_ignore_the_status_filter_but_honour_the_others(db: AsyncSession) -> None:
    pkg = await make_package(db)
    other = await make_package(db, slug="test-leh", dest_slug="test-ladakh")
    await make_enquiry(db, ref="TS-AAA111", package_id=pkg.id, status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-BBB111", package_id=pkg.id, status=EnquiryStatus.CONTACTED)
    await make_enquiry(db, ref="TS-CCC111", package_id=other.id, status=EnquiryStatus.NEW)
    await db.commit()

    out = await svc.list_enquiries(
        db, EnquiryFilters.model_validate({"status": "new", "packageId": pkg.id})
    )

    assert [r.ref for r in out.items] == ["TS-AAA111"]
    assert out.total == 1
    # Counts: this package only (the packageId filter applies), all four statuses (it does not).
    assert (out.counts.new, out.counts.contacted, out.counts.all) == (1, 1, 2)


@pytest.mark.db
async def test_date_filter_is_an_inclusive_ist_business_day_range(db: AsyncSession) -> None:
    late = await make_enquiry(db, ref="TS-LATE11")
    early = await make_enquiry(db, ref="TS-EARL11")
    # 23:30 IST on the 22nd is still the 22nd for the owner, though it is 18:00 UTC.
    at_ist(late, dt.datetime(2026, 9, 22, 18, 0, tzinfo=dt.UTC))
    at_ist(early, dt.datetime(2026, 9, 23, 3, 0, tzinfo=dt.UTC))  # 08:30 IST on the 23rd
    await db.commit()

    one_day = EnquiryFilters.model_validate({"from": "2026-09-22", "to": "2026-09-22"})
    assert [r.ref for r in (await svc.list_enquiries(db, one_day)).items] == ["TS-LATE11"]

    both = EnquiryFilters.model_validate({"from": "2026-09-22", "to": "2026-09-23"})
    assert {r.ref for r in (await svc.list_enquiries(db, both)).items} == {"TS-LATE11", "TS-EARL11"}


@pytest.mark.db
async def test_search_matches_a_name_or_a_phone_however_it_is_typed(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-PRIYA1", name="Priya Sharma", phone="9845022110")
    await make_enquiry(db, ref="TS-ANIR11", name="Anirudh S", phone="9980041234")
    await db.commit()

    async def refs(q: str) -> list[str]:
        out = await svc.list_enquiries(db, EnquiryFilters.model_validate({"q": q}))
        return [r.ref for r in out.items]

    assert await refs("priya") == ["TS-PRIYA1"]
    assert await refs("+91 98450-22110") == ["TS-PRIYA1"]
    assert await refs("9980") == ["TS-ANIR11"]
    assert await refs("%") == []  # a wildcard is matched literally, not as "everything"


@pytest.mark.db
async def test_paging_is_fifty_to_a_page(db: AsyncSession) -> None:
    for i in range(PAGE_SIZE + 3):
        await make_enquiry(db, ref=f"TS-P{i:05d}")
    await db.commit()

    first = await svc.list_enquiries(db, EnquiryFilters())
    second = await svc.list_enquiries(db, EnquiryFilters(page=2))

    assert len(first.items) == PAGE_SIZE and len(second.items) == 3
    assert first.total == PAGE_SIZE + 3 and first.total_pages == 2
    assert not {r.id for r in first.items} & {r.id for r in second.items}


@pytest.mark.db
async def test_an_empty_inbox_still_reports_one_page(db: AsyncSession) -> None:
    out = await svc.list_enquiries(db, EnquiryFilters())
    assert (out.items, out.total, out.total_pages, out.counts.all) == ([], 0, 1, 0)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.admin_enquiries'`

- [ ] **Step 3: Write the service** — create `api/app/services/admin_enquiries.py`:

```python
"""The owner's enquiry inbox (F21, 06 §A4 / §C-REST).

Read-mostly: the only writes are a status change and an appended note. Nothing public reads
enquiries, so — unlike every catalog service — **no `revalidate` call belongs in this module**.
The sidebar's new-enquiry badge rides along on `GET /auth/session` (F16) and refreshes when the
page does.

Filtering, searching and paging are server-side, the opposite of F18's packages table: the
catalogue is a dozen rows, the inbox grows without bound.
"""

import datetime as dt
import math
import re
from typing import Any, TypeVar

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Enquiry, Package
from app.models.enums import EnquiryStatus
from app.schemas.admin_enquiries import (
    PAGE_SIZE,
    EnquiryFilters,
    EnquiryList,
    EnquiryRow,
    StatusCounts,
)
from app.schemas.enquiries import PackageRef, normalise_phone
from app.services.email.render import IST

# A query made only of digits and the punctuation people put in phone numbers is a phone search.
PHONE_QUERY_RE = re.compile(r"^[0-9 +\-.()]+$")

S = TypeVar("S", bound=Select[Any])


def ist_day_start(day: dt.date) -> dt.datetime:
    """Midnight IST on `day`, as the aware UTC instant `created_at` is compared against.

    The owner reads "received today" as an Indian business day — the same rule
    `analytics.ist_today` applies to page views.
    """
    return dt.datetime.combine(day, dt.time.min, tzinfo=IST).astimezone(dt.UTC)


def like_escape(value: str) -> str:
    r"""Escape LIKE wildcards so a `%` typed into the search box matches a literal `%`."""
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


def search_clause(q: str) -> ColumnElement[bool]:
    """Mockup A6: "Search name or phone". A phone is normalised the way the enquiry form
    normalises a submitted number, so `+91 98450-22110` finds the row stored as `9845022110`."""
    text = q.strip()
    if PHONE_QUERY_RE.match(text):
        digits = normalise_phone(text)
        if digits:
            # No escaping needed: PHONE_QUERY_RE already excludes `%` and `_`.
            return Enquiry.phone.contains(digits)
    return Enquiry.name.ilike(f"%{like_escape(text)}%")


def _filtered(stmt: S, filters: EnquiryFilters, *, with_status: bool) -> S:
    """Every filter except `status`, which the tab counts deliberately leave out (A6)."""
    if with_status and filters.status is not None:
        stmt = stmt.where(Enquiry.status == filters.status)
    if filters.type is not None:
        stmt = stmt.where(Enquiry.type == filters.type)
    if filters.package_id is not None:
        stmt = stmt.where(Enquiry.package_id == filters.package_id)
    if filters.from_ is not None:
        stmt = stmt.where(Enquiry.created_at >= ist_day_start(filters.from_))
    if filters.to is not None:
        # Exclusive upper bound at midnight IST the next day: `to` is an inclusive day.
        stmt = stmt.where(Enquiry.created_at < ist_day_start(filters.to + dt.timedelta(days=1)))
    if filters.q:
        stmt = stmt.where(search_clause(filters.q))
    return stmt


def _row(row: Enquiry, package_slug: str | None, package_name: str | None) -> EnquiryRow:
    package = (
        PackageRef(slug=package_slug, name=package_name)
        if package_slug and package_name
        else None
    )
    return EnquiryRow(
        id=row.id,
        ref=row.ref,
        type=row.type,
        status=row.status,
        name=row.name,
        phone=row.phone,
        package=package,
        travel_month=row.travel_month,
        adults=row.adults,
        children=row.children,
        created_at=row.created_at,
    )


async def _counts(db: AsyncSession, filters: EnquiryFilters) -> StatusCounts:
    rows = await db.execute(
        _filtered(
            select(Enquiry.status, func.count()).select_from(Enquiry), filters, with_status=False
        ).group_by(Enquiry.status)
    )
    by_status = {status: int(n) for status, n in rows.all()}
    return StatusCounts(
        new=by_status.get(EnquiryStatus.NEW, 0),
        contacted=by_status.get(EnquiryStatus.CONTACTED, 0),
        converted=by_status.get(EnquiryStatus.CONVERTED, 0),
        closed=by_status.get(EnquiryStatus.CLOSED, 0),
        all=sum(by_status.values()),
    )


def _with_package(filters: EnquiryFilters) -> Select[tuple[Enquiry, str | None, str | None]]:
    """`package_id` is `ON DELETE SET NULL` and contact enquiries never have one, so the join
    to `packages` is always an outer one."""
    return _filtered(
        select(Enquiry, Package.slug, Package.name).outerjoin(
            Package, Package.id == Enquiry.package_id
        ),
        filters,
        with_status=True,
    ).order_by(Enquiry.created_at.desc(), Enquiry.id.desc())


async def list_enquiries(db: AsyncSession, filters: EnquiryFilters) -> EnquiryList:
    total = (
        await db.execute(
            _filtered(select(func.count()).select_from(Enquiry), filters, with_status=True)
        )
    ).scalar_one()
    rows = await db.execute(
        _with_package(filters).limit(PAGE_SIZE).offset((filters.page - 1) * PAGE_SIZE)
    )
    return EnquiryList(
        items=[_row(e, slug, name) for e, slug, name in rows.all()],
        page=filters.page,
        page_size=PAGE_SIZE,
        total=total,
        total_pages=max(1, math.ceil(total / PAGE_SIZE)),
        counts=await _counts(db, filters),
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q`
Expected: PASS (17 tests)

- [ ] **Step 5: Lint and commit**

```bash
uv run --directory api ruff format api/app/services/admin_enquiries.py api/tests/test_admin_enquiries.py
uv run --directory api ruff check . && uv run --directory api pyright
git add api/app/services/admin_enquiries.py api/tests/test_admin_enquiries.py
git commit -m "feat(F21): server-side enquiry list — filters, IST date range, tab counts, paging

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Enquiry detail — timeline, package card, same-phone history

**Files:**

- Modify: `api/app/services/admin_enquiries.py`
- Test: `api/tests/test_admin_enquiries.py` (append)

**Interfaces:**

- Consumes: Task 2's module-level helpers; `app.models.{EnquiryNote, PackageImage}`; `app.errors.ApiError`.
- Produces: `RELATED_LIMIT = 5`, `device_from(user_agent) -> Device`, `load_enquiry(db, id) -> Enquiry`, `get_enquiry(db, id) -> AdminEnquiry`. Task 4 calls `load_enquiry` and `get_enquiry`.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_enquiries.py`:

```python
# --- service: detail ------------------------------------------------------------------------------

from app.errors import ApiError
from app.models import EnquiryNote


def test_device_is_derived_from_the_user_agent_and_never_invented() -> None:
    iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"
    mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140"
    assert svc.device_from(iphone) == "Mobile"
    assert svc.device_from("Mozilla/5.0 (Linux; Android 14; Pixel 8)") == "Mobile"
    assert svc.device_from(mac) == "Desktop"
    assert svc.device_from(None) == "Unknown"
    assert svc.device_from("") == "Unknown"


@pytest.mark.db
async def test_detail_carries_every_submitted_field_and_the_package_card(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    row = await make_enquiry(
        db,
        ref="TS-DET111",
        package_id=pkg.id,
        type=EnquiryType.CUSTOM,
        travel_month=dt.date(2026, 11, 1),
        message="Are early check-ins possible?",
        preferred_dates="Second week of November",
        budget_paise=2_500_000,
        changes="Skip Kufri, add a day in Manali",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    )
    await db.commit()

    out = await svc.get_enquiry(db, row.id)

    assert out.ref == "TS-DET111" and out.type == EnquiryType.CUSTOM
    assert out.message == "Are early check-ins possible?"
    assert out.budget_paise == 2_500_000 and out.changes
    assert out.package is not None and out.package.slug == "test-goa-beaches"
    assert out.package.nights == 3 and out.package.starting_price_paise == 1_499_900
    assert out.device == "Mobile"
    assert out.notes == [] and out.related == []


@pytest.mark.db
async def test_detail_never_exposes_the_ip_hash(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-PRIV11", ip_hash="deadbeef" * 4)
    await db.commit()
    payload = (await svc.get_enquiry(db, row.id)).model_dump(by_alias=True)
    assert "ipHash" not in payload and "ip_hash" not in payload
    assert "deadbeef" not in str(payload)


@pytest.mark.db
async def test_notes_come_back_oldest_first(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-NOTE11")
    first = EnquiryNote(enquiry_id=row.id, body="Called at 11:40 — no answer.")
    second = EnquiryNote(enquiry_id=row.id, body="WhatsApp sent with check-in info.")
    db.add_all([first, second])
    await db.flush()
    first.created_at = dt.datetime.now(dt.UTC) - dt.timedelta(hours=1)
    await db.commit()

    out = await svc.get_enquiry(db, row.id)
    assert [n.body for n in out.notes] == [
        "Called at 11:40 — no answer.",
        "WhatsApp sent with check-in info.",
    ]


@pytest.mark.db
async def test_related_lists_other_enquiries_from_the_same_phone_newest_first(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    current = await make_enquiry(db, ref="TS-CUR111", phone="9845022110")
    older = await make_enquiry(db, ref="TS-OTH111", phone="9845022110", package_id=pkg.id)
    await make_enquiry(db, ref="TS-ELSE11", phone="9980041234")
    at_ist(older, dt.datetime.now(dt.UTC) - dt.timedelta(days=30))
    await db.commit()

    out = await svc.get_enquiry(db, current.id)

    assert [r.ref for r in out.related] == ["TS-OTH111"]
    assert out.related[0].package_name == "North Goa Beaches"


@pytest.mark.db
async def test_detail_404s_for_an_unknown_id(db: AsyncSession) -> None:
    with pytest.raises(ApiError) as exc:
        await svc.get_enquiry(db, "enq_does_not_exist")
    assert exc.value.code == "not_found"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q -k "device or detail or notes_come or related"`
Expected: FAIL — `AttributeError: module 'app.services.admin_enquiries' has no attribute 'device_from'`

- [ ] **Step 3: Extend the service** — add to `api/app/services/admin_enquiries.py` (imports first, then the code below the list section):

```python
# --- add to the imports at the top of the file ---
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import EnquiryNote, PackageImage
from app.schemas.admin_enquiries import (
    AdminEnquiry,
    Device,
    EnquiryNoteOut,
    EnquiryPackage,
    RelatedEnquiry,
)
```

```python
# --- detail ---------------------------------------------------------------------------------------

RELATED_LIMIT = 5
# Every mobile browser carries one of these; a desktop UA carries none of them.
MOBILE_UA_RE = re.compile(r"Mobi|Android|iPhone|iPad|iPod|Windows Phone", re.IGNORECASE)


def device_from(user_agent: str | None) -> Device:
    """"Mobile" or "Desktop" from the UA, and "Unknown" when there is nothing to go on.

    This is all the "source" the owner gets: mockup A7 also showed a city, but there is no geo
    lookup anywhere in this app and `ip_hash` is a hash, so inventing one would be a lie.
    """
    if not user_agent:
        return "Unknown"
    return "Mobile" if MOBILE_UA_RE.search(user_agent) else "Desktop"


async def load_enquiry(db: AsyncSession, id: str) -> Enquiry:
    """`populate_existing=True` matters: the session runs with `expire_on_commit=False`, so an
    instance already in the identity map would otherwise answer with the notes it loaded before
    a status change appended one (the F18 stale-relationship bug)."""
    row = (
        await db.execute(
            select(Enquiry)
            .where(Enquiry.id == id)
            .options(selectinload(Enquiry.notes))
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ApiError("not_found", "Enquiry not found")
    return row


async def _package_card(db: AsyncSession, package_id: str | None) -> EnquiryPackage | None:
    if package_id is None:
        return None
    cover = PackageImage.__table__.alias("cover")
    found = (
        await db.execute(
            select(Package, cover.c.url)
            .outerjoin(cover, cover.c.id == Package.cover_image_id)
            .where(Package.id == package_id)
        )
    ).one_or_none()
    if found is None:
        return None
    pkg, cover_url = found
    return EnquiryPackage(
        slug=pkg.slug,
        name=pkg.name,
        nights=pkg.nights,
        days=pkg.days,
        starting_price_paise=pkg.starting_price_paise,
        cover_url=cover_url,
        status=pkg.status,
    )


async def _related(db: AsyncSession, row: Enquiry) -> list[RelatedEnquiry]:
    """A7's "other enquiries · same phone" — covered by ix_enquiries_phone_package_id_created_at."""
    rows = await db.execute(
        select(Enquiry.id, Enquiry.ref, Enquiry.status, Package.name, Enquiry.created_at)
        .outerjoin(Package, Package.id == Enquiry.package_id)
        .where(Enquiry.phone == row.phone, Enquiry.id != row.id)
        .order_by(Enquiry.created_at.desc())
        .limit(RELATED_LIMIT)
    )
    return [
        RelatedEnquiry(
            id=id, ref=ref, status=status, package_name=package_name, created_at=created_at
        )
        for id, ref, status, package_name, created_at in rows.all()
    ]


async def _detail(db: AsyncSession, row: Enquiry) -> AdminEnquiry:
    return AdminEnquiry(
        id=row.id,
        ref=row.ref,
        type=row.type,
        status=row.status,
        name=row.name,
        phone=row.phone,
        email=row.email,
        travel_month=row.travel_month,
        adults=row.adults,
        children=row.children,
        message=row.message,
        preferred_dates=row.preferred_dates,
        budget_paise=row.budget_paise,
        changes=row.changes,
        package=await _package_card(db, row.package_id),
        email_status=row.email_status,
        device=device_from(row.user_agent),
        user_agent=row.user_agent,
        created_at=row.created_at,
        updated_at=row.updated_at,
        # The relationship is ordered by `created_at` on the model — oldest first, as a
        # timeline reads.
        notes=[
            EnquiryNoteOut(id=n.id, body=n.body, created_at=n.created_at) for n in row.notes
        ],
        related=await _related(db, row),
    )


async def get_enquiry(db: AsyncSession, id: str) -> AdminEnquiry:
    return await _detail(db, await load_enquiry(db, id))
```

- [ ] **Step 4: Run the whole file to verify it passes**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q`
Expected: PASS (23 tests)

- [ ] **Step 5: Lint and commit**

```bash
uv run --directory api ruff format api/app/services/admin_enquiries.py api/tests/test_admin_enquiries.py
uv run --directory api ruff check . && uv run --directory api pyright
git add api/app/services/admin_enquiries.py api/tests/test_admin_enquiries.py
git commit -m "feat(F21): enquiry detail — notes timeline, package card, same-phone history

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Status change with an auto-note, and adding a note

**Files:**

- Modify: `api/app/services/admin_enquiries.py`
- Test: `api/tests/test_admin_enquiries.py` (append)

**Interfaces:**

- Consumes: `load_enquiry`, `_detail` from Task 3.
- Produces: `STATUS_LABELS: dict[EnquiryStatus, str]`, `status_note(old, new) -> str`, `set_status(db, id, status) -> AdminEnquiry`, `add_note(db, id, body) -> AdminEnquiry`. Task 6's routes call both writes; Task 5 reuses `STATUS_LABELS`.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_enquiries.py`:

```python
# --- service: writes ------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_status_change_appends_a_note_in_the_same_timeline(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-STAT11", status=EnquiryStatus.NEW)
    await db.commit()

    out = await svc.set_status(db, row.id, EnquiryStatus.CONTACTED)

    assert out.status == EnquiryStatus.CONTACTED
    assert [n.body for n in out.notes] == ["Status changed from New to Contacted"]


@pytest.mark.db
async def test_setting_the_same_status_twice_does_not_spam_the_timeline(
    db: AsyncSession,
) -> None:
    row = await make_enquiry(db, ref="TS-SAME11", status=EnquiryStatus.CONTACTED)
    await db.commit()

    out = await svc.set_status(db, row.id, EnquiryStatus.CONTACTED)

    assert out.status == EnquiryStatus.CONTACTED
    assert out.notes == []


@pytest.mark.db
async def test_status_changes_and_owner_notes_interleave_in_one_timeline(
    db: AsyncSession,
) -> None:
    row = await make_enquiry(db, ref="TS-MIX111")
    await db.commit()

    await svc.set_status(db, row.id, EnquiryStatus.CONTACTED)
    await svc.add_note(db, row.id, "Called at 11:40 — no answer, WhatsApp sent.")
    out = await svc.set_status(db, row.id, EnquiryStatus.CONVERTED)

    assert [n.body for n in out.notes] == [
        "Status changed from New to Contacted",
        "Called at 11:40 — no answer, WhatsApp sent.",
        "Status changed from Contacted to Converted",
    ]


@pytest.mark.db
async def test_writes_404_for_an_unknown_id(db: AsyncSession) -> None:
    with pytest.raises(ApiError) as exc:
        await svc.set_status(db, "enq_nope", EnquiryStatus.CLOSED)
    assert exc.value.code == "not_found"
    with pytest.raises(ApiError):
        await svc.add_note(db, "enq_nope", "hello")


@pytest.mark.db
async def test_a_status_change_is_persisted_not_just_returned(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-PERS11")
    await db.commit()
    await svc.set_status(db, row.id, EnquiryStatus.CLOSED)

    stored = await svc.get_enquiry(db, row.id)
    assert stored.status == EnquiryStatus.CLOSED
    assert len(stored.notes) == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q -k "status or note"`
Expected: FAIL — `AttributeError: module 'app.services.admin_enquiries' has no attribute 'set_status'`

- [ ] **Step 3: Extend the service** — add to `api/app/services/admin_enquiries.py`:

```python
# --- writes ---------------------------------------------------------------------------------------

STATUS_LABELS: dict[EnquiryStatus, str] = {
    EnquiryStatus.NEW: "New",
    EnquiryStatus.CONTACTED: "Contacted",
    EnquiryStatus.CONVERTED: "Converted",
    EnquiryStatus.CLOSED: "Closed",
}


def status_note(old: EnquiryStatus, new: EnquiryStatus) -> str:
    """Auto notes are worded distinctly rather than flagged by a column: v1 adds no `kind` to
    `enquiry_notes`, because one timeline of calls and status moves is what the owner reads."""
    return f"Status changed from {STATUS_LABELS[old]} to {STATUS_LABELS[new]}"


async def set_status(db: AsyncSession, id: str, status: EnquiryStatus) -> AdminEnquiry:
    """One transaction: the new status and the note that records it land together, or not at all.

    Re-selecting the same status is a no-op — the owner clicking the tab they are already on
    should not add a line to the timeline.
    """
    row = await load_enquiry(db, id)
    if row.status != status:
        db.add(EnquiryNote(enquiry_id=row.id, body=status_note(row.status, status)))
        row.status = status
        await db.commit()
        row = await load_enquiry(db, id)
    return await _detail(db, row)


async def add_note(db: AsyncSession, id: str, body: str) -> AdminEnquiry:
    """Append-only: notes are never edited or deleted (06 §A4)."""
    row = await load_enquiry(db, id)
    db.add(EnquiryNote(enquiry_id=row.id, body=body))
    await db.commit()
    return await _detail(db, await load_enquiry(db, id))
```

- [ ] **Step 4: Run the whole file to verify it passes**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q`
Expected: PASS (28 tests)

- [ ] **Step 5: Lint and commit**

```bash
uv run --directory api ruff format api/app/services/admin_enquiries.py api/tests/test_admin_enquiries.py
uv run --directory api ruff check . && uv run --directory api pyright
git add api/app/services/admin_enquiries.py api/tests/test_admin_enquiries.py
git commit -m "feat(F21): status changes auto-append a note; append-only owner notes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: CSV export — injection-safe, BOM'd, filter-aware

**Files:**

- Modify: `api/app/services/admin_enquiries.py`
- Test: `api/tests/test_enquiries_csv.py` (create)

**Interfaces:**

- Consumes: `_with_package`, `STATUS_LABELS`, `ist_day_start` from Tasks 2–4; `app.services.format.MONTHS`; `app.services.analytics.ist_today`.
- Produces: `CSV_MAX_ROWS`, `CSV_HEADERS`, `RISKY_PREFIXES`, `csv_safe(value) -> str`, `csv_record(enquiry, package_name) -> list[str]`, `csv_records(db, filters) -> list[list[str]]`, `csv_lines(records) -> Iterator[str]`, `csv_filename() -> str`. Task 6's route calls `csv_records`, `csv_lines`, `csv_filename`.

- [ ] **Step 1: Write the failing tests** — create `api/tests/test_enquiries_csv.py`:

```python
"""F21 CSV export: the owner opens this in Excel, so encoding and formula safety are the spec."""

import csv
import datetime as dt
import io

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.schemas.admin_enquiries import EnquiryFilters
from app.services import admin_enquiries as svc
from tests.test_admin_enquiries import make_enquiry, make_package

# --- injection ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("=cmd|'/c calc'!A0", "'=cmd|'/c calc'!A0"),
        ("+1234", "'+1234"),
        ("-1+1", "'-1+1"),
        ("@SUM(A1:A9)", "'@SUM(A1:A9)"),
        ("\tTabbed", "'\tTabbed"),
        ("\rCarriage", "'\rCarriage"),
        ("Priya Sharma", "Priya Sharma"),
        ("₹26,499 please", "₹26,499 please"),
        ("", ""),
        ("Nov 2026", "Nov 2026"),
    ],
)
def test_csv_safe_neutralises_every_formula_prefix(raw: str, expected: str) -> None:
    assert svc.csv_safe(raw) == expected


# --- rendering ------------------------------------------------------------------------------------


def test_the_file_starts_with_a_bom_and_uses_crlf_and_quotes_everything() -> None:
    text = "".join(svc.csv_lines([["TS-AAA111", "Priya, Sharma"]]))
    assert text.startswith("﻿")
    assert text.count("\r\n") == 2  # header + one row
    assert '"TS-AAA111","Priya, Sharma"' in text
    assert '"Ref"' in text and '"Received (IST)"' in text


def test_a_rupee_sign_survives_a_round_trip_through_utf8_sig() -> None:
    text = "".join(svc.csv_lines([["₹26,499", "Priya Sharma"]]))
    decoded = text.encode("utf-8").decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(decoded)))
    assert rows[1] == ["₹26,499", "Priya Sharma"]


def test_the_filename_carries_the_ist_day() -> None:
    name = svc.csv_filename()
    assert name.startswith("tripsmith-enquiries-") and name.endswith(".csv")
    assert svc.ist_today().isoformat() in name


# --- rows -----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_records_render_the_submitted_fields_the_way_a_person_reads_them(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    await make_enquiry(
        db,
        ref="TS-CSV111",
        package_id=pkg.id,
        type=EnquiryType.CUSTOM,
        status=EnquiryStatus.CONTACTED,
        travel_month=dt.date(2026, 11, 1),
        budget_paise=2_500_000,
        adults=2,
        children=1,
        message="Landing at 9 am",
        email_status=EmailStatus.SENT,
    )
    await db.commit()

    (record,) = await svc.csv_records(db, EnquiryFilters())
    row = dict(zip(svc.CSV_HEADERS, record, strict=True))

    assert row["Ref"] == "TS-CSV111"
    assert row["Status"] == "Contacted" and row["Type"] == "Customise"
    assert row["Phone"] == "9845022110"  # ten digits: no `+` for csv_safe to escape
    assert row["Package"] == "North Goa Beaches"
    assert row["Travel month"] == "Nov 2026"
    assert row["Adults"] == "2" and row["Children"] == "1"
    assert row["Budget (₹)"] == "25000"  # rupees, not paise
    assert row["Emails"] == "Sent"
    assert row["Message"] == "Landing at 9 am"


@pytest.mark.db
async def test_records_honour_the_filters_but_not_the_page(db: AsyncSession) -> None:
    for i in range(55):
        await make_enquiry(db, ref=f"TS-C{i:05d}", status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-CLOSED1", status=EnquiryStatus.CLOSED)
    await db.commit()

    everything = await svc.csv_records(db, EnquiryFilters(page=2))
    only_new = await svc.csv_records(db, EnquiryFilters.model_validate({"status": "new"}))

    assert len(everything) == 56  # page is ignored: an export is the whole filtered view
    assert len(only_new) == 55


@pytest.mark.db
async def test_a_dangerous_message_is_escaped_in_the_rendered_row(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-EVIL11", message="=cmd|'/c calc'!A0", name="-Bobby")
    await db.commit()

    (record,) = await svc.csv_records(db, EnquiryFilters())
    row = dict(zip(svc.CSV_HEADERS, record, strict=True))

    assert row["Message"].startswith("'=")
    assert row["Name"] == "'-Bobby"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_enquiries_csv.py -q`
Expected: FAIL — `AttributeError: module 'app.services.admin_enquiries' has no attribute 'csv_safe'`

- [ ] **Step 3: Extend the service** — add to `api/app/services/admin_enquiries.py`:

```python
# --- add to the imports at the top of the file ---
import csv
import io
from collections.abc import Iterator, Sequence

from app.models.enums import EmailStatus, EnquiryType
from app.services.analytics import ist_today
from app.services.format import MONTHS
```

```python
# --- csv ------------------------------------------------------------------------------------------

# One request holds the whole export in memory before streaming it (see `csv_records`), and the
# api function has a 30 s ceiling on Vercel. At portfolio scale this is never reached.
CSV_MAX_ROWS = 10_000

CSV_HEADERS = (
    "Ref",
    "Received (IST)",
    "Status",
    "Type",
    "Name",
    "Phone",
    "Email",
    "Package",
    "Travel month",
    "Adults",
    "Children",
    "Budget (₹)",
    "Preferred dates",
    "Changes",
    "Message",
    "Emails",
)

# Excel and Sheets evaluate a cell that opens with one of these, and a tab or CR lets a crafted
# value break out of its cell first. `message`, `name` and `changes` come straight from a public
# form, so an enquiry reading `=cmd|'/c calc'!A0` would run when the owner opens the export.
RISKY_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

TYPE_LABELS: dict[EnquiryType, str] = {
    EnquiryType.STANDARD: "Standard",
    EnquiryType.CUSTOM: "Customise",
    EnquiryType.CONTACT: "Contact",
}
EMAIL_STATUS_LABELS: dict[EmailStatus, str] = {
    EmailStatus.SENT: "Sent",
    EmailStatus.FAILED: "Failed",
    EmailStatus.SKIPPED: "Not sent",
}


def csv_safe(value: str) -> str:
    """Prefix a formula-looking value with `'` so the spreadsheet treats it as text."""
    return f"'{value}" if value.startswith(RISKY_PREFIXES) else value


def _month_label(month: dt.date | None) -> str:
    return f"{MONTHS[month.month - 1]} {month.year}" if month else ""


def csv_record(row: Enquiry, package_name: str | None) -> list[str]:
    """One spreadsheet line. Phone is the bare ten digits the DB stores — writing `+91 …` would
    trip `csv_safe` and put a stray quote in front of every number."""
    fields = [
        row.ref,
        row.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M"),
        STATUS_LABELS[row.status],
        TYPE_LABELS.get(row.type, row.type.value),
        row.name,
        row.phone,
        row.email,
        package_name or "",
        _month_label(row.travel_month),
        str(row.adults),
        str(row.children),
        "" if row.budget_paise is None else str(row.budget_paise // 100),
        row.preferred_dates or "",
        row.changes or "",
        row.message or "",
        EMAIL_STATUS_LABELS[row.email_status],
    ]
    return [csv_safe(field) for field in fields]


async def csv_records(db: AsyncSession, filters: EnquiryFilters) -> list[list[str]]:
    """The whole filtered view — `page` is deliberately ignored, an export is not one screen.

    Materialised, not lazily streamed: the `get_session` dependency closes as soon as the route
    handler returns, so a generator that queried inside `StreamingResponse` would run against a
    closed session.
    """
    rows = await db.execute(_with_package(filters).limit(CSV_MAX_ROWS))
    return [csv_record(e, name) for e, _slug, name in rows.all()]


def csv_lines(records: Sequence[Sequence[str]]) -> Iterator[str]:
    """Header + rows, quoted, CRLF, BOM first.

    The BOM is not decoration: without it Excel on a Windows machine in India reads the file in
    the ANSI codepage and mangles ₹ and every name with a non-ASCII character.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    yield "﻿"
    for record in (CSV_HEADERS, *records):
        writer.writerow(record)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def csv_filename() -> str:
    return f"tripsmith-enquiries-{ist_today().isoformat()}.csv"
```

Also re-export `ist_today` for the test's use — it is already imported at the top of the module, so `svc.ist_today` resolves.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_enquiries_csv.py -q`
Expected: PASS (16 tests)

- [ ] **Step 5: Lint and commit**

```bash
uv run --directory api ruff format api/app/services/admin_enquiries.py api/tests/test_enquiries_csv.py
uv run --directory api ruff check . && uv run --directory api pyright
git add api/app/services/admin_enquiries.py api/tests/test_enquiries_csv.py
git commit -m "feat(F21): CSV export — BOM, CRLF, quoted, and safe against formula injection

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The five owner routes

**Files:**

- Create: `api/app/routers/admin/enquiries.py`
- Modify: `api/app/main.py`, `api/tests/test_openapi.py`, `api/openapi.json` (generated), `web/src/lib/api-types.ts` (generated)
- Test: `api/tests/test_admin_enquiries.py` (append)

**Interfaces:**

- Consumes: everything from Tasks 1–5; `app.services.auth.deps.require_owner`, `app.infra.cache.NO_STORE`.
- Produces: operation ids `listAdminEnquiries`, `exportEnquiriesCsv`, `getAdminEnquiry`, `setEnquiryStatus`, `addEnquiryNote`, and therefore the web paths `/admin/enquiries`, `/admin/enquiries.csv`, `/admin/enquiries/{id}`, `/admin/enquiries/{id}/status`, `/admin/enquiries/{id}/notes` in `api-types.ts`. Tasks 7–9 consume those types.

- [ ] **Step 1: Write the failing route tests** — append to `api/tests/test_admin_enquiries.py`:

```python
# --- routes ---------------------------------------------------------------------------------------

from httpx import AsyncClient

from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie


async def owner_headers(db: AsyncSession, client: AsyncClient) -> dict[str, str]:
    await seeded_with_owner(db)
    res = await client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    assert res.status_code == 200
    return with_cookie(res.cookies["ts_session"])


@pytest.mark.db
async def test_every_enquiry_route_is_owner_only(db_client: AsyncClient) -> None:
    for method, path in [
        ("GET", "/admin/enquiries"),
        ("GET", "/admin/enquiries.csv"),
        ("GET", "/admin/enquiries/enq_1"),
        ("PATCH", "/admin/enquiries/enq_1/status"),
        ("POST", "/admin/enquiries/enq_1/notes"),
    ]:
        res = await db_client.request(method, path, json={})
        assert res.status_code == 401, path
        assert res.json()["error"]["code"] == "unauthorized"


@pytest.mark.db
async def test_list_route_answers_with_no_store_and_the_camelcase_contract(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    pkg = await make_package(db)
    await make_enquiry(db, ref="TS-ROUT11", package_id=pkg.id)
    await db.commit()

    res = await db_client.get("/admin/enquiries", headers=headers)

    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["items"][0]["ref"] == "TS-ROUT11"
    assert body["items"][0]["package"]["slug"] == "test-goa-beaches"
    assert body["pageSize"] == 50 and body["totalPages"] == 1
    assert body["counts"]["new"] == 1


@pytest.mark.db
async def test_list_route_passes_the_query_through(db: AsyncSession, db_client: AsyncClient) -> None:
    headers = await owner_headers(db, db_client)
    await make_enquiry(db, ref="TS-QRY111", name="Priya Sharma")
    await make_enquiry(db, ref="TS-QRY222", name="Anirudh S")
    await db.commit()

    res = await db_client.get("/admin/enquiries?q=priya&status=new&page=1", headers=headers)

    assert [r["ref"] for r in res.json()["items"]] == ["TS-QRY111"]


@pytest.mark.db
async def test_a_blank_filter_is_treated_as_absent(db: AsyncSession, db_client: AsyncClient) -> None:
    """The no-JS GET form submits every control, so `?status=&q=` must not 400."""
    headers = await owner_headers(db, db_client)
    await make_enquiry(db, ref="TS-BLNK11")
    await db.commit()

    res = await db_client.get("/admin/enquiries?status=&type=&q=&from=&to=", headers=headers)

    assert res.status_code == 200 and res.json()["total"] == 1


@pytest.mark.db
async def test_a_backwards_date_range_is_a_field_error(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    res = await db_client.get(
        "/admin/enquiries?from=2026-09-30&to=2026-09-01", headers=headers
    )
    assert res.status_code == 400
    assert res.json()["error"]["fieldErrors"] == {"to": "must not be before `from`"}


@pytest.mark.db
async def test_detail_status_and_notes_round_trip(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    row = await make_enquiry(db, ref="TS-RND111")
    await db.commit()

    detail = await db_client.get(f"/admin/enquiries/{row.id}", headers=headers)
    assert detail.status_code == 200 and detail.json()["status"] == "new"

    moved = await db_client.patch(
        f"/admin/enquiries/{row.id}/status", json={"status": "contacted"}, headers=headers
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "contacted"
    assert moved.headers["cache-control"] == "no-store"

    noted = await db_client.post(
        f"/admin/enquiries/{row.id}/notes", json={"body": "Called back"}, headers=headers
    )
    assert noted.status_code == 201
    assert [n["body"] for n in noted.json()["notes"]] == [
        "Status changed from New to Contacted",
        "Called back",
    ]


@pytest.mark.db
async def test_an_empty_note_is_rejected_under_its_field(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    row = await make_enquiry(db, ref="TS-EMPT11")
    await db.commit()

    res = await db_client.post(
        f"/admin/enquiries/{row.id}/notes", json={"body": "   "}, headers=headers
    )

    assert res.status_code == 400
    assert "body" in res.json()["error"]["fieldErrors"]


@pytest.mark.db
async def test_csv_route_is_an_attachment_with_the_right_headers(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    await make_enquiry(db, ref="TS-DWN111", name="Priya Sharma")
    await db.commit()

    res = await db_client.get("/admin/enquiries.csv", headers=headers)

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["cache-control"] == "no-store"
    assert "attachment; filename=\"tripsmith-enquiries-" in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM on the wire
    assert "TS-DWN111" in res.text
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_enquiries.py -q -k "route"`
Expected: FAIL — every route 404s (the router does not exist yet)

- [ ] **Step 3: Write the router** — create `api/app/routers/admin/enquiries.py`:

```python
"""`/admin/enquiries*` (06 §C-REST): the owner's inbox — list, detail, status, notes, CSV.

Mounted under a plain `/admin` prefix rather than `/admin/enquiries`, because the export lives
at `/admin/enquiries.csv`, a sibling of the collection and not a child of it. `.csv` is declared
before `/enquiries/{id}` so the intent is obvious, though the two cannot collide: a path
parameter never matches across a `/`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.admin_enquiries import (
    AdminEnquiry,
    EnquiryFilters,
    EnquiryList,
    EnquiryNoteInput,
    EnquiryStatusInput,
)
from app.services import admin_enquiries as svc
from app.services.auth.deps import require_owner

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]
Filters = Annotated[EnquiryFilters, Query()]


@router.get("/enquiries", operation_id="listAdminEnquiries", response_model_by_alias=True)
async def list_route(response: Response, db: Db, filters: Filters) -> EnquiryList:
    response.headers.update(NO_STORE)
    return await svc.list_enquiries(db, filters)


@router.get(
    "/enquiries.csv",
    operation_id="exportEnquiriesCsv",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {}}, "description": "The filtered inbox as CSV"}},
)
async def export_route(db: Db, filters: Filters) -> StreamingResponse:
    """Streamed, never stored: no Blob object to create and no garbage to collect."""
    records = await svc.csv_records(db, filters)
    return StreamingResponse(
        svc.csv_lines(records),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{svc.csv_filename()}"',
            **NO_STORE,
        },
    )


@router.get("/enquiries/{id}", operation_id="getAdminEnquiry", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminEnquiry:
    response.headers.update(NO_STORE)
    return await svc.get_enquiry(db, id)


@router.patch(
    "/enquiries/{id}/status", operation_id="setEnquiryStatus", response_model_by_alias=True
)
async def set_status_route(
    id: str, payload: EnquiryStatusInput, response: Response, db: Db
) -> AdminEnquiry:
    response.headers.update(NO_STORE)
    return await svc.set_status(db, id, payload.status)


@router.post(
    "/enquiries/{id}/notes",
    operation_id="addEnquiryNote",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def add_note_route(
    id: str, payload: EnquiryNoteInput, response: Response, db: Db
) -> AdminEnquiry:
    """201 with the whole enquiry, not just the note: the client renders the fresh timeline."""
    response.headers.update(NO_STORE)
    return await svc.add_note(db, id, payload.body)
```

- [ ] **Step 4: Wire it into the app** — in `api/app/main.py`, add the import beside the other admin routers and include it after `admin_destinations`:

```python
from app.routers.admin import destinations as admin_destinations
from app.routers.admin import enquiries as admin_enquiries
from app.routers.admin import package_images as admin_package_images
```

```python
    app.include_router(admin_destinations.router)
    app.include_router(admin_enquiries.router)
    app.include_router(admin_packages.router)
```

- [ ] **Step 5: Add the operation ids to the contract test** — in `api/tests/test_openapi.py`, inside `test_document_exposes_the_v1_enums_and_operations`, after the package image assertions:

```python
    enquiries = doc["paths"]["/admin/enquiries"]
    assert enquiries["get"]["operationId"] == "listAdminEnquiries"
    assert doc["paths"]["/admin/enquiries.csv"]["get"]["operationId"] == "exportEnquiriesCsv"
    one_enquiry = doc["paths"]["/admin/enquiries/{id}"]
    assert one_enquiry["get"]["operationId"] == "getAdminEnquiry"
    assert doc["paths"]["/admin/enquiries/{id}/status"]["patch"]["operationId"] == (
        "setEnquiryStatus"
    )
    assert doc["paths"]["/admin/enquiries/{id}/notes"]["post"]["operationId"] == "addEnquiryNote"
    assert schemas["EnquiryStatus"]["enum"] == ["new", "contacted", "converted", "closed"]
```

- [ ] **Step 6: Regenerate the contract and run the api suite**

```bash
pnpm gen:api
TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest -q
```

Expected: PASS — 361 baseline + 28 (`test_admin_enquiries.py`) + 16 (`test_enquiries_csv.py`) ≈ **405**, zero failures, zero warnings.

- [ ] **Step 7: Lint and commit**

```bash
uv run --directory api ruff format api/app/routers/admin/enquiries.py
uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright
git add api/app/routers/admin/enquiries.py api/app/main.py api/tests/ api/openapi.json web/src/lib/api-types.ts
git commit -m "feat(F21): /admin/enquiries routes — list, detail, status, notes, CSV

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: URL filter state and contact links (pure web modules)

**Files:**

- Create: `web/src/lib/admin/enquiry-filters.ts`, `web/src/lib/admin/enquiry-links.ts`
- Test: `web/tests/enquiry-filters.test.ts`, `web/tests/enquiry-links.test.ts`

**Interfaces:**

- Consumes: `components['schemas']['EnquiryStatus' | 'EnquiryType']` from the regenerated `api-types.ts`; `BUSINESS` from `@/lib/business`.
- Produces: from `enquiry-filters`: `Filters`, `INBOX_PATH`, `STATUSES`, `TYPES`, `STATUS_LABELS`, `TYPE_LABELS`, `parseFilters`, `toQuery`, `filterHref`, `csvHref`. From `enquiry-links`: `telHref`, `waHref`, `mailtoHref`, `replyMessage`, `emailSubject`. Tasks 8 and 9 consume all of these.

- [ ] **Step 1: Write the failing tests** — create `web/tests/enquiry-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { csvHref, filterHref, parseFilters, toQuery } from '@/lib/admin/enquiry-filters';

describe('parseFilters', () => {
  it('defaults to the unfiltered first page', () => {
    expect(parseFilters({})).toEqual({
      status: undefined,
      type: undefined,
      packageId: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      page: 1,
    });
  });

  it('reads every supported param', () => {
    expect(
      parseFilters({
        status: 'contacted',
        type: 'custom',
        packageId: 'pkg_1',
        from: '2026-09-01',
        to: '2026-09-30',
        q: '  Priya  ',
        page: '3',
      }),
    ).toEqual({
      status: 'contacted',
      type: 'custom',
      packageId: 'pkg_1',
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'Priya',
      page: 3,
    });
  });

  it('drops values the api would reject instead of forwarding them', () => {
    const f = parseFilters({ status: 'archived', type: 'callback', from: 'yesterday', page: '0' });
    expect(f.status).toBeUndefined();
    expect(f.type).toBeUndefined();
    expect(f.from).toBeUndefined();
    expect(f.page).toBe(1);
  });

  it('takes the first value when a param repeats', () => {
    expect(parseFilters({ status: ['new', 'closed'] }).status).toBe('new');
  });
});

describe('filterHref', () => {
  const base = parseFilters({ status: 'new', q: 'Priya', page: '4' });

  it('keeps the other filters and returns to page 1', () => {
    expect(filterHref(base, { status: 'contacted' })).toBe(
      '/admin/enquiries?status=contacted&q=Priya',
    );
  });

  it('keeps the page when paging is what changed', () => {
    expect(filterHref(base, { page: 2 })).toBe('/admin/enquiries?status=new&q=Priya&page=2');
  });

  it('clears a filter that is set to undefined', () => {
    expect(filterHref(base, { status: undefined })).toBe('/admin/enquiries?q=Priya');
  });

  it('is the bare path when nothing is filtered', () => {
    expect(filterHref(parseFilters({}), {})).toBe('/admin/enquiries');
  });
});

describe('csvHref', () => {
  it('points at the api through the rewrite and never carries a page', () => {
    const f = parseFilters({ status: 'converted', page: '6' });
    expect(csvHref(f)).toBe('/api/admin/enquiries.csv?status=converted');
  });
});

describe('toQuery', () => {
  it('omits page 1 so the first page has a clean URL', () => {
    expect(toQuery(parseFilters({ q: 'x' }))).toEqual({
      status: undefined,
      type: undefined,
      packageId: undefined,
      from: undefined,
      to: undefined,
      q: 'x',
      page: undefined,
    });
  });
});
```

Create `web/tests/enquiry-links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emailSubject, mailtoHref, replyMessage, telHref, waHref } from '@/lib/admin/enquiry-links';

const enquiry = { name: 'Priya Sharma', ref: 'TS-7F3K2Q', package: { name: 'North Goa Beaches' } };

describe('contact links', () => {
  it('dials the stored ten digits with the country code', () => {
    expect(telHref('9845022110')).toBe('tel:+919845022110');
  });

  it('opens WhatsApp to the visitor, not to the business number', () => {
    expect(waHref('9845022110', 'Hi Priya')).toBe('https://wa.me/919845022110?text=Hi%20Priya');
  });

  it('prefills the mail subject', () => {
    expect(mailtoHref('priya.s@gmail.com', 'Tripsmith · TS-7F3K2Q')).toBe(
      'mailto:priya.s@gmail.com?subject=Tripsmith%20%C2%B7%20TS-7F3K2Q',
    );
  });
});

describe('reply copy', () => {
  it('greets by first name and names the trip and the ref', () => {
    expect(replyMessage(enquiry)).toBe(
      'Hi Priya, this is Tripsmith about your enquiry for North Goa Beaches (TS-7F3K2Q).',
    );
  });

  it('drops the trip for a general enquiry', () => {
    expect(replyMessage({ ...enquiry, package: null })).toBe(
      'Hi Priya, this is Tripsmith about your enquiry (TS-7F3K2Q).',
    );
  });

  it('builds the email subject from the ref', () => {
    expect(emailSubject(enquiry)).toBe('Tripsmith · your enquiry TS-7F3K2Q');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test enquiry-filters enquiry-links`
Expected: FAIL — `Failed to resolve import "@/lib/admin/enquiry-filters"`

- [ ] **Step 3: Write `web/src/lib/admin/enquiry-filters.ts`**

```ts
import type { components } from '@/lib/api-types';

export type EnquiryStatus = components['schemas']['EnquiryStatus'];
export type EnquiryType = components['schemas']['EnquiryType'];

export const INBOX_PATH = '/admin/enquiries';
export const CSV_PATH = '/api/admin/enquiries.csv';

export const STATUSES = ['new', 'contacted', 'converted', 'closed'] as const;
export const TYPES = ['standard', 'custom', 'contact'] as const;

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  closed: 'Closed',
};

/** "Customise", not "Custom" — the public form calls it "Customise this trip" (06 §meta). */
export const TYPE_LABELS: Record<EnquiryType, string> = {
  standard: 'Standard',
  custom: 'Customise',
  contact: 'Contact',
};

export interface Filters {
  status?: EnquiryStatus;
  type?: EnquiryType;
  packageId?: string;
  from?: string;
  to?: string;
  q?: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE = 10_000;
const SEARCH_MAX = 80;

const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const oneOf = <T extends string>(allowed: readonly T[], v?: string): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

const isoDate = (v?: string) => (v && ISO_DATE.test(v) ? v : undefined);

/**
 * The URL is the filter state (F21): a filtered inbox is linkable, the back button works, and
 * the tabs, pager and search box degrade to plain links and a GET form with JavaScript off.
 *
 * Anything unrecognised is dropped rather than forwarded, so a hand-edited URL can never make
 * the page throw a 400 out of the api.
 */
export function parseFilters(params: RawParams): Filters {
  const page = Number(one(params.page));
  return {
    status: oneOf(STATUSES, one(params.status)),
    type: oneOf(TYPES, one(params.type)),
    packageId: one(params.packageId),
    from: isoDate(one(params.from)),
    to: isoDate(one(params.to)),
    q: one(params.q)?.slice(0, SEARCH_MAX),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The query for `api('/admin/enquiries', { searchParams })`; `api()` drops the blanks itself. */
export function toQuery(f: Filters): Record<string, string | undefined> {
  return {
    status: f.status,
    type: f.type,
    packageId: f.packageId,
    from: f.from,
    to: f.to,
    q: f.q,
    page: f.page > 1 ? String(f.page) : undefined,
  };
}

/**
 * The same inbox with some filters changed. Any change other than paging returns to page 1 —
 * staying on page 7 of a list that just became three rows long shows an empty screen.
 */
export function filterHref(f: Filters, patch: Partial<Filters>, path = INBOX_PATH): string {
  const next: Filters = { ...f, ...patch, page: patch.page ?? 1 };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(toQuery(next))) if (value) search.append(key, value);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The export honours the current filters but never a page — it is the whole filtered view. */
export const csvHref = (f: Filters) => filterHref(f, { page: 1 }, CSV_PATH);
```

- [ ] **Step 4: Write `web/src/lib/admin/enquiry-links.ts`**

```ts
import { BUSINESS } from '@/lib/business';

/**
 * Contact links for one enquiry. These point at the **visitor**, not at the business — unlike
 * `whatsappHref` in lib/business.ts, which always opens a chat with Tripsmith.
 *
 * Phones are stored as the bare ten digits the enquiry form normalises to, so every link here
 * adds the country code itself.
 */

interface EnquiryLike {
  name: string;
  ref: string;
  package?: { name: string } | null;
}

export const telHref = (phone: string) => `tel:+91${phone}`;

export const waHref = (phone: string, text: string) =>
  `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

export const mailtoHref = (email: string, subject: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}`;

/** The opener the owner sends: who is calling, about which trip, and the ref to quote back. */
export function replyMessage(e: EnquiryLike): string {
  const first = e.name.trim().split(/\s+/)[0] ?? e.name;
  const trip = e.package ? ` for ${e.package.name}` : '';
  return `Hi ${first}, this is ${BUSINESS.name} about your enquiry${trip} (${e.ref}).`;
}

export const emailSubject = (e: EnquiryLike) => `${BUSINESS.name} · your enquiry ${e.ref}`;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test enquiry-filters enquiry-links`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/admin/enquiry-filters.ts web/src/lib/admin/enquiry-links.ts web/tests/enquiry-filters.test.ts web/tests/enquiry-links.test.ts
git commit -m "feat(F21): URL filter state and per-enquiry contact links

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The inbox screen (mockup A6)

**Files:**

- Create: `web/src/components/admin/enquiries/StatusBadge.tsx`, `InboxFilters.tsx`, `EnquiriesTable.tsx`, `Pager.tsx`
- Modify: `web/src/app/(admin)/admin/(shell)/enquiries/page.tsx` (replaces the F21 placeholder)
- Test: `web/tests/enquiries-table.test.tsx`

**Interfaces:**

- Consumes: Task 7's `Filters`, `filterHref`, `csvHref`, `toQuery`, `STATUSES`, `STATUS_LABELS`, `TYPE_LABELS`; `api` from `@/lib/api`; `formatDate`/`MONTHS` from `@/lib/format`; existing `PageHead`, `Table*`, `Badge`, `buttonVariants`, `Input`, `NativeSelect`.
- Produces: `StatusBadge({ status })`, `InboxFilters({ filters, packages })`, `EnquiriesTable({ items })`, `Pager({ filters, page, totalPages, total })`. Task 9 reuses `StatusBadge`.

- [ ] **Step 1: Write the failing test** — create `web/tests/enquiries-table.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnquiriesTable } from '@/components/admin/enquiries/EnquiriesTable';
import type { components } from '@/lib/api-types';

type Row = components['schemas']['EnquiryRow'];

const row = (over: Partial<Row> = {}): Row => ({
  id: 'enq_1',
  ref: 'TS-7F3K2Q',
  type: 'standard',
  status: 'new',
  name: 'Priya Sharma',
  phone: '9845022110',
  package: { slug: 'north-goa-beaches', name: 'North Goa Beaches' },
  travelMonth: '2026-11-01',
  adults: 2,
  children: 0,
  createdAt: '2026-09-22T06:12:00Z',
  ...over,
});

describe('EnquiriesTable', () => {
  it('renders the A6 columns for one enquiry', () => {
    render(<EnquiriesTable items={[row()]} />);
    const line = screen.getByRole('row', { name: /Priya Sharma/ });
    expect(within(line).getByText('TS-7F3K2Q')).toBeTruthy();
    expect(within(line).getByText('98450 22110')).toBeTruthy();
    expect(within(line).getByText('North Goa Beaches')).toBeTruthy();
    expect(within(line).getByText('Standard')).toBeTruthy();
    expect(within(line).getByText('Nov 2026 · 2 adults')).toBeTruthy();
    expect(within(line).getByText('New')).toBeTruthy();
  });

  it('counts children in the party line', () => {
    render(<EnquiriesTable items={[row({ adults: 2, children: 2 })]} />);
    expect(screen.getByText('Nov 2026 · 2 adults, 2 children')).toBeTruthy();
  });

  it('dashes the package and month of a general enquiry', () => {
    render(<EnquiriesTable items={[row({ type: 'contact', package: null, travelMonth: null })]} />);
    const line = screen.getByRole('row', { name: /Priya Sharma/ });
    expect(within(line).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('links each row to its detail page', () => {
    render(<EnquiriesTable items={[row()]} />);
    expect(screen.getByRole('link', { name: /Open/ }).getAttribute('href')).toBe(
      '/admin/enquiries/enq_1',
    );
  });

  it('says so when a filter matches nothing', () => {
    render(<EnquiriesTable items={[]} />);
    expect(screen.getByText('No enquiries match these filters.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test enquiries-table`
Expected: FAIL — `Failed to resolve import "@/components/admin/enquiries/EnquiriesTable"`

- [ ] **Step 3: Write `web/src/components/admin/enquiries/StatusBadge.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type EnquiryStatus } from '@/lib/admin/enquiry-filters';

/** Mockup A6 `.badge.<status>`: new is the loud one, closed is the quiet one. */
const VARIANT: Record<EnquiryStatus, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  contacted: 'secondary',
  converted: 'secondary',
  closed: 'outline',
};

export function StatusBadge({ status }: { status: EnquiryStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
```

- [ ] **Step 4: Write `web/src/components/admin/enquiries/EnquiriesTable.tsx`**

```tsx
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TYPE_LABELS } from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';
import { MONTHS } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

type EnquiryRow = components['schemas']['EnquiryRow'];

/** `2026-11-01` → `Nov 2026`; the travel month is stored as the first of the month. */
export function monthLabel(iso: string | null): string {
  if (!iso) return '—';
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** `2 adults, 1 child` — the owner needs the party size at a glance to quote a price. */
export function partyLabel(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? 'adult' : 'adults'}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  return parts.join(', ');
}

/** `9845022110` → `98450 22110`, how an Indian mobile is read out. */
export const phoneLabel = (phone: string) => `${phone.slice(0, 5)} ${phone.slice(5)}`;

/** Received as a relative age up to a week old, then the calendar date (A6 "12 min ago"). */
export function receivedLabel(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Mockup A6. A server component: the rows arrive already filtered, searched and paged by the
 * api, so there is nothing here for the browser to recompute.
 */
export function EnquiriesTable({ items }: { items: EnquiryRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-line bg-bg p-6 text-center text-mute">
        No enquiries match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-bg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Package</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Month · pax</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Received</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="num font-bold">{e.ref}</TableCell>
              <TableCell>
                <b className="block">{e.name}</b>
                <span className="text-xs text-mute">{phoneLabel(e.phone)}</span>
              </TableCell>
              <TableCell className="text-ink2">{e.package?.name ?? '—'}</TableCell>
              <TableCell className="text-ink2">{TYPE_LABELS[e.type]}</TableCell>
              <TableCell className="whitespace-nowrap text-ink2">
                {e.travelMonth
                  ? `${monthLabel(e.travelMonth)} · ${partyLabel(e.adults, e.children)}`
                  : '—'}
              </TableCell>
              <TableCell>
                <StatusBadge status={e.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-mute">
                {receivedLabel(e.createdAt)}
              </TableCell>
              <TableCell className="text-right text-[13px] font-bold">
                <Link href={`/admin/enquiries/${e.id}`} className="text-primary">
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test enquiries-table`
Expected: PASS (5 tests)

- [ ] **Step 6: Write `web/src/components/admin/enquiries/InboxFilters.tsx`**

```tsx
import Link from 'next/link';
import { Search } from 'lucide-react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  INBOX_PATH,
  STATUSES,
  STATUS_LABELS,
  TYPES,
  TYPE_LABELS,
  filterHref,
  type Filters,
} from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';

type StatusCounts = components['schemas']['StatusCounts'];
type PackageOption = { id: string; name: string };

/**
 * Tabs are links and everything else is one GET form, so the whole inbox works with JavaScript
 * off and every view is a URL the owner can bookmark or send. Counts come from the api with all
 * the other filters applied, so "New 3" means new *in this view* (A6).
 */
export function InboxFilters({
  filters,
  counts,
  packages,
}: {
  filters: Filters;
  counts: StatusCounts;
  packages: PackageOption[];
}) {
  const tabs = [
    { value: undefined, label: 'All', count: counts.all },
    ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: counts[s] })),
  ];
  return (
    <div className="grid gap-3">
      <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
        {tabs.map((tab) => {
          const active = filters.status === tab.value;
          return (
            <Link
              key={tab.label}
              href={filterHref(filters, { status: tab.value })}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors ${
                active ? 'bg-ink text-white' : 'text-ink2 hover:bg-bg2'
              }`}
            >
              {tab.label} {tab.count}
            </Link>
          );
        })}
      </nav>

      <form method="get" action={INBOX_PATH} className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="q" className="sr-only">
            Search name or phone
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ''}
            placeholder="Search name or phone…"
            className="pl-9"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="type" className="text-xs font-bold text-mute">
            Type
          </label>
          <NativeSelect id="type" name="type" defaultValue={filters.type ?? ''}>
            <option value="">Any type</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <label htmlFor="packageId" className="text-xs font-bold text-mute">
            Package
          </label>
          <NativeSelect id="packageId" name="packageId" defaultValue={filters.packageId ?? ''}>
            <option value="">Any package</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <label htmlFor="from" className="text-xs font-bold text-mute">
            Received from
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="to" className="text-xs font-bold text-mute">
            to
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
        </div>
        {/* The status tab is a link, so carry it through the form rather than losing it. */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Link
          href={filterHref(filters, {
            q: undefined,
            type: undefined,
            packageId: undefined,
            from: undefined,
            to: undefined,
          })}
          className="px-2 py-1.5 text-sm font-bold text-mute hover:text-ink"
        >
          Clear
        </Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Write `web/src/components/admin/enquiries/Pager.tsx`**

```tsx
import Link from 'next/link';
import { filterHref, type Filters } from '@/lib/admin/enquiry-filters';

/** Numbered pages, windowed to seven so a year of enquiries does not wrap the footer (A6). */
export function pageWindow(page: number, totalPages: number, size = 7): number[] {
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), totalPages - size + 1));
  const from = Math.max(1, start);
  const count = Math.min(size, totalPages - from + 1);
  return Array.from({ length: count }, (_, i) => from + i);
}

export function Pager({
  filters,
  page,
  totalPages,
  total,
  shown,
}: {
  filters: Filters;
  page: number;
  totalPages: number;
  total: number;
  shown: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-mute">
      <span>
        Showing {shown} of {total} {total === 1 ? 'enquiry' : 'enquiries'}
      </span>
      {totalPages > 1 && (
        <nav className="flex gap-1 sm:ml-auto" aria-label="Pages">
          {pageWindow(page, totalPages).map((n) => (
            <Link
              key={n}
              href={filterHref(filters, { page: n })}
              aria-current={n === page ? 'page' : undefined}
              className={`min-w-8 rounded-md px-2 py-1 text-center font-bold ${
                n === page ? 'bg-ink text-white' : 'text-ink2 hover:bg-bg2'
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Replace the placeholder page** — `web/src/app/(admin)/admin/(shell)/enquiries/page.tsx`:

```tsx
import { Download } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { EnquiriesTable } from '@/components/admin/enquiries/EnquiriesTable';
import { InboxFilters } from '@/components/admin/enquiries/InboxFilters';
import { Pager } from '@/components/admin/enquiries/Pager';
import { buttonVariants } from '@/components/ui/button';
import { csvHref, parseFilters, toQuery } from '@/lib/admin/enquiry-filters';
import { api } from '@/lib/api';

export const metadata = { title: 'Enquiries' };

type SearchParams = Record<string, string | string[] | undefined>;

/** Mockup A6. Everything the owner filters by lives in the URL, so this page re-renders on the
 *  server for each view — nothing here is client state. */
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseFilters(await searchParams);
  const [inbox, catalogue] = await Promise.all([
    api('/admin/enquiries', { auth: true, searchParams: toQuery(filters) }),
    api('/admin/packages', { auth: true }),
  ]);
  const { counts } = inbox;
  return (
    <>
      <PageHead
        title="Enquiries"
        subtitle={`${counts.new} new · ${counts.contacted} contacted · ${counts.converted} converted`}
        actions={
          <Link
            href={csvHref(filters)}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            download
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </Link>
        }
      />
      <InboxFilters
        filters={filters}
        counts={counts}
        packages={catalogue.items.map((p) => ({ id: p.id, name: p.name }))}
      />
      <EnquiriesTable items={inbox.items} />
      <Pager
        filters={filters}
        page={inbox.page}
        totalPages={inbox.totalPages}
        total={inbox.total}
        shown={inbox.items.length}
      />
    </>
  );
}
```

- [ ] **Step 9: Run the web suite and the type check**

```bash
pnpm --filter web test
rm -rf web/.next && pnpm typecheck && pnpm lint
```

Expected: PASS — 190 baseline + 13 (Task 7) + 5 = **208**; typecheck and lint clean.

- [ ] **Step 10: Commit**

```bash
git add web/src/app/\(admin\)/admin/\(shell\)/enquiries/page.tsx web/src/components/admin/enquiries web/tests/enquiries-table.test.tsx
git commit -m "feat(F21): inbox screen — status tabs, filters, search, pager, CSV export (A6)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The enquiry detail screen (mockup A7)

**Files:**

- Create: `web/src/components/admin/enquiries/StatusPicker.tsx`, `NotesPanel.tsx`, `EnquiryFacts.tsx`, `RelatedEnquiries.tsx`
- Create: `web/src/app/(admin)/admin/(shell)/enquiries/[id]/page.tsx`
- Test: `web/tests/status-picker.test.tsx`, `web/tests/notes-panel.test.tsx`

**Interfaces:**

- Consumes: `adminRequest` from `@/lib/admin/client`, `reportAdminError` from `@/lib/admin/errors`, Task 7's link helpers and label maps, Task 8's `StatusBadge` / `monthLabel` / `partyLabel` / `phoneLabel`, `inr` and `formatDate` from `@/lib/format`, `getSession` from `@/lib/auth/session`.
- Produces: `StatusPicker({ id, status })`, `NotesPanel({ id, notes, ownerName })`, `EnquiryFacts({ enquiry })`, `RelatedEnquiries({ items })`.

- [ ] **Step 1: Write the failing tests** — create `web/tests/status-picker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusPicker } from '@/components/admin/enquiries/StatusPicker';

const refresh = vi.fn();
const adminRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/enquiries/enq_1',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  refresh.mockClear();
  adminRequest.mockReset();
});

describe('StatusPicker', () => {
  it('marks the current status as pressed', () => {
    render(<StatusPicker id="enq_1" status="contacted" />);
    expect(screen.getByRole('button', { name: 'Contacted' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'New' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('patches the api and refreshes so the sidebar badge follows', async () => {
    adminRequest.mockResolvedValue({});
    render(<StatusPicker id="enq_1" status="new" />);

    await userEvent.click(screen.getByRole('button', { name: 'Converted' }));

    expect(adminRequest).toHaveBeenCalledWith('/admin/enquiries/enq_1/status', {
      method: 'PATCH',
      body: { status: 'converted' },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('does not call the api for the status it is already on', async () => {
    render(<StatusPicker id="enq_1" status="new" />);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(adminRequest).not.toHaveBeenCalled();
  });
});
```

Create `web/tests/notes-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotesPanel } from '@/components/admin/enquiries/NotesPanel';

const refresh = vi.fn();
const adminRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/enquiries/enq_1',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const notes = [
  { id: 'n1', body: 'Status changed from New to Contacted', createdAt: '2026-09-22T06:12:00Z' },
  { id: 'n2', body: 'Called at 11:40 — no answer.', createdAt: '2026-09-22T06:14:00Z' },
];

afterEach(() => {
  refresh.mockClear();
  adminRequest.mockReset();
});

describe('NotesPanel', () => {
  it('renders the timeline with the signed-in owner as the author', () => {
    render(<NotesPanel id="enq_1" notes={notes} ownerName="Rohan" />);
    expect(screen.getByText('Called at 11:40 — no answer.')).toBeTruthy();
    expect(screen.getAllByText(/Rohan/).length).toBe(2);
  });

  it('posts a note and clears the box', async () => {
    adminRequest.mockResolvedValue({});
    render(<NotesPanel id="enq_1" notes={[]} ownerName="Rohan" />);
    const box = screen.getByLabelText('Add a note');

    await userEvent.type(box, 'Sent the itinerary');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(adminRequest).toHaveBeenCalledWith('/admin/enquiries/enq_1/notes', {
      method: 'POST',
      body: { body: 'Sent the itinerary' },
    });
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(refresh).toHaveBeenCalled();
  });

  it('will not post an empty note', async () => {
    render(<NotesPanel id="enq_1" notes={[]} ownerName="Rohan" />);
    expect(screen.getByRole('button', { name: 'Add note' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('says so when there is nothing on the timeline yet', () => {
    render(<NotesPanel id="enq_1" notes={[]} ownerName="Rohan" />);
    expect(screen.getByText('No notes yet.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test status-picker notes-panel`
Expected: FAIL — `Failed to resolve import "@/components/admin/enquiries/StatusPicker"`

- [ ] **Step 3: Write `web/src/components/admin/enquiries/StatusPicker.tsx`**

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { STATUSES, STATUS_LABELS, type EnquiryStatus } from '@/lib/admin/enquiry-filters';

/**
 * Mockup A7's one-click status control. `router.refresh()` afterwards re-renders the server
 * components, which is also what moves the sidebar's new-enquiry badge: it rides along on
 * `GET /auth/session` (F16), so nothing here needs to know the badge exists.
 */
export function StatusPicker({ id, status }: { id: string; status: EnquiryStatus }) {
  const router = useRouter();
  const pathname = usePathname();
  const [saving, setSaving] = useState<EnquiryStatus | null>(null);
  const [, startTransition] = useTransition();

  async function choose(next: EnquiryStatus) {
    if (next === status || saving) return;
    setSaving(next);
    try {
      await adminRequest(`/admin/enquiries/${id}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      toast.success(`Marked ${STATUS_LABELS[next].toLowerCase()}`);
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not change the status' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Enquiry status">
      {STATUSES.map((s) => {
        const active = s === status;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            disabled={saving !== null}
            onClick={() => void choose(s)}
            className={`rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-60 ${
              active ? 'bg-ink text-white' : 'bg-bg2 text-ink2 hover:bg-line'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write `web/src/components/admin/enquiries/NotesPanel.tsx`**

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { components } from '@/lib/api-types';

type Note = components['schemas']['EnquiryNoteOut'];

const NOTE_MAX = 2000;

/** `2026-09-22T06:14:00Z` → `22 Sep, 11:44 am` in IST — the owner's own clock. */
export function noteTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Mockup A7's append-only timeline. Status changes land here too — the api writes one in the
 * same transaction as the change — so calls and status moves read as a single history.
 *
 * `enquiry_notes` has no author column in v1 (single owner), so the signed-in name comes from
 * the session rather than from the row.
 */
export function NotesPanel({
  id,
  notes,
  ownerName,
}: {
  id: string;
  notes: Note[];
  ownerName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fieldId = useId();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await adminRequest(`/admin/enquiries/${id}/notes`, {
        method: 'POST',
        body: { body: trimmed },
      });
      setBody('');
      toast.success('Note added');
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not add the note' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3">
      {notes.length === 0 ? (
        <p className="text-sm text-mute">No notes yet.</p>
      ) : (
        <ol className="grid gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-card border border-line bg-bg2 p-3 text-sm">
              {n.body}
              <span className="mt-1 block text-xs text-mute">
                {ownerName} · {noteTime(n.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="grid gap-2">
        <label htmlFor={fieldId} className="text-xs font-bold text-mute">
          Add a note
        </label>
        <Textarea
          id={fieldId}
          rows={3}
          maxLength={NOTE_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened on the call?"
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={!body.trim() || saving} onClick={() => void submit()}>
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the two component tests to verify they pass**

Run: `pnpm --filter web test status-picker notes-panel`
Expected: PASS (7 tests)

- [ ] **Step 6: Write `web/src/components/admin/enquiries/EnquiryFacts.tsx`**

```tsx
import Link from 'next/link';
import { monthLabel, partyLabel, phoneLabel } from './EnquiriesTable';
import { TYPE_LABELS } from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';

type AdminEnquiry = components['schemas']['AdminEnquiry'];

const EMAIL_STATUS_LABELS: Record<AdminEnquiry['emailStatus'], string> = {
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Not sent',
};

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <small className="block text-xs text-mute">{label}</small>
      <b className="block text-sm">{children}</b>
    </div>
  );
}

/** Mockup A7's `.kvs` grid: everything the visitor submitted, in the order they typed it. */
export function EnquiryFacts({ enquiry: e }: { enquiry: AdminEnquiry }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Fact label="Name">{e.name}</Fact>
      <Fact label="Mobile">+91 {phoneLabel(e.phone)}</Fact>
      <Fact label="Email">{e.email}</Fact>
      <Fact label="Type">{TYPE_LABELS[e.type]}</Fact>
      <Fact label="Package">
        {e.package ? (
          <Link href={`/packages/${e.package.slug}`} className="text-primary" target="_blank">
            {e.package.name}
          </Link>
        ) : (
          '—'
        )}
      </Fact>
      <Fact label="Travel month">{monthLabel(e.travelMonth)}</Fact>
      <Fact label="Travellers">{partyLabel(e.adults, e.children)}</Fact>
      {e.budgetPaise !== null && <Fact label="Budget per person">{inr(e.budgetPaise)}</Fact>}
      {e.preferredDates && <Fact label="Preferred dates">{e.preferredDates}</Fact>}
      {e.changes && (
        <Fact label="Changes asked for" wide>
          <span className="font-medium">{e.changes}</span>
        </Fact>
      )}
      {e.message && (
        <Fact label="Message" wide>
          <span className="font-medium">{e.message}</span>
        </Fact>
      )}
      <Fact label="Emails">{EMAIL_STATUS_LABELS[e.emailStatus]} · owner and visitor</Fact>
      {/* No city: there is no geo lookup, and `ip_hash` is a hash the api never returns. */}
      <Fact label="Source">
        <span title={e.userAgent ?? undefined}>{e.device}</span>
      </Fact>
    </div>
  );
}
```

- [ ] **Step 7: Write `web/src/components/admin/enquiries/RelatedEnquiries.tsx`**

```tsx
import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { formatDate } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

type RelatedEnquiry = components['schemas']['RelatedEnquiry'];

/** A7's "other enquiries · same phone": a returning caller is the owner's best lead. */
export function RelatedEnquiries({ items }: { items: RelatedEnquiry[] }) {
  if (items.length === 0) return <p className="text-sm text-mute">None — first enquiry.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/admin/enquiries/${r.id}`} className="num font-bold text-primary">
            {r.ref}
          </Link>
          <span className="text-ink2">{r.packageName ?? 'General enquiry'}</span>
          <StatusBadge status={r.status} />
          <span className="ml-auto text-xs text-mute">{formatDate(r.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: Write the detail page** — `web/src/app/(admin)/admin/(shell)/enquiries/[id]/page.tsx`:

```tsx
import { ArrowLeft, Download, Mail, MessageCircle, Phone } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { EnquiryFacts } from '@/components/admin/enquiries/EnquiryFacts';
import { NotesPanel } from '@/components/admin/enquiries/NotesPanel';
import { RelatedEnquiries } from '@/components/admin/enquiries/RelatedEnquiries';
import { StatusPicker } from '@/components/admin/enquiries/StatusPicker';
import { buttonVariants } from '@/components/ui/button';
import { TYPE_LABELS } from '@/lib/admin/enquiry-filters';
import { emailSubject, mailtoHref, replyMessage, telHref, waHref } from '@/lib/admin/enquiry-links';
import { api, ApiRequestError } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import { duration, formatDate, inr } from '@/lib/format';

export const metadata = { title: 'Enquiry' };

/** Mockup A7. Two columns on a desktop: the enquiry and its timeline on the left, status and
 *  the trip on the right. */
export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  let enquiry;
  try {
    enquiry = await api('/admin/enquiries/{id}', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const reply = replyMessage(enquiry);
  const panel = 'grid gap-3 rounded-card border border-line bg-bg p-4';
  const heading = 'text-sm font-extrabold';
  return (
    <>
      <PageHead
        title={`${enquiry.ref} · ${enquiry.name}`}
        subtitle={`${TYPE_LABELS[enquiry.type]} enquiry${
          enquiry.package ? ` · ${enquiry.package.name}` : ''
        } · received ${formatDate(enquiry.createdAt)}`}
        actions={
          <>
            <a
              href={telHref(enquiry.phone)}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Phone className="size-4" aria-hidden />
              Call
            </a>
            <a
              href={waHref(enquiry.phone, reply)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
            <a
              href={mailtoHref(enquiry.email, emailSubject(enquiry))}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Mail className="size-4" aria-hidden />
              Email
            </a>
            <Link
              href="/admin/enquiries"
              className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Inbox
            </Link>
          </>
        }
      />

      <div className="grid gap-3.5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="grid gap-3.5">
          <section className={panel}>
            <h2 className={heading}>Enquiry</h2>
            <EnquiryFacts enquiry={enquiry} />
          </section>
          <section className={panel}>
            <h2 className={heading}>
              Notes <span className="font-semibold text-mute">· append-only</span>
            </h2>
            <NotesPanel
              id={enquiry.id}
              notes={enquiry.notes}
              ownerName={session?.user.name ?? 'Owner'}
            />
          </section>
        </div>

        <div className="grid gap-3.5">
          <section className={panel}>
            <h2 className={heading}>Status</h2>
            <StatusPicker id={enquiry.id} status={enquiry.status} />
            <p className="text-xs text-mute">Every change is added to the notes below.</p>
          </section>

          {enquiry.package && (
            <section className={panel}>
              <h2 className={heading}>Trip</h2>
              {enquiry.package.coverUrl && (
                <span className="relative block h-32 overflow-hidden rounded-card bg-line">
                  <Image
                    src={enquiry.package.coverUrl}
                    alt=""
                    fill
                    sizes="320px"
                    className="object-cover"
                  />
                </span>
              )}
              <b className="text-sm">{enquiry.package.name}</b>
              <span className="text-[13px] text-mute">
                {duration(enquiry.package.nights, enquiry.package.days)}
                {enquiry.package.startingPricePaise > 0 &&
                  ` · from ${inr(enquiry.package.startingPricePaise)}`}
              </span>
              <a
                href={`/api/packages/${enquiry.package.slug}/itinerary.pdf`}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                <Download className="size-4" aria-hidden />
                Itinerary PDF
              </a>
            </section>
          )}

          <section className={panel}>
            <h2 className={heading}>Other enquiries · same phone</h2>
            <RelatedEnquiries items={enquiry.related} />
          </section>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 9: Run the full web suite, typecheck and lint**

```bash
pnpm --filter web test
rm -rf web/.next && pnpm typecheck && pnpm lint
```

Expected: PASS — **215** vitest tests (208 + 7), typecheck and lint clean.

- [ ] **Step 10: Commit**

```bash
git add web/src/app/\(admin\)/admin/\(shell\)/enquiries web/src/components/admin/enquiries web/tests/status-picker.test.tsx web/tests/notes-panel.test.tsx
git commit -m "feat(F21): enquiry detail — facts, status picker, notes timeline, same-phone panel (A7)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Browser walk-through, docs, PR

**Files:**

- Modify: `docs/07-plan.md` (row F21 → 🟢), `docs/06-data-and-api.md` (§C-REST line 287)

**Interfaces:** none — this task ships what Tasks 1–9 built.

- [ ] **Step 1: Start the stack against the local database**

```bash
cp api/.env.local .worktrees/f21-enquiries-inbox/api/.env.local   # if not already copied
# In api/.env.local (worktree copy only) override:
#   DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_dev
#   WEB_URL=http://localhost:3010
#   SITE_URL=http://localhost:3010
uv run --directory api uvicorn app.main:app --port 8010 --reload
API_URL=http://localhost:8010 pnpm --filter web exec next dev -p 3010
```

Ports 3000 and 8000 belong to Zapigo processes on this machine — never kill them, never bind them.

- [ ] **Step 2: Seed a handful of enquiries to work with**

```bash
uv run --directory api python - <<'PY'
import asyncio, datetime as dt, random
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.models import Enquiry, Package
from app.models.enums import EnquiryStatus, EnquiryType
from sqlalchemy import select

URL = "postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_dev"
NAMES = [("Priya Sharma","9845022110"),("Anirudh S","9980041234"),("Meghna T","9000077812"),
         ("Rohit & Neha","9811103345"),("Sanjay Patel","9825010098")]

async def main() -> None:
    engine = create_async_engine(URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        packages = (await db.execute(select(Package))).scalars().all()
        for i in range(60):
            name, phone = NAMES[i % len(NAMES)]
            pkg = random.choice(packages) if i % 7 else None
            db.add(Enquiry(
                ref=f"TS-DEV{i:03d}",
                type=EnquiryType.CONTACT if pkg is None else EnquiryType.STANDARD,
                package_id=pkg.id if pkg else None, name=name, phone=phone,
                email=f"{name.split()[0].lower()}@example.in",
                travel_month=dt.date.today().replace(day=1) + dt.timedelta(days=60),
                adults=2, children=i % 3, status=random.choice(list(EnquiryStatus)),
                message="=1+1 formula test" if i == 0 else "Landing at 9 am, early check-in?",
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
            ))
        await db.commit()
    await engine.dispose()

asyncio.run(main())
PY
```

- [ ] **Step 3: Walk the screens in a real browser with the console open**

Four of F18's seven bugs were invisible to a green test suite. Chrome's Issues panel is what found them. Check, and note anything wrong before moving on:

- Sign in at `http://localhost:3010/admin/login`, open Enquiries. Tabs switch and the URL changes; the count on each tab matches the rows.
- Filter by package and a date range, then switch tabs — the other filters survive, and the counts reflect the narrowed view.
- Search `9845` and `Priya`; both find rows. Search `%` finds nothing rather than everything.
- Page 2 loads, the pager marks the current page, and changing any filter returns to page 1.
- **Disable JavaScript** and repeat: tabs, Apply, Clear and the pager all still work.
- Open an enquiry. Change the status twice — the badge moves, a note appears each time, the sidebar count changes, and re-selecting the same status adds nothing.
- Add a note; it appears with the owner's name and an IST time.
- Call / WhatsApp / Email open with the right number, prefilled text and subject.
- **Console and Issues panel are clean** — no hydration mismatch, no misused label, no missing `alt`.

- [ ] **Step 4: Open the CSV in a spreadsheet**

Click Export CSV with a filter applied. Confirm: the filename carries today's date; the file opens in Excel or LibreOffice with ₹ and Indian names intact; the row count matches the filtered view, not the page; and the enquiry whose message is `=1+1 formula test` shows the text, not `2`.

- [ ] **Step 5: Update the docs**

In `docs/07-plan.md`, turn the F21 row's 🔴 into 🟢. In `docs/06-data-and-api.md` §C-REST, replace the enquiries row with the query the inbox actually takes:

```markdown
| v1 | `GET /admin/enquiries?status=&type=&packageId=&from=&to=&q=&page=` (server-side filter, name/phone search, 50 per page) · `GET /admin/enquiries/:id` · `PATCH /admin/enquiries/:id/status` (auto-appends a note) · `POST /admin/enquiries/:id/notes` · `GET /admin/enquiries.csv` (streamed, UTF-8 BOM, honours the filters) | enquiries | owner |
```

- [ ] **Step 6: Run every gate**

```bash
TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest -q
pnpm --filter web test
pnpm lint && pnpm typecheck
uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright
git diff --exit-code api/openapi.json web/src/lib/api-types.ts   # `pnpm gen:api` already committed
```

Expected: ~405 pytest, 215 vitest, every gate clean.

- [ ] **Step 7: Request a code review**

REQUIRED SUB-SKILL: `superpowers:requesting-code-review` before opening the PR, then `/code-review <pr> high` once it is open.

- [ ] **Step 8: Commit the docs and open the PR**

```bash
git add docs/07-plan.md docs/06-data-and-api.md docs/superpowers/plans/2026-09-22-f21-enquiries-inbox.md
git commit -m "docs(F21): enquiries inbox shipped — 07-plan row green, C-REST query documented

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/f21-enquiries-inbox
gh pr create --title "feat(F21): enquiries inbox — filters, detail, notes, CSV export" --body "$(cat <<'BODY'
Milestone 1.3 Manage, row F21. Mockups A6 (inbox) and A7 (detail).

**api** — `services/admin_enquiries.py` + `routers/admin/enquiries.py`: server-side filtering,
name-or-phone search, IST business-day date range, 50 per page, tab counts computed with every
filter except status, append-only notes, status changes that auto-append their own note, and a
streamed CSV with a UTF-8 BOM that is safe against formula injection. No migration — the tables
and indexes have been there since S10.

**web** — `/admin/enquiries` and `/admin/enquiries/[id]`. All filter state lives in the URL, so
every view is linkable and the whole inbox works with JavaScript off; only the status picker and
the note composer are client components.

Verified in the browser with the console open, and the export opened in a spreadsheet.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 9: Merge after review**

`gh pr merge <n> --squash` alone on its own line — the auto-mode classifier blocks it inside a
compound command, and it prints a harmless "'main' is already used by worktree" then exits 1.
Confirm with `gh pr view <n> --json state`. Then verify on production: sign in, open the inbox,
change a status, download the CSV. Vercel deploys after a squash-merge can sit queued for up to
~20 minutes — check `vercel ls tripsmith-api` and wait rather than redeploying.

---

## Self-review

**Spec coverage** — every clause of 07-plan row F21 and the six A6/A7 behaviours map to a task:

| Spec requirement | Task |
|---|---|
| `/admin/enquiries` table with status / type / package / date filters | 2, 8 |
| Name-phone search | 2, 8 |
| 50 per page, numbered pager | 2, 8 |
| `/admin/enquiries/[id]` detail with every submitted field | 3, 9 |
| One-click status | 4, 6, 9 |
| Append-only notes | 3, 4, 6, 9 |
| `mailto:` + WhatsApp + call links | 7, 9 |
| Export CSV button | 5, 6, 8 |
| `GET /admin/enquiries`, `GET …/:id`, `PATCH …/status`, `POST …/notes`, `GET …csv` | 6 |
| Acceptance: "CSV opens correctly in Excel" | 5 (BOM, CRLF, quoting), 10 step 4 (opened for real) |
| Tab counts ignore the status filter | 2 |
| Same-phone panel (A7) | 3, 9 |
| `ip_hash` never exposed | 1, 3 |
| No revalidate anywhere | 2 (module docstring), enforced by the absence of the import |

**Type consistency** — `EnquiryFilters.from_`/alias `from` is used identically in Tasks 1, 2, 5 and 6; `AdminEnquiry` is the single response shape for detail, status and notes (Tasks 3, 4, 6, 9); `STATUS_LABELS` exists once per side (`admin_enquiries.py` and `enquiry-filters.ts`) and the CSV reuses the Python one; `monthLabel`/`partyLabel`/`phoneLabel` are defined once in `EnquiriesTable.tsx` and imported by `EnquiryFacts.tsx`.

**Known trade-offs, deliberately accepted**

- Offset paging drifts if an enquiry arrives while the owner is on page 3. Keyset paging would fix it and cost a cursor in every URL; at one enquiry an hour, it is not worth it.
- The inbox page makes two api calls (enquiries + packages, in parallel) so the package filter can list names. A dedicated `packages` field on the list response would save one round-trip and couple two things that do not belong together.
- The CSV holds the whole filtered set in memory before streaming. `CSV_MAX_ROWS = 10_000` bounds it; a true cursor stream would need a session that outlives the handler.
