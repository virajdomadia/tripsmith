# F1+F2 — Catalog read services + Package page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor can open `/packages/<slug>` on production and read everything about a seeded package — gallery + lightbox, facts, highlights, day-by-day itinerary, inclusions, hotels, departures with seats/badges, occupancy pricing, FAQ, related trips — served by new `GET /packages/{slug}`, `GET /packages/{slug}/departures?month=`, `GET /destinations[/{slug}]` endpoints.

**Architecture:** `api/app/services/catalog/reads.py` holds the four read functions (pure SQLAlchemy 2.0 async over the existing models, `seats_left` from the `departure_availability` view) and returns pydantic `ApiModel`s; thin routers add `Cache-Control` and the 404 envelope; `pnpm gen:api` regenerates the contract. `web/` gets a typed path-param helper in `api.ts`, a statically generated `/packages/[slug]` page composed of server components on the K tokens, plus three small client islands (gallery lightbox, section scroll-spy, GSAP-scrubbed itinerary route line).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + pydantic v2 + pytest (`db` marker, Alembic harness) · Next.js 15 App Router + React 19 + Tailwind 4 `@theme` tokens + `gsap`/`@gsap/react` + vitest.

**Spec:** `docs/07-plan.md` rows **F1+F2** (milestone 1.1), `docs/03-requirements.md` §R4, `docs/06-data-and-api.md` §A3 (`departure_availability`), §C0, §C1, §C-REST, `docs/04-ui-mockups.md` (K tokens, showcase motion), `mockups/screens.html` S5 (the visual reference — open it in a browser while building Tasks 8–10).

## Global Constraints

- One branch, one PR: `f1-catalog-reads` (worktree `.worktrees/f1-catalog-reads`, already created from `origin/main` = `b3c3c39`). Never touch the main checkout; never bare `git stash`. Squash-merge at the end.
- Python `>=3.12,<3.13`, ruff line length 100, rules E/F/I/B/UP, pyright basic — `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright` must stay green. `uv` is not on the bash PATH: prefix commands with `export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"`.
- JSON on the wire is camelCase (`ApiModel` alias generator); Python is snake_case. Every response model extends `app.schemas.ApiModel`.
- Every public GET sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (`PUBLIC_CACHE_CONTROL`). Errors are the envelope `{ error: { code, message, fieldErrors? } }` via `ApiError`.
- Badge rules stay in `services/catalog/pricing.py`: *Sold out* 0 seats · *Filling fast* ≤ 4 · *Guaranteed* flag · else none. Prices are integer paise.
- Draft packages are invisible publicly (404). Departures before today are never returned. `seats_left` always comes from the `departure_availability` view, never `seats_total` directly (v2 replaces the view).
- Contract files `api/openapi.json` and `web/src/lib/api-types.ts` are generated (`pnpm gen:api`), committed, and freshness-tested — regenerate after any schema/route change, never hand-edit.
- Web: no new UI libraries; `gsap` + `@gsap/react` are the only new deps (the authored motion, 04 §"The showcase"). Every colour/radius/shadow comes from `globals.css` tokens via Tailwind utilities (`bg-bg2`, `text-mute`, `border-line`, `rounded-card`, `shadow-lift`, `ease-(--ease-out)` …) — no hex values in components. Tabular numerals on every price. `prefers-reduced-motion` renders everything at rest.
- Photos: `next/image` with the width/height the API returns; remote hosts `*.public.blob.vercel-storage.com` (prod) and `http://localhost:8000` (`seed.py --local`).
- **No CTAs on the package page yet** (no Enquire / PDF / WhatsApp buttons, no mobile CTA bar) — F11/F12 add them. The price box is informational.
- Tests only where a bug would embarrass in a demo: availability/badges, month filter, draft hiding, related ranking, path-param substitution, price/date formatting, JSON-LD offers. No tests for layout.
- Package page must be statically generated for the seeded slugs (`generateStaticParams`), render unknown slugs on demand, use tagged fetches `package:<slug>` / `packages` with `revalidate: false`, and must not break `next build` when the api is unreachable (CI has no `API_URL`).

---

## Local environment (do once, before Task 1)

The worktree has no `.env.local` files and pytest `db` tests need a Postgres. Use a throwaway cluster from the installed PG 18 (the `postgres` password in `.env.local` does not match it).

```bash
cd "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/.worktrees/f1-catalog-reads"
cp ../../api/.env.local api/.env.local && cp ../../web/.env.local web/.env.local
export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
PG="/c/Program Files/PostgreSQL/18/bin"
export PGDATA="$SCRATCHPAD/pg"   # $SCRATCHPAD = the session scratchpad directory from the system prompt
"$PG/initdb" -U tripsmith -A trust -E UTF8 -D "$PGDATA" >/dev/null
```

`pg_ctl -w start` hangs the bash tool — start it with `run_in_background: true` (Bash tool option) as its own call:

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
uv run --directory api pytest -q     # baseline: 78 passed
pnpm --filter web test               # baseline: 25 passed
```

Run the dev api against the local DB (background call): `DATABASE_URL=$DEV_URL uv run --directory api uvicorn app.main:app --reload --port 8000`, and web: `pnpm --filter web dev`. Kill by port afterwards (`Get-NetTCPConnection -LocalPort 8000 | Stop-Process` in PowerShell) — never `taskkill //IM node.exe`.

---

## File structure

