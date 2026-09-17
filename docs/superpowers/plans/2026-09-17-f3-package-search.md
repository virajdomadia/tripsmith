# F3 — Package search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor opens `/packages` on production, narrows the catalog by destination, budget, nights, theme and travel month, sorts it, sees the result count, shares the URL (which renders the same results server-side), and gets a useful empty state — with every filter decision made in one server function, `search_packages(params)`, that the v3 AI tool will call unchanged.

**Architecture:** `GET /packages` grows a pydantic query model (`SearchParams`) and returns `{ items, total, facets }`; `services/catalog/search.py` applies the filters as SQLAlchemy `where` clauses (month = an `EXISTS` over upcoming departures joined to the `departure_availability` view) and computes the facets (the destinations, months and ranges the filter panel offers — derived from the live catalog, never hard-coded). On the web, the URL *is* the state: `lib/search.ts` parses Next's `searchParams` into a `SearchQuery`, forwards it to the api, and serialises it back canonically. The page is a server component; the filter rail and toolbar are client islands that change the URL with `router.replace` inside one `useTransition`, which re-renders the server page with the new results — no reload, no client-side fetch, no duplicated data path. Without JS the rail is a plain GET form to the same URLs.

**Tech Stack:** FastAPI 0.141 (query-parameter models) + SQLAlchemy 2.0 async + pydantic v2 + pytest (`db` marker) · Next.js 15 App Router + React 19 (`useTransition`) + Tailwind 4 tokens + vitest. No new dependencies on either side.

**Spec:** `docs/07-plan.md` row **F3** (milestone 1.1); `docs/03-requirements.md` §R3 (the requirement + acceptance); `docs/06-data-and-api.md` §C1 `searchPackages` (the param/return contract), §C0 (`Cache-Control`, blank query params), §C6/§C-tools (the v3 tool reuses this function); `mockups/screens.html` **S4** + **S4b** (the visual reference — open it in a browser while building Tasks 5–6); `docs/04-ui-mockups.md` (K tokens).

## Global Constraints