**api/**
- Modify `app/models/catalog.py` — add the `departure_availability` view as a lightweight `table()` so services join it instead of reading `seats_total`.
- Create `app/services/catalog/availability.py` — `Availability` dataclass + `next_departures(db, today)` (earliest upcoming departure per package, seats from the view). Extracted from `search.py`.
- Create `app/services/catalog/cards.py` — `package_card(package, availability)`: the one `Package` → `PackageCard` mapper (search, related, destination pages).
- Modify `app/services/catalog/search.py` — use the two modules above; behaviour unchanged.
- Create `app/services/catalog/reads.py` — `get_package`, `get_departures_for_month`, `list_destinations`, `get_destination`, plus pure helpers `month_bounds`, `related_order`.
- Modify `app/schemas/catalog.py` — `PackageDetail` and friends, `DepartureList`, `DestinationCard`/`List`/`Detail`.
- Modify `app/routers/site/catalog.py` — the four routes.
- Create `tests/test_catalog_reads.py`; modify `tests/test_catalog.py` only if the refactor breaks an import (it should not).
- Regenerate `openapi.json` → `web/src/lib/api-types.ts`.

**web/**
- Modify `src/lib/api.ts` — `params` (path template substitution).
- Create `src/lib/format.ts` — `inr`, `formatDate`, `duration`.
- Create `src/lib/seo/package-jsonld.ts`, `src/components/seo/JsonLd.tsx`.
- Create `src/components/site/Badge.tsx`, `Stamp.tsx`, `Photo.tsx`, `PackageCard.tsx`; restyle `SiteHeader.tsx` / `SiteFooter.tsx` on the tokens.
- Create `src/components/site/package/` — `PackageHero.tsx`, `Gallery.tsx` (client), `QuickFacts.tsx`, `SectionNav.tsx` (client), `Highlights.tsx`, `Itinerary.tsx` + `ItineraryMotion.tsx` (client), `Inclusions.tsx`, `Hotels.tsx`, `DeparturesTable.tsx`, `OccupancyPricing.tsx`, `Faq.tsx`, `PriceBox.tsx`, `RelatedPackages.tsx`.
- Create `src/app/(site)/packages/[slug]/page.tsx`, `src/app/not-found.tsx`.
- Modify `src/components/site/ApiStatus.tsx` (link each listed package to its page), `next.config.ts` (localhost image host).
- Tests: `tests/api.test.ts` (+1), create `tests/format.test.ts`, `tests/package-jsonld.test.ts`.

---

### Task 1: Availability from the view + card mapper (refactor, no behaviour change)

**Files:**
- Modify: `api/app/models/catalog.py`
- Create: `api/app/services/catalog/availability.py`, `api/app/services/catalog/cards.py`
- Modify: `api/app/services/catalog/search.py`
- Test: existing `api/tests/test_catalog.py` (must stay green)

**Interfaces:**
- Produces: `departure_availability` (SQLAlchemy `TableClause` with columns `departure_id: Text`, `seats_left: Integer`); `Availability(seats_left: int, guaranteed: bool, price_double_paise: int)` (frozen dataclass, satisfies `pricing.DepartureLike`); `async next_departures(db: AsyncSession, today: dt.date) -> dict[str, Availability]` keyed by `package_id`; `package_card(p: Package, availability: Availability | None) -> PackageCard` (requires `p.destination` and `p.cover_image` loaded).

- [ ] **Step 1: Add the view to the models**

Append to `api/app/models/catalog.py` (add `column, table` to the `sqlalchemy` import):

```python
# The `departure_availability` view (06 A3). v1 = `seats_total`; the v2 migration replaces the
# view to subtract bookings. Services join this instead of reading seats_total so v2 changes
# nothing above the database.
departure_availability = table(
    "departure_availability",
    column("departure_id", Text),
    column("seats_left", Integer),
)
```

- [ ] **Step 2: Create `availability.py`**

```python
"""Upcoming-departure availability (seats from the `departure_availability` view)."""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure
from app.models.catalog import departure_availability


@dataclass(frozen=True)
class Availability:
    """Satisfies `pricing.DepartureLike`."""

    seats_left: int
    guaranteed: bool
    price_double_paise: int


async def next_departures(db: AsyncSession, today: dt.date) -> dict[str, Availability]:
    """The earliest departure on/after `today` per package id — the card badge's source."""
    rows = await db.execute(
        select(
            Departure.package_id,
            Departure.guaranteed,
            Departure.price_double_paise,
            departure_availability.c.seats_left,
        )
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.date >= today)
        .order_by(Departure.package_id, Departure.date)
    )
    out: dict[str, Availability] = {}
    for package_id, guaranteed, price, seats_left in rows:
        out.setdefault(package_id, Availability(seats_left, guaranteed, price))
    return out
```

- [ ] **Step 3: Create `cards.py`**

```python
"""`Package` → `PackageCard`, shared by search, related trips and destination pages."""

from app.models import Package
from app.schemas.catalog import PackageCard
from app.services.catalog.availability import Availability
from app.services.catalog.pricing import badge_for


def package_card(p: Package, availability: Availability | None) -> PackageCard:
    """`p.destination` and `p.cover_image` must be loaded (selectinload) by the caller."""
    return PackageCard(
        slug=p.slug,
        name=p.name,
        destination=p.destination.name,
        nights=p.nights,
        days=p.days,
        starting_price_paise=p.starting_price_paise,
        themes=list(p.themes),
        cover_url=p.cover_image.url if p.cover_image else None,
        highlights=list(p.highlights),
        badge=badge_for(availability) if availability else None,
    )
```

- [ ] **Step 4: Rewrite `search.py` on top of them**

Replace the whole file body below the docstring with:

```python
import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Package
from app.models.enums import PackageStatus
from app.schemas.catalog import PackageCard
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card


async def search_packages(db: AsyncSession, *, today: dt.date | None = None) -> list[PackageCard]:
    today = today or dt.date.today()
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.status == PackageStatus.LIVE)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
                .order_by(Package.starting_price_paise, Package.name)
            )
        )
        .scalars()
        .all()
    )
    upcoming = await next_departures(db, today)
    return [package_card(p, upcoming.get(p.id)) for p in packages]
```

Keep the module docstring; delete `_Availability` and `_next_departures`.

- [ ] **Step 5: Run the existing suite**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright && uv run --directory api pytest -q tests/test_catalog.py`
Expected: all green — `test_badge_uses_the_next_upcoming_departure` still passes (it proves the view join works: it sets `seats_total=3` and the view mirrors it).

- [ ] **Step 6: Commit**

```bash
git add api/app/models/catalog.py api/app/services/catalog/
git commit -m "refactor(catalog): seats from the departure_availability view; shared card mapper"
```

### Task 2: Response schemas + pure helpers (`month_bounds`, `related_order`)

**Files:**
- Modify: `api/app/schemas/catalog.py`
- Create: `api/app/services/catalog/reads.py` (helpers only in this task; the async reads come in Tasks 3–5)
- Test: `api/tests/test_catalog_reads.py`

**Interfaces:**
- Produces schemas (all `ApiModel`, camelCase on the wire): `DestinationRef{slug,name}`, `ImageOut{url,alt,width,height}`, `Meals{breakfast,lunch,dinner}`, `ItineraryDayOut{day_no,title,description,meals,stay}`, `HotelOut{name,city,stars,nights}`, `FaqItem{q,a}`, `DepartureOut{id,date,seats_total,seats_left,guaranteed,price_double_paise,price_triple_paise,price_child_paise,single_supplement_paise,badge}`, `DepartureList{items}`, `PackageDetail{slug,name,summary,destination,themes,nights,days,departure_city,starting_price_paise,highlights,inclusions,exclusions,hotels,faq,itinerary,images,cover,departures,related,updated_at}`, `DestinationCard{slug,name,tagline,cover_url,package_count,starting_price_paise}`, `DestinationList{items}`, `DestinationDetail{slug,name,tagline,intro,cover_url,region,best_months,packages}`.
- Produces helpers: `month_bounds(month: str) -> tuple[dt.date, dt.date]` (first day, first day of next month); `related_order(package, candidates) -> list` (same destination → shared theme → rest; cheapest first inside each tier; excludes `package` itself).

- [ ] **Step 1: Write the failing tests**

Create `api/tests/test_catalog_reads.py`:

```python
"""F1 catalog reads: package detail, departures by month, destinations (06 C1, R4)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package
from app.models.enums import PackageStatus
from app.services.catalog.reads import month_bounds, related_order
from content import load_content
from scripts.seed import seed
from tests.settings import make_settings
from tests.test_catalog import RecordingStore

CACHE = "public, s-maxage=60, stale-while-revalidate=300"


async def seeded(db: AsyncSession) -> None:
    await seed(db, load_content(), RecordingStore(), make_settings())


async def set_status(db: AsyncSession, slug: str, status: PackageStatus) -> None:
    await db.execute(update(Package).where(Package.slug == slug).values(status=status))
    await db.commit()


# --- pure helpers -------------------------------------------------------------------------------


def test_month_bounds_rolls_over_december() -> None:
    assert month_bounds("2026-12") == (dt.date(2026, 12, 1), dt.date(2027, 1, 1))
    assert month_bounds("2026-02") == (dt.date(2026, 2, 1), dt.date(2026, 3, 1))


class P:  # package-like duck for related_order
    def __init__(self, id: str, dest: str, themes: list[str], price: int, name: str = "") -> None:
        self.id = id
        self.destination_id = dest
        self.themes = themes
        self.starting_price_paise = price
        self.name = name or id


def test_related_order_same_destination_then_shared_theme_then_rest_cheapest_first() -> None:
    me = P("me", "goa", ["beach", "family"], 100)
    candidates = [
        me,  # excluded
        P("kerala-family", "kerala", ["family"], 50),
        P("goa-pricey", "goa", ["honeymoon"], 900),
        P("goa-cheap", "goa", ["beach"], 300),
        P("ladakh", "ladakh", ["adventure"], 10),
        P("himachal-beach", "himachal", ["hills", "beach"], 400),
    ]
    assert [p.id for p in related_order(me, candidates)] == [
        "goa-cheap",
        "goa-pricey",
        "kerala-family",
        "himachal-beach",
        "ladakh",
    ]
```

(`pytest`, `AsyncClient`, `Departure`, `PackageStatus`, `seeded`, `set_status`, `CACHE` are used by the DB tests added in Tasks 3–5 — ruff F401 will complain until then; that is expected and goes away in Task 3.)

- [ ] **Step 2: Run to verify it fails**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.catalog.reads'`.

- [ ] **Step 3: Add the schemas**

Append to `api/app/schemas/catalog.py` (add `import datetime as dt` at the top):

```python
class DestinationRef(ApiModel):
    slug: str
    name: str


class ImageOut(ApiModel):
    url: str
    alt: str
    width: int
    height: int


class Meals(ApiModel):
    breakfast: bool
    lunch: bool
    dinner: bool


class ItineraryDayOut(ApiModel):
    day_no: int
    title: str
    description: str = Field(description="Markdown")
    meals: Meals
    stay: str | None = Field(description="Hotel / city for the night; null on the last day")


class HotelOut(ApiModel):
    name: str
    city: str
    stars: int
    nights: int


class FaqItem(ApiModel):
    q: str
    a: str


class DepartureOut(ApiModel):
    id: str
    date: dt.date
    seats_total: int
    seats_left: int = Field(description="From the departure_availability view")
    guaranteed: bool
    price_double_paise: int = Field(description="Per adult, double sharing")
    price_triple_paise: int
    price_child_paise: int = Field(description="Child 5-11 sharing the parents room")
    single_supplement_paise: int
    badge: Badge | None


class DepartureList(ApiModel):
    items: list[DepartureOut] = Field(description="Upcoming departures, soonest first")


class PackageDetail(ApiModel):
    slug: str
    name: str
    summary: str
    destination: DestinationRef
    themes: list[Theme]
    nights: int
    days: int
    departure_city: str
    starting_price_paise: int = Field(description="Cheapest upcoming double-sharing price; 0 if none")
    highlights: list[str]
    inclusions: list[str]
    exclusions: list[str]
    hotels: list[HotelOut]
    faq: list[FaqItem]
    itinerary: list[ItineraryDayOut]
    images: list[ImageOut] = Field(description="Gallery order; the cover is first")
    cover: ImageOut | None
    departures: list[DepartureOut] = Field(description="Upcoming only, soonest first")
    related: list[PackageCard] = Field(description="Up to 3: same destination, then shared theme")
    updated_at: dt.datetime


class DestinationCard(ApiModel):
    slug: str
    name: str
    tagline: str
    cover_url: str
    package_count: int = Field(description="Live packages")
    starting_price_paise: int


class DestinationList(ApiModel):
    items: list[DestinationCard] = Field(description="Only destinations with at least 1 live package")


class DestinationDetail(ApiModel):
    slug: str
    name: str
    tagline: str
    intro: str = Field(description="Markdown")
    cover_url: str
    region: str
    best_months: list[int] = Field(description="1-12")
    packages: list[PackageCard] = Field(description="Live packages, cheapest first")
```

- [ ] **Step 4: Create `reads.py` with the helpers**

```python
"""Catalog reads for the package page and destination pages (06 C1).

`get_package` / `get_departures_for_month` / `list_destinations` / `get_destination` return
pydantic models or `None` (the router turns `None` into the 404 envelope). Draft packages never
leave this module; `seats_left` always comes from the `departure_availability` view.
"""

import datetime as dt
from collections.abc import Iterable
from typing import Protocol, TypeVar


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    """`'2026-12'` -> `(2026-12-01, 2027-01-01)`; the router validated the format."""
    year, mon = (int(part) for part in month.split("-"))
    start = dt.date(year, mon, 1)
    end = dt.date(year + 1, 1, 1) if mon == 12 else dt.date(year, mon + 1, 1)
    return start, end


class PackageLike(Protocol):
    id: str
    destination_id: str
    themes: list  # Theme enums or their string values
    starting_price_paise: int
    name: str


TPackage = TypeVar("TPackage", bound=PackageLike)


def related_order(package: PackageLike, candidates: Iterable[TPackage]) -> list[TPackage]:
    """R4 "same destination or theme": tier 0 same destination, 1 shares a theme, 2 anything
    else live; cheapest first within a tier, name as tiebreaker; the package itself excluded."""
    mine = set(package.themes)

    def tier(p: PackageLike) -> int:
        if p.destination_id == package.destination_id:
            return 0
        return 1 if mine & set(p.themes) else 2

    return sorted(
        (p for p in candidates if p.id != package.id),
        key=lambda p: (tier(p), p.starting_price_paise, p.name),
    )
```

- [ ] **Step 5: Run the tests**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py`
Expected: 2 passed.

- [ ] **Step 6: Format, then commit**

Run: `uv run --directory api ruff format . && uv run --directory api pyright` (ruff `check` still reports unused imports in the test file — fixed by Task 3).

```bash
git add api/app/schemas/catalog.py api/app/services/catalog/reads.py api/tests/test_catalog_reads.py
git commit -m "feat(F1): catalog read schemas + month/related helpers"
```

### Task 3: `get_package` + `GET /packages/{slug}`

**Files:**
- Modify: `api/app/services/catalog/reads.py`
- Modify: `api/app/routers/site/catalog.py`
- Test: `api/tests/test_catalog_reads.py`

**Interfaces:**
- Consumes: `next_departures`, `package_card`, `Availability` (Task 1); schemas + `related_order` (Task 2); `departure_availability` table; `badge_for`.
- Produces: `async get_package(db: AsyncSession, slug: str, *, today: dt.date | None = None) -> PackageDetail | None`; private `async _upcoming_departures(db, package_id, today, month: str | None = None) -> list[DepartureOut]` and `_departure_out(d: Departure, seats_left: int) -> DepartureOut` (reused by Task 4); route `GET /packages/{slug}` operationId `getPackage`, 404 envelope `{"code": "not_found", "message": "Package not found"}`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_catalog_reads.py`:

```python
# --- GET /packages/{slug} -----------------------------------------------------------------------


@pytest.mark.db
async def test_get_package_returns_the_full_detail(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)

    res = await db_client.get("/packages/north-goa-beaches")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    p = res.json()
    assert p["name"] == "North Goa Beaches"
    assert p["destination"] == {"slug": "goa", "name": "Goa"}
    assert (p["nights"], p["days"], p["departureCity"]) == (3, 4, "Ex-Mumbai")
    assert p["startingPricePaise"] == 14_499_00
    assert p["themes"] == ["beach", "family"]
    assert len(p["highlights"]) == 4 and p["inclusions"] and p["exclusions"]
    assert p["hotels"][0] == {
        "name": "Lemon Tree Amarante Beach Resort",
        "city": "Candolim",
        "stars": 4,
        "nights": 3,
    }
    assert p["faq"][0]["q"] == "Is this package suitable for children?"
    # Itinerary: one entry per day, in order, with the meals object.
    assert [d["dayNo"] for d in p["itinerary"]] == [1, 2, 3, 4]
    assert set(p["itinerary"][0]["meals"]) == {"breakfast", "lunch", "dinner"}
    assert p["itinerary"][1]["meals"]["breakfast"] is True
    # Gallery: seed order, cover first, dimensions present.
    assert len(p["images"]) >= 4
    assert p["cover"] == p["images"][0]
    assert p["images"][0]["url"].endswith("/packages/north-goa-beaches/vagator-palms-1.jpg")
    assert p["images"][0]["width"] > 0 and p["images"][0]["alt"]
    # Departures: all four are upcoming (seeded 2026-11 to 2027-02), soonest first, seats from the
    # view, badges by the pricing rules (16 guaranteed / 4 seats / 16 plain / 12 plain).
    assert [d["date"] for d in p["departures"]] == [
        "2026-11-20",
        "2026-12-18",
        "2027-01-15",
        "2027-02-12",
    ]
    assert [d["seatsLeft"] for d in p["departures"]] == [16, 4, 16, 12]
    assert [d["badge"] for d in p["departures"]] == ["guaranteed", "filling-fast", None, None]
    first = p["departures"][0]
    assert (first["priceDoublePaise"], first["priceTriplePaise"]) == (14_999_00, 13_499_00)
    assert (first["priceChildPaise"], first["singleSupplementPaise"]) == (8_999_00, 6_000_00)
    assert first["id"] and first["seatsTotal"] == 16
    # Related: the only other live package (same destination), as a card with its badge.
    assert [r["slug"] for r in p["related"]] == ["goa-quiet-escape"]
    assert p["related"][0]["badge"] == "guaranteed"
    assert p["updatedAt"]


@pytest.mark.db
async def test_get_package_hides_past_departures(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    await db.execute(
        update(Departure)
        .where(Departure.date == dt.date(2026, 11, 20))
        .values(date=dt.date(2020, 1, 1))
    )
    await db.commit()

    p = (await db_client.get("/packages/north-goa-beaches")).json()

    assert [d["date"] for d in p["departures"]] == ["2026-12-18", "2027-01-15", "2027-02-12"]
    assert p["departures"][0]["badge"] == "filling-fast"


@pytest.mark.db
async def test_get_package_404s_for_drafts_and_unknown_slugs(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    await set_status(db, "goa-quiet-escape", PackageStatus.DRAFT)

    for slug in ("goa-quiet-escape", "nope"):
        res = await db_client.get(f"/packages/{slug}")
        assert res.status_code == 404, slug
        assert res.json() == {"error": {"code": "not_found", "message": "Package not found"}}

    # A draft is also no longer "related" to the live one.
    live = (await db_client.get("/packages/north-goa-beaches")).json()
    assert live["related"] == []
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py`
Expected: 3 new tests FAIL with status 404 ≠ 200 (the route does not exist: FastAPI 404 → envelope `not_found` "Not Found" — the message differs from ours) and the draft test fails on the message text.

- [ ] **Step 3: Implement `get_package`**

Add to `api/app/services/catalog/reads.py` (imports at the top of the module):

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Package
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.catalog import (
    DepartureOut,
    DestinationRef,
    FaqItem,
    HotelOut,
    ImageOut,
    ItineraryDayOut,
    Meals,
    PackageDetail,
)
from app.services.catalog.availability import Availability, next_departures
from app.services.catalog.cards import package_card
from app.services.catalog.pricing import badge_for

RELATED_LIMIT = 3
```

and the functions (after `related_order`):

```python
def _image_out(image) -> ImageOut:  # PackageImage
    return ImageOut(url=image.url, alt=image.alt, width=image.width, height=image.height)


def _departure_out(d: Departure, seats_left: int) -> DepartureOut:
    availability = Availability(seats_left, d.guaranteed, d.price_double_paise)
    return DepartureOut(
        id=d.id,
        date=d.date,
        seats_total=d.seats_total,
        seats_left=seats_left,
        guaranteed=d.guaranteed,
        price_double_paise=d.price_double_paise,
        price_triple_paise=d.price_triple_paise,
        price_child_paise=d.price_child_paise,
        single_supplement_paise=d.single_supplement_paise,
        badge=badge_for(availability),
    )


async def _upcoming_departures(
    db: AsyncSession, package_id: str, today: dt.date, month: str | None = None
) -> list[DepartureOut]:
    stmt = (
        select(Departure, departure_availability.c.seats_left)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.package_id == package_id, Departure.date >= today)
        .order_by(Departure.date)
    )
    if month:
        start, end = month_bounds(month)
        stmt = stmt.where(Departure.date >= start, Departure.date < end)
    rows = await db.execute(stmt)
    return [_departure_out(d, seats_left) for d, seats_left in rows]


async def _live_package(db: AsyncSession, slug: str) -> Package | None:
    return (
        await db.execute(
            select(Package)
            .where(Package.slug == slug, Package.status == PackageStatus.LIVE)
            .options(
                selectinload(Package.destination),
                selectinload(Package.itinerary),
                selectinload(Package.images),
                selectinload(Package.cover_image),
            )
        )
    ).scalar_one_or_none()


async def _related(db: AsyncSession, package: Package, today: dt.date) -> list:
    candidates = (
        (
            await db.execute(
                select(Package)
                .where(Package.status == PackageStatus.LIVE, Package.id != package.id)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
            )
        )
        .scalars()
        .all()
    )
    upcoming = await next_departures(db, today)
    return [
        package_card(p, upcoming.get(p.id))
        for p in related_order(package, candidates)[:RELATED_LIMIT]
    ]


async def get_package(
    db: AsyncSession, slug: str, *, today: dt.date | None = None
) -> PackageDetail | None:
    """Everything the package page renders; `None` for drafts and unknown slugs (06 C1)."""
    today = today or dt.date.today()
    p = await _live_package(db, slug)
    if p is None:
        return None
    images = [_image_out(i) for i in p.images]
    return PackageDetail(
        slug=p.slug,
        name=p.name,
        summary=p.summary,
        destination=DestinationRef(slug=p.destination.slug, name=p.destination.name),
        themes=list(p.themes),
        nights=p.nights,
        days=p.days,
        departure_city=p.departure_city,
        starting_price_paise=p.starting_price_paise,
        highlights=list(p.highlights),
        inclusions=list(p.inclusions),
        exclusions=list(p.exclusions),
        hotels=[HotelOut.model_validate(h) for h in p.hotels],
        faq=[FaqItem.model_validate(f) for f in p.faq],
        itinerary=[
            ItineraryDayOut(
                day_no=d.day_no,
                title=d.title,
                description=d.description,
                meals=Meals(breakfast=d.meal_b, lunch=d.meal_l, dinner=d.meal_d),
                stay=d.stay,
            )
            for d in p.itinerary
        ],
        images=images,
        cover=_image_out(p.cover_image) if p.cover_image else (images[0] if images else None),
        departures=await _upcoming_departures(db, p.id, today),
        related=await _related(db, p, today),
        updated_at=p.updated_at,
    )
```

Type the `_related` return as `list[PackageCard]` (import `PackageCard` from `app.schemas.catalog`) and annotate `_image_out(image: PackageImage)` (import `PackageImage` from `app.models`) — pyright basic wants both.

- [ ] **Step 4: Add the route**

In `api/app/routers/site/catalog.py` add imports `from app.errors import ApiError`, `from app.schemas.catalog import PackageDetail, PackageList`, `from app.services.catalog.reads import get_package`, and after `get_packages`:

```python
@router.get("/packages/{slug}", operation_id="getPackage")
async def get_package_route(slug: str, db: Session, response: Response) -> PackageDetail:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    detail = await get_package(db, slug)
    if detail is None:
        raise ApiError("not_found", "Package not found")
    return detail
```

- [ ] **Step 5: Run the tests**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py tests/test_catalog.py`
Expected: all pass (5 in the new file, 7 in the old).

- [ ] **Step 6: Lint + commit**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright`

```bash
git add api/app/services/catalog/reads.py api/app/routers/site/catalog.py api/tests/test_catalog_reads.py
git commit -m "feat(F1): get_package + GET /packages/{slug} with departures, badges and related trips"
```

### Task 4: `get_departures_for_month` + `GET /packages/{slug}/departures?month=`

**Files:**
- Modify: `api/app/services/catalog/reads.py`, `api/app/routers/site/catalog.py`
- Test: `api/tests/test_catalog_reads.py`

**Interfaces:**
- Consumes: `_upcoming_departures`, `_live_package` (Task 3).
- Produces: `async get_departures_for_month(db, slug, month: str | None, *, today=None) -> list[DepartureOut] | None` (`None` = draft/unknown package; `month=None` = all upcoming — the v3 `checkAvailability` tool calls this); route operationId `getDeparturesForMonth`, query `month` validated by regex `^\d{4}-(0[1-9]|1[0-2])$` (a bad value is a 400 `validation` envelope with `fieldErrors.month`; a blank value is stripped by `BlankQueryParamsMiddleware` and means "all").

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_catalog_reads.py`:

```python
# --- GET /packages/{slug}/departures ------------------------------------------------------------


@pytest.mark.db
async def test_departures_filter_by_month(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)

    res = await db_client.get("/packages/north-goa-beaches/departures", params={"month": "2026-12"})

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    items = res.json()["items"]
    assert [d["date"] for d in items] == ["2026-12-18"]
    assert items[0]["seatsLeft"] == 4 and items[0]["badge"] == "filling-fast"

    empty = await db_client.get("/packages/north-goa-beaches/departures", params={"month": "2027-06"})
    assert empty.json() == {"items": []}


@pytest.mark.db
async def test_departures_without_month_are_all_upcoming(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    plain = await db_client.get("/packages/north-goa-beaches/departures")
    blank = await db_client.get("/packages/north-goa-beaches/departures?month=")

    assert len(plain.json()["items"]) == 4
    assert blank.json() == plain.json()


@pytest.mark.db
async def test_departures_reject_a_bad_month_and_404_for_drafts(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    bad = await db_client.get("/packages/north-goa-beaches/departures", params={"month": "2026-13"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "validation"
    assert "month" in bad.json()["error"]["fieldErrors"]

    await set_status(db, "north-goa-beaches", PackageStatus.DRAFT)
    gone = await db_client.get("/packages/north-goa-beaches/departures")
    assert gone.status_code == 404
    assert gone.json()["error"]["code"] == "not_found"
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py -k departures`
Expected: 3 FAIL (404 from the missing route).

- [ ] **Step 3: Implement the service function**

Append to `reads.py`:

```python
async def get_departures_for_month(
    db: AsyncSession, slug: str, month: str | None, *, today: dt.date | None = None
) -> list[DepartureOut] | None:
    """Upcoming departures of a live package, optionally within one `YYYY-MM` (06 C1; the v3
    `checkAvailability` tool reuses it). `None` when the package is draft/unknown."""
    today = today or dt.date.today()
    package = (
        await db.execute(
            select(Package.id).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if package is None:
        return None
    return await _upcoming_departures(db, package, today, month)
```

- [ ] **Step 4: Add the route**

In the router add `from fastapi import Query`, `from typing import Annotated` (already imported), import `DepartureList` and `get_departures_for_month`, then:

```python
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


@router.get("/packages/{slug}/departures", operation_id="getDeparturesForMonth")
async def get_departures_route(
    slug: str,
    db: Session,
    response: Response,
    month: Annotated[
        str | None,
        Query(pattern=MONTH_PATTERN, description="YYYY-MM; omitted or blank = all upcoming"),
    ] = None,
) -> DepartureList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    items = await get_departures_for_month(db, slug, month)
    if items is None:
        raise ApiError("not_found", "Package not found")
    return DepartureList(items=items)
```

- [ ] **Step 5: Run the tests**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py`
Expected: 8 passed.

- [ ] **Step 6: Lint + commit**

```bash
uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright
git add api/app/services/catalog/reads.py api/app/routers/site/catalog.py api/tests/test_catalog_reads.py
git commit -m "feat(F1): GET /packages/{slug}/departures?month= (regex-validated, blank = all upcoming)"
```

### Task 5: `list_destinations` / `get_destination` + routes

**Files:**
- Modify: `api/app/services/catalog/reads.py`, `api/app/routers/site/catalog.py`
- Test: `api/tests/test_catalog_reads.py`

**Interfaces:**
- Produces: `async list_destinations(db, *, today=None) -> list[DestinationCard]` (only destinations with ≥ 1 live package, by `position`, then name); `async get_destination(db, slug, *, today=None) -> DestinationDetail | None` (`None` when unknown or no live packages); routes `GET /destinations` (`listDestinations`, body `DestinationList`) and `GET /destinations/{slug}` (`getDestination`, 404 "Destination not found").

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_catalog_reads.py`:

```python
# --- GET /destinations --------------------------------------------------------------------------


@pytest.mark.db
async def test_destinations_list_counts_live_packages(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/destinations")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    items = res.json()["items"]
    assert len(items) == 1
    goa = items[0]
    assert (goa["slug"], goa["name"]) == ("goa", "Goa")
    assert goa["tagline"]
    assert goa["coverUrl"].startswith("https://blob.test/destinations/goa/")
    assert goa["packageCount"] == 2
    assert goa["startingPricePaise"] == 14_499_00


@pytest.mark.db
async def test_destination_detail_lists_its_live_packages_cheapest_first(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/destinations/goa")

    assert res.status_code == 200
    d = res.json()
    assert d["region"] == "West India"
    assert d["intro"] and d["tagline"] and d["coverUrl"]
    assert all(1 <= m <= 12 for m in d["bestMonths"]) and d["bestMonths"]
    assert [p["slug"] for p in d["packages"]] == ["north-goa-beaches", "goa-quiet-escape"]
    assert d["packages"][0]["badge"] == "guaranteed"


@pytest.mark.db
async def test_destinations_without_live_packages_are_hidden(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    await set_status(db, "north-goa-beaches", PackageStatus.DRAFT)

    still = (await db_client.get("/destinations")).json()["items"]
    assert still[0]["packageCount"] == 1 and still[0]["startingPricePaise"] == 21_499_00

    await set_status(db, "goa-quiet-escape", PackageStatus.DRAFT)
    assert (await db_client.get("/destinations")).json() == {"items": []}
    gone = await db_client.get("/destinations/goa")
    assert gone.status_code == 404
    assert gone.json()["error"]["message"] == "Destination not found"
    assert (await db_client.get("/destinations/atlantis")).status_code == 404
```

Check `region` in `api/content/destinations/goa.py` before running; if it is not `"West India"`, use the value from the file.

- [ ] **Step 2: Run to verify they fail**

Run: `uv run --directory api pytest -q tests/test_catalog_reads.py -k destination`
Expected: 3 FAIL (404 from the missing routes).

- [ ] **Step 3: Implement the two service functions**

Append to `reads.py` (add `func` to the sqlalchemy import, `Destination` to the models import, `DestinationCard`, `DestinationDetail` to the schemas import):

```python
async def list_destinations(
    db: AsyncSession, *, today: dt.date | None = None
) -> list[DestinationCard]:
    """Destinations with at least one live package, in display order (06 C1)."""
    rows = await db.execute(
        select(
            Destination,
            func.count(Package.id),
            func.min(Package.starting_price_paise),
        )
        .join(Package, Package.destination_id == Destination.id)
        .where(Package.status == PackageStatus.LIVE)
        .group_by(Destination.id)
        .order_by(Destination.position, Destination.name)
    )
    return [
        DestinationCard(
            slug=d.slug,
            name=d.name,
            tagline=d.tagline,
            cover_url=d.cover_url,
            package_count=count,
            starting_price_paise=cheapest,
        )
        for d, count, cheapest in rows
    ]


async def get_destination(
    db: AsyncSession, slug: str, *, today: dt.date | None = None
) -> DestinationDetail | None:
    """A destination with its live packages as cards; `None` if unknown or nothing is live."""
    today = today or dt.date.today()
    d = (
        await db.execute(select(Destination).where(Destination.slug == slug))
    ).scalar_one_or_none()
    if d is None:
        return None
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.destination_id == d.id, Package.status == PackageStatus.LIVE)
                .options(selectinload(Package.destination), selectinload(Package.cover_image))
                .order_by(Package.starting_price_paise, Package.name)
            )
        )
        .scalars()
        .all()
    )
    if not packages:
        return None
    upcoming = await next_departures(db, today)
    return DestinationDetail(
        slug=d.slug,
        name=d.name,
        tagline=d.tagline,
        intro=d.intro,
        cover_url=d.cover_url,
        region=d.region,
        best_months=list(d.best_months),
        packages=[package_card(p, upcoming.get(p.id)) for p in packages],
    )
```

(`today` is accepted by `list_destinations` for signature symmetry with the other reads; it is unused in v1 and can be dropped if ruff/pyright object — do not leave an ARG warning.)

- [ ] **Step 4: Add the routes**

In the router import `DestinationDetail`, `DestinationList`, `get_destination`, `list_destinations`, then:

```python
@router.get("/destinations", operation_id="listDestinations")
async def get_destinations(db: Session, response: Response) -> DestinationList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return DestinationList(items=await list_destinations(db))


@router.get("/destinations/{slug}", operation_id="getDestination")
async def get_destination_route(slug: str, db: Session, response: Response) -> DestinationDetail:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    detail = await get_destination(db, slug)
    if detail is None:
        raise ApiError("not_found", "Destination not found")
    return detail
```

- [ ] **Step 5: Run the whole api suite**

Run: `uv run --directory api pytest -q`
Expected: 78 + 11 = 89 passed, except `tests/test_openapi.py::test_committed_openapi_json_is_fresh` FAILS (the contract is stale) — Task 6 fixes it.

- [ ] **Step 6: Lint + commit**

```bash
uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright
git add api/app/services/catalog/reads.py api/app/routers/site/catalog.py api/tests/test_catalog_reads.py
git commit -m "feat(F1): GET /destinations and /destinations/{slug} (live packages only)"
```

### Task 6: Regenerate the contract + path params in the web client

**Files:**
- Regenerate: `api/openapi.json`, `web/src/lib/api-types.ts`
- Modify: `web/src/lib/api.ts`
- Test: `web/tests/api.test.ts`

**Interfaces:**
- Consumes: the generated `paths['/packages/{slug}']`, `paths['/packages/{slug}/departures']`, `paths['/destinations']`, `paths['/destinations/{slug}']` and `components['schemas']['PackageDetail' | 'DepartureOut' | 'DestinationCard' | 'DestinationDetail' | 'PackageCard']`.
- Produces: `ApiInit.params?: Record<string, string>` — `api('/packages/{slug}', { params: { slug } })` substitutes `{name}` tokens with `encodeURIComponent(value)`; a missing param throws `Error('Missing path param "slug" for /packages/{slug}')`.

- [ ] **Step 1: Regenerate**

Run from the repo root: `pnpm gen:api`
Expected: `api/openapi.json` gains the four operations and the new component schemas; `web/src/lib/api-types.ts` changes. Verify: `uv run --directory api pytest -q tests/test_openapi.py` and `pnpm --filter web test tests/contract.test.ts` both pass; `git diff --stat` shows exactly the two generated files.

- [ ] **Step 2: Write the failing web test**

Add to `web/tests/api.test.ts` inside the `describe('api() …')` block:

```ts
  it('fills {param} tokens in the path, URL-encoded', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/packages/{slug}/departures', {
      params: { slug: 'north goa/beaches' },
      searchParams: { month: '2026-12' },
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.toString()).toBe(
      'http://localhost:8000/packages/north%20goa%2Fbeaches/departures?month=2026-12',
    );
  });

  it('throws when a path param is missing instead of calling the api', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/packages/{slug}')).rejects.toThrow('Missing path param "slug"');
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter web test tests/api.test.ts`
Expected: FAIL — URL is `http://localhost:8000/packages/%7Bslug%7D/departures?month=2026-12` and the second test does not throw (TypeScript also errors on `params`).

- [ ] **Step 4: Implement**

In `web/src/lib/api.ts`, extend `ApiInit`:

```ts
export interface ApiInit {
  /** Values for `{name}` tokens in the path (`/packages/{slug}`), URL-encoded. */
  params?: Record<string, string>;
  /** Cache tags for on-demand revalidation (`/revalidate` route handler). */
  tags?: string[];
  revalidate?: number | false;
  searchParams?: Record<string, string | undefined>;
  /**
   * Forward the viewer's `Cookie` header (owner session) and never cache. Only for `/admin/**`
   * and `/auth/session`; public data must not vary by viewer.
   */
  auth?: boolean;
}
```

add above `api()`:

```ts
/** `/packages/{slug}` + `{ slug: 'x' }` → `/packages/x`. Throws rather than sending a literal `{slug}`. */
export function fillPath(path: string, params: Record<string, string> = {}) {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path param "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}
```

and change the first line of `api()` to `const url = new URL(fillPath(path, init.params), BASE);`.

- [ ] **Step 5: Run the web tests**

Run: `pnpm --filter web test && pnpm --filter web typecheck`
Expected: 27 passed; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add api/openapi.json web/src/lib/api-types.ts web/src/lib/api.ts web/tests/api.test.ts
git commit -m "feat(F1): regenerate the contract; api() fills {param} path tokens"
```

### Task 7: Formatting helpers + JSON-LD builder

**Files:**
- Create: `web/src/lib/format.ts`, `web/src/lib/seo/package-jsonld.ts`, `web/src/components/seo/JsonLd.tsx`
- Test: `web/tests/format.test.ts`, `web/tests/package-jsonld.test.ts`

**Interfaces:**
- Produces: `inr(paise: number): string` (`14_499_00` → `'₹14,499'`); `formatDate(iso: string): string` (`'2026-11-20'` → `'Fri 20 Nov 2026'`, UTC, no locale dependence); `shortDate(iso)` → `'20 Nov'`; `duration(nights, days)` → `'3N / 4D'`; `mealsLabel({breakfast,lunch,dinner})` → `'Breakfast · Dinner'` or `'No meals'`; `packageJsonLd(p: PackageDetail, url: string): Record<string, unknown>`; `<JsonLd data={…} />`.

- [ ] **Step 1: Write the failing tests**

`web/tests/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { duration, formatDate, inr, mealsLabel, shortDate } from '../src/lib/format';

describe('format helpers', () => {
  it('renders paise as whole rupees with Indian grouping', () => {
    expect(inr(14_499_00)).toBe('₹14,499');
    expect(inr(1_25_000_00)).toBe('₹1,25,000');
    expect(inr(0)).toBe('₹0');
  });
  it('renders ISO dates as "Fri 20 Nov 2026" regardless of the host timezone', () => {
    expect(formatDate('2026-11-20')).toBe('Fri 20 Nov 2026');
    expect(formatDate('2027-01-01')).toBe('Fri 1 Jan 2027');
    expect(shortDate('2026-12-18')).toBe('18 Dec');
  });
  it('labels duration and meals', () => {
    expect(duration(3, 4)).toBe('3N / 4D');
    expect(mealsLabel({ breakfast: true, lunch: false, dinner: true })).toBe('Breakfast · Dinner');
    expect(mealsLabel({ breakfast: false, lunch: false, dinner: false })).toBe('No meals');
  });
});
```

`web/tests/package-jsonld.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { components } from '../src/lib/api-types';
import { packageJsonLd } from '../src/lib/seo/package-jsonld';

type PackageDetail = components['schemas']['PackageDetail'];

const departure = (over: Partial<PackageDetail['departures'][number]>) => ({
  id: 'd1',
  date: '2026-11-20',
  seatsTotal: 16,
  seatsLeft: 16,
  guaranteed: true,
  priceDoublePaise: 14_999_00,
  priceTriplePaise: 13_499_00,
  priceChildPaise: 8_999_00,
  singleSupplementPaise: 6_000_00,
  badge: 'guaranteed' as const,
  ...over,
});

const pkg: PackageDetail = {
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  summary: 'Three nights in Candolim.',
  destination: { slug: 'goa', name: 'Goa' },
  themes: ['beach', 'family'],
  nights: 3,
  days: 4,
  departureCity: 'Ex-Mumbai',
  startingPricePaise: 14_499_00,
  highlights: ['Sunset from Chapora Fort'],
  inclusions: ['3 nights'],
  exclusions: ['Flights'],
  hotels: [{ name: 'Lemon Tree', city: 'Candolim', stars: 4, nights: 3 }],
  faq: [],
  itinerary: [
    { dayNo: 1, title: 'Arrive Goa', description: '', meals: { breakfast: false, lunch: false, dinner: false }, stay: 'Candolim' },
    { dayNo: 2, title: 'North Goa', description: '', meals: { breakfast: true, lunch: false, dinner: false }, stay: 'Candolim' },
  ],
  images: [{ url: 'https://x/a.jpg', alt: 'a', width: 1600, height: 1000 }],
  cover: { url: 'https://x/a.jpg', alt: 'a', width: 1600, height: 1000 },
  departures: [departure({}), departure({ id: 'd2', date: '2026-12-18', seatsLeft: 0, badge: 'sold-out', priceDoublePaise: 17_499_00 })],
  related: [],
  updatedAt: '2026-09-15T00:00:00Z',
};

describe('packageJsonLd', () => {
  it('emits a TouristTrip with one Offer per upcoming departure', () => {
    const ld = packageJsonLd(pkg, 'https://tripsmith.vercel.app/packages/north-goa-beaches');
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: 'North Goa Beaches',
      url: 'https://tripsmith.vercel.app/packages/north-goa-beaches',
      touristType: ['beach', 'family'],
      image: ['https://x/a.jpg'],
      provider: { '@type': 'TravelAgency', name: 'Tripsmith' },
    });
    const offers = ld.offers as Array<Record<string, unknown>>;
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ '@type': 'Offer', price: '14999', priceCurrency: 'INR', availability: 'https://schema.org/InStock', validFrom: '2026-11-20' });
    expect(offers[1]).toMatchObject({ price: '17499', availability: 'https://schema.org/SoldOut' });
    const itinerary = ld.itinerary as { itemListElement: Array<{ position: number; name: string }> };
    expect(itinerary.itemListElement.map((d) => d.name)).toEqual(['Arrive Goa', 'North Goa']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web test tests/format.test.ts tests/package-jsonld.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `format.ts`**

```ts
/** Display formatting shared by the site. Prices arrive as integer paise; dates as ISO `YYYY-MM-DD`. */

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export const inr = (paise: number) => rupees.format(Math.round(paise / 100));

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse an ISO date as a calendar day (UTC), so the server's timezone never shifts it. */
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** `2026-11-20` → `Fri 20 Nov 2026` */
export function formatDate(iso: string) {
  const d = day(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `2026-12-18` → `18 Dec` */
export function shortDate(iso: string) {
  const d = day(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const duration = (nights: number, days: number) => `${nights}N / ${days}D`;

export function mealsLabel(meals: { breakfast: boolean; lunch: boolean; dinner: boolean }) {
  const names = [
    meals.breakfast && 'Breakfast',
    meals.lunch && 'Lunch',
    meals.dinner && 'Dinner',
  ].filter(Boolean);
  return names.length ? names.join(' · ') : 'No meals';
}
```

If `inr(14_499_00)` renders as `₹ 14,499` (a non-breaking space after the symbol on some ICU builds), normalise: `.replace(/ |\s/g, '')` before returning — the test pins `'₹14,499'`.

- [ ] **Step 4: Implement `package-jsonld.ts` and `JsonLd.tsx`**

`web/src/lib/seo/package-jsonld.ts`:

```ts
import type { components } from '@/lib/api-types';

type PackageDetail = components['schemas']['PackageDetail'];

/** schema.org TouristTrip + one Offer per upcoming departure (R4 acceptance). */
export function packageJsonLd(p: PackageDetail, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: p.name,
    description: p.summary,
    url,
    image: p.images.map((i) => i.url),
    touristType: p.themes,
    provider: { '@type': 'TravelAgency', name: 'Tripsmith' },
    itinerary: {
      '@type': 'ItemList',
      numberOfItems: p.itinerary.length,
      itemListElement: p.itinerary.map((d) => ({
        '@type': 'ListItem',
        position: d.dayNo,
        name: d.title,
      })),
    },
    offers: p.departures.map((d) => ({
      '@type': 'Offer',
      name: `Departure ${d.date}`,
      url,
      price: String(Math.round(d.priceDoublePaise / 100)),
      priceCurrency: 'INR',
      validFrom: d.date,
      availability: d.seatsLeft > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    })),
  };
}
```

`web/src/components/seo/JsonLd.tsx`:

```tsx
/** Inline JSON-LD. `<` is escaped so a `</script>` inside content cannot break out of the tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck`
Expected: 31 passed; lint + typecheck clean (run `pnpm --filter web exec prettier --write src tests` first if prettier complains).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/format.ts web/src/lib/seo web/src/components/seo web/tests/format.test.ts web/tests/package-jsonld.test.ts
git commit -m "feat(F2): price/date formatting and TouristTrip JSON-LD builder"
```

### Task 8: Shared site primitives on the K tokens (Badge, Stamp, Photo, PackageCard, header, footer)

**Files:**
- Create: `web/src/components/site/Badge.tsx`, `Stamp.tsx`, `Photo.tsx`, `PackageCard.tsx`, `Container.tsx`
- Modify: `web/src/components/site/SiteHeader.tsx`, `SiteFooter.tsx`, `web/src/app/globals.css`, `web/next.config.ts`

**Interfaces:**
- Consumes: `components['schemas']['PackageCard']`, `Badge` enum values `'filling-fast' | 'sold-out' | 'guaranteed'`, `inr`, `duration`.
- Produces: `<Badge value />` (pill), `<Stamp value />` (postmark, absolute top-right of a photo), `<Photo src alt width height sizes className priority />` (rounded, `object-cover` `next/image` in a positioned box), `<PackageCard card />` (links to `/packages/${slug}`), `<Container>` (`w-[min(1220px,100%-32px)] mx-auto`), `BADGE_LABEL` map.

- [ ] **Step 1: Image hosts + the base-layer utilities**

`web/next.config.ts` — extend `images.remotePatterns` with the local seed host:

```ts
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'http', hostname: 'localhost', port: '8000' }, // scripts/seed.py --local
    ],
  },
```

`web/src/app/globals.css` — append after the `@layer base` block (two utilities the mockup uses everywhere):

```css
@utility num {
  font-variant-numeric: tabular-nums;
}

@utility label-caps {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-mute);
}
```

- [ ] **Step 2: Primitives**

`web/src/components/site/Container.tsx`:

```tsx
import type { ReactNode } from 'react';

/** The page column from the mockups: 1220px, 16px side gutters on phones. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-[min(1220px,100%-32px)] ${className}`}>{children}</div>;
}
```

`web/src/components/site/Badge.tsx`:

```tsx
import type { components } from '@/lib/api-types';

export type BadgeValue = NonNullable<components['schemas']['PackageCard']['badge']>;

/** Labels mirror api `BADGE_LABELS` (schemas/meta.py); `GET /meta` is the runtime source if they drift. */
export const BADGE_LABEL: Record<BadgeValue, string> = {
  'filling-fast': 'Filling fast',
  'sold-out': 'Sold out',
  guaranteed: 'Guaranteed departure',
};

const TONE: Record<BadgeValue, string> = {
  'filling-fast': 'bg-warn-soft text-warn',
  'sold-out': 'bg-line text-mute',
  guaranteed: 'bg-ok-soft text-ok',
};

export function Badge({ value }: { value: BadgeValue | null | undefined }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center rounded-chip px-2.5 py-1 text-xs font-bold leading-tight ${TONE[value]}`}>
      {BADGE_LABEL[value]}
    </span>
  );
}
```

`web/src/components/site/Stamp.tsx` (the postmark motif from direction K):

```tsx
import type { BadgeValue } from './Badge';

const COPY: Record<BadgeValue, [string, string, string]> = {
  'filling-fast': ['Filling', 'fast', 'few seats'],
  'sold-out': ['Sold', 'out', 'this date'],
  guaranteed: ['Departure', '✓', 'guaranteed'],
};
const TONE: Record<BadgeValue, string> = {
  'filling-fast': 'text-warn',
  'sold-out': 'text-mute',
  guaranteed: 'text-ok',
};

/** Dashed-circle postmark, rotated −12°, sits top-right inside a `relative` photo box. */
export function Stamp({ value }: { value: BadgeValue | null | undefined }) {
  if (!value) return null;
  const [top, big, bottom] = COPY[value];
  return (
    <div
      aria-label={`${top} ${big} ${bottom}`}
      className={`absolute right-2.5 top-2.5 grid h-21 w-21 -rotate-12 place-items-center rounded-full border-2 border-dashed border-current bg-bg/95 text-center text-[9px] font-bold uppercase leading-[1.15] tracking-[0.12em] shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)] ${TONE[value]}`}
    >
      <span>
        {top}
        <b className="block text-[15px] normal-case tracking-tight">{big}</b>
        {bottom}
      </span>
    </div>
  );
}
```

`web/src/components/site/Photo.tsx`:

```tsx
import Image from 'next/image';
import type { ReactNode } from 'react';

type Props = {
  src: string;
  alt: string;
  sizes: string;
  className?: string; // aspect ratio + radius live here, e.g. "aspect-[16/10] rounded-card"
  priority?: boolean;
  children?: ReactNode; // overlays (Stamp, captions)
};

/** A positioned box with a cover-fit `next/image`; hover zoom via `group`. */
export function Photo({ src, alt, sizes, className = '', priority, children }: Props) {
  return (
    <div className={`group relative overflow-hidden bg-line ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover transition-transform duration-[1200ms] ease-(--ease-out) group-hover:scale-105"
      />
      {children}
    </div>
  );
}
```

`web/src/components/site/PackageCard.tsx`:

```tsx
import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { duration, inr } from '@/lib/format';
import { Photo } from './Photo';
import { Stamp } from './Stamp';

type Card = components['schemas']['PackageCard'];

export function PackageCard({ card }: { card: Card }) {
  return (
    <Link
      href={`/packages/${card.slug}`}
      className="grid grid-rows-[auto_1fr] overflow-hidden rounded-card border border-line bg-bg no-underline transition-[transform,box-shadow] duration-500 ease-(--ease-out) hover:-translate-y-1 hover:shadow-lift"
    >
      {card.coverUrl ? (
        <Photo src={card.coverUrl} alt="" sizes="(min-width: 1024px) 400px, 100vw" className="aspect-[16/10]">
          <Stamp value={card.badge} />
        </Photo>
      ) : (
        <div className="aspect-[16/10] bg-bg2" />
      )}
      <div className="grid content-start gap-2 p-4 pb-5">
        <div className="flex items-center justify-between text-[13px] font-semibold text-mute">
          <span>
            {card.destination} · {duration(card.nights, card.days)}
          </span>
          <span className="capitalize">{card.themes.join(' · ')}</span>
        </div>
        <h3 className="text-xl leading-tight">{card.name}</h3>
        <p className="line-clamp-2 text-[13px] text-mute">{card.highlights[0]}</p>
        <div className="mt-1 flex items-end justify-between border-t border-line pt-3">
          <div>
            <small className="block text-xs font-semibold text-mute">From</small>
            <b className="num text-[22px] font-extrabold tracking-tight">
              {inr(card.startingPricePaise)} <i className="text-[13px] font-semibold not-italic text-mute">/ person</i>
            </b>
          </div>
          <span className="rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-bold text-white">View trip</span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Header + footer on the tokens**

`SiteHeader.tsx`:

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { Container } from './Container';

/** Public header. Links fill in as their pages land (F3 Trips, F5 Destinations, F8 About/Contact). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-ink no-underline">
          <Image src="/logo.svg" alt="" width={28} height={28} priority />
          Tripsmith
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold text-mute">
          <Link href="/" className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
            Home
          </Link>
        </nav>
      </Container>
    </header>
  );
}
```

Check `web/public/logo.svg` renders at 28px; if it is a wordmark rather than a mark, drop the `<Image>` and keep the text.

`SiteFooter.tsx`:

```tsx
import { Container } from './Container';

/** Compact footer; F6/F8 expand it (address, phone, WhatsApp, policy links). No year: static pages would bake it in. */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-bg2">
      <Container className="flex flex-wrap items-center justify-between gap-3 py-8 text-sm text-mute">
        <span className="font-extrabold text-ink">Tripsmith</span>
        <small>© Tripsmith · Domestic holidays across India.</small>
      </Container>
    </footer>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`
Expected: clean; 31 tests still pass (`tests/api-status.test.ts` renders `ApiStatus`, not the header — unaffected).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/site web/src/app/globals.css web/next.config.ts
git commit -m "feat(F2): site primitives on the K tokens — Badge, Stamp, Photo, PackageCard, header/footer"
```

### Task 9: The package page — server components + route (`/packages/[slug]`)

**Files:**
- Create: `web/src/components/site/package/PackageHero.tsx`, `QuickFacts.tsx`, `Highlights.tsx`, `icons.tsx`, `Itinerary.tsx`, `Inclusions.tsx`, `Hotels.tsx`, `DeparturesTable.tsx`, `OccupancyPricing.tsx`, `Faq.tsx`, `PriceBox.tsx`, `RelatedPackages.tsx`, `Section.tsx`
- Create: `web/src/app/(site)/packages/[slug]/page.tsx`, `web/src/app/not-found.tsx`
- Modify: `web/src/components/site/ApiStatus.tsx`

Gallery, section nav and the itinerary motion are stubs here (plain markup) and become client islands in Task 10, so this task renders a complete, static page first.

**Interfaces:**
- Consumes: `api()` with `params` (Task 6), `PackageDetail` type, `inr/formatDate/shortDate/duration/mealsLabel`, `packageJsonLd`, `JsonLd`, `Badge`, `Photo`, `PackageCard`, `Container`.
- Produces: every component takes `{ pkg: PackageDetail }` or the relevant slice; section ids `overview`, `itinerary`, `inclusions`, `hotels`, `dates`, `faq` (Task 10's nav targets); `Itinerary` renders `<ol data-itinerary>` with `<li data-day>` items and a `<span data-route>` rule (Task 10 animates them).

- [ ] **Step 1: `page.tsx`**

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { DeparturesTable } from '@/components/site/package/DeparturesTable';
import { Faq } from '@/components/site/package/Faq';
import { Highlights } from '@/components/site/package/Highlights';
import { Hotels } from '@/components/site/package/Hotels';
import { Inclusions } from '@/components/site/package/Inclusions';
import { Itinerary } from '@/components/site/package/Itinerary';
import { OccupancyPricing } from '@/components/site/package/OccupancyPricing';
import { PackageHero } from '@/components/site/package/PackageHero';
import { PriceBox } from '@/components/site/package/PriceBox';
import { QuickFacts } from '@/components/site/package/QuickFacts';
import { RelatedPackages } from '@/components/site/package/RelatedPackages';
import { Section } from '@/components/site/package/Section';
import { api, ApiRequestError } from '@/lib/api';
import { duration, inr } from '@/lib/format';
import { packageJsonLd } from '@/lib/seo/package-jsonld';

type Params = { slug: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Tagged + cached until the api revalidates `package:<slug>` (admin edits, F18). Draft/unknown → 404 page. */
async function loadPackage(slug: string) {
  try {
    return await api('/packages/{slug}', {
      params: { slug },
      tags: [`package:${slug}`],
      revalidate: false,
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
}

/** Prerender every live package at build; new slugs render on first request. CI builds with no api
 * reachable, so an unreachable api means "prerender nothing" rather than a failed build. */
export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { items } = await api('/packages', { tags: ['packages'], revalidate: false });
    return items.map((p) => ({ slug: p.slug }));
  } catch (err) {
    console.warn(`generateStaticParams: api unreachable, prerendering no packages (${String(err)})`);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadPackage(slug);
  const title = `${p.name} — ${duration(p.nights, p.days)} ${p.destination.name} package from ${inr(p.startingPricePaise)}`;
  return {
    title,
    description: p.summary,
    alternates: { canonical: `${SITE_URL}/packages/${p.slug}` },
    openGraph: {
      title: p.name,
      description: p.summary,
      type: 'website',
      images: p.cover ? [{ url: p.cover.url, width: p.cover.width, height: p.cover.height, alt: p.cover.alt }] : [],
    },
  };
}

export default async function PackagePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const pkg = await loadPackage(slug);
  const url = `${SITE_URL}/packages/${pkg.slug}`;

  return (
    <Container>
      <JsonLd data={packageJsonLd(pkg, url)} />
      <PackageHero pkg={pkg} />
      <QuickFacts pkg={pkg} />

      <div className="mt-7 grid items-start gap-12 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Section id="overview" title={null}>
            <p className="max-w-[62ch] text-lg leading-relaxed text-ink2">{pkg.summary}</p>
            <Highlights items={pkg.highlights} />
          </Section>
          <Section id="itinerary" title="Day by day">
            <Itinerary days={pkg.itinerary} />
          </Section>
          <Section id="inclusions" title="What's in the price">
            <Inclusions inclusions={pkg.inclusions} exclusions={pkg.exclusions} />
          </Section>
          <Section id="hotels" title="Where you stay">
            <Hotels hotels={pkg.hotels} />
          </Section>
          <Section id="dates" title="Dates & prices">
            <DeparturesTable departures={pkg.departures} />
            <h3 className="mb-3 mt-8 text-lg">Price per person</h3>
            <OccupancyPricing departures={pkg.departures} />
          </Section>
          {pkg.faq.length > 0 && (
            <Section id="faq" title="Questions">
              <Faq items={pkg.faq} />
            </Section>
          )}
        </div>
        <aside className="hidden lg:block">
          <PriceBox pkg={pkg} />
        </aside>
      </div>

      <RelatedPackages cards={pkg.related} />
    </Container>
  );
}
```

- [ ] **Step 2: Layout pieces**

`Section.tsx`:

```tsx
import type { ReactNode } from 'react';

/** A nav-addressable section; `scroll-mt` clears the sticky header + section nav (Task 10). */
export function Section({ id, title, children }: { id: string; title: string | null; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={title ? `${id}-title` : undefined} className="scroll-mt-32 pt-11 first:pt-0">
      {title && (
        <h2 id={`${id}-title`} className="mb-4 text-[clamp(24px,2.8vw,30px)]">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
```

`PackageHero.tsx` (breadcrumbs + full-width cover with caption; the gallery grid follows in Task 10 — here render the first image only):

```tsx
import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { duration } from '@/lib/format';
import { Photo } from '@/components/site/Photo';

type PackageDetail = components['schemas']['PackageDetail'];

export function PackageHero({ pkg }: { pkg: PackageDetail }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">Home</Link>
        <span aria-hidden>›</span>
        <span>{pkg.destination.name}</span>
        <span aria-hidden>›</span>
        <span className="text-ink">{pkg.name}</span>
      </nav>
      <div className="relative mt-3.5">
        {pkg.cover && (
          <Photo
            src={pkg.cover.url}
            alt={pkg.cover.alt}
            sizes="(min-width: 1280px) 1220px, 100vw"
            priority
            className="aspect-[4/5] rounded-card sm:aspect-[21/9]"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 rounded-b-card bg-gradient-to-t from-[rgb(10_20_30/0.7)] to-transparent p-5 text-white [text-shadow:0_2px_20px_rgb(0_0_0/0.4)] sm:p-8">
          <h1 className="text-[clamp(32px,4.6vw,56px)]">{pkg.name}</h1>
          <div className="mt-2.5 flex flex-wrap gap-3.5 text-sm font-semibold">
            <span>{duration(pkg.nights, pkg.days)}</span>
            <span>{pkg.departureCity}</span>
            <span className="capitalize">{pkg.themes.join(' · ')}</span>
          </div>
        </div>
      </div>
    </>
  );
}
```

`QuickFacts.tsx`:

```tsx
import type { components } from '@/lib/api-types';
import { duration, inr, shortDate } from '@/lib/format';

type PackageDetail = components['schemas']['PackageDetail'];

export function QuickFacts({ pkg }: { pkg: PackageDetail }) {
  const stay = pkg.hotels[0];
  const next = pkg.departures[0];
  const facts: [string, string][] = [
    ['Duration', duration(pkg.nights, pkg.days)],
    ['From', pkg.startingPricePaise ? inr(pkg.startingPricePaise) : 'On request'],
    ['Departs', pkg.departureCity.replace(/^Ex-/, '')],
    ['Stay', stay ? `${stay.stars}★ ${stay.city}` : '—'],
    ['Next date', next ? shortDate(next.date) : 'On request'],
  ];
  return (
    <dl className="mt-4.5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-line bg-bg2 sm:grid-cols-3 lg:grid-cols-5">
      {facts.map(([label, value]) => (
        <div key={label} className="border-b border-r border-line px-4.5 py-4 last:border-r-0 sm:border-b-0">
          <dt className="label-caps mb-1">{label}</dt>
          <dd className="num text-lg font-extrabold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 3: Content sections**

`Highlights.tsx`:

```tsx
import { Check } from './icons';

export function Highlights({ items }: { items: string[] }) {
  return (
    <>
      <h2 className="mb-4 mt-8 text-[clamp(24px,2.8vw,30px)]">Highlights</h2>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {items.map((h) => (
          <li key={h} className="flex items-baseline gap-2.5">
            <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-ok" />
            {h}
          </li>
        ))}
      </ul>
    </>
  );
}
```

`icons.tsx` (inline SVGs, `currentColor`, the four the page needs):

```tsx
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const Check = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Cross = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Meal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 11h18M12 4a8 8 0 0 1 8 7H4a8 8 0 0 1 8-7ZM5 15h14M7 19h10" /></svg>
);
export const Bed = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 18V8M21 18v-6a3 3 0 0 0-3-3h-7v6M3 15h18M3 9h4a2 2 0 0 1 2 2v4" /></svg>
);
```

`Itinerary.tsx` (server; the numbered markers + a vertical rule that Task 10 draws on scroll):

```tsx
import type { components } from '@/lib/api-types';
import { mealsLabel } from '@/lib/format';
import { Bed, Meal } from './icons';

type Day = components['schemas']['ItineraryDayOut'];

export function Itinerary({ days }: { days: Day[] }) {
  return (
    <div className="relative">
      {/* The route: a 2px rule behind the day markers. Task 10 scrubs its scaleY with scroll. */}
      <span
        data-route
        aria-hidden
        className="absolute bottom-5 left-[16px] top-5 w-0.5 origin-top bg-primary/25"
      />
      <ol data-itinerary className="grid">
        {days.map((d) => (
          <li key={d.dayNo} data-day className="is-lit relative border-t border-line py-5 pl-[46px] last:border-b">
            <span className="absolute left-0 top-5 grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-primary text-sm font-extrabold text-white transition-colors duration-500 [li:not(.is-lit)_&]:bg-primary-soft [li:not(.is-lit)_&]:text-primary">
              {d.dayNo}
            </span>
            <h3 className="mb-1.5 text-[19px]">{d.title}</h3>
            <p className="mb-2.5 max-w-[62ch] text-ink2">{d.description}</p>
            <div className="flex flex-wrap gap-2 text-xs font-bold text-mute">
              <span className="inline-flex items-center gap-1.5 rounded-chip bg-bg2 px-2.5 py-1">
                <Meal className="h-3.5 w-3.5 text-primary" />
                {mealsLabel(d.meals)}
              </span>
              {d.stay && (
                <span className="inline-flex items-center gap-1.5 rounded-chip bg-bg2 px-2.5 py-1">
                  <Bed className="h-3.5 w-3.5 text-primary" />
                  Stay · {d.stay}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

The marker's default (no JS / reduced motion / before Task 10) must be the **lit** state — so put `is-lit` on every `<li>` here; Task 10 removes it at mount only when motion is allowed and re-adds it as the route passes each day.

`Inclusions.tsx`:

```tsx
import { Check, Cross } from './icons';

export function Inclusions({ inclusions, exclusions }: { inclusions: string[]; exclusions: string[] }) {
  const List = ({ items, included }: { items: string[]; included: boolean }) => (
    <ul className="grid gap-2">
      {items.map((t) => (
        <li key={t} className="flex items-baseline gap-2.5">
          {included ? (
            <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-ok" />
          ) : (
            <Cross className="h-4 w-4 shrink-0 translate-y-0.5 text-mute/70" />
          )}
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="label-caps mb-3">Included</h3>
        <List items={inclusions} included />
      </div>
      <div>
        <h3 className="label-caps mb-3">Not included</h3>
        <List items={exclusions} included={false} />
      </div>
    </div>
  );
}
```

`Hotels.tsx`:

```tsx
import type { components } from '@/lib/api-types';

type Hotel = components['schemas']['HotelOut'];

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function Hotels({ hotels }: { hotels: Hotel[] }) {
  return (
    <ul className="grid gap-3">
      {hotels.map((h) => (
        <li key={`${h.name}-${h.city}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] border border-line p-4">
          <b className="text-lg">{h.name}</b>
          <span aria-label={`${h.stars} star`} className="tracking-wider text-action">{stars(h.stars)}</span>
          <span className="text-sm text-mute">
            {h.city} · {h.nights} {h.nights === 1 ? 'night' : 'nights'}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Departures, pricing, FAQ, price box, related**

`DeparturesTable.tsx` (seat bar + badge; the Enquire column arrives in F12):

```tsx
import type { components } from '@/lib/api-types';
import { Badge } from '@/components/site/Badge';
import { formatDate, inr } from '@/lib/format';

type Departure = components['schemas']['DepartureOut'];

export function DeparturesTable({ departures }: { departures: Departure[] }) {
  if (departures.length === 0) {
    return <p className="rounded-[14px] border border-line bg-bg2 p-5 text-mute">No fixed departures are open right now — dates on request.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-bg2 text-left">
            <th className="label-caps px-3.5 py-3">Departure</th>
            <th className="label-caps px-3.5 py-3">Per person</th>
            <th className="label-caps px-3.5 py-3">Seats</th>
            <th className="label-caps px-3.5 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((d) => {
            const fill = Math.max(0, Math.min(1, d.seatsLeft / d.seatsTotal));
            const low = d.seatsLeft > 0 && d.seatsLeft <= 4;
            return (
              <tr key={d.id} className="border-t border-line hover:bg-bg2/60">
                <td className="px-3.5 py-3 font-bold">{formatDate(d.date)}</td>
                <td className="num px-3.5 py-3">{inr(d.priceDoublePaise)}</td>
                <td className="px-3.5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <i aria-hidden className="inline-block h-1.5 w-14 overflow-hidden rounded-chip bg-line">
                      <b className={`block h-full rounded-chip ${low ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${fill * 100}%` }} />
                    </i>
                    <span className="num">{d.seatsLeft > 0 ? `${d.seatsLeft} left` : '—'}</span>
                  </span>
                </td>
                <td className="px-3.5 py-3"><Badge value={d.badge} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

`OccupancyPricing.tsx` (R4: per adult double / triple / child 5–11 / single supplement — from the next departure, with the range across upcoming ones when they differ):

```tsx
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';

type Departure = components['schemas']['DepartureOut'];

const range = (values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? inr(lo) : `${inr(lo)} – ${inr(hi)}`;
};

export function OccupancyPricing({ departures }: { departures: Departure[] }) {
  if (departures.length === 0) return null;
  const cells: [string, string][] = [
    ['Adult · double sharing', range(departures.map((d) => d.priceDoublePaise))],
    ['Adult · triple sharing', range(departures.map((d) => d.priceTriplePaise))],
    ['Child 5–11 · with parents', range(departures.map((d) => d.priceChildPaise))],
    ['Single supplement', `+ ${range(departures.map((d) => d.singleSupplementPaise))}`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-btn border border-line p-3.5">
          <dt className="mb-1 text-xs font-semibold text-mute">{label}</dt>
          <dd className="num text-xl font-extrabold">{value}</dd>
        </div>
      ))}
      <p className="col-span-full text-xs text-mute">Prices vary by departure date; the table above is per adult on double sharing.</p>
    </dl>
  );
}
```

`Faq.tsx` (native `<details>` — no JS):

```tsx
import type { components } from '@/lib/api-types';

type Item = components['schemas']['FaqItem'];

export function Faq({ items }: { items: Item[] }) {
  return (
    <div>
      {items.map((f) => (
        <details key={f.q} className="group border-t border-line last:border-b">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="text-[22px] font-normal text-mute group-open:hidden">+</span>
            <span aria-hidden className="hidden text-[22px] font-normal text-mute group-open:inline">–</span>
          </summary>
          <p className="mb-4 max-w-[65ch] text-ink2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
```

`PriceBox.tsx` (sticky, informational — F12 adds the buttons):

```tsx
import type { components } from '@/lib/api-types';
import { formatDate, inr } from '@/lib/format';

type PackageDetail = components['schemas']['PackageDetail'];

export function PriceBox({ pkg }: { pkg: PackageDetail }) {
  const next = pkg.departures.find((d) => d.seatsLeft > 0) ?? pkg.departures[0];
  return (
    <div className="sticky top-24 grid gap-3 rounded-card border border-line bg-bg p-5.5 shadow-[0_30px_60px_-40px_rgb(20_32_42/0.35)]">
      <div className="text-[13px] font-semibold text-mute">
        From
        <b className="num block text-[34px] leading-tight tracking-tight text-ink">{inr(pkg.startingPricePaise)}</b>
        per person, double sharing
      </div>
      {next && (
        <div className="grid gap-0.5 rounded-btn border-[1.5px] border-line px-3 py-2.5">
          <span className="label-caps">Next departure</span>
          <span className="flex justify-between font-bold">
            {formatDate(next.date)}
            <span className="num">{next.seatsLeft > 0 ? `${next.seatsLeft} seats` : 'Sold out'}</span>
          </span>
        </div>
      )}
      <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-mute">
        Enquiries open soon — a person calls you back within 2 hours, 10 am – 8 pm IST. Nothing to pay online.
      </p>
    </div>
  );
}
```

`RelatedPackages.tsx`:

```tsx
import type { components } from '@/lib/api-types';
import { PackageCard } from '@/components/site/PackageCard';

type Card = components['schemas']['PackageCard'];

export function RelatedPackages({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="related-title" className="mt-16">
      <h2 id="related-title" className="mb-5 text-[clamp(26px,3.2vw,38px)]">More trips like this</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => <PackageCard key={c.slug} card={c} />)}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 404 page + reachable from the home placeholder**

`web/src/app/not-found.tsx` (root: also catches unknown URLs; renders the site chrome itself because route-group layouts do not wrap it):

```tsx
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main>
        <Container className="grid justify-items-center gap-3.5 py-24 text-center">
          <p className="label-caps">404</p>
          <h1 className="text-4xl">That trip is not on the map</h1>
          <p className="max-w-[40ch] text-mute">The page may have moved, or the package is no longer live.</p>
          <Link href="/" className="rounded-btn bg-action px-5 py-3 font-bold text-ink hover:bg-action-ink">Back to home</Link>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
```

In `ApiStatus.tsx`, wrap each listed package name in `<Link href={`/packages/${p.slug}`}>` (import `Link from 'next/link'`) so the page is reachable from the live home until F6 replaces it. Run `pnpm --filter web test tests/api-status.test.ts` — if the test asserts the exact text, keep the text identical and only add the anchor.

- [ ] **Step 6: Verify in the browser**

With the local api (`DATABASE_URL=$DEV_URL … uvicorn …`) and `pnpm --filter web dev` running:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/packages/north-goa-beaches http://localhost:3000/packages/nope`
Expected: `200` then `404`.

Run from `web/`: `pnpm exec playwright screenshot --viewport-size=1280,900 --full-page http://localhost:3000/packages/north-goa-beaches "$SCRATCHPAD/pkg-desktop.png"` and `--viewport-size=390,844` → `pkg-phone.png`; open both with the Read tool. Check against `mockups/screens.html` S5: hero caption over the cover, 5-cell facts strip (2 columns on the phone), two-column highlights, numbered days, included/not-included columns, departures table with bars + pills, four pricing cells, FAQ, related card with its stamp, sticky price box on desktop only. Fix spacing/wrapping before moving on.

Run: `curl -s http://localhost:3000/packages/north-goa-beaches | grep -o '"@type":"TouristTrip"' ` → present; `grep -o '<title>[^<]*'` → `North Goa Beaches — 3N / 4D Goa package from ₹14,499 · Tripsmith`.

- [ ] **Step 7: Lint, typecheck, build, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: clean; the build log lists `/packages/[slug]` as `● (SSG)` with the two seeded slugs when the local api is up, and builds with the `generateStaticParams: api unreachable` warning when it is down.

```bash
git add web/src/app web/src/components
git commit -m "feat(F2): /packages/[slug] — hero, facts, itinerary, inclusions, hotels, departures, pricing, FAQ, related, JSON-LD"
```

### Task 10: Client islands — gallery lightbox, section nav, the route that draws itself

**Files:**
- Create: `web/src/components/site/package/Gallery.tsx`, `SectionNav.tsx`, `ItineraryMotion.tsx`
- Modify: `web/package.json` (deps), `web/src/app/(site)/packages/[slug]/page.tsx`, `web/src/components/site/package/Itinerary.tsx`

**Interfaces:**
- Consumes: `ImageOut[]` (`pkg.images`), the section ids from Task 9, `[data-route]` / `[data-day]` hooks in `Itinerary`.
- Produces: `<Gallery images />` (grid of up to 5 + "+N photos", any cell opens a `<dialog>` lightbox with prev/next/close, arrow keys, Escape, backdrop click); `<SectionNav sections={[{id,label}]} />` (sticky pill row under the header; the pill of the section in view is dark); `<ItineraryMotion>` wraps `Itinerary` and scrubs the route line with GSAP ScrollTrigger, lighting each day marker as the line reaches it; everything renders at rest when `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Install GSAP**

Run from the repo root: `pnpm --filter web add --save-exact gsap @gsap/react`
Expected: `web/package.json` gains both with exact versions; `pnpm-lock.yaml` updates. (`gsap` ≥ 3.13 ships ScrollTrigger in the public package — no club plugins needed.)

- [ ] **Step 2: `Gallery.tsx`**

```tsx
'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { components } from '@/lib/api-types';
import { Photo } from '@/components/site/Photo';

type ImageOut = components['schemas']['ImageOut'];

const GRID_MAX = 5;

/** The S5 gallery: one tall cell + four small on desktop, three cells on phones; every cell and the
 * "+N photos" chip open the lightbox. The lightbox is a native `<dialog>` (focus trap, Escape,
 * backdrop) so there is no library and no scroll-lock code. */
export function Gallery({ images }: { images: ImageOut[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const open = useCallback((i: number) => setIndex(i), []);
  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (delta: number) => setIndex((i) => (i === null ? i : (i + delta + images.length) % images.length)),
    [images.length],
  );

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (index !== null && !el.open) el.showModal();
    if (index === null && el.open) el.close();
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, step]);

  if (images.length === 0) return null;
  const grid = images.slice(0, GRID_MAX);
  const extra = images.length - grid.length;
  const current = index === null ? null : images[index];

  return (
    <>
      <div className="mt-2 grid auto-rows-[110px] grid-cols-2 gap-2 sm:auto-rows-[150px] sm:grid-cols-[2fr_1fr_1fr]">
        {grid.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => open(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}: ${img.alt}`}
            className={`h-full w-full cursor-zoom-in overflow-hidden rounded-[10px] focus-visible:outline-2 ${
              i === 0 ? 'col-span-2 sm:col-span-1 sm:row-span-2' : ''
            } ${i >= 3 ? 'hidden sm:block' : ''}`}
          >
            <Photo src={img.url} alt={img.alt} sizes="(min-width: 640px) 400px, 50vw" className="h-full">
              {i === grid.length - 1 && extra > 0 && (
                <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-bg px-2.5 py-1.5 text-xs font-bold text-ink">
                  + {extra} photos
                </span>
              )}
            </Photo>
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        onClose={close}
        onClick={(e) => e.target === dialog.current && close()}
        aria-label="Photo gallery"
        className="m-auto h-dvh w-screen max-w-none bg-transparent p-0 backdrop:bg-ink/90"
      >
        {current && (
          <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-10">
            <Image
              key={current.url}
              src={current.url}
              alt={current.alt}
              width={current.width}
              height={current.height}
              sizes="100vw"
              className="max-h-full w-auto max-w-full rounded-[10px] object-contain"
            />
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-chip bg-bg/90 px-3 py-1 text-xs font-semibold text-ink">
              {index! + 1} / {images.length} · {current.alt}
            </p>
            <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-bg text-lg font-bold text-ink">×</button>
            <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-bg/90 text-xl text-ink">‹</button>
            <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-bg/90 text-xl text-ink">›</button>
          </div>
        )}
      </dialog>
    </>
  );
}
```

Render it in `page.tsx` directly after `<PackageHero pkg={pkg} />`: `<Gallery images={pkg.images} />`. (The hero keeps the cover; the grid starts from the second image if that reads as a duplicate — pass `pkg.images.slice(1)` and keep the lightbox over `pkg.images` if the cover should still be reachable; choose the variant that looks right in the screenshot.)

- [ ] **Step 3: `SectionNav.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';

export type NavSection = { id: string; label: string };

/** Sticky pill row (S5 `.subnav`). The section nearest the top of the viewport owns the dark pill. */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-16 z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2 backdrop-blur [scrollbar-width:none]"
    >
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? 'location' : undefined}
          className={`whitespace-nowrap rounded-chip px-3.5 py-2 text-sm font-semibold transition-colors ${
            active === s.id ? 'bg-ink text-white' : 'text-mute hover:bg-bg2 hover:text-ink'
          }`}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
```

In `page.tsx`, after `<QuickFacts />`:

```tsx
<SectionNav
  sections={[
    { id: 'overview', label: 'Overview' },
    { id: 'itinerary', label: 'Itinerary' },
    { id: 'inclusions', label: 'Inclusions' },
    { id: 'hotels', label: 'Hotels' },
    { id: 'dates', label: 'Dates & prices' },
    ...(pkg.faq.length ? [{ id: 'faq', label: 'FAQ' }] : []),
  ]}
/>
```

- [ ] **Step 4: `ItineraryMotion.tsx` — the signature motion**

```tsx
'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * "The route draws itself" (docs/04-ui-mockups.md, The showcase): the itinerary's vertical rule
 * grows with scroll, and each day marker lights up as the line reaches it. Server markup ships
 * fully lit (`is-lit` on every day) so no-JS and reduced-motion readers see the finished state;
 * this only runs when motion is allowed.
 */
export function ItineraryMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const route = root.querySelector<HTMLElement>('[data-route]');
      const days = Array.from(root.querySelectorAll<HTMLElement>('[data-day]'));
      if (!route || days.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        days.forEach((d) => d.classList.remove('is-lit'));
        gsap.fromTo(
          route,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top 70%', end: 'bottom 70%', scrub: 0.4 },
          },
        );
        days.forEach((day) =>
          ScrollTrigger.create({
            trigger: day,
            start: 'top 70%',
            onEnter: () => day.classList.add('is-lit'),
            onLeaveBack: () => day.classList.remove('is-lit'),
          }),
        );
      });
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
```

The `matchMedia` is created inside the `useGSAP` context, so it is reverted with the context on unmount — no manual cleanup. In `page.tsx` wrap the itinerary: `<ItineraryMotion><Itinerary days={pkg.itinerary} /></ItineraryMotion>`.

Give the route rule a visible drawn colour: in `Itinerary.tsx` change the rule to `bg-primary` (the undrawn portion is simply not there yet because `scaleY` starts at 0), and make lit markers pop: keep `bg-primary text-white` for `.is-lit` and the soft variant otherwise (already in Task 9's classes).

- [ ] **Step 5: Verify in the browser**

Run the api + web dev servers as in Task 9. Playwright screenshots again (desktop + phone) and read them: the gallery grid shows 1 tall + 4 small cells (3 cells on the phone) with a "+ N photos" chip on the last cell; the section nav sits under the header. Then drive it once in headless Chromium to be sure the islands hydrate:

```bash
cd web && node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:3000/packages/north-goa-beaches');
  await p.click('button[aria-label^=\"Open photo 2\"]');
  console.log('lightbox open:', await p.locator('dialog[open]').count());
  await p.keyboard.press('ArrowRight'); console.log(await p.locator('dialog p').innerText());
  await p.keyboard.press('Escape'); console.log('closed:', (await p.locator('dialog[open]').count()) === 0);
  await p.locator('#dates').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  console.log('active pill:', await p.locator('nav[aria-label=\"On this page\"] a[aria-current]').innerText());
  console.log('lit days:', await p.locator('[data-day].is-lit').count(), '/', await p.locator('[data-day]').count());
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.reload();
  console.log('reduced motion lit:', await p.locator('[data-day].is-lit').count());
  await b.close();
})();"
```

Expected: `lightbox open: 1`, the caption reads `3 / N · …`, `closed: true`, `active pill: Dates & prices`, `lit days: 4 / 4` after scrolling past the itinerary, `reduced motion lit: 4` without scrolling.

- [ ] **Step 6: Lint, typecheck, test, build, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: clean.

```bash
git add web/package.json pnpm-lock.yaml web/src/components/site/package web/src/app
git commit -m "feat(F2): gallery lightbox, section nav and the scroll-drawn itinerary route (GSAP)"
```

### Task 11: Full verification, production check, PR

**Files:** none new — `docs/07-plan.md` row F1+F2 gets its `✅ PR #n` mark after merge (same style as the S rows).

- [ ] **Step 1: Everything green from the root**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm gen:api && git diff --exit-code api/openapi.json web/src/lib/api-types.ts`
Expected: lint/typecheck clean; pytest 89 passed, vitest 31 passed; no contract diff.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin f1-catalog-reads
gh pr create --title "feat(F1+F2): catalog read services + package page" --body "$(cat <<'BODY'
## Summary
- **api:** `GET /packages/{slug}` (detail: itinerary, images, upcoming departures with `seatsLeft` from the `departure_availability` view + badges, 3 related), `GET /packages/{slug}/departures?month=YYYY-MM`, `GET /destinations`, `GET /destinations/{slug}`; drafts → 404 envelope; `Cache-Control` on every public GET; contract regenerated.
- **web:** `/packages/[slug]` on the K tokens — hero, gallery + `<dialog>` lightbox, quick facts, sticky section nav, highlights, day-by-day with the scroll-drawn route (GSAP ScrollTrigger, at rest under reduced motion), inclusions, hotels, departures table with seat bars + badges, occupancy pricing, FAQ, related cards with stamps, JSON-LD `TouristTrip`/`Offer`, `generateMetadata`, SSG + tagged fetch (`package:<slug>`), 404 page. No CTAs yet (F11/F12).
- Site header/footer restyled on the tokens; placeholder home links to the package pages.

## Test plan
- [ ] CI green (web · api · contract)
- [ ] https://tripsmith.vercel.app/packages/north-goa-beaches and /goa-quiet-escape render on a phone
- [ ] https://tripsmith-api.vercel.app/packages/north-goa-beaches returns the detail; `/packages/nope` → 404 envelope
- [ ] Lighthouse mobile on the package page ≥ 90 (PageSpeed Insights, after merge)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 3: After CI is green — review, squash-merge, verify production**

Session policy (2026-09-15): review → squash-merge → verify prod → tracker → next. `gh pr merge --squash --delete-branch` (the "main is already used by worktree" message is harmless). Then:

```bash
curl -s https://tripsmith-api.vercel.app/packages/north-goa-beaches | head -c 300
curl -s -o /dev/null -w "%{http_code}\n" https://tripsmith.vercel.app/packages/north-goa-beaches
curl -s -o /dev/null -w "%{http_code}\n" https://tripsmith.vercel.app/packages/nope
```

Expected: JSON detail, `200`, `404`. Previews are behind Vercel Authentication — only production counts. Mark the row in `docs/07-plan.md` (`F1+F2 ✅ PR #n`) in the next feature's PR, not on main directly; update the tracker artifact row status; then start **F3 Package search** in a new worktree.

---

## Self-review notes

- **Spec coverage:** F1 row — `get_package` (T3), `list_destinations` / `get_destination` (T5), `get_departures_for_month` (T4), pricing + badge helpers (existing, reused via `Availability`), pydantic `PackageDetail` / `DestinationCard` (T2), regenerate contract (T6), pytest badge/pricing edge cases + draft hidden (T3–T5). F2 row — gallery + lightbox (T10), quick facts / highlights / itinerary / inclusions / hotels / departures with badges / occupancy pricing / FAQ / 3 related (T9), draft → 404 (T9 `notFound`), SSG + tagged fetch (T9), `generateMetadata` + JSON-LD (T7/T9), **no CTAs** (T9 PriceBox is informational), `Cache-Control` on public GETs (T3–T5). R4 lightbox, occupancy table, sticky CTA bar → the bar is explicitly deferred to F12 by the F2 row. "Lighthouse mobile ≥ 90" is checked on production after merge (T11) — no workflow, per the lean rule.
- **Deferred by design:** `/destinations` web pages (F5), search params on `GET /packages` (F3), `getHomeData` (F6).
- **Type consistency:** `Meals` fields `breakfast/lunch/dinner` are used identically in T2 schemas, T7 `mealsLabel`, T9 `Itinerary`; `DepartureOut.seatsLeft/seatsTotal/priceDoublePaise…` names match between T2, T7 tests, T9 tables; `api('/packages/{slug}', { params })` (T6) is what T9 calls; `is-lit` / `[data-route]` / `[data-day]` hooks match between T9 and T10.