- One branch, one PR: `f3-package-search` (worktree `.worktrees/f3-package-search`, created from `origin/main` = `c94c71a`). Never touch the main checkout; never bare `git stash`. Fix review findings on the same branch. Squash-merge at the end.
- Python `>=3.12,<3.13`, ruff line length 100, rules E/F/I/B/UP, pyright basic — `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright` stays green. `uv` is not on the bash PATH: prefix commands with `export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"`.
- JSON on the wire is camelCase (`ApiModel` alias generator); Python is snake_case. Every request/response model extends `app.schemas.ApiModel`. **Query-string names are the camelCase aliases** (`maxBudget`, `nightsMin`, `nightsMax`), exactly as 06 C1 spells them.
- Every public GET sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (`PUBLIC_CACHE_CONTROL`). Errors are the envelope `{ error: { code, message, fieldErrors? } }`; bad query values are `400 validation` with a `fieldErrors` key per offending param. Blank params (`?month=`) are stripped by `BlankQueryParamsMiddleware` and mean "not provided".
- Money: **responses are integer paise; the `maxBudget` query param is whole rupees** (URLs are typed and shared by people; the v3 tool will pass what a traveller says). Facet `budget.min/max` are rupees too, for the same slider.
- Badge rules stay in `services/catalog/pricing.py`; `seats_left` always comes from the `departure_availability` view; departures before today never count; draft packages never match anything.
- Contract files `api/openapi.json` and `web/src/lib/api-types.ts` are generated (`pnpm gen:api`), committed and freshness-tested — regenerate after Task 2, never hand-edit.
- Web: no new UI libraries. Every colour/radius/shadow comes from `globals.css` tokens via Tailwind utilities — no hex values in components. Tabular numerals (`num`) on every price and count. `prefers-reduced-motion` renders everything at rest. Native form controls (`accent-primary`) rather than hand-built checkboxes — lean, accessible, keyboardable.
- Tests only where a bug would embarrass in a demo: the filter matrix, sort, facets, query validation (pytest); URL parse/serialise round trip and chips (vitest). No tests for layout.
- Copy: the listing is "Holiday packages"; counts read "6 packages" / "1 package" (S4 toolbar). No enquiry CTA anywhere yet — S4b's "Ask us for options" waits for F9.

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| List params (`destination`, `themes`) | **Any-of** within a list; **AND** across different params. `?destination=goa&destination=kerala&themes=beach` = (Goa or Kerala) and beach. |
| `maxBudget` compares against | `packages.starting_price_paise` (cheapest upcoming double-sharing price, cached). `≤ maxBudget × 100`, inclusive. A package "on request" (`starting_price_paise = 0`) never satisfies a budget. |
| `month` semantics | The package has **≥ 1 departure dated inside that month, on/after today, with `seats_left > 0`** (R3's wording, via the view). A past month matches nothing. |
| Nights | Inclusive range `nightsMin ≤ nights ≤ nightsMax`, either side optional; `nightsMax < nightsMin` is a 400 on the api, silently swapped by the web parser. |
| Sort | `price-asc` (default) · `price-desc` · `duration` (fewest nights first, then price). "On request" (price 0) always sinks to the bottom; `name` breaks ties so the order is stable. |
| `total` | `len(items)` — no pagination in v1 (12 packages). |
| Facets | New `facets` object on `PackageList`: destinations (with counts), all six themes (with counts), upcoming months that have a departure with seats (with counts), nights `{min,max}`, budget `{min,max}` in rupees rounded out to ₹1,000. **Counts are for the whole live catalog, not narrowed by the current filter** (one query set, no drill-down math). The panel's options come from here — nothing is hard-coded on the web. |
| Web URL scheme | Same names as the api (`/packages?destination=goa&themes=beach&month=2026-12&maxBudget=20000&nightsMin=3&nightsMax=5&sort=duration`), so the page forwards them 1:1. Serialised in canonical order with defaults omitted → equal queries produce equal URLs (shareable, one cache entry each). |
| "Results update without full reload" | `router.replace(href, { scroll: false })` inside `useTransition`. The server page re-renders with the new `searchParams`; results dim (`aria-busy`) while pending. One code path serves first render, shared links and live updates. `replace`, not `push`: filter twiddles are not history entries. |
| Crawlability | `/packages` is indexable. Filtered variants carry `robots: noindex, follow` and `canonical: /packages` — shareable, but not duplicate content. |
| Inline search bar (S4 shows F6's home search form above the rail) | **Not built here.** It duplicates the rail's destination/month/budget and its "travellers" field is not a search param. F6 builds that form on the home page; it will submit to `/packages?…`. |
| Nights control | Two selects (From / To) fed by `facets.nights`, not S4's bucket checkboxes — the contract is a range, and two selects map to it without ambiguity. |
| Phone layout | Rail collapses under a "Filters (n)" button above the grid (S4 note); always visible from `lg:`. |
| Empty state | S4b: dashed box, a specific hint (mentions the month when one is set), "Clear filters", then "Try one of these instead" = the three cheapest live packages (a second, unfiltered `/packages` fetch only in this branch). |
| Header | `SiteHeader` gains **Trips → `/packages`** (its comment reserved this for F3). |
| Motion signature | Result cards rise in with a 60 ms stagger (`animate-rise`, CSS keyframes, off under reduced motion), re-triggered on every result change by re-keying the grid. |

---

## Local environment (do once, before Task 1)

The worktree has no `.env.local` files and the pytest `db` tests need a Postgres. The throwaway cluster from the F1 session lived in that session's scratchpad — recreate one from the installed PG 18 (the `postgres` password in `.env.local` does not match it).

Dev servers from the F1 session may still hold ports 3000/8000. Free them first (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Then (bash):

```bash
cd "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/.worktrees/f3-package-search"
cp ../../api/.env.local api/.env.local && cp ../../web/.env.local web/.env.local
export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
PG="/c/Program Files/PostgreSQL/18/bin"
export PGDATA="$SCRATCHPAD/pg"   # $SCRATCHPAD = the session scratchpad directory from the system prompt
"$PG/initdb" -U tripsmith -A trust -E UTF8 -D "$PGDATA" >/dev/null
```

`pg_ctl -w start` hangs the bash tool — start it with `run_in_background: true` as its own call:

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_ctl" -D "$PGDATA" -o "-p 5499" -l "$PGDATA/log" start
```

Then:

```bash
"$PG/createdb" -p 5499 -U tripsmith tripsmith_test
"$PG/createdb" -p 5499 -U tripsmith tripsmith_dev
export TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_test
export DEV_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_dev
cd api && ALEMBIC_URL=$DEV_URL uv run alembic upgrade head && uv run python scripts/seed.py --local --database-url $DEV_URL && cd ..
pnpm install --frozen-lockfile
uv run --directory api pytest -q     # baseline: 90 passed
pnpm --filter web test               # baseline: 34 passed
```

Run the dev api against the local DB (background call): `DATABASE_URL=$DEV_URL uv run --directory api uvicorn app.main:app --reload --port 8000`, and web: `pnpm --filter web dev`. Kill by port afterwards — never `taskkill //IM node.exe`.

Commit this plan as the branch's first commit before Task 1:

```bash
git add docs/superpowers/plans/2026-09-17-f3-package-search.md
git commit -m "docs(F3): implementation plan for package search"
```

---

## File structure

**api/**
- Modify `app/schemas/catalog.py` — `SortOrder`, `SearchParams` (query model + `nightsMax ≥ nightsMin` validator), `FacetOption`, `RangeFacet`, `SearchFacets`; `PackageList` gains `facets`; `MONTH_PATTERN` moves here from the router.
- Modify `app/services/catalog/search.py` — `search_packages(db, params, *, today) -> PackageList`; pure `apply_filters`, `sort_order`, `month_label`, `budget_range`; `seat_available_departures`; `search_facets`.
- Modify `app/routers/site/catalog.py` — `GET /packages` takes `Annotated[SearchParams, Query()]`; imports `MONTH_PATTERN` from schemas.
- Create `tests/test_search.py` — pure helpers + the filter matrix over the two seeded Goa trips plus one inserted Kerala trip.
- Regenerate `openapi.json` → `web/src/lib/api-types.ts`.

**web/**
- Modify `src/lib/api.ts` — `searchParams` accepts `string[]` (appended once per value).
- Create `src/lib/search.ts` — `SearchQuery`, `parseSearchQuery`, `toSearchParams`, `searchHref`, `toApiSearchParams`, `isFiltered`, `activeChips`, `nightsLabel`, `monthLabel`, `resultCount`, `SORT_LABEL`, `THEMES`, `EMPTY_QUERY`.
- Create `src/app/(site)/packages/page.tsx` — the server page + `generateMetadata`.
- Create `src/components/site/packages/` — `SearchTransition.tsx` (client: context, `Results`, `NavLink`), `FilterPanel.tsx` (client), `ResultsToolbar.tsx` (client), `ResultsGrid.tsx`, `EmptyState.tsx`.
- Modify `src/components/site/SiteHeader.tsx` (Trips link), `src/app/globals.css` (`animate-rise`).
- Tests: `tests/api.test.ts` (+1), create `tests/search.test.ts`.

**docs/**
- Modify `docs/07-plan.md` — mark `F1+F2 ✅ PR #20 + #21` (the F1 plan deferred this mark to the next feature's PR).

---

### Task 1: Search schemas — `SearchParams`, `SortOrder`, facets, pure helpers

**Files:**
- Modify: `api/app/schemas/catalog.py`
- Modify: `api/app/services/catalog/search.py` (pure helpers only in this task)
- Modify: `api/app/routers/site/catalog.py` (only `MONTH_PATTERN` import)
- Test: `api/tests/test_search.py` (pure part)

**Interfaces:**
- Produces: `MONTH_PATTERN: str`; `SortOrder(StrEnum)` = `PRICE_ASC "price-asc"`, `PRICE_DESC "price-desc"`, `DURATION "duration"`; `SearchParams(ApiModel)` with `destination: list[str]`, `max_budget: int | None` (rupees, `> 0`), `nights_min/nights_max: int | None` (`1..30`, max ≥ min), `themes: list[Theme]`, `month: str | None` (`YYYY-MM`), `sort: SortOrder`; `FacetOption(value: str, label: str, count: int)`; `RangeFacet(min: int, max: int)`; `SearchFacets(destinations, themes, months: list[FacetOption], nights, budget: RangeFacet)`; `PackageList(items, total, facets: SearchFacets)`; pure `month_label(month: str) -> str`, `budget_range(cheapest_paise: int | None, priciest_paise: int | None) -> RangeFacet`, `sort_order(sort: SortOrder) -> tuple[Any, ...]` (SQL order-by clauses).

- [ ] **Step 1: Write the failing tests (pure part)**

Create `api/tests/test_search.py`:

```python
"""F3 package search: `search_packages` filter matrix, sort, facets and the GET /packages query
params (03 R3, 06 C1). The same function feeds the v3 AI tool, so the matrix is thorough."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Destination, Package
from app.models.enums import PackageStatus, Theme
from app.schemas.catalog import RangeFacet, SearchParams, SortOrder
from app.services.catalog.search import budget_range, month_label, search_packages
from content import load_content
from scripts.seed import seed
from tests.settings import make_settings
from tests.test_catalog import RecordingStore

NGB, GQE, KER = "north-goa-beaches", "goa-quiet-escape", "kerala-backwaters"
CACHE = "public, s-maxage=60, stale-while-revalidate=300"


# --- pure helpers -------------------------------------------------------------------------------


def test_month_label() -> None:
    assert month_label("2026-11") == "November 2026"
    assert month_label("2027-01") == "January 2027"


def test_budget_range_rounds_out_to_the_nearest_thousand_rupees() -> None:
    assert budget_range(14_499_00, 21_499_00) == RangeFacet(min=14_000, max=22_000)
    assert budget_range(10_000_00, 10_000_00) == RangeFacet(min=10_000, max=10_000)
    assert budget_range(None, None) == RangeFacet(min=0, max=0)
    assert budget_range(0, 0) == RangeFacet(min=0, max=0)  # every package "on request"


def test_search_params_validates_the_nights_range_and_reads_camel_case() -> None:
    with pytest.raises(ValueError, match="nightsMin"):
        SearchParams(nights_min=5, nights_max=3)
    assert SearchParams(nights_min=3, nights_max=3).nights_max == 3
    params = SearchParams.model_validate({"maxBudget": 20000, "sort": "duration"})
    assert (params.max_budget, params.sort) == (20000, SortOrder.DURATION)
    assert SearchParams().sort is SortOrder.PRICE_ASC
```

(The imports `AsyncClient`, `update`, `AsyncSession`, `Departure`, `Destination`, `Package`, `PackageStatus`, `Theme`, `search_packages`, `load_content`, `seed`, `make_settings`, `RecordingStore`, `dt`, `NGB/GQE/KER`, `CACHE` are used by Task 2's tests — ruff F401 will complain until then; that is fine for the two minutes between the steps, or add `# noqa: F401` temporarily and remove it in Task 2.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_search.py -q`
Expected: `ImportError` — `RangeFacet` / `SearchParams` / `budget_range` do not exist yet.

- [ ] **Step 3: Add the schemas**

In `api/app/schemas/catalog.py`, change the imports and add the search models. Replace the top of the file through `PackageList` with:

```python
"""Catalog response models (06 C, Part D) and the `GET /packages` query model."""

import datetime as dt
from enum import StrEnum

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import Theme
from app.schemas import ApiModel
from app.schemas.meta import Badge

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
NIGHTS_MAX = 30


class SortOrder(StrEnum):
    PRICE_ASC = "price-asc"
    PRICE_DESC = "price-desc"
    DURATION = "duration"


class SearchParams(ApiModel):
    """R3 filters for `search_packages` — also the v3 `searchPackages` tool's argument schema.

    Lists are any-of; different fields AND together. The query is typed by people, so money is
    whole rupees here (responses stay paise).
    """

    destination: list[str] = Field(default_factory=list, description="Destination slugs; any of")
    max_budget: int | None = Field(
        default=None, gt=0, description="Maximum starting price per person, in rupees"
    )
    nights_min: int | None = Field(default=None, ge=1, le=NIGHTS_MAX)
    nights_max: int | None = Field(default=None, ge=1, le=NIGHTS_MAX)
    themes: list[Theme] = Field(default_factory=list, description="Any of")
    month: str | None = Field(
        default=None,
        pattern=MONTH_PATTERN,
        description="YYYY-MM: packages with a departure that month that still has seats",
    )
    sort: SortOrder = Field(default=SortOrder.PRICE_ASC)

    @field_validator("nights_max")
    @classmethod
    def _not_below_nights_min(cls, value: int | None, info: ValidationInfo) -> int | None:
        nights_min = info.data.get("nights_min")
        if value is not None and nights_min is not None and value < nights_min:
            raise ValueError("must be at least nightsMin")
        return value


class PackageCard(ApiModel):
    slug: str
    name: str
    destination: str = Field(description="Destination display name")
    nights: int
    days: int
    starting_price_paise: int
    themes: list[Theme]
    cover_url: str | None
    highlights: list[str]
    badge: Badge | None = Field(description="From the next upcoming departure")


class FacetOption(ApiModel):
    value: str
    label: str
    count: int = Field(description="Live packages in the whole catalog (not the current filter)")


class RangeFacet(ApiModel):
    min: int
    max: int


class SearchFacets(ApiModel):
    """What the filter panel offers — derived from the live catalog, never hard-coded."""

    destinations: list[FacetOption] = Field(description="value = slug; display order")
    themes: list[FacetOption] = Field(description="Every theme in enum order; count may be 0")
    months: list[FacetOption] = Field(
        description="value = YYYY-MM; upcoming months with a departure that has seats, soonest first"
    )
    nights: RangeFacet = Field(description="Shortest / longest live package; 0/0 when none")
    budget: RangeFacet = Field(
        description="Cheapest / priciest starting price in rupees, rounded out to 1,000; 0/0 if none"
    )


class PackageList(ApiModel):
    items: list[PackageCard]
    total: int
    facets: SearchFacets
```

Everything below `PackageList` in the file (`DestinationRef` … `DestinationDetail`) stays exactly as it is.

- [ ] **Step 4: Add the pure helpers to `search.py`**

Replace `api/app/services/catalog/search.py` entirely (Task 2 fills in the rest of this file; this version keeps the S11 behaviour of `search_packages` so `test_catalog.py` stays green in between):

```python
"""`search_packages` — the single filter function the site, the sitemap and (v3) the AI reuse
(03 R3, 06 C1).

Filters are `where` clauses over live packages; the travel month is an EXISTS over upcoming
departures joined to the `departure_availability` view. Facets describe the whole live catalog
so the filter panel offers only real destinations, months and ranges.
"""

import calendar
import datetime as dt
import math
from typing import Any

from sqlalchemy import func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Package
from app.models.enums import PackageStatus
from app.schemas.catalog import PackageCard, RangeFacet, SortOrder
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card

BUDGET_STEP_RUPEES = 1_000


def month_label(month: str) -> str:
    """`'2026-11'` -> `'November 2026'` (the format was validated upstream)."""
    year, mon = month.split("-")
    return f"{calendar.month_name[int(mon)]} {year}"


def budget_range(cheapest_paise: int | None, priciest_paise: int | None) -> RangeFacet:
    """Slider bounds in rupees, rounded out to ₹1,000 so every real price sits inside them."""
    if not cheapest_paise or not priciest_paise:
        return RangeFacet(min=0, max=0)
    step = BUDGET_STEP_RUPEES
    return RangeFacet(
        min=math.floor(cheapest_paise / 100 / step) * step,
        max=math.ceil(priciest_paise / 100 / step) * step,
    )


def sort_order(sort: SortOrder) -> tuple[Any, ...]:
    """ORDER BY clauses. "On request" (price 0) sinks to the bottom whichever way prices go;
    `name` breaks ties so the order is stable between requests."""
    price = func.nullif(Package.starting_price_paise, 0)
    match sort:
        case SortOrder.PRICE_DESC:
            return (nulls_last(price.desc()), Package.name)
        case SortOrder.DURATION:
            return (Package.nights, nulls_last(price.asc()), Package.name)
        case _:
            return (nulls_last(price.asc()), Package.name)


async def search_packages(db: AsyncSession, *, today: dt.date | None = None) -> list[PackageCard]:
    today = today or dt.date.today()
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.status == PackageStatus.LIVE)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
                .order_by(*sort_order(SortOrder.PRICE_ASC))
            )
        )
        .scalars()
        .all()
    )
    upcoming = await next_departures(db, today)
    return [package_card(p, upcoming.get(p.id)) for p in packages]
```

- [ ] **Step 5: Point the router's `MONTH_PATTERN` at the schema**

In `api/app/routers/site/catalog.py`, delete the line `MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"` and add `MONTH_PATTERN` to the `app.schemas.catalog` import:

```python
from app.schemas.catalog import (
    MONTH_PATTERN,
    DepartureList,
    DestinationDetail,
    DestinationList,
    PackageDetail,
    PackageList,
)
```

The router still builds `PackageList(items=items, total=len(items))` — `facets` is now required, so pyright flags it and the three `GET /packages` tests in `test_catalog.py` are **red until Task 2 Step 4** replaces that route body. Run only the pure tests in this task (Step 6); the full suite is green again at Task 2 Step 5.

- [ ] **Step 6: Run the pure tests**

Run: `uv run --directory api pytest tests/test_search.py -q -k "month_label or budget_range or search_params"`
Expected: 3 passed.

- [ ] **Step 7: Format + commit (optional intermediate)**

Run: `uv run --directory api ruff format .` (`ruff check` reports F401 for the Task-2 imports in the test file until Task 2 — either add `# noqa: F401` to those import lines for now and drop it in Task 2, or skip this commit and commit once at the end of Task 2.)

```bash
git add api/app/schemas/catalog.py api/app/services/catalog/search.py api/app/routers/site/catalog.py api/tests/test_search.py
git commit -m "feat(F3): SearchParams, SortOrder and facet schemas; pure sort/label helpers"
```

---

### Task 2: `search_packages(params)` — filters, sort, facets, `GET /packages` query params

**Files:**
- Modify: `api/app/services/catalog/search.py`
- Modify: `api/app/routers/site/catalog.py:31-35`
- Test: `api/tests/test_search.py` (the `db` matrix)

**Interfaces:**
- Consumes: `SearchParams`, `SortOrder`, `SearchFacets`, `FacetOption`, `RangeFacet`, `PackageList`, `month_label`, `budget_range`, `sort_order` (Task 1); `month_bounds` (`services/catalog/reads.py`); `departure_availability` (`models/catalog.py`); `next_departures`, `package_card`.
- Produces: `async search_packages(db: AsyncSession, params: SearchParams | None = None, *, today: dt.date | None = None) -> PackageList`; pure `apply_filters(stmt: Select[tuple[Package]], params: SearchParams, today: dt.date) -> Select[tuple[Package]]`; `seat_available_departures(today: dt.date) -> Select[tuple[str]]`; `async search_facets(db, today) -> SearchFacets`. Route `GET /packages?destination=&maxBudget=&nightsMin=&nightsMax=&themes=&month=&sort=` → `PackageList`.

- [ ] **Step 1: Write the failing tests (the matrix)**

Append to `api/tests/test_search.py`:

```python
# --- fixture: the two seeded Goa trips + one Kerala trip ----------------------------------------
#
# NGB  North Goa Beaches   3N  ₹14,499  beach+family      Nov 20 (16) · Dec 18 (4) · Jan 15 (16) · Feb 12 (12)
# GQE  Goa Quiet Escape    4N  ₹21,499  beach+honeymoon   Nov 27 (12) · Dec 24 (10) · Jan 22 (12)
# KER  Kerala Backwaters   5N  ₹24,999  honeymoon+heritage  Dec 5 (8) · Jan 9 (0 — sold out)
#
# Like F1's tests these assume today < 2026-11-20 (the seed content moves forward in F4+F5).


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, load_content(), RecordingStore(), make_settings())
    kerala = Destination(
        slug="kerala",
        name="Kerala",
        tagline="Backwaters, tea hills and a slower pace",
        intro="Houseboats on Vembanad, tea at Munnar.",
        cover_url="https://blob.test/destinations/kerala.jpg",
        region="South India",
        best_months=[10, 11, 12, 1, 2],
        position=2,
    )
    db.add(kerala)
    await db.flush()
    package = Package(
        slug=KER,
        destination_id=kerala.id,
        name="Kerala Backwaters",
        summary="Five nights of houseboats and tea gardens.",
        themes=[Theme.HONEYMOON, Theme.HERITAGE],
        nights=5,
        days=6,
        highlights=["A night on a houseboat", "Tea tasting at Munnar"],
        starting_price_paise=24_999_00,
        status=PackageStatus.LIVE,
    )
    db.add(package)
    await db.flush()
    for date, seats in ((dt.date(2026, 12, 5), 8), (dt.date(2027, 1, 9), 0)):
        db.add(
            Departure(
                package_id=package.id,
                date=date,
                seats_total=seats,
                price_double_paise=24_999_00,
                price_triple_paise=22_999_00,
                price_child_paise=12_499_00,
                single_supplement_paise=9_000_00,
            )
        )
    await db.commit()


async def slugs(client: AsyncClient, query: str = "") -> list[str]:
    res = await client.get(f"/packages{query}")
    assert res.status_code == 200, res.text
    return [c["slug"] for c in res.json()["items"]]


async def field_errors(client: AsyncClient, query: str) -> list[str]:
    res = await client.get(f"/packages{query}")
    assert res.status_code == 400, res.text
    assert res.json()["error"]["code"] == "validation"
    return list(res.json()["error"]["fieldErrors"])


# --- GET /packages ------------------------------------------------------------------------------


@pytest.mark.db
async def test_unfiltered_is_every_live_package_cheapest_first(
    catalog: None, db_client: AsyncClient
) -> None:
    res = await db_client.get("/packages")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    body = res.json()
    assert [c["slug"] for c in body["items"]] == [NGB, GQE, KER]
    assert body["total"] == 3
    assert set(body["facets"]) == {"destinations", "themes", "months", "nights", "budget"}


@pytest.mark.db
async def test_destination_is_any_of(catalog: None, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?destination=goa") == [NGB, GQE]
    assert await slugs(db_client, "?destination=kerala") == [KER]
    assert await slugs(db_client, "?destination=kerala&destination=goa") == [NGB, GQE, KER]
    assert await slugs(db_client, "?destination=mars") == []


@pytest.mark.db
async def test_max_budget_is_rupees_against_the_starting_price(
    catalog: None, db: AsyncSession, db_client: AsyncClient
) -> None:
    assert await slugs(db_client, "?maxBudget=15000") == [NGB]
    assert await slugs(db_client, "?maxBudget=14499") == [NGB]  # inclusive
    assert await slugs(db_client, "?maxBudget=14498") == []
    assert await slugs(db_client, "?maxBudget=30000") == [NGB, GQE, KER]

    # "On request" (no upcoming price) can never satisfy a budget.
    await db.execute(update(Package).where(Package.slug == GQE).values(starting_price_paise=0))
    await db.commit()
    assert await slugs(db_client, "?maxBudget=30000") == [NGB, KER]

    assert await field_errors(db_client, "?maxBudget=0") == ["maxBudget"]
    assert await field_errors(db_client, "?maxBudget=cheap") == ["maxBudget"]


@pytest.mark.db
async def test_nights_range_is_inclusive_either_side_optional(
    catalog: None, db_client: AsyncClient
) -> None:
    assert await slugs(db_client, "?nightsMin=4") == [GQE, KER]
    assert await slugs(db_client, "?nightsMax=3") == [NGB]
    assert await slugs(db_client, "?nightsMin=4&nightsMax=4") == [GQE]
    assert await slugs(db_client, "?nightsMin=3&nightsMax=5") == [NGB, GQE, KER]
    assert await field_errors(db_client, "?nightsMin=5&nightsMax=3") == ["nightsMax"]
    assert await field_errors(db_client, "?nightsMin=0") == ["nightsMin"]


@pytest.mark.db
async def test_themes_are_any_of(catalog: None, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?themes=honeymoon") == [GQE, KER]
    assert await slugs(db_client, "?themes=family") == [NGB]
    assert await slugs(db_client, "?themes=family&themes=heritage") == [NGB, KER]
    assert await slugs(db_client, "?themes=hills") == []
    assert await field_errors(db_client, "?themes=luxury") == ["themes.0"]


@pytest.mark.db
async def test_month_needs_a_departure_with_seats_that_month(
    catalog: None, db: AsyncSession, db_client: AsyncClient
) -> None:
    assert await slugs(db_client, "?month=2026-12") == [NGB, GQE, KER]
    # KER's January date is sold out, so January is only the Goa trips.
    assert await slugs(db_client, "?month=2027-01") == [NGB, GQE]
    assert await slugs(db_client, "?month=2027-03") == []

    # Selling out KER's last December seats drops it from December.
    await db.execute(
        update(Departure).where(Departure.date == dt.date(2026, 12, 5)).values(seats_total=0)
    )
    await db.commit()
    assert await slugs(db_client, "?month=2026-12") == [NGB, GQE]

    assert await field_errors(db_client, "?month=2026-13") == ["month"]
    assert await field_errors(db_client, "?month=Dec") == ["month"]


@pytest.mark.db
async def test_past_departures_never_count(catalog: None, db: AsyncSession) -> None:
    # A `today` after every seeded date: nothing departs "in December" any more, and the
    # months facet is empty too.
    result = await search_packages(db, SearchParams(month="2026-12"), today=dt.date(2027, 6, 1))
    assert result.items == []
    assert result.total == 0
    assert result.facets.months == []


@pytest.mark.db
async def test_sort_orders(catalog: None, db: AsyncSession, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?sort=price-asc") == [NGB, GQE, KER]
    assert await slugs(db_client, "?sort=price-desc") == [KER, GQE, NGB]
    assert await slugs(db_client, "?sort=duration") == [NGB, GQE, KER]

    # "On request" sinks to the bottom whichever way prices are sorted.
    await db.execute(update(Package).where(Package.slug == NGB).values(starting_price_paise=0))
    await db.commit()
    assert await slugs(db_client, "?sort=price-asc") == [GQE, KER, NGB]
    assert await slugs(db_client, "?sort=price-desc") == [KER, GQE, NGB]

    assert await field_errors(db_client, "?sort=newest") == ["sort"]


@pytest.mark.db
async def test_filters_and_together(catalog: None, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?destination=goa&themes=honeymoon&month=2026-12") == [GQE]
    assert (
        await slugs(db_client, "?destination=goa&themes=honeymoon&month=2026-12&maxBudget=20000")
        == []
    )


@pytest.mark.db
async def test_drafts_never_match(
    catalog: None, db: AsyncSession, db_client: AsyncClient
) -> None:
    await db.execute(update(Package).where(Package.slug == KER).values(status=PackageStatus.DRAFT))
    await db.commit()

    assert await slugs(db_client, "?destination=kerala") == []
    assert await slugs(db_client, "?themes=heritage") == []
    facets = (await db_client.get("/packages")).json()["facets"]
    assert [d["value"] for d in facets["destinations"]] == ["goa"]
    assert facets["nights"] == {"min": 3, "max": 4}


@pytest.mark.db
async def test_blank_params_mean_unfiltered(catalog: None, db_client: AsyncClient) -> None:
    query = "?destination=&maxBudget=&nightsMin=&nightsMax=&themes=&month=&sort="
    assert await slugs(db_client, query) == [NGB, GQE, KER]


@pytest.mark.db
async def test_facets_describe_the_whole_live_catalog(
    catalog: None, db_client: AsyncClient
) -> None:
    # Not narrowed by the current filter — the panel keeps offering every real option.
    facets = (await db_client.get("/packages?destination=kerala")).json()["facets"]

    assert facets["destinations"] == [
        {"value": "goa", "label": "Goa", "count": 2},
        {"value": "kerala", "label": "Kerala", "count": 1},
    ]
    assert facets["themes"] == [
        {"value": "beach", "label": "Beach", "count": 2},
        {"value": "hills", "label": "Hills", "count": 0},
        {"value": "honeymoon", "label": "Honeymoon", "count": 2},
        {"value": "family", "label": "Family", "count": 1},
        {"value": "adventure", "label": "Adventure", "count": 0},
        {"value": "heritage", "label": "Heritage", "count": 1},
    ]
    assert facets["months"] == [
        {"value": "2026-11", "label": "November 2026", "count": 2},
        {"value": "2026-12", "label": "December 2026", "count": 3},
        {"value": "2027-01", "label": "January 2027", "count": 2},  # KER's Jan date is sold out
        {"value": "2027-02", "label": "February 2027", "count": 1},
    ]
    assert facets["nights"] == {"min": 3, "max": 5}
    assert facets["budget"] == {"min": 14_000, "max": 25_000}


@pytest.mark.db
async def test_search_packages_is_callable_with_params_directly(
    catalog: None, db: AsyncSession
) -> None:
    """What the v3 `searchPackages` tool will do — no HTTP in between."""
    result = await search_packages(
        db,
        SearchParams(themes=[Theme.HONEYMOON], sort=SortOrder.PRICE_DESC),
        today=dt.date(2026, 10, 1),
    )
    assert [c.slug for c in result.items] == [KER, GQE]
    assert result.total == 2
    assert result.facets.nights == RangeFacet(min=3, max=5)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_search.py -q`
Expected: the `db` tests fail — `TypeError: search_packages() got an unexpected keyword argument`/`takes 1 positional argument` for the direct calls, and `?maxBudget=15000` returns 3 items (params ignored) for the route tests. (If `TEST_DATABASE_URL` is unset they are skipped — set it, see "Local environment".)

- [ ] **Step 3: Implement the filters, facets and the new `search_packages`**

Replace `api/app/services/catalog/search.py` with:

```python
"""`search_packages` — the single filter function the site, the sitemap and (v3) the AI reuse
(03 R3, 06 C1).

Filters are `where` clauses over live packages; the travel month is an EXISTS over upcoming
departures joined to the `departure_availability` view. Facets describe the whole live catalog
so the filter panel offers only real destinations, months and ranges.
"""

import calendar
import datetime as dt
import math
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import Select, func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Destination, Package
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus, Theme
from app.schemas.catalog import (
    FacetOption,
    PackageList,
    RangeFacet,
    SearchFacets,
    SearchParams,
    SortOrder,
)
from app.schemas.meta import THEME_LABELS
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card
from app.services.catalog.reads import month_bounds

BUDGET_STEP_RUPEES = 1_000


# --- pure ---------------------------------------------------------------------------------------


def month_label(month: str) -> str:
    """`'2026-11'` -> `'November 2026'` (the format was validated upstream)."""
    year, mon = month.split("-")
    return f"{calendar.month_name[int(mon)]} {year}"


def budget_range(cheapest_paise: int | None, priciest_paise: int | None) -> RangeFacet:
    """Slider bounds in rupees, rounded out to ₹1,000 so every real price sits inside them."""
    if not cheapest_paise or not priciest_paise:
        return RangeFacet(min=0, max=0)
    step = BUDGET_STEP_RUPEES
    return RangeFacet(
        min=math.floor(cheapest_paise / 100 / step) * step,
        max=math.ceil(priciest_paise / 100 / step) * step,
    )


def sort_order(sort: SortOrder) -> tuple[Any, ...]:
    """ORDER BY clauses. "On request" (price 0) sinks to the bottom whichever way prices go;
    `name` breaks ties so the order is stable between requests."""
    price = func.nullif(Package.starting_price_paise, 0)
    match sort:
        case SortOrder.PRICE_DESC:
            return (nulls_last(price.desc()), Package.name)
        case SortOrder.DURATION:
            return (Package.nights, nulls_last(price.asc()), Package.name)
        case _:
            return (nulls_last(price.asc()), Package.name)


def seat_available_departures(today: dt.date) -> Select[tuple[str]]:
    """Ids of departures on/after `today` that still have seats (the view, never `seats_total`)."""
    return (
        select(Departure.id)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.date >= today, departure_availability.c.seats_left > 0)
    )


def apply_filters(
    stmt: Select[tuple[Package]], params: SearchParams, today: dt.date
) -> Select[tuple[Package]]:
    """The R3 filters, AND-ed; each list is any-of. Pure so a test can read the statement."""
    if params.destination:
        stmt = stmt.join(Destination, Destination.id == Package.destination_id).where(
            Destination.slug.in_(params.destination)
        )
    if params.max_budget is not None:
        # Rupees on the query, paise in the row; "on request" (0) has no price to compare.
        stmt = stmt.where(
            Package.starting_price_paise > 0,
            Package.starting_price_paise <= params.max_budget * 100,
        )
    if params.nights_min is not None:
        stmt = stmt.where(Package.nights >= params.nights_min)
    if params.nights_max is not None:
        stmt = stmt.where(Package.nights <= params.nights_max)
    if params.themes:
        stmt = stmt.where(Package.themes.overlap(params.themes))
    if params.month:
        start, end = month_bounds(params.month)
        stmt = stmt.where(
            seat_available_departures(today)
            .where(
                Departure.package_id == Package.id,
                Departure.date >= start,
                Departure.date < end,
            )
            .exists()
        )
    return stmt


# --- queries ------------------------------------------------------------------------------------


async def search_facets(db: AsyncSession, today: dt.date) -> SearchFacets:
    """The filter panel's options, from the live catalog. Twelve packages: counting in Python is
    simpler than array-unnest SQL and just as fast."""
    live = Package.status == PackageStatus.LIVE

    destination_rows = await db.execute(
        select(Destination.slug, Destination.name, func.count(Package.id))
        .join(Package, Package.destination_id == Destination.id)
        .where(live)
        .group_by(Destination.id)
        .order_by(Destination.position, Destination.name)
    )
    destinations = [
        FacetOption(value=slug, label=name, count=count) for slug, name, count in destination_rows
    ]

    theme_counts = Counter(
        theme
        for themes in (await db.execute(select(Package.themes).where(live))).scalars()
        for theme in themes
    )
    themes = [
        FacetOption(value=t.value, label=THEME_LABELS[t], count=theme_counts.get(t, 0))
        for t in Theme
    ]

    departure_rows = await db.execute(
        select(Departure.package_id, Departure.date)
        .join(Package, Package.id == Departure.package_id)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(live, Departure.date >= today, departure_availability.c.seats_left > 0)
    )
    by_month: dict[str, set[str]] = defaultdict(set)
    for package_id, date in departure_rows:
        by_month[date.strftime("%Y-%m")].add(package_id)
    months = [
        FacetOption(value=month, label=month_label(month), count=len(ids))
        for month, ids in sorted(by_month.items())
    ]

    nights_min, nights_max, cheapest, priciest = (
        await db.execute(
            select(
                func.min(Package.nights),
                func.max(Package.nights),
                func.min(func.nullif(Package.starting_price_paise, 0)),
                func.max(Package.starting_price_paise),
            ).where(live)
        )
    ).one()

    return SearchFacets(
        destinations=destinations,
        themes=themes,
        months=months,
        nights=RangeFacet(min=nights_min or 0, max=nights_max or 0),
        budget=budget_range(cheapest, priciest),
    )


async def search_packages(
    db: AsyncSession, params: SearchParams | None = None, *, today: dt.date | None = None
) -> PackageList:
    """Live packages matching `params` as cards, plus the facets the filter panel needs.
    The v3 `searchPackages` tool calls this with the same `SearchParams`."""
    params = params or SearchParams()
    today = today or dt.date.today()
    stmt = apply_filters(select(Package).where(Package.status == PackageStatus.LIVE), params, today)
    packages = (
        (
            await db.execute(
                stmt.options(
                    selectinload(Package.destination), selectinload(Package.cover_image)
                ).order_by(*sort_order(params.sort))
            )
        )
        .scalars()
        .all()
    )
    upcoming = await next_departures(db, today)
    items = [package_card(p, upcoming.get(p.id)) for p in packages]
    return PackageList(items=items, total=len(items), facets=await search_facets(db, today))
```

Notes for the implementer:
- `Package.themes.overlap(...)` is PostgreSQL `&&` on the `theme[]` column (the GIN index from 06 A3 serves it). If pyright rejects `.overlap` on the `Mapped[list[Theme]]` attribute, write it as `Package.themes.op("&&")(params.themes)` — same SQL.
- `.exists()` on the correlated subquery: SQLAlchemy auto-correlates `Package` because the subquery sits inside `select(Package)`.
- `theme_counts.get(t, 0)` works whether the driver hands back `Theme` members or their string values — `StrEnum` members hash and compare as their string.
- `func.min(func.nullif(starting_price_paise, 0))` ignores "on request" packages for the slider's lower bound; the upper bound uses the plain max (0 only if every package is on request → `budget_range` returns 0/0).

- [ ] **Step 4: Wire the query model into the route**

In `api/app/routers/site/catalog.py`, add `SearchParams` to the `app.schemas.catalog` import and replace the `get_packages` route:

```python
@router.get("/packages", operation_id="searchPackages")
async def get_packages(
    db: Session, response: Response, params: Annotated[SearchParams, Query()]
) -> PackageList:
    """R3 search. Every filter lives in `search_packages`; this only adds the cache header."""
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return await search_packages(db, params)
```

FastAPI (≥ 0.115) reads a pydantic model annotated with `Query()` as individual query parameters named by their aliases (`maxBudget`, …) and documents each in the OpenAPI operation; a validator error becomes `RequestValidationError` with loc `("query", "nightsMax")`, which `errors.py` renders as `fieldErrors: {"nightsMax": …}`. **If** the `maxBudget=15000` test still returns 3 items (aliases not honoured by this FastAPI build), replace the model parameter with explicit ones and build the model by hand:

```python
@router.get("/packages", operation_id="searchPackages")
async def get_packages(
    db: Session,
    response: Response,
    destination: Annotated[list[str] | None, Query()] = None,
    max_budget: Annotated[int | None, Query(alias="maxBudget", gt=0)] = None,
    nights_min: Annotated[int | None, Query(alias="nightsMin", ge=1, le=NIGHTS_MAX)] = None,
    nights_max: Annotated[int | None, Query(alias="nightsMax", ge=1, le=NIGHTS_MAX)] = None,
    themes: Annotated[list[Theme] | None, Query()] = None,
    month: Annotated[str | None, Query(pattern=MONTH_PATTERN)] = None,
    sort: SortOrder = SortOrder.PRICE_ASC,
) -> PackageList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    try:
        params = SearchParams(
            destination=destination or [],
            max_budget=max_budget,
            nights_min=nights_min,
            nights_max=nights_max,
            themes=themes or [],
            month=month,
            sort=sort,
        )
    except ValidationError as exc:
        raise ApiError(
            "validation", "Invalid search", field_errors={"nightsMax": exc.errors()[0]["msg"]}
        ) from exc
    return await search_packages(db, params)
```

(`ValidationError` from `pydantic`, `NIGHTS_MAX`/`SortOrder`/`SearchParams` from `app.schemas.catalog`, `Theme` from `app.models.enums`.) Prefer the model form; the explicit form is the fallback only.

- [ ] **Step 5: Run the whole api suite**

Run: `uv run --directory api pytest -q`
Expected: **106 passed** (90 + 16 new; `test_catalog.py`'s `GET /packages` tests still pass — `facets` is additive and the order is unchanged for priced packages).

- [ ] **Step 6: Lint, format, typecheck**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright`
Expected: clean. (If ruff reorders the schema import block, accept its order.)

- [ ] **Step 7: Commit**

```bash
git add api/app/services/catalog/search.py api/app/routers/site/catalog.py api/tests/test_search.py
git commit -m "feat(F3): search_packages filters, sort and facets; GET /packages query params"
```

---

### Task 3: Regenerate the contract; array search params in the web client

**Files:**
- Regenerate: `api/openapi.json`, `web/src/lib/api-types.ts`
- Modify: `web/src/lib/api.ts:66-69,88-90`
- Test: `web/tests/api.test.ts`

**Interfaces:**
- Produces: `components['schemas']['SearchParams' | 'SortOrder' | 'SearchFacets' | 'FacetOption' | 'RangeFacet']` and `paths['/packages']['get']['parameters']['query']` in `api-types.ts`; `ApiInit.searchParams?: Record<string, string | string[] | undefined>` — arrays append one `k=v` per value, empty strings/undefined are skipped.

- [ ] **Step 1: Regenerate**

Run: `pnpm gen:api && git status --short api/openapi.json web/src/lib/api-types.ts`
Expected: both files modified. Sanity-check the operation:

Run: `grep -n '"maxBudget"\|"nightsMin"\|SearchFacets\|"sort"' api/openapi.json | head`
Expected: `maxBudget`, `nightsMin`, `sort` appear as query `parameters` of `searchPackages`; `SearchFacets` in `components.schemas`.

Run: `grep -n "maxBudget\|SearchFacets\|SortOrder" web/src/lib/api-types.ts | head`
Expected: `maxBudget?: number` under `'/packages': { get: { parameters: { query?: …` and the `SearchFacets` / `SortOrder` schemas.

- [ ] **Step 2: Write the failing test**

Add to the `describe('api() — typed server-side fetch', …)` block in `web/tests/api.test.ts`:

```ts
  it('appends array search params once per value and skips blanks', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/packages', {
      searchParams: {
        destination: ['goa', 'kerala'],
        themes: [],
        month: '',
        maxBudget: undefined,
        sort: 'duration',
      },
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.toString()).toBe(
      'http://localhost:8000/packages?destination=goa&destination=kerala&sort=duration',
    );
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web test -- tests/api.test.ts`
Expected: typecheck failure in the test (`string[]` not assignable) or `destination=goa%2Ckerala` in the URL.

- [ ] **Step 4: Accept arrays in `api.ts`**

In `web/src/lib/api.ts` change the `ApiInit` field and the loop:

```ts
  /** Query string; an array appends one `k=v` per value; blanks and undefined are omitted. */
  searchParams?: Record<string, string | string[] | undefined>;
```

```ts
  for (const [k, v] of Object.entries(init.searchParams ?? {}))
    for (const one of Array.isArray(v) ? v : [v]) if (one) url.searchParams.append(k, one);
```

- [ ] **Step 5: Run web lint/typecheck/tests**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`
Expected: clean; **35 passed** (34 + 1). `tests/contract.test.ts` passes because the generated file is fresh.

- [ ] **Step 6: Commit**

```bash
git add api/openapi.json web/src/lib/api-types.ts web/src/lib/api.ts web/tests/api.test.ts
git commit -m "feat(F3): regenerate contract (search params + facets); array search params in api()"
```

---

### Task 4: `lib/search.ts` — the query as one pure module (parse · serialise · chips)

**Files:**
- Create: `web/src/lib/search.ts`
- Test: `web/tests/search.test.ts`

**Interfaces:**
- Consumes: `components['schemas']['SortOrder' | 'Theme' | 'SearchFacets']`, `paths['/packages']['get']['parameters']['query']` (Task 3); `inr` (`lib/format.ts`).
- Produces (all exported): `type SearchQuery = { destination: string[]; maxBudget?: number; nightsMin?: number; nightsMax?: number; themes: Theme[]; month?: string; sort: SortOrder }`; `type RawSearchParams = Record<string, string | string[] | undefined>`; `type Facets`; `type ContractQuery`; `DEFAULT_SORT = 'price-asc'`; `SORT_LABEL: Record<SortOrder, string>`; `THEMES` (readonly tuple of the six themes); `NIGHTS_MAX = 30`; `EMPTY_QUERY`; `parseSearchQuery(raw): SearchQuery`; `toSearchParams(q): URLSearchParams`; `searchHref(q): string` (`'/packages'` or `'/packages?…'`); `toApiSearchParams(q): Record<string, string | string[] | undefined>`; `isFiltered(q): boolean`; `nightsLabel(min?, max?): string`; `monthLabel('YYYY-MM'): string`; `resultCount(n): string`; `type FilterChip = { key: string; label: string; href: string }`; `activeChips(q, facets): FilterChip[]`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/search.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { components } from '../src/lib/api-types';
import {
  activeChips,
  type ContractQuery,
  DEFAULT_SORT,
  isFiltered,
  monthLabel,
  nightsLabel,
  parseSearchQuery,
  resultCount,
  searchHref,
  type SearchQuery,
  THEMES,
  toApiSearchParams,
  toSearchParams,
} from '../src/lib/search';

type Facets = components['schemas']['SearchFacets'];

const facets: Facets = {
  destinations: [
    { value: 'goa', label: 'Goa', count: 2 },
    { value: 'kerala', label: 'Kerala', count: 1 },
  ],
  themes: [
    { value: 'beach', label: 'Beach', count: 2 },
    { value: 'honeymoon', label: 'Honeymoon', count: 2 },
  ],
  months: [{ value: '2026-12', label: 'December 2026', count: 3 }],
  nights: { min: 3, max: 5 },
  budget: { min: 14000, max: 25000 },
};

describe('parseSearchQuery', () => {
  it('reads every filter from repeated and single params', () => {
    expect(
      parseSearchQuery({
        destination: ['goa', 'kerala'],
        maxBudget: '20000',
        nightsMin: '3',
        nightsMax: '5',
        themes: 'beach',
        month: '2026-12',
        sort: 'duration',
      }),
    ).toEqual({
      destination: ['goa', 'kerala'],
      maxBudget: 20000,
      nightsMin: 3,
      nightsMax: 5,
      themes: ['beach'],
      month: '2026-12',
      sort: 'duration',
    });
  });

  it('defaults to the empty query', () => {
    expect(parseSearchQuery({})).toEqual({ destination: [], themes: [], sort: DEFAULT_SORT });
  });

  it('drops what the api would reject instead of failing the page', () => {
    const q = parseSearchQuery({
      destination: ['Goa!', 'goa', 'goa'],
      maxBudget: '-5',
      nightsMin: '0',
      nightsMax: '31',
      themes: ['luxury', 'beach', 'beach'],
      month: '2026-13',
      sort: 'newest',
    });
    expect(q).toEqual({ destination: ['goa'], themes: ['beach'], sort: 'price-asc' });
  });

  it('swaps a reversed nights range', () => {
    expect(parseSearchQuery({ nightsMin: '5', nightsMax: '3' })).toMatchObject({
      nightsMin: 3,
      nightsMax: 5,
    });
  });

  it('ignores blank values like the api does', () => {
    expect(parseSearchQuery({ destination: '', month: '', sort: '', maxBudget: ' ' })).toEqual({
      destination: [],
      themes: [],
      sort: 'price-asc',
    });
  });
});

describe('URL round trip', () => {
  it('serialises canonically and omits the default sort', () => {
    const q: SearchQuery = {
      destination: ['goa'],
      maxBudget: 20000,
      themes: ['beach', 'family'],
      month: '2026-12',
      sort: 'price-asc',
    };
    expect(toSearchParams(q).toString()).toBe(
      'destination=goa&maxBudget=20000&themes=beach&themes=family&month=2026-12',
    );
    expect(searchHref({ destination: [], themes: [], sort: 'price-asc' })).toBe('/packages');
    expect(searchHref({ destination: [], themes: [], sort: 'duration' })).toBe(
      '/packages?sort=duration',
    );
  });

  it('parse(serialise(q)) is q', () => {
    const q: SearchQuery = {
      destination: ['kerala', 'goa'],
      maxBudget: 25000,
      nightsMin: 4,
      nightsMax: 6,
      themes: ['honeymoon'],
      month: '2027-01',
      sort: 'price-desc',
    };
    const sp = toSearchParams(q);
    const raw = Object.fromEntries(
      [...new Set(sp.keys())].map((k) => {
        const all = sp.getAll(k);
        return [k, all.length > 1 ? all : all[0]];
      }),
    );
    expect(parseSearchQuery(raw)).toEqual(q);
  });

  it('maps to api() search params with arrays intact', () => {
    expect(
      toApiSearchParams({ destination: ['goa'], themes: [], sort: 'price-asc', maxBudget: 20000 }),
    ).toEqual({
      destination: ['goa'],
      maxBudget: '20000',
      nightsMin: undefined,
      nightsMax: undefined,
      themes: [],
      month: undefined,
      sort: 'price-asc',
    });
  });

  it('is the shape the contract accepts, with every api theme', () => {
    expectTypeOf<SearchQuery>().toMatchTypeOf<ContractQuery>();
    expectTypeOf<(typeof THEMES)[number]>().toEqualTypeOf<components['schemas']['Theme']>();
  });
});

describe('chips + labels', () => {
  it('describes every active filter with a link that removes just that one', () => {
    const q: SearchQuery = {
      destination: ['goa', 'kerala'],
      maxBudget: 20000,
      nightsMin: 4,
      themes: ['beach'],
      month: '2026-12',
      sort: 'duration',
    };
    const chips = activeChips(q, facets);
    expect(chips.map((c) => c.label)).toEqual([
      'Goa',
      'Kerala',
      'Up to ₹20,000',
      '4+ nights',
      'Beach',
      'December 2026',
    ]);
    expect(chips[0].href).toBe(
      '/packages?destination=kerala&maxBudget=20000&nightsMin=4&themes=beach&month=2026-12&sort=duration',
    );
    expect(chips[5].href).toBe(
      '/packages?destination=goa&destination=kerala&maxBudget=20000&nightsMin=4&themes=beach&sort=duration',
    );
  });

  it('falls back to the raw value when the facets no longer list it', () => {
    const q: SearchQuery = { destination: ['ladakh'], themes: [], month: '2027-06', sort: 'price-asc' };
    expect(activeChips(q, facets).map((c) => c.label)).toEqual(['ladakh', 'June 2027']);
  });

  it('labels nights, months, counts and "filtered"', () => {
    expect(nightsLabel(3, 5)).toBe('3–5 nights');
    expect(nightsLabel(4, 4)).toBe('4 nights');
    expect(nightsLabel(6, undefined)).toBe('6+ nights');
    expect(nightsLabel(undefined, 3)).toBe('Up to 3 nights');
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(resultCount(1)).toBe('1 package');
    expect(resultCount(0)).toBe('0 packages');
    expect(isFiltered({ destination: [], themes: [], sort: 'duration' })).toBe(false);
    expect(isFiltered({ destination: [], themes: [], month: '2026-12', sort: 'price-asc' })).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- tests/search.test.ts`
Expected: FAIL — cannot resolve `../src/lib/search`.

- [ ] **Step 3: Implement `search.ts`**

Create `web/src/lib/search.ts`:

```ts
import type { components, paths } from './api-types';
import { inr } from './format';

/**
 * The listing's query, one shape for three jobs: the URL (`/packages?…`), the api call and
 * the filter panel's state. Pure — parse Next's `searchParams`, serialise back canonically,
 * describe the active filters as chips. Param names are the api's, so the page forwards them 1:1.
 */

export type SortOrder = components['schemas']['SortOrder'];
export type Theme = components['schemas']['Theme'];
export type Facets = components['schemas']['SearchFacets'];
/** What the contract says `GET /packages` accepts; `SearchQuery` must stay assignable to it. */
export type ContractQuery = NonNullable<paths['/packages']['get']['parameters']['query']>;

export interface SearchQuery {
  destination: string[];
  /** Whole rupees, like the api's `maxBudget`. */
  maxBudget?: number;
  nightsMin?: number;
  nightsMax?: number;
  themes: Theme[];
  /** `YYYY-MM` */
  month?: string;
  sort: SortOrder;
}

/** Next.js `searchParams` after `await`: repeated keys arrive as arrays. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_SORT: SortOrder = 'price-asc';
export const SORT_LABEL: Record<SortOrder, string> = {
  'price-asc': 'Price, low to high',
  'price-desc': 'Price, high to low',
  duration: 'Shortest first',
};
/** Mirrors the api `Theme` enum (a type test keeps them equal); `/meta` supplies labels. */
export const THEMES = [
  'beach',
  'hills',
  'honeymoon',
  'family',
  'adventure',
  'heritage',
] as const satisfies readonly Theme[];
export const NIGHTS_MAX = 30;
const BUDGET_MAX = 10_000_000; // rupees — anything above is a typo, not a filter
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SLUG = /^[a-z0-9-]+$/;

export const EMPTY_QUERY: SearchQuery = { destination: [], themes: [], sort: DEFAULT_SORT };

const list = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v === undefined ? [] : [v]).map((s) => s.trim()).filter(Boolean);
const first = (v: string | string[] | undefined) => list(v)[0];
const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
const isTheme = (s: string): s is Theme => (THEMES as readonly string[]).includes(s);
const isSort = (s: string | undefined): s is SortOrder => s !== undefined && s in SORT_LABEL;

/** A whole number inside [min, max], else undefined — URLs are user input, never throw. */
function int(v: string | string[] | undefined, min: number, max: number): number | undefined {
  const s = first(v);
  if (s === undefined || !/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n >= min && n <= max ? n : undefined;
}

/** Lenient: anything the api would reject is dropped or repaired, so a hand-edited URL still renders. */
export function parseSearchQuery(raw: RawSearchParams): SearchQuery {
  let nightsMin = int(raw.nightsMin, 1, NIGHTS_MAX);
  let nightsMax = int(raw.nightsMax, 1, NIGHTS_MAX);
  if (nightsMin !== undefined && nightsMax !== undefined && nightsMax < nightsMin)
    [nightsMin, nightsMax] = [nightsMax, nightsMin];
  const month = first(raw.month);
  const sort = first(raw.sort);
  return {
    destination: uniq(list(raw.destination).filter((s) => SLUG.test(s))),
    maxBudget: int(raw.maxBudget, 1, BUDGET_MAX),
    nightsMin,
    nightsMax,
    themes: uniq(list(raw.themes).filter(isTheme)),
    month: month !== undefined && MONTH.test(month) ? month : undefined,
    sort: isSort(sort) ? sort : DEFAULT_SORT,
  };
}

/** Canonical order, defaults omitted: equal queries → equal URLs (shareable, one cache entry). */
export function toSearchParams(q: SearchQuery): URLSearchParams {
  const sp = new URLSearchParams();
  for (const d of q.destination) sp.append('destination', d);
  if (q.maxBudget !== undefined) sp.set('maxBudget', String(q.maxBudget));
  if (q.nightsMin !== undefined) sp.set('nightsMin', String(q.nightsMin));
  if (q.nightsMax !== undefined) sp.set('nightsMax', String(q.nightsMax));
  for (const t of q.themes) sp.append('themes', t);
  if (q.month !== undefined) sp.set('month', q.month);
  if (q.sort !== DEFAULT_SORT) sp.set('sort', q.sort);
  return sp;
}

export function searchHref(q: SearchQuery): string {
  const s = toSearchParams(q).toString();
  return s ? `/packages?${s}` : '/packages';
}

/** For `api('/packages', { searchParams })`: arrays stay arrays, numbers become strings. */
export function toApiSearchParams(q: SearchQuery): Record<string, string | string[] | undefined> {
  return {
    destination: q.destination,
    maxBudget: q.maxBudget?.toString(),
    nightsMin: q.nightsMin?.toString(),
    nightsMax: q.nightsMax?.toString(),
    themes: q.themes,
    month: q.month,
    sort: q.sort,
  };
}

/** True when a filter (not the sort) narrows the catalog. */
export const isFiltered = (q: SearchQuery) =>
  toSearchParams({ ...q, sort: DEFAULT_SORT }).size > 0;

export function nightsLabel(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined)
    return min === max ? `${min} nights` : `${min}–${max} nights`;
  if (min !== undefined) return `${min}+ nights`;
  if (max !== undefined) return `Up to ${max} nights`;
  return 'Any length';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `'2026-11'` → `'November 2026'`; the api's facet labels say the same, this covers months it no longer lists. */
export function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  return `${MONTH_NAMES[Number(mon) - 1]} ${year}`;
}

export const resultCount = (n: number) => (n === 1 ? '1 package' : `${n} packages`);

export interface FilterChip {
  key: string;
  label: string;
  /** The same query without this one filter. */
  href: string;
}

/** The toolbar's removable chips, in a fixed order: destinations, budget, nights, themes, month. */
export function activeChips(q: SearchQuery, facets: Facets): FilterChip[] {
  const label = (options: Facets['destinations'], value: string, fallback: string) =>
    options.find((o) => o.value === value)?.label ?? fallback;
  const chips: FilterChip[] = q.destination.map((d) => ({
    key: `destination:${d}`,
    label: label(facets.destinations, d, d),
    href: searchHref({ ...q, destination: q.destination.filter((x) => x !== d) }),
  }));
  if (q.maxBudget !== undefined)
    chips.push({
      key: 'maxBudget',
      label: `Up to ${inr(q.maxBudget * 100)}`,
      href: searchHref({ ...q, maxBudget: undefined }),
    });
  if (q.nightsMin !== undefined || q.nightsMax !== undefined)
    chips.push({
      key: 'nights',
      label: nightsLabel(q.nightsMin, q.nightsMax),
      href: searchHref({ ...q, nightsMin: undefined, nightsMax: undefined }),
    });
  for (const t of q.themes)
    chips.push({
      key: `themes:${t}`,
      label: label(facets.themes, t, t),
      href: searchHref({ ...q, themes: q.themes.filter((x) => x !== t) }),
    });
  if (q.month !== undefined)
    chips.push({
      key: 'month',
      label: label(facets.months, q.month, monthLabel(q.month)),
      href: searchHref({ ...q, month: undefined }),
    });
  return chips;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter web test -- tests/search.test.ts`
Expected: 12 passed. (`URLSearchParams.size` needs Node ≥ 18.16 — the repo runs Node 22.)

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck`
Expected: clean (prettier may reflow a line or two — run `pnpm --filter web exec prettier --write src/lib/search.ts tests/search.test.ts` and re-run lint).

```bash
git add web/src/lib/search.ts web/tests/search.test.ts
git commit -m "feat(F3): lib/search — parse, serialise and describe the listing query"
```

---

### Task 5: The listing page — server-rendered from the URL (`/packages`)

**Files:**
- Create: `web/src/app/(site)/packages/page.tsx`, `web/src/components/site/packages/ResultsGrid.tsx`, `web/src/components/site/packages/EmptyState.tsx`, `web/src/components/site/packages/SearchTransition.tsx`
- Modify: `web/src/components/site/SiteHeader.tsx`, `web/src/app/globals.css`

This task lands the page with a **static** rail placeholder so that shareable URLs already render server-side; Task 6 swaps in the live rail and toolbar. `SearchTransition.tsx` is created here because `EmptyState` uses its `NavLink`.

**Interfaces:**
- Consumes: `api('/packages', { searchParams })` (Task 3); everything in `lib/search.ts` (Task 4); `PackageCard`, `Container`.
- Produces: `SearchTransition` (client provider), `useSearch(): { pending: boolean; navigate(href: string): void }`, `Results` (dims children while pending), `NavLink({ href, className?, ariaLabel?, children })` (a real `<a>` that navigates through the transition); `ResultsGrid({ items: PackageCard[] })`; `EmptyState({ query, suggestions })`; the `animate-rise` utility; page `searchParams` → results.

- [ ] **Step 1: The transition context (client)**

Create `web/src/components/site/packages/SearchTransition.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useTransition, type MouseEvent, type ReactNode } from 'react';

type Search = { pending: boolean; navigate: (href: string) => void };
const SearchContext = createContext<Search>({ pending: false, navigate: () => {} });
export const useSearch = () => useContext(SearchContext);

/**
 * The listing's one transition. Every control calls `navigate(href)`: the URL changes and Next
 * re-renders the server page with the new `searchParams` — no reload, no client fetch, one data
 * path for first render, shared links and live updates. `Results` dims until the new cards land.
 * `replace`, not `push`: filter twiddles are not history entries.
 */
export function SearchTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.replace(href, { scroll: false }));
  return <SearchContext.Provider value={{ pending, navigate }}>{children}</SearchContext.Provider>;
}

export function Results({ children }: { children: ReactNode }) {
  const { pending } = useSearch();
  return (
    <div
      aria-busy={pending}
      aria-live="polite"
      className={`transition-opacity duration-300 ${pending ? 'opacity-40' : 'opacity-100'}`}
    >
      {children}
    </div>
  );
}

/** A real link (crawlable, works without JS) that runs through the search transition when JS is on. */
export function NavLink({
  href,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const { navigate } = useSearch();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new-tab clicks stay native
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
```

- [ ] **Step 2: The grid with its motion**

Create `web/src/components/site/packages/ResultsGrid.tsx`:

```tsx
import { PackageCard } from '@/components/site/PackageCard';
import type { components } from '@/lib/api-types';

type Card = components['schemas']['PackageCard'];

/**
 * Two-up beside the filter rail (S4 `.listing .cards`). Each card rises in, staggered 60 ms —
 * the page re-keys this grid per query, so every result change plays it again.
 */
export function ResultsGrid({ items }: { items: Card[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {items.map((card, i) => (
        <li
          key={card.slug}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
        >
          <PackageCard card={card} />
        </li>
      ))}
    </ul>
  );
}
```

Append to `web/src/app/globals.css` (after the `label-caps` utility):

```css
/* Listing cards rise in, staggered by an inline animation-delay; at rest under reduced motion. */
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@utility animate-rise {
  animation: rise 0.6s var(--ease-out) both;
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}
```

- [ ] **Step 3: The empty state**

Create `web/src/components/site/packages/EmptyState.tsx`:

```tsx
import { PackageCard } from '@/components/site/PackageCard';
import type { components } from '@/lib/api-types';
import { isFiltered, monthLabel, type SearchQuery } from '@/lib/search';
import { NavLink } from './SearchTransition';

type Card = components['schemas']['PackageCard'];

/** S4b: say what went wrong, offer one click out, show three trips anyway. ("Ask us for options" arrives with the enquiry form, F9.) */
export function EmptyState({ query, suggestions }: { query: SearchQuery; suggestions: Card[] }) {
  const filtered = isFiltered(query);
  const hint = !filtered
    ? 'No trips are live right now — check back soon.'
    : query.month
      ? `Nothing departs in ${monthLabel(query.month)} with these filters — the month and the budget are the usual culprits.`
      : 'Loosen one filter — the budget and the nights range are the usual culprits — or start again.';
  return (
    <>
      <div className="grid justify-items-center gap-2.5 rounded-card border-[1.5px] border-dashed border-line px-6 py-12 text-center">
        <h2 className="text-[22px]">
          {filtered ? 'No trips match these filters.' : 'Nothing to show yet.'}
        </h2>
        <p className="max-w-[40ch] text-mute">{hint}</p>
        {filtered && (
          <NavLink
            href="/packages"
            className="mt-2 inline-flex items-center rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-bg2"
          >
            Clear filters
          </NavLink>
        )}
      </div>
      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions-title" className="mt-12">
          <h2 id="suggestions-title" className="mb-5 text-[clamp(22px,2.6vw,30px)]">
            Try one of these instead
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((c) => (
              <li key={c.slug}>
                <PackageCard card={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 4: The page**

Create `web/src/app/(site)/packages/page.tsx`. The rail and toolbar are Task 6's — this version renders the count and chips inline so the page is complete and reviewable on its own:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { EmptyState } from '@/components/site/packages/EmptyState';
import { ResultsGrid } from '@/components/site/packages/ResultsGrid';
import { NavLink, Results, SearchTransition } from '@/components/site/packages/SearchTransition';
import { api } from '@/lib/api';
import {
  activeChips,
  EMPTY_QUERY,
  isFiltered,
  parseSearchQuery,
  resultCount,
  toApiSearchParams,
  toSearchParams,
  type RawSearchParams,
  type SearchQuery,
} from '@/lib/search';

type Props = { searchParams: Promise<RawSearchParams> };

/** Cached 60 s per distinct query (the api's own s-maxage); tagged so admin edits (F18) can purge it. */
const search = (query: SearchQuery) =>
  api('/packages', { searchParams: toApiSearchParams(query), tags: ['packages'], revalidate: 60 });

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseSearchQuery(await searchParams);
  return {
    title: 'Holiday packages',
    description:
      'Every Tripsmith trip with real departure dates and per-person prices. Filter by destination, budget, nights, theme and travel month.',
    // One indexable URL. Filtered views are shareable, but crawlers are pointed at the listing.
    alternates: { canonical: '/packages' },
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function PackagesPage({ searchParams }: Props) {
  const query = parseSearchQuery(await searchParams);
  const results = await search(query);
  const { facets } = results;
  const chips = activeChips(query, facets);
  const queryKey = toSearchParams(query).toString();
  const catalogSize = facets.destinations.reduce((n, d) => n + d.count, 0);
  const suggestions =
    results.total === 0 && isFiltered(query) ? (await search(EMPTY_QUERY)).items.slice(0, 3) : [];

  return (
    <Container className="pb-20">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span className="text-ink">Holiday packages</span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Holiday packages</h1>
        <p className="mt-1.5 max-w-[60ch] text-base text-mute">
          {plural(catalogSize, 'trip', 'trips')} across{' '}
          {plural(facets.destinations.length, 'destination', 'destinations')} — every date a real
          departure.
        </p>
      </header>

      <SearchTransition>
        <div className="grid gap-7 pt-5 lg:grid-cols-[280px_1fr] lg:items-start">
          {/* Task 6 replaces this with <FilterPanel query={query} facets={facets} /> */}
          <aside aria-label="Filters" className="rounded-[16px] border border-line p-4.5 text-sm text-mute">
            Filters arrive in the next step.
          </aside>
          <div className="min-w-0">
            {/* Task 6 replaces this with <ResultsToolbar query={query} total={results.total} chips={chips} /> */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="num font-bold" role="status">
                {resultCount(results.total)}
              </span>
              {chips.map((chip) => (
                <NavLink
                  key={chip.key}
                  href={chip.href}
                  ariaLabel={`Remove ${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-chip bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary no-underline hover:bg-primary hover:text-white"
                >
                  {chip.label} <span aria-hidden>×</span>
                </NavLink>
              ))}
            </div>
            <Results>
              {results.total > 0 ? (
                <ResultsGrid key={queryKey} items={results.items} />
              ) : (
                <EmptyState query={query} suggestions={suggestions} />
              )}
            </Results>
          </div>
        </div>
      </SearchTransition>
    </Container>
  );
}
```

Reading `searchParams` makes the route dynamic (rendered per request); the `fetch` inside is still cached 60 s per URL through the Data Cache, and `/packages` with no params is the only URL crawlers index.

- [ ] **Step 5: Header link**

In `web/src/components/site/SiteHeader.tsx`, add after the Home link (and update the comment: `F3 Trips` is now done, `F5 Destinations, F8 About/Contact` remain):

```tsx
          <Link href="/packages" className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
            Trips
          </Link>
```

- [ ] **Step 6: Run it against the local api and check the URLs render server-side**

With the api on 8000 (local DB, seeded `--local`) and `pnpm --filter web dev` running:

Run: `curl -s http://localhost:3000/packages | grep -o "2 packages\|North Goa Beaches\|Goa Quiet Escape" | sort -u`
Expected: all three strings — the unfiltered listing.

Run: `curl -s "http://localhost:3000/packages?themes=honeymoon&month=2026-12" | grep -o "1 package\|Goa Quiet Escape\|North Goa Beaches\|Remove Honeymoon\|Remove December 2026" | sort -u`
Expected: `1 package`, `Goa Quiet Escape`, `Remove December 2026`, `Remove Honeymoon` — and **not** `North Goa Beaches` (the server rendered the filtered result and both chips).

Run: `curl -s "http://localhost:3000/packages?maxBudget=5000" | grep -o "0 packages\|No trips match these filters\|Try one of these instead\|Clear filters" | sort -u`
Expected: all four — the empty state with suggestions.

Run: `curl -s "http://localhost:3000/packages?month=2026-12" | grep -o '<meta name="robots"[^>]*>'`
Expected: a `noindex` robots tag; `curl -s http://localhost:3000/packages | grep -c 'name="robots"'` → `0`.

Take a screenshot for the eye (from `web/`): `pnpm exec playwright screenshot --viewport-size=390,844 "http://localhost:3000/packages" "$SCRATCHPAD/f3-phone.png"` and a 1280-wide one. Cards should be two-up on desktop, one-up on the phone, rising in.

- [ ] **Step 7: Lint, typecheck, test, build, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: clean; the build lists `/packages` as dynamic (ƒ).

```bash
git add web/src/app/(site)/packages web/src/components/site/packages web/src/components/site/SiteHeader.tsx web/src/app/globals.css
git commit -m "feat(F3): /packages listing rendered from the URL — count, chips, empty state, rising cards"
```

---

### Task 6: Filter rail + toolbar — live updates without a reload

**Files:**
- Create: `web/src/components/site/packages/FilterPanel.tsx`, `web/src/components/site/packages/ResultsToolbar.tsx`
- Modify: `web/src/app/(site)/packages/page.tsx` (swap in the two components)

**Interfaces:**
- Consumes: `useSearch`, `NavLink` (Task 5); `SearchQuery`, `Facets`, `Theme`, `SortOrder`, `searchHref`, `isFiltered`, `SORT_LABEL`, `resultCount`, `FilterChip` (Task 4); `inr`.
- Produces: `FilterPanel({ query, facets })`, `ResultsToolbar({ query, total, chips })`.

Both keep a local copy of the query (`draft` / `sort`) so controls respond instantly, and re-sync from the server's `query` prop **only when no navigation is pending** — overlapping edits keep the latest draft until the last response lands, so nothing snaps back mid-click.

- [ ] **Step 1: The rail**

Create `web/src/components/site/packages/FilterPanel.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { inr } from '@/lib/format';
import {
  DEFAULT_SORT,
  type Facets,
  isFiltered,
  searchHref,
  type SearchQuery,
  type Theme,
} from '@/lib/search';
import { NavLink, useSearch } from './SearchTransition';

type Props = { query: SearchQuery; facets: Facets };

const BUDGET_STEP = 1000; // rupees — the api rounds its facet bounds to the same step
const SLIDER_DEBOUNCE_MS = 350;

/**
 * S4 filter rail. A real GET form to `/packages`, so the URL is the state: with JS every change
 * navigates through the search transition; without it "Show trips" submits the same params.
 * Options (destinations, months, ranges) come from the api's facets — nothing is hard-coded.
 */
export function FilterPanel({ query, facets }: Props) {
  const { navigate, pending } = useSearch();
  const [draft, setDraft] = useState(query);
  const [open, setOpen] = useState(false); // phones: collapsed above the grid (S4)
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setHydrated(true), []);
  // Chips, "Clear all" and back/forward change the URL behind the rail's back: follow the
  // server's query once nothing is in flight.
  useEffect(() => {
    if (!pending) setDraft(query);
  }, [pending, query]);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Show the change now; navigate now, or after a pause for the slider. */
  const commit = (next: SearchQuery, delay = 0) => {
    setDraft(next);
    clearTimeout(timer.current);
    if (delay) timer.current = setTimeout(() => navigate(searchHref(next)), delay);
    else navigate(searchHref(next));
  };
  const toggleDestination = (slug: string, on: boolean) =>
    commit({
      ...draft,
      destination: on ? [...draft.destination, slug] : draft.destination.filter((d) => d !== slug),
    });
  const toggleTheme = (theme: Theme, on: boolean) =>
    commit({
      ...draft,
      themes: on ? [...draft.themes, theme] : draft.themes.filter((t) => t !== theme),
    });
  const setNights = (nightsMin?: number, nightsMax?: number) =>
    commit({ ...draft, nightsMin, nightsMax });

  const showBudget = facets.budget.max > facets.budget.min;
  const budgetValue = draft.maxBudget ?? facets.budget.max;
  const nightsOptions = range(facets.nights.min, facets.nights.max);
  const activeCount =
    draft.destination.length +
    draft.themes.length +
    (draft.maxBudget !== undefined ? 1 : 0) +
    (draft.nightsMin !== undefined || draft.nightsMax !== undefined ? 1 : 0) +
    (draft.month !== undefined ? 1 : 0);

  return (
    <aside aria-label="Filters" className="lg:sticky lg:top-20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="filter-form"
        className="flex w-full items-center justify-between rounded-btn border border-line px-4 py-3 text-sm font-bold lg:hidden"
      >
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && (
            <span className="num rounded-chip bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {activeCount}
            </span>
          )}
        </span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      <form
        id="filter-form"
        method="get"
        action="/packages"
        className={`${open ? 'grid' : 'hidden'} mt-3 gap-5 rounded-[16px] border border-line p-4.5 lg:mt-0 lg:grid`}
      >
        <Group title="Destination">
          {facets.destinations.map((d) => (
            <Check
              key={d.value}
              name="destination"
              value={d.value}
              label={d.label}
              count={d.count}
              checked={draft.destination.includes(d.value)}
              onChange={(on) => toggleDestination(d.value, on)}
            />
          ))}
        </Group>

        {showBudget && (
          <Group title="Budget per person">
            <label className="grid gap-2 text-sm">
              <span className="flex justify-between font-bold">
                <span>Up to</span>
                <span className="num">
                  {draft.maxBudget === undefined ? 'Any' : inr(budgetValue * 100)}
                </span>
              </span>
              <input
                type="range"
                // Unnamed while unlimited so a no-JS submit does not send "maxBudget=<max>".
                name={draft.maxBudget === undefined ? undefined : 'maxBudget'}
                min={facets.budget.min}
                max={facets.budget.max}
                step={BUDGET_STEP}
                value={budgetValue}
                aria-valuetext={draft.maxBudget === undefined ? 'Any budget' : inr(budgetValue * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  commit(
                    { ...draft, maxBudget: v >= facets.budget.max ? undefined : v },
                    SLIDER_DEBOUNCE_MS,
                  );
                }}
                className="accent-primary"
              />
              <span className="num flex justify-between text-xs font-semibold text-mute">
                <span>{inr(facets.budget.min * 100)}</span>
                <span>{inr(facets.budget.max * 100)}</span>
              </span>
            </label>
          </Group>
        )}

        {facets.nights.max > 0 && (
          <Group title="Nights">
            <div className="grid grid-cols-2 gap-2">
              <Select
                name="nightsMin"
                label="From"
                value={draft.nightsMin}
                options={nightsOptions}
                onChange={(v) =>
                  setNights(
                    v,
                    v !== undefined && draft.nightsMax !== undefined && draft.nightsMax < v
                      ? v
                      : draft.nightsMax,
                  )
                }
              />
              <Select
                name="nightsMax"
                label="To"
                value={draft.nightsMax}
                options={nightsOptions}
                onChange={(v) =>
                  setNights(
                    v !== undefined && draft.nightsMin !== undefined && draft.nightsMin > v
                      ? v
                      : draft.nightsMin,
                    v,
                  )
                }
              />
            </div>
          </Group>
        )}

        <Group title="Theme">
          {facets.themes.map((t) => {
            const theme = t.value as Theme;
            const checked = draft.themes.includes(theme);
            return (
              <Check
                key={t.value}
                name="themes"
                value={t.value}
                label={t.label}
                count={t.count}
                checked={checked}
                disabled={t.count === 0 && !checked}
                onChange={(on) => toggleTheme(theme, on)}
              />
            );
          })}
        </Group>

        {facets.months.length > 0 && (
          <Group title="Travel month">
            <Check
              type="radio"
              name="month"
              value=""
              label="Any month"
              checked={draft.month === undefined}
              onChange={() => commit({ ...draft, month: undefined })}
            />
            {facets.months.map((m) => (
              <Check
                key={m.value}
                type="radio"
                name="month"
                value={m.value}
                label={m.label}
                count={m.count}
                checked={draft.month === m.value}
                onChange={() => commit({ ...draft, month: m.value })}
              />
            ))}
          </Group>
        )}

        {draft.sort !== DEFAULT_SORT && <input type="hidden" name="sort" value={draft.sort} />}

        <div className="flex flex-wrap gap-2">
          {!hydrated && (
            <button
              type="submit"
              className="rounded-btn bg-primary px-4 py-2.5 text-sm font-bold text-white"
            >
              Show trips
            </button>
          )}
          {isFiltered(draft) && (
            <NavLink
              href="/packages"
              className="rounded-btn border border-line px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-bg2"
            >
              Clear all
            </NavLink>
          )}
        </div>
      </form>
    </aside>
  );
}

const range = (min: number, max: number) =>
  max >= min ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="label-caps">{title}</h3>
      {children}
    </div>
  );
}

function Check({
  type = 'checkbox',
  name,
  value,
  label,
  count,
  checked,
  disabled,
  onChange,
}: {
  type?: 'checkbox' | 'radio';
  name: string;
  value: string;
  label: string;
  count?: number;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 text-sm ${disabled ? 'text-mute/60' : 'cursor-pointer'}`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4.5 accent-primary"
      />
      <span>{label}</span>
      {count !== undefined && <span className="num ml-auto text-xs text-mute">{count}</span>}
    </label>
  );
}

function Select({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: number | undefined;
  options: number[];
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-mute">
      {label}
      <select
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="rounded-[10px] border border-line bg-bg px-2.5 py-2 text-sm font-semibold text-ink"
      >
        <option value="">Any</option>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
```

No-JS path: blank selects/radios submit `nightsMin=`, `month=` — `BlankQueryParamsMiddleware` strips them on the api and `parseSearchQuery` ignores them on the web. Radio "Any month" has `value=""` for the same reason.

- [ ] **Step 2: The toolbar**

Create `web/src/components/site/packages/ResultsToolbar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  type FilterChip,
  resultCount,
  searchHref,
  type SearchQuery,
  SORT_LABEL,
  type SortOrder,
} from '@/lib/search';
import { NavLink, useSearch } from './SearchTransition';

type Props = { query: SearchQuery; total: number; chips: FilterChip[] };

/** S4 `.toolbar`: count · removable chips · sort. */
export function ResultsToolbar({ query, total, chips }: Props) {
  const { navigate, pending } = useSearch();
  const [sort, setSort] = useState(query.sort);
  useEffect(() => {
    if (!pending) setSort(query.sort);
  }, [pending, query.sort]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="num font-bold" role="status">
        {resultCount(total)}
      </span>
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <NavLink
                href={chip.href}
                ariaLabel={`Remove ${chip.label}`}
                className="inline-flex items-center gap-1.5 rounded-chip bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary no-underline transition-colors hover:bg-primary hover:text-white"
              >
                {chip.label}
                <span aria-hidden>×</span>
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink
              href="/packages"
              className="inline-flex items-center rounded-chip px-2.5 py-1 text-xs font-bold text-mute no-underline hover:text-ink"
            >
              Clear all
            </NavLink>
          </li>
        </ul>
      )}
      <label className="ml-auto flex items-center gap-2 text-sm text-mute">
        Sort
        <select
          value={sort}
          onChange={(e) => {
            const next = e.target.value as SortOrder;
            setSort(next);
            navigate(searchHref({ ...query, sort: next }));
          }}
          className="rounded-[10px] border border-line bg-bg px-2.5 py-1.5 text-sm font-semibold text-ink"
        >
          {(Object.keys(SORT_LABEL) as SortOrder[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Swap them into the page**

In `web/src/app/(site)/packages/page.tsx`:
- add `import { FilterPanel } from '@/components/site/packages/FilterPanel';` and `import { ResultsToolbar } from '@/components/site/packages/ResultsToolbar';`
- replace the placeholder `<aside …>…</aside>` with `<FilterPanel query={query} facets={facets} />`
- replace the inline `<div className="mb-4 flex …">…</div>` (count + chips) with `<ResultsToolbar query={query} total={results.total} chips={chips} />`
- remove the now-unused imports `NavLink` and `resultCount` (keep `Results`, `SearchTransition`); delete the two "Task 6 replaces…" comments.

- [ ] **Step 4: Click through in a browser (the acceptance walk)**

With both dev servers running, open `http://localhost:3000/packages` and check each of these, watching the URL bar and the Network tab (there must be **no full document reload** — only RSC fetches — and no `/api/packages` XHR):

1. Tick **Honeymoon** → URL becomes `/packages?themes=honeymoon`, count "1 package", grid dims briefly then shows Goa Quiet Escape rising in, chip "Honeymoon ×" appears.
2. Choose month **December 2026** → URL adds `&month=2026-12`; the November radio shows count 2, December 2; "Any month" clears it.
3. Drag the budget slider to ₹15,000 → after the pause the URL gains `maxBudget=15000`; with Honeymoon still ticked → "0 packages", the S4b box with "Nothing departs in December 2026 with these filters…", "Clear filters", and "Try one of these instead" with two cards.
4. Click chip **× Honeymoon** → only the chip's filter goes; the checkbox unticks by itself (the rail re-synced from the URL).
5. Sort → "Price, high to low" → order flips, `sort=price-desc` in the URL; no chip for sort.
6. Nights From = 4, To = 3 → the "To" select jumps to 4 (never a reversed range in the URL).
7. Reload the page on a filtered URL → the same state renders server-side (checkboxes ticked, count right). Paste the URL in a private window → same.
8. Phone width (390): the rail is a "Filters (2)" button; tapping opens it above the grid; cards are one-up.
9. Browser back → the earlier filter state does **not** come back step by step (`replace`), only the page you came from — intended.
10. DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce" → cards appear without the rise.

- [ ] **Step 5: Lint, typecheck, test, build, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: clean; vitest **47 passed** (34 + 1 + 12).

```bash
git add web/src/app/(site)/packages/page.tsx web/src/components/site/packages
git commit -m "feat(F3): filter rail and toolbar — URL-driven, no-reload updates, works as a plain GET form"
```

---

### Task 7: Docs, full verification, production check, PR

**Files:**
- Modify: `docs/07-plan.md:46` — mark F1+F2 done (deferred here by the F1 plan).

- [ ] **Step 1: Mark F1+F2 in the plan**

In `docs/07-plan.md` change the F1+F2 row's part cell from `**Catalog read services**` to `**Catalog read services** ✅ PR #20 + #21` (same style as the S rows). F3's own mark goes in F4+F5's PR.

```bash
git add docs/07-plan.md
git commit -m "docs: mark F1+F2 done in 07-plan"
```

- [ ] **Step 2: Everything green from the root**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm gen:api && git diff --exit-code api/openapi.json web/src/lib/api-types.ts`
Expected: lint/typecheck clean; pytest **106 passed**, vitest **47 passed**; no contract diff.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin f3-package-search
gh pr create --title "feat(F3): package search — filters, sort, facets, URL-driven listing" --body "$(cat <<'BODY'
## Summary
- **api:** `GET /packages` takes `destination[]`, `maxBudget` (rupees), `nightsMin`/`nightsMax`, `themes[]`, `month` (YYYY-MM), `sort` (`price-asc` default · `price-desc` · `duration`) via a pydantic query model (`SearchParams` — the v3 tool's argument schema too); `search_packages(params)` applies them as SQL (month = EXISTS over upcoming departures with `seats_left > 0` from the view); response gains `facets` (destinations/themes/months with counts, nights + budget ranges) so the panel offers only real options. Bad values → `400 validation` with `fieldErrors`. 16 new pytest cases (filter matrix, sort incl. "on request" last, facets, direct-call reuse).
- **web:** `/packages` on the K tokens — filter rail (destination, budget slider, nights, theme, travel month), count, removable chips, sort, S4b empty state with suggestions, cards rising in. The URL is the state: `lib/search.ts` parses/serialises it (12 vitest cases); the rail is a GET form that, with JS, navigates via `router.replace` in one `useTransition` (server re-render, no reload, no client fetch). Filtered URLs render server-side and are `noindex` with canonical `/packages`. Header gains **Trips**.
- Contract regenerated; `api()` accepts array search params.

## Test plan
- [ ] CI green (web · api · contract)
- [ ] https://tripsmith-api.vercel.app/packages?themes=honeymoon&month=2026-12 → 1 item + facets; `?nightsMin=5&nightsMax=3` → 400 `nightsMax`
- [ ] https://tripsmith.vercel.app/packages renders 2 cards; tick a theme → URL + count update without a reload; paste the URL in a private window → same state
- [ ] Phone: rail collapses under "Filters"; cards one-up

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 4: Review before merging**

From the worktree cwd run `/code-review <pr> high` (the skill reviews whatever repo the shell cwd is in — the F1 lesson). Fix findings on this branch, push, wait for CI.

- [ ] **Step 5: Squash-merge, verify production, tracker**

Session policy (2026-09-15): review → squash-merge → verify prod → tracker → next. `gh pr merge --squash --delete-branch` (the "main is already used by worktree" message is harmless). The web deployment prerenders nothing for `/packages` (dynamic), but `vercel redeploy` the web deployment anyway if it went live before the api ([[vercel-web-api-deploy-race]]). Then:

```bash
curl -s "https://tripsmith-api.vercel.app/packages?themes=honeymoon&month=2026-12" | head -c 400
curl -s -o /dev/null -w "%{http_code}\n" "https://tripsmith-api.vercel.app/packages?nightsMin=5&nightsMax=3"
curl -s "https://tripsmith.vercel.app/packages?themes=honeymoon" | grep -o "1 package\|Goa Quiet Escape" | sort -u
```

Expected: JSON with one item and `facets`; `400`; both strings. Previews are behind Vercel Authentication — only production counts. Update the tracker artifact row **F3 → done** (row status in the artifact db `rows/f3`), note the PR number in memory, then start **F4+F5 Content → 6 packages + Destinations** in a new worktree.

---

## Summary

| Task | Deliverable | Tests |
|---|---|---|
| 1 | `SearchParams`, `SortOrder`, facet schemas, pure `month_label` / `budget_range` / `sort_order` | 3 pytest |
| 2 | `search_packages(params)` filters + sort + facets; `GET /packages` query params | 13 pytest (db) |
| 3 | Contract regenerated; `api()` array search params | 1 vitest |
| 4 | `lib/search.ts` — parse · serialise · chips | 12 vitest |
| 5 | `/packages` server page, grid + motion, empty state, transition context, header link | curl checks |
| 6 | Filter rail + toolbar — no-reload updates, GET form fallback | browser walk |
| 7 | Docs mark, root verification, PR, prod check, tracker | — |

Totals after merge: pytest 106 · vitest 47.

## Self-review notes

- **Spec coverage — 07-plan F3 row:** FilterBar (destination multi ✓ T6, budget max ✓ T6 slider, nights range ✓ T6 selects, theme multi ✓ T6, travel month ✓ T6) · sort ✓ T6 · filters in URL ✓ T4/T5 · result count ✓ T5/T6 · empty state ✓ T5 · client re-fetch without reload ✓ T5/T6 (`router.replace` + `useTransition`) · `search_packages(params)` single function ✓ T2 (direct-call test proves the v3 reuse) · `GET /packages` ✓ T2 · `PackageCard` schema unchanged ✓ · "pytest filter matrix green" ✓ T2 · "shareable filter URLs render server-side" ✓ T5 curl checks.
- **03 R3:** every listed filter ✓; card contents unchanged from F1's `PackageCard` (cover, name, destination, N/D, from-price, first highlight, stamp) ✓; "filters live in the URL, shareable and crawlable" ✓ (canonical + noindex decision); "empty state suggests clearing filters" ✓; "result count shown" ✓; "results update without full reload" ✓.
- **06 C1:** param names/types match (`destination: string[]`, `maxBudget: number`, `nightsMin/Max`, `themes: Theme[]`, `month: 'YYYY-MM'`, `sort` enum); return `{ items, total }` extended additively with `facets` — noted for the doc in a later docs pass (06 C1 table should gain `facets`; not blocking).
- **Deferred by design:** inline search bar on the listing (F6 builds the home form), "Ask us for options" (F9), facet counts narrowed by the current filter (not needed at 12 packages), pagination.
- **Type consistency:** `SearchParams` aliases (`maxBudget`, `nightsMin`, `nightsMax`) = URL names in `search.ts` = test query strings; `SearchFacets.{destinations,themes,months,nights,budget}` used identically in T2 tests, T4 fixture, T6 rail; `PackageList.facets` read as `results.facets` in T5; `NavLink` props `{ href, className?, ariaLabel?, children }` match every call site (T5 page, T5 EmptyState, T6 toolbar/rail); `useSearch()` returns `{ pending, navigate }` and both T6 components read both; `resultCount`, `activeChips`, `searchHref`, `isFiltered`, `EMPTY_QUERY`, `toApiSearchParams`, `toSearchParams` all exported from T4 with the signatures T5/T6 call; `sort_order` returns a tuple spread into `.order_by(*…)` in both the T1 interim and T2 final `search_packages`.
- **Placeholder scan:** the only "fallback" text is Task 2 Step 4's explicit alternative route body (full code, exact condition to switch) and Task 2's `.op("&&")` alternative — both are complete instructions, not TODOs.
