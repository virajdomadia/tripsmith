# F18 Packages CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner lists, creates, edits, duplicates, publishes and deletes packages from `/admin/packages` — basics, gallery, itinerary, departures with occupancy pricing, inclusions/exclusions/FAQ and hotels — and a price change reaches the public page and the itinerary PDF within seconds.

**Architecture:** The api gains `routers/admin/packages.py` and `routers/admin/package_images.py` behind the existing `require_owner` dependency, plus `services/catalog/admin_packages.py` — one service that writes the package and its nested `itinerary_days`, `departures`, `hotels` and `faq` inside a single transaction, recomputes the cached `starting_price_paise`, evaluates the four publish rules, and calls `infra.revalidate` with cache tags. The web builds mockup **A3** (list) and **A4** (form) as a server-component list page plus one client form: a single `useForm` over the whole nested shape with `useFieldArray` per list, `@dnd-kit` for itinerary and gallery reordering, and writes posted straight through the existing `/api/:path*` rewrite so the session cookie rides along same-origin.

**Tech Stack:** FastAPI 0.141 · SQLAlchemy 2 async · pydantic v2 (camelCase aliases) · Pillow · Next 15.5 App Router · React 19 · Tailwind 4 · shadcn/ui · react-hook-form 7.88 + @hookform/resolvers 5.9 · zod 4 · @dnd-kit/core + @dnd-kit/sortable (new) · vitest · pytest.

**Spec:** `docs/07-plan.md` rows F18–F20 (this plan absorbs F19 and F20), `docs/06-data-and-api.md` §A3 (packages, itinerary_days, departures, package_images) + §C-REST rows 285–286 + §C4 (`createPackage`, `setPackageStatus`, `duplicatePackage`, `deletePackage`, image ops), `docs/04-ui-mockups.md` + `mockups/screens.html` screens **A3** and **A4**. Design decisions settled in chat on 2026-09-22 (see "Design decisions" below).

## Global Constraints

- Branch `feat/f18-packages-crud` in worktree `.worktrees/f18-packages-crud` (already created at main = `28295ef`). Never touch the main checkout — other sessions share it.
- One PR, squash-merged. Viraj's review-merge-next standing grant applies for this session.
- Contract: after any schema/route change run `pnpm gen:api` **at the repo root** and commit `api/openapi.json` + `web/src/lib/api-types.ts` (CI's `contract` job diffs them).
- Every `/admin/*` route carries `dependencies=[Depends(require_owner)]`; the web middleware is UX only.
- Error envelope only: raise `ApiError(code, message, field_errors=...)` — never `HTTPException`.
- Every admin response sets `Cache-Control: no-store` via `response.headers.update(NO_STORE)` from `app.infra.cache`.
- Public data must not vary by viewer; `api(..., { auth: true })` is only for `/admin/**` and `/auth/session`.
- Static assets never live under `/admin` — the middleware gates them.
- Copy: Indian English, sentence case, no exclamation marks.
- Money is **paise** on the wire and in the DB, everywhere, always. Render with `inr()` from `web/src/lib/format.ts`; never build a rupee string by hand.
- Tests: `uv run --directory api pytest` and `pnpm --filter web test`. `db`-marked tests need `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test` (local PostgreSQL 18 on port 5499, role `tripsmith`, no password).
- `api/tests/fixture_content/` is a frozen fixture — **never edit it**. Tests needing other data insert rows themselves.
- Never hardcode a calendar date as "future" in a test — use `dt.date.today() + dt.timedelta(days=N)`.
- Lint gates before the PR: `pnpm lint`, `pnpm typecheck`, `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`.
- A local `pnpm --filter web typecheck` after adding or moving routes needs `rm -rf web/.next` first — stale `.next/types` reference deleted route files.
- Demo password in tests is always `owner-pw-for-tests` (GitGuardian flags the real demo password).
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Design decisions (settled — do not re-litigate)

1. **F18 absorbs F19 and F20.** One PR delivers the whole A4 screen. F18's own acceptance test ("owner changes a price, public page and PDF reflect it") needs the departures editor, and 06 §C4 specifies `updatePackage` takes `days[]`, `departures[]`, `hotels[]` and `faq[]` in one transaction — splitting would mean building that endpoint twice. `docs/07-plan.md` is updated in Task 14.
2. **`status` is not a field on `PackageInput`.** Publishing is `POST /admin/packages/{id}/status` alone, so a PUT can never bypass the publish rules. `POST /admin/packages` always creates a **draft**.
3. **The four publish rules are evaluated server-side** and returned on every `AdminPackage` as `publishRules[]` + `canPublish`. The A4 side panel renders that array; it does not re-derive the logic in the browser. Rules: at least one image · itinerary complete (`len(itinerary) == days`) · at least one departure dated today or later · every departure has double, triple and child prices above 0.
4. **Prices are `ge=0` in the schema**, so a draft can park a departure with prices still to be decided; publish rule 4 is what insists on real prices. `single_supplement_paise` may legitimately stay 0 and is **not** part of rule 4.
5. **Itinerary is a full replace** on every PUT — `day_no` comes from array order, nothing external references a day, and `cascade="all, delete-orphan"` handles removal. `len(itinerary)` may be 0 to `nights + 1`; more than `nights + 1` is a validation error. Incomplete is allowed for drafts and caught by publish rule 2.
6. **Departures are matched by `id`**: a row with an `id` is updated, one without is inserted, and any existing row whose id is absent from the payload is deleted. Ids must survive so v2 bookings keep their foreign key.
7. **`starting_price_paise` is recomputed after every write** as `min(price_double_paise)` over departures dated today or later, `0` when there are none. This is the recompute `api/app/services/catalog/reads.py:56` already anticipates ("seed / F18 recompute").
8. **Revalidate tags after every package write:** `packages`, `destinations`, `home`, `package:<slug>`, `destination:<destination slug>`, plus `package:<old slug>` when the slug changed and `destination:<old destination slug>` when the package moved destination. The `updated_at` bump invalidates the PDF cache by itself — `pdf_pathname` is keyed on it.
9. **Delete guard is app-level.** `enquiries.package_id` is `ON DELETE SET NULL`, so the database will not stop it; the service raises `conflict` when any enquiry references the package, mirroring the destinations guard. The UI disables the button and shows the count.
10. **Duplicate deep-copies** itinerary days, departures, hotels, faq and the `package_images` rows — reusing the same Blob URLs, no re-upload. Slug `<slug>-copy`, then `-copy-2`, `-copy-3` on collision; name `<name> (copy)`; status draft; `cover_image_id` remapped to the copied row.
11. **Image upload needs a package id**, so on `/admin/packages/new` the gallery panel is disabled with "Save the draft first, then add photos." The first save lands on `/admin/packages/[id]` with the gallery live. No pre-id staging upload — it buys a marginally smoother first run at the cost of orphan-blob bookkeeping.
12. **Image routes live in their own module** `routers/admin/package_images.py` (four routes, multipart handling, its own service functions) so `packages.py` stays about the package. Both mount under the same `/admin/packages` prefix.
13. **Reordering uses `@dnd-kit/core` + `@dnd-kit/sortable`** for both itinerary days and gallery tiles. Its `KeyboardSensor` gives accessible reordering without a parallel button path.
14. **Gallery writes are immediate, not part of the form.** Upload, reorder, set cover, edit alt and delete each hit the api as they happen (the package already exists) and then `router.refresh()`. They are not staged in `useForm` state — that would leave a half-saved gallery on a validation failure elsewhere.
15. **The A3 list filters client-side.** Tabs (All / Live / Draft) and the search box operate on rows already fetched; at portfolio scale (13 packages) server-side filtering and pagination are not worth the round-trip.
16. **`GET /admin/packages/{id}` returns past departures too.** The owner needs to see and edit history; only the *public* reads filter to upcoming.

## File map

**api/**

- Modify `app/schemas/catalog.py` — `ItineraryDayInput`, `HotelInput`, `DepartureInput`, `PackageInput`, `PackageStatusInput`, `AdminDeparture`, `AdminImage`, `PublishRule`, `AdminPackage`, `AdminPackageRow`, `AdminPackageList`, `ImageOrderInput`, `ImageAltInput`.
- Create `app/services/catalog/admin_packages.py` — list/get/create/update/delete, `set_status`, `duplicate_package`, `publish_rules`, `recompute_starting_price`, `revalidate_tags`.
- Create `app/services/catalog/admin_package_images.py` — `add_image`, `reorder_images`, `set_alt`, `remove_image`.
- Create `app/routers/admin/packages.py`, `app/routers/admin/package_images.py`.
- Modify `app/main.py` — include both routers.
- Modify `tests/test_openapi.py` — new operation ids.
- Create `tests/test_admin_packages.py`, `tests/test_admin_package_images.py`.
- Regenerate `openapi.json`.

**web/**

- Modify `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- Create `src/components/ui/select.tsx`, `switch.tsx`, `checkbox.tsx`, `tabs.tsx`, `alert-dialog.tsx` (shadcn).
- Modify `src/lib/admin/client.ts` — `uploadPackageImage`.
- Create `src/lib/admin/package-schema.ts` — zod mirror, `toInput`, `THEMES`, `blankDay`, `blankDeparture`.
- Create `src/lib/admin/sortable.ts` — shared dnd-kit sensor + `reorder` helper.
- Create `src/app/(admin)/admin/(shell)/packages/page.tsx` (replaces the placeholder), `packages/new/page.tsx`, `packages/[id]/page.tsx`.
- Create `src/components/admin/packages/PackagesTable.tsx`, `PackageForm.tsx`, `BasicsPanel.tsx`, `ListEditor.tsx`, `FaqEditor.tsx`, `HotelsEditor.tsx`, `ItineraryEditor.tsx`, `DeparturesEditor.tsx`, `GalleryUploader.tsx`, `StatusPanel.tsx`, `DeletePackage.tsx`, `DuplicatePackage.tsx`.
- Create `tests/package-schema.test.ts`, `tests/packages-table.test.tsx`, `tests/status-panel.test.tsx`, `tests/departures-editor.test.tsx`, `tests/itinerary-editor.test.tsx`.
- Regenerated `src/lib/api-types.ts`.

**docs/** — `07-plan.md` F18 row absorbs F19/F20 and turns green; `06-data-and-api.md` §C-REST gains the collection-level `PATCH /admin/packages/:id/images`.

---

## Task 1: Package input and output schemas

**Files:**

- Modify: `api/app/schemas/catalog.py`
- Test: `api/tests/test_admin_packages.py` (create)

**Interfaces:**

- Produces, all in `app.schemas.catalog`: `ItineraryDayInput`, `HotelInput`, `DepartureInput`, `PackageInput`, `PackageStatusInput`, `AdminDeparture`, `AdminImage`, `PublishRule`, `AdminPackage`, `AdminPackageRow`, `AdminPackageList`, `ImageOrderInput`, `ImageAltInput`. Every later api task consumes these.
- Consumes: existing `ApiModel`, `SLUG_PATTERN`, `Meals`, `HotelOut`, `FaqItem`, `ItineraryDayOut`, `DestinationRef`, `Theme`, `PackageStatus`.

- [ ] **Step 1: Write the failing schema tests** — create `api/tests/test_admin_packages.py`:

```python
"""F18 package CRUD: schemas, service and `/admin/packages` routes (06 §A3, §C-REST, §C4)."""

import datetime as dt
from collections.abc import Sequence

import pytest
from pydantic import ValidationError

from app.schemas.catalog import DepartureInput, PackageInput

SUMMARY = "Three slow nights on the Konkan coast with one free beach day and a fort sunset."


def soon(days: int = 30) -> dt.date:
    """A date that is always in the future — never hardcode a calendar date in a test."""
    return dt.date.today() + dt.timedelta(days=days)


def departure(**overrides: object) -> dict[str, object]:
    fields: dict[str, object] = {
        "date": soon().isoformat(),
        "seatsTotal": 16,
        "guaranteed": False,
        "priceDoublePaise": 1_499_900,
        "priceTriplePaise": 1_349_900,
        "priceChildPaise": 899_900,
        "singleSupplementPaise": 600_000,
    }
    fields.update(overrides)
    return fields


def day(n: int) -> dict[str, object]:
    return {
        "title": f"Day {n}",
        "description": f"What happens on day {n}, in a sentence long enough to be real.",
        "meals": {"breakfast": True, "lunch": False, "dinner": False},
        "stay": "Lemon Tree Amarante, Candolim",
    }


def payload(**overrides: object) -> PackageInput:
    fields: dict[str, object] = {
        "slug": "konkan-coast",
        "destinationId": "d-goa",
        "name": "Konkan Coast",
        "summary": SUMMARY,
        "themes": ["beach"],
        "nights": 3,
        "departureCity": "Ex-Mumbai",
        "highlights": ["Sunset at the fort"],
        "inclusions": ["3 nights with breakfast"],
        "exclusions": ["Flights"],
        "hotels": [{"name": "Lemon Tree", "city": "Candolim", "stars": 4, "nights": 3}],
        "faq": [{"q": "Is it family friendly?", "a": "Yes, the beach is calm."}],
        "featured": False,
        "itinerary": [day(1), day(2), day(3), day(4)],
        "departures": [departure()],
    }
    fields.update(overrides)
    return PackageInput.model_validate(fields)


# --- schema ---------------------------------------------------------------------------------------


def test_days_is_derived_from_nights_and_never_sent() -> None:
    assert payload(nights=3).days == 4
    assert "days" not in PackageInput.model_fields


def test_itinerary_may_be_short_for_a_draft_but_never_longer_than_the_trip() -> None:
    assert payload(itinerary=[]).itinerary == []
    assert len(payload(itinerary=[day(1), day(2)]).itinerary) == 2
    with pytest.raises(ValidationError) as exc:
        payload(itinerary=[day(n) for n in range(1, 6)])
    assert "4 days" in str(exc.value)


def test_departure_dates_must_be_unique_within_the_payload() -> None:
    same = soon(45).isoformat()
    with pytest.raises(ValidationError) as exc:
        payload(departures=[departure(date=same), departure(date=same)])
    assert "same date" in str(exc.value)


def test_prices_may_be_zero_so_a_draft_can_park_a_departure() -> None:
    parked = payload(departures=[departure(priceDoublePaise=0, priceChildPaise=0)])
    assert parked.departures[0].price_double_paise == 0
    with pytest.raises(ValidationError):
        payload(departures=[departure(priceDoublePaise=-1)])


def test_rejects_bad_slugs_themes_and_empty_text() -> None:
    with pytest.raises(ValidationError):
        payload(slug="Konkan Coast")
    with pytest.raises(ValidationError):
        payload(themes=["spa"])
    with pytest.raises(ValidationError):
        payload(name="   ")
    with pytest.raises(ValidationError):
        payload(nights=0)
    with pytest.raises(ValidationError):
        payload(nights=31)


def test_strips_and_drops_blank_list_entries() -> None:
    out = payload(highlights=["  Sunset at the fort  ", "", "   "])
    assert out.highlights == ["Sunset at the fort"]
    assert payload(name="  Konkan Coast ").name == "Konkan Coast"


def test_departure_id_is_optional_so_new_rows_can_be_inserted() -> None:
    assert DepartureInput.model_validate(departure()).id is None
    assert DepartureInput.model_validate(departure(id="dep-1")).id == "dep-1"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: FAIL — `ImportError: cannot import name 'DepartureInput' from 'app.schemas.catalog'`

- [ ] **Step 3: Add the schemas** — append to `api/app/schemas/catalog.py` (after `UploadedImage`, keeping the existing imports and adding `Literal` to the `typing` import and `PackageStatus` to the `app.models.enums` import):

```python
class ItineraryDayInput(ApiModel):
    """One day of the itinerary. `day_no` is the array index + 1 — never sent."""

    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=4000, description="Markdown")
    meals: Meals
    stay: str | None = Field(default=None, max_length=120)

    @field_validator("title", "description", "stay", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class HotelInput(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=80)
    stars: int = Field(ge=1, le=5)
    nights: int = Field(ge=1, le=NIGHTS_MAX)

    @field_validator("name", "city", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class DepartureInput(ApiModel):
    """`id` present = update that row; absent = insert. Rows the payload omits are deleted.

    Prices are `ge=0` so a draft can park a departure with the rate still to be agreed; the
    publish rules are what insist on real prices before the package can go live.
    """

    id: str | None = None
    date: dt.date
    seats_total: int = Field(ge=1, le=200)
    guaranteed: bool = False
    price_double_paise: int = Field(ge=0, le=PRICE_MAX_PAISE)
    price_triple_paise: int = Field(ge=0, le=PRICE_MAX_PAISE)
    price_child_paise: int = Field(ge=0, le=PRICE_MAX_PAISE)
    single_supplement_paise: int = Field(ge=0, le=PRICE_MAX_PAISE)


class PackageInput(ApiModel):
    """Owner create/update body (06 §C4) — the whole package in one transaction.

    `status` is deliberately absent: publishing is `POST /admin/packages/{id}/status`, so a
    PUT can never bypass the publish rules. `days` is derived (`nights + 1`, the DB check
    constraint `days_is_nights_plus_one`).
    """

    slug: str = Field(pattern=SLUG_PATTERN, min_length=1, max_length=80)
    destination_id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=40, max_length=600)
    themes: list[Theme] = Field(default_factory=list, max_length=6)
    nights: int = Field(ge=1, le=NIGHTS_MAX)
    departure_city: str = Field(min_length=1, max_length=80, default="Ex-Mumbai")
    highlights: list[str] = Field(default_factory=list, max_length=12)
    inclusions: list[str] = Field(default_factory=list, max_length=20)
    exclusions: list[str] = Field(default_factory=list, max_length=20)
    hotels: list[HotelInput] = Field(default_factory=list, max_length=10)
    faq: list[FaqItem] = Field(default_factory=list, max_length=15)
    featured: bool = False
    itinerary: list[ItineraryDayInput] = Field(default_factory=list, max_length=NIGHTS_MAX + 1)
    departures: list[DepartureInput] = Field(default_factory=list, max_length=60)

    @property
    def days(self) -> int:
        return self.nights + 1

    @field_validator("name", "summary", "departure_city", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("highlights", "inclusions", "exclusions", mode="before")
    @classmethod
    def _clean_lines(cls, v: object) -> object:
        """The form's textareas are one-entry-per-line; blank lines are not entries."""
        if not isinstance(v, list):
            return v
        return [s.strip() for s in v if not isinstance(s, str) or s.strip()]

    @field_validator("themes")
    @classmethod
    def _unique_themes(cls, v: list[Theme]) -> list[Theme]:
        seen: list[Theme] = []
        for t in v:
            if t not in seen:
                seen.append(t)
        return seen

    @model_validator(mode="after")
    def _check_nested(self) -> "PackageInput":
        if len(self.itinerary) > self.days:
            raise ValueError(f"A {self.nights}-night trip has {self.days} days at most")
        dates = [d.date for d in self.departures]
        if len(dates) != len(set(dates)):
            raise ValueError("Two departures cannot share the same date")
        return self


class PackageStatusInput(ApiModel):
    status: PackageStatus


class AdminDeparture(ApiModel):
    """Every departure the owner has, past ones included; `seats_left` is read-only."""

    id: str
    date: dt.date
    seats_total: int
    seats_left: int = Field(description="From the departure_availability view; never edited")
    guaranteed: bool
    price_double_paise: int
    price_triple_paise: int
    price_child_paise: int
    single_supplement_paise: int


class AdminImage(ApiModel):
    id: str
    url: str
    alt: str
    width: int
    height: int
    position: int


class PublishRule(ApiModel):
    """One live-publish precondition, evaluated by the api so the UI never re-derives it."""

    key: Literal["images", "itinerary", "departures", "prices"]
    label: str
    ok: bool
    detail: str


class AdminPackage(ApiModel):
    id: str
    slug: str
    destination_id: str
    destination: DestinationRef
    name: str
    summary: str
    themes: list[Theme]
    nights: int
    days: int
    departure_city: str
    highlights: list[str]
    inclusions: list[str]
    exclusions: list[str]
    hotels: list[HotelOut]
    faq: list[FaqItem]
    itinerary: list[ItineraryDayOut]
    departures: list[AdminDeparture] = Field(description="All departures, soonest first")
    images: list[AdminImage] = Field(description="Gallery order")
    cover_image_id: str | None
    status: PackageStatus
    featured: bool
    starting_price_paise: int
    enquiry_count: int = Field(description="All time; blocks delete when above 0")
    publish_rules: list[PublishRule]
    can_publish: bool
    updated_at: dt.datetime


class AdminPackageRow(ApiModel):
    id: str
    slug: str
    name: str
    cover_url: str | None
    destination: DestinationRef
    nights: int
    days: int
    starting_price_paise: int
    departure_count: int = Field(description="Dated today or later")
    enquiry_count_30d: int
    status: PackageStatus
    featured: bool
    updated_at: dt.datetime


class AdminPackageList(ApiModel):
    items: list[AdminPackageRow]


class ImageOrderInput(ApiModel):
    """The whole gallery order in one call; `cover_id` must be one of `order`."""

    order: list[str] = Field(min_length=1, max_length=40)
    cover_id: str | None = None


class ImageAltInput(ApiModel):
    alt: str = Field(max_length=200)

    @field_validator("alt", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v
```

Add near the other module constants at the top of the file, under `BUDGET_MAX_RUPEES`:

```python
PRICE_MAX_PAISE = 100_000_000  # ₹10,00,000 — a sanity ceiling, not a business rule
```

Extend the existing imports at the top of the file:

```python
from typing import Annotated, Literal

from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.models.enums import PackageStatus, Theme
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: PASS — 7 passed

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas/catalog.py api/tests/test_admin_packages.py
git commit -m "feat(F18): package input and output schemas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Publish rules and the starting-price recompute

**Files:**

- Create: `api/app/services/catalog/admin_packages.py`
- Test: `api/tests/test_admin_packages.py` (append)

**Interfaces:**

- Produces: `publish_rules(pkg: Package, *, image_count: int, today: dt.date) -> list[PublishRule]`, `can_publish(rules) -> bool`, `recompute_starting_price(pkg: Package, *, today: dt.date) -> int`, `revalidate_tags(slug, destination_slug, old_slug=None, old_destination_slug=None) -> list[str]`, `DUPLICATE_SLUG: str`.
- Consumes: Task 1's `PublishRule`; `app.models.Package`.

These are pure functions over a loaded `Package` — no session, no IO — so they test without a database and get reused by every write path in Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_packages.py`:

```python
from app.models import Departure, ItineraryDay, Package, PackageImage
from app.models.enums import PackageStatus
from app.services.catalog import admin_packages as svc


def built_package(
    *,
    nights: int = 3,
    days_written: int = 4,
    departures: Sequence[tuple[dt.date, int]] = (),
    images: int = 1,
) -> Package:
    """An in-memory Package graph — enough for the pure rule functions, no session needed."""
    pkg = Package(
        slug="konkan-coast",
        destination_id="d-goa",
        name="Konkan Coast",
        summary=SUMMARY,
        nights=nights,
        days=nights + 1,
    )
    pkg.itinerary = [
        ItineraryDay(day_no=n, title=f"Day {n}", description="Text")
        for n in range(1, days_written + 1)
    ]
    pkg.departures = [
        Departure(
            date=d,
            seats_total=16,
            price_double_paise=price,
            price_triple_paise=price - 100_000,
            price_child_paise=price - 500_000,
            single_supplement_paise=0,
        )
        for d, price in departures
    ]
    pkg.images = [
        PackageImage(url=f"https://blob.test/{n}.jpg", width=1600, height=1000, position=n)
        for n in range(images)
    ]
    return pkg


def rule(rules: Sequence[object], key: str) -> object:
    return next(r for r in rules if r.key == key)  # type: ignore[attr-defined]


def test_publish_rules_all_pass_for_a_complete_package() -> None:
    pkg = built_package(departures=[(soon(), 1_499_900)])
    rules = svc.publish_rules(pkg, image_count=1, today=dt.date.today())
    assert [r.key for r in rules] == ["images", "itinerary", "departures", "prices"]
    assert all(r.ok for r in rules)
    assert svc.can_publish(rules) is True


def test_each_rule_fails_on_its_own() -> None:
    today = dt.date.today()

    no_image = built_package(departures=[(soon(), 1_499_900)], images=0)
    rules = svc.publish_rules(no_image, image_count=0, today=today)
    assert rule(rules, "images").ok is False
    assert rule(rules, "itinerary").ok is True
    assert svc.can_publish(rules) is False

    short = built_package(days_written=2, departures=[(soon(), 1_499_900)])
    rules = svc.publish_rules(short, image_count=1, today=today)
    assert rule(rules, "itinerary").ok is False
    assert rule(rules, "itinerary").detail == "2 of 4 days written"

    none_upcoming = built_package(departures=[(dt.date.today() - dt.timedelta(days=1), 1_499_900)])
    rules = svc.publish_rules(none_upcoming, image_count=1, today=today)
    assert rule(rules, "departures").ok is False
    assert rule(rules, "prices").ok is True  # the past departure still has prices

    unpriced = built_package(departures=[(soon(), 0)])
    rules = svc.publish_rules(unpriced, image_count=1, today=today)
    assert rule(rules, "prices").ok is False
    assert "1 departure" in rule(rules, "prices").detail


def test_a_departure_today_counts_as_upcoming() -> None:
    today = dt.date.today()
    pkg = built_package(departures=[(today, 1_499_900)])
    assert rule(svc.publish_rules(pkg, image_count=1, today=today), "departures").ok is True


def test_starting_price_is_the_cheapest_upcoming_double_and_zero_when_none_remain() -> None:
    today = dt.date.today()
    pkg = built_package(
        departures=[(soon(10), 1_749_900), (soon(60), 1_449_900), (today, 1_599_900)]
    )
    assert svc.recompute_starting_price(pkg, today=today) == 1_449_900

    past_only = built_package(departures=[(today - dt.timedelta(days=1), 1_000_000)])
    assert svc.recompute_starting_price(past_only, today=today) == 0
    assert svc.recompute_starting_price(built_package(), today=today) == 0


def test_an_unpriced_upcoming_departure_does_not_become_the_starting_price() -> None:
    """A parked departure (price 0) must not advertise the package as free."""
    today = dt.date.today()
    pkg = built_package(departures=[(soon(10), 0), (soon(60), 1_449_900)])
    assert svc.recompute_starting_price(pkg, today=today) == 1_449_900


def test_revalidate_tags_cover_the_old_slug_and_the_old_destination() -> None:
    assert svc.revalidate_tags("konkan-coast", "goa") == [
        "packages",
        "destinations",
        "home",
        "package:konkan-coast",
        "destination:goa",
    ]
    moved = svc.revalidate_tags(
        "konkan-coast", "maharashtra", old_slug="konkan", old_destination_slug="goa"
    )
    assert "package:konkan" in moved and "destination:goa" in moved
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.catalog.admin_packages'`

- [ ] **Step 3: Create the module with the pure functions** — `api/app/services/catalog/admin_packages.py`:

```python
"""Owner-side package CRUD (F18, 06 §A3 §C4). Every write revalidates the public pages.

The rule and price functions at the top are pure over a loaded `Package` graph so the same
logic serves the read, the write and the status endpoints — and tests them without a session.
"""

import datetime as dt
from collections.abc import Sequence

from app.models import Package
from app.schemas.catalog import PublishRule

DUPLICATE_SLUG = "A package with this slug already exists"


def revalidate_tags(
    slug: str,
    destination_slug: str,
    old_slug: str | None = None,
    old_destination_slug: str | None = None,
) -> list[str]:
    """`destinations` too: the destination cards carry package counts and from-prices, and the
    destination page lists the package. A rename or a move has to bust the old keys as well."""
    tags = ["packages", "destinations", "home", f"package:{slug}", f"destination:{destination_slug}"]
    if old_slug and old_slug != slug:
        tags.append(f"package:{old_slug}")
    if old_destination_slug and old_destination_slug != destination_slug:
        tags.append(f"destination:{old_destination_slug}")
    return tags


def recompute_starting_price(pkg: Package, *, today: dt.date) -> int:
    """Cheapest double-sharing price across upcoming departures; 0 when none remain.

    Unpriced departures (0 — a draft parking a date) are skipped: `reads.py` treats 0 as "no
    upcoming date", and a parked row must never advertise the package as free.
    """
    prices = [
        d.price_double_paise
        for d in pkg.departures
        if d.date >= today and d.price_double_paise > 0
    ]
    return min(prices) if prices else 0


def publish_rules(pkg: Package, *, image_count: int, today: dt.date) -> list[PublishRule]:
    """The four live-publish preconditions (06 §C4 `setPackageStatus`), in panel order."""
    written = len(pkg.itinerary)
    upcoming = [d for d in pkg.departures if d.date >= today]
    unpriced = [
        d
        for d in pkg.departures
        if not (d.price_double_paise > 0 and d.price_triple_paise > 0 and d.price_child_paise > 0)
    ]
    return [
        PublishRule(
            key="images",
            label="At least one photo",
            ok=image_count > 0,
            detail=f"{image_count} uploaded" if image_count else "No photos yet",
        ),
        PublishRule(
            key="itinerary",
            label="Full itinerary",
            ok=written == pkg.days,
            detail=f"{written} of {pkg.days} days written",
        ),
        PublishRule(
            key="departures",
            label="At least one upcoming departure",
            ok=bool(upcoming),
            detail=f"{len(upcoming)} upcoming" if upcoming else "No dates from today onwards",
        ),
        PublishRule(
            key="prices",
            label="Prices set for every departure",
            ok=not unpriced,
            detail=(
                "All departures priced"
                if not unpriced
                else f"{len(unpriced)} departure{'' if len(unpriced) == 1 else 's'} unpriced"
            ),
        ),
    ]


def can_publish(rules: Sequence[PublishRule]) -> bool:
    return all(r.ok for r in rules)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: PASS — 13 passed

- [ ] **Step 5: Commit**

```bash
git add api/app/services/catalog/admin_packages.py api/tests/test_admin_packages.py
git commit -m "feat(F18): publish rules, starting-price recompute, revalidate tags

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Read paths — list and get

**Files:**

- Modify: `api/app/services/catalog/admin_packages.py`
- Test: `api/tests/test_admin_packages.py` (append)

**Interfaces:**

- Produces: `list_packages(db) -> list[AdminPackageRow]`, `get_package(db, id) -> AdminPackage`, `load(db, id) -> Package` (raises `not_found`), `to_admin(db, pkg) -> AdminPackage`.
- Consumes: Task 2's `publish_rules`, `can_publish`.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_packages.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Destination, Enquiry
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_packages.revalidate", rec)
    return rec


async def seeded(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def package_by_slug(db: AsyncSession, slug: str) -> Package:
    return (await db.execute(select(Package).where(Package.slug == slug))).scalar_one()


async def goa_id(db: AsyncSession) -> str:
    return (
        await db.execute(select(Destination.id).where(Destination.slug == "goa"))
    ).scalar_one()


@pytest.mark.db
async def test_list_returns_every_package_draft_included(db: AsyncSession) -> None:
    await seeded(db)
    rows = await svc.list_packages(db)
    assert {r.slug for r in rows} == {"north-goa-beaches", "goa-quiet-escape"}
    north = next(r for r in rows if r.slug == "north-goa-beaches")
    assert north.destination.name == "Goa"
    assert north.nights == 3 and north.days == 4
    assert north.status is PackageStatus.LIVE
    assert north.cover_url and north.cover_url.startswith("http")
    assert north.departure_count == len(
        [d for d in (await package_by_slug(db, "north-goa-beaches")).departures
         if d.date >= dt.date.today()]
    )
    assert north.enquiry_count_30d == 0


@pytest.mark.db
async def test_list_counts_only_enquiries_from_the_last_30_days(db: AsyncSession) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    now = dt.datetime.now(dt.UTC)
    for age_days in (1, 10, 40):
        db.add(
            Enquiry(
                ref=f"TS-AGE{age_days:03d}",
                type=EnquiryType.STANDARD,
                name="Asha",
                phone="9845000000",
                email="asha@example.com",
                adults=2,
                children=0,
                status=EnquiryStatus.NEW,
                email_status=EmailStatus.SKIPPED,
                package_id=pkg.id,
                created_at=now - dt.timedelta(days=age_days),
            )
        )
    await db.commit()
    row = next(r for r in await svc.list_packages(db) if r.slug == "north-goa-beaches")
    assert row.enquiry_count_30d == 2


@pytest.mark.db
async def test_get_returns_the_whole_graph_with_past_departures(db: AsyncSession) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    pkg.departures.append(
        Departure(
            date=dt.date.today() - dt.timedelta(days=90),
            seats_total=16,
            price_double_paise=1_299_900,
            price_triple_paise=1_199_900,
            price_child_paise=799_900,
            single_supplement_paise=500_000,
        )
    )
    await db.commit()

    out = await svc.get_package(db, pkg.id)
    assert out.slug == "north-goa-beaches" and out.destination.slug == "goa"
    assert len(out.itinerary) == 4 and out.itinerary[0].day_no == 1
    assert len(out.images) == 7 and out.cover_image_id is not None
    assert out.hotels[0].name == "Lemon Tree Amarante Beach Resort"
    assert len(out.faq) == 3
    dates = [d.date for d in out.departures]
    assert dates == sorted(dates), "soonest first, past included"
    assert any(d < dt.date.today() for d in dates)
    assert out.departures[0].seats_left >= 0
    assert out.can_publish is True
    assert out.enquiry_count == 0


@pytest.mark.db
async def test_get_raises_not_found_for_an_unknown_id(db: AsyncSession) -> None:
    await seeded(db)
    with pytest.raises(ApiError) as exc:
        await svc.get_package(db, "nope")
    assert exc.value.code == "not_found"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: FAIL — `AttributeError: module 'app.services.catalog.admin_packages' has no attribute 'list_packages'`

- [ ] **Step 3: Add the read paths** — append to `api/app/services/catalog/admin_packages.py`, extending the imports:

```python
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import Departure, Destination, Enquiry, ItineraryDay, Package, PackageImage
from app.models.catalog import departure_availability
from app.schemas.catalog import (
    AdminDeparture,
    AdminImage,
    AdminPackage,
    AdminPackageRow,
    DestinationRef,
    FaqItem,
    HotelOut,
    ItineraryDayOut,
    Meals,
    PublishRule,
)

ENQUIRY_WINDOW_DAYS = 30
NOT_FOUND = "Package not found"
```

```python
def _loaded() -> Select[tuple[Package]]:
    """Every write and every read needs the whole graph; load it in one round trip."""
    return select(Package).options(
        selectinload(Package.destination),
        selectinload(Package.itinerary),
        selectinload(Package.departures),
        selectinload(Package.images),
    )


async def load(db: AsyncSession, id: str) -> Package:
    pkg = (await db.execute(_loaded().where(Package.id == id))).scalar_one_or_none()
    if pkg is None:
        raise ApiError("not_found", NOT_FOUND)
    return pkg


async def _seats_left(db: AsyncSession, pkg: Package) -> dict[str, int]:
    """`seats_left` lives in the departure_availability view — never on the row (06 §A3)."""
    if not pkg.departures:
        return {}
    rows = await db.execute(
        select(departure_availability.c.departure_id, departure_availability.c.seats_left).where(
            departure_availability.c.departure_id.in_([d.id for d in pkg.departures])
        )
    )
    return {str(id_): int(left) for id_, left in rows.all()}


async def _enquiry_count(db: AsyncSession, package_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count(Enquiry.id)).where(Enquiry.package_id == package_id)
            )
        ).scalar_one()
    )


def _day_out(d: ItineraryDay) -> ItineraryDayOut:
    return ItineraryDayOut(
        day_no=d.day_no,
        title=d.title,
        description=d.description,
        meals=Meals(breakfast=d.meal_b, lunch=d.meal_l, dinner=d.meal_d),
        stay=d.stay,
    )


def _image_out(i: PackageImage) -> AdminImage:
    return AdminImage(id=i.id, url=i.url, alt=i.alt, width=i.width, height=i.height, position=i.position)


async def to_admin(db: AsyncSession, pkg: Package) -> AdminPackage:
    today = dt.date.today()
    left = await _seats_left(db, pkg)
    images = sorted(pkg.images, key=lambda i: i.position)
    rules = publish_rules(pkg, image_count=len(images), today=today)
    return AdminPackage(
        id=pkg.id,
        slug=pkg.slug,
        destination_id=pkg.destination_id,
        destination=DestinationRef(slug=pkg.destination.slug, name=pkg.destination.name),
        name=pkg.name,
        summary=pkg.summary,
        themes=list(pkg.themes),
        nights=pkg.nights,
        days=pkg.days,
        departure_city=pkg.departure_city,
        highlights=list(pkg.highlights),
        inclusions=list(pkg.inclusions),
        exclusions=list(pkg.exclusions),
        hotels=[HotelOut.model_validate(h) for h in pkg.hotels],
        faq=[FaqItem.model_validate(f) for f in pkg.faq],
        itinerary=[_day_out(d) for d in sorted(pkg.itinerary, key=lambda d: d.day_no)],
        departures=[
            AdminDeparture(
                id=d.id,
                date=d.date,
                seats_total=d.seats_total,
                seats_left=left.get(d.id, d.seats_total),
                guaranteed=d.guaranteed,
                price_double_paise=d.price_double_paise,
                price_triple_paise=d.price_triple_paise,
                price_child_paise=d.price_child_paise,
                single_supplement_paise=d.single_supplement_paise,
            )
            for d in sorted(pkg.departures, key=lambda d: d.date)
        ],
        images=[_image_out(i) for i in images],
        cover_image_id=pkg.cover_image_id,
        status=pkg.status,
        featured=pkg.featured,
        starting_price_paise=pkg.starting_price_paise,
        enquiry_count=await _enquiry_count(db, pkg.id),
        publish_rules=rules,
        can_publish=can_publish(rules),
        updated_at=pkg.updated_at,
    )


async def get_package(db: AsyncSession, id: str) -> AdminPackage:
    return await to_admin(db, await load(db, id))


async def list_packages(db: AsyncSession) -> list[AdminPackageRow]:
    """One aggregate query per count — the A3 table shows upcoming departures and 30-day
    enquiries next to every row, and there are a dozen packages, not a million."""
    today = dt.date.today()
    since = dt.datetime.now(dt.UTC) - dt.timedelta(days=ENQUIRY_WINDOW_DAYS)
    upcoming = (
        select(Departure.package_id, func.count(Departure.id).label("n"))
        .where(Departure.date >= today)
        .group_by(Departure.package_id)
        .subquery()
    )
    recent = (
        select(Enquiry.package_id, func.count(Enquiry.id).label("n"))
        .where(Enquiry.created_at >= since)
        .group_by(Enquiry.package_id)
        .subquery()
    )
    cover = PackageImage.__table__.alias("cover")
    rows = await db.execute(
        select(
            Package,
            Destination.slug,
            Destination.name,
            cover.c.url,
            func.coalesce(upcoming.c.n, 0),
            func.coalesce(recent.c.n, 0),
        )
        .join(Destination, Destination.id == Package.destination_id)
        .outerjoin(cover, cover.c.id == Package.cover_image_id)
        .outerjoin(upcoming, upcoming.c.package_id == Package.id)
        .outerjoin(recent, recent.c.package_id == Package.id)
        .order_by(Package.status, Package.name)
    )
    return [
        AdminPackageRow(
            id=p.id,
            slug=p.slug,
            name=p.name,
            cover_url=cover_url,
            destination=DestinationRef(slug=dest_slug, name=dest_name),
            nights=p.nights,
            days=p.days,
            starting_price_paise=p.starting_price_paise,
            departure_count=int(departures),
            enquiry_count_30d=int(enquiries),
            status=p.status,
            featured=p.featured,
            updated_at=p.updated_at,
        )
        for p, dest_slug, dest_name, cover_url, departures, enquiries in rows.all()
    ]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: PASS — 17 passed

- [ ] **Step 5: Commit**

```bash
git add api/app/services/catalog/admin_packages.py api/tests/test_admin_packages.py
git commit -m "feat(F18): admin package list and detail reads

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create and update with nested writes

**Files:**

- Modify: `api/app/services/catalog/admin_packages.py`
- Test: `api/tests/test_admin_packages.py` (append)

**Interfaces:**

- Produces: `create_package(db, payload) -> AdminPackage`, `update_package(db, id, payload) -> AdminPackage`.
- Consumes: Task 1's `PackageInput`; Task 2's `recompute_starting_price`, `revalidate_tags`, `DUPLICATE_SLUG`; Task 3's `load`, `to_admin`.

The whole nested set is written in one transaction: itinerary full-replaced, departures diffed by id, `starting_price_paise` recomputed, then one `revalidate` call.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_packages.py`:

```python
@pytest.mark.db
async def test_create_makes_a_draft_and_writes_the_nested_rows(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    out = await svc.create_package(db, payload(destinationId=await goa_id(db)))
    assert out.status is PackageStatus.DRAFT, "create never publishes"
    assert out.days == 4 and out.nights == 3
    assert [d.day_no for d in out.itinerary] == [1, 2, 3, 4]
    assert out.itinerary[0].meals.breakfast is True
    assert len(out.departures) == 1 and out.departures[0].id
    assert out.hotels[0].city == "Candolim" and out.faq[0].q.startswith("Is it")
    assert out.starting_price_paise == 1_499_900
    assert out.can_publish is False, "no images yet"
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:konkan-coast", "destination:goa"]
    ]


@pytest.mark.db
async def test_create_rejects_a_duplicate_slug_and_an_unknown_destination(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    with pytest.raises(ApiError) as exc:
        await svc.create_package(db, payload(slug="north-goa-beaches", destinationId=await goa_id(db)))
    assert exc.value.code == "conflict"
    assert exc.value.field_errors == {"slug": svc.DUPLICATE_SLUG}

    with pytest.raises(ApiError) as exc:
        await svc.create_package(db, payload(destinationId="nope"))
    assert exc.value.code == "validation"
    assert "destinationId" in (exc.value.field_errors or {})
    assert revalidated.calls == []


@pytest.mark.db
async def test_update_replaces_the_itinerary_and_keeps_departure_ids(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    before = await svc.get_package(db, pkg.id)
    kept = before.departures[-1]  # the furthest-out departure
    revalidated.calls.clear()

    body = payload(
        slug="north-goa-beaches",
        destinationId=await goa_id(db),
        name="North Goa Beaches",
        nights=3,
        itinerary=[day(1), day(2)],
        departures=[
            {**departure(id=kept.id, date=kept.date.isoformat()), "priceDoublePaise": 1_111_100},
            departure(date=soon(120).isoformat(), priceDoublePaise=1_999_900),
        ],
    )
    out = await svc.update_package(db, pkg.id, body)

    assert [d.day_no for d in out.itinerary] == [1, 2], "full replace, not a merge"
    ids = {d.id for d in out.departures}
    assert kept.id in ids, "an id sent back must survive — v2 bookings reference it"
    assert len(out.departures) == 2, "departures the payload omitted are deleted"
    assert next(d for d in out.departures if d.id == kept.id).price_double_paise == 1_111_100
    assert out.starting_price_paise == 1_111_100
    assert out.can_publish is False, "itinerary is now 2 of 4 days"


@pytest.mark.db
async def test_update_revalidates_the_old_slug_and_the_old_destination(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    kerala = Destination(
        slug="kerala",
        name="Kerala",
        tagline="Backwaters and tea hills",
        intro="A long enough intro to satisfy nothing in particular here.",
        cover_url="https://blob.test/kerala.jpg",
        region="South India",
        best_months=[11, 12],
    )
    db.add(kerala)
    await db.commit()
    pkg = await package_by_slug(db, "north-goa-beaches")
    revalidated.calls.clear()

    await svc.update_package(
        db, pkg.id, payload(slug="konkan-coast", destinationId=kerala.id, nights=3)
    )
    tags = revalidated.calls[0]
    assert "package:konkan-coast" in tags and "package:north-goa-beaches" in tags
    assert "destination:kerala" in tags and "destination:goa" in tags


@pytest.mark.db
async def test_update_rejects_a_slug_another_package_already_uses(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db, pkg.id, payload(slug="goa-quiet-escape", destinationId=await goa_id(db))
        )
    assert exc.value.code == "conflict" and exc.value.field_errors == {"slug": svc.DUPLICATE_SLUG}
    assert revalidated.calls == []


@pytest.mark.db
async def test_update_rejects_a_departure_id_from_another_package(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    """Otherwise a crafted payload could steal another package's departure row."""
    await seeded(db)
    mine = await package_by_slug(db, "north-goa-beaches")
    theirs = await svc.get_package(db, (await package_by_slug(db, "goa-quiet-escape")).id)
    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db,
            mine.id,
            payload(
                slug="north-goa-beaches",
                destinationId=await goa_id(db),
                departures=[departure(id=theirs.departures[0].id)],
            ),
        )
    assert exc.value.code == "validation"
    assert "departures" in (exc.value.field_errors or {})
    assert revalidated.calls == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: FAIL — `AttributeError: module 'app.services.catalog.admin_packages' has no attribute 'create_package'`

- [ ] **Step 3: Add the write paths** — append to `api/app/services/catalog/admin_packages.py`, extending the imports with `from sqlalchemy.exc import IntegrityError`, `from app.infra.revalidate import revalidate` and `from app.schemas.catalog import PackageInput`:

```python
UNKNOWN_DESTINATION = "Pick a destination that exists"
FOREIGN_DEPARTURE = "A departure in this payload belongs to another package"


async def _assert_slug_free(db: AsyncSession, slug: str, *, except_id: str | None) -> None:
    q = select(Package.id).where(Package.slug == slug)
    if except_id is not None:
        q = q.where(Package.id != except_id)
    if (await db.execute(q)).scalar_one_or_none() is not None:
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG})


async def _assert_destination_exists(db: AsyncSession, destination_id: str) -> None:
    q = select(Destination.id).where(Destination.id == destination_id)
    if (await db.execute(q)).scalar_one_or_none() is None:
        raise ApiError(
            "validation", UNKNOWN_DESTINATION, field_errors={"destinationId": UNKNOWN_DESTINATION}
        )


async def _commit_or_conflict(db: AsyncSession) -> None:
    """`_assert_slug_free` gives the friendly error on the common path; this is the safety net
    for a concurrent insert that wins the race and hits the DB `unique` constraint."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ApiError("conflict", DUPLICATE_SLUG, field_errors={"slug": DUPLICATE_SLUG}) from None


def _apply_fields(pkg: Package, payload: PackageInput) -> None:
    pkg.slug = payload.slug
    pkg.destination_id = payload.destination_id
    pkg.name = payload.name
    pkg.summary = payload.summary
    pkg.themes = list(payload.themes)
    pkg.nights = payload.nights
    pkg.days = payload.days
    pkg.departure_city = payload.departure_city
    pkg.highlights = list(payload.highlights)
    pkg.inclusions = list(payload.inclusions)
    pkg.exclusions = list(payload.exclusions)
    pkg.hotels = [h.model_dump() for h in payload.hotels]
    pkg.faq = [f.model_dump() for f in payload.faq]
    pkg.featured = payload.featured


def _apply_itinerary(pkg: Package, payload: PackageInput) -> None:
    """Full replace — `day_no` is the array order and nothing outside references a day.
    `cascade="all, delete-orphan"` on the relationship deletes the rows we drop."""
    pkg.itinerary = [
        ItineraryDay(
            day_no=n,
            title=d.title,
            description=d.description,
            meal_b=d.meals.breakfast,
            meal_l=d.meals.lunch,
            meal_d=d.meals.dinner,
            stay=d.stay,
        )
        for n, d in enumerate(payload.itinerary, start=1)
    ]


def _apply_departures(pkg: Package, payload: PackageInput) -> None:
    """Diffed by id so v2 bookings keep their foreign key: a row with an id is updated in
    place, one without is inserted, and any existing row the payload omits is dropped."""
    existing = {d.id: d for d in pkg.departures}
    sent_ids = {d.id for d in payload.departures if d.id}
    unknown = sent_ids - existing.keys()
    if unknown:
        raise ApiError("validation", FOREIGN_DEPARTURE, field_errors={"departures": FOREIGN_DEPARTURE})

    kept: list[Departure] = []
    for row in payload.departures:
        target = existing[row.id] if row.id else Departure()
        target.date = row.date
        target.seats_total = row.seats_total
        target.guaranteed = row.guaranteed
        target.price_double_paise = row.price_double_paise
        target.price_triple_paise = row.price_triple_paise
        target.price_child_paise = row.price_child_paise
        target.single_supplement_paise = row.single_supplement_paise
        kept.append(target)
    pkg.departures = kept


async def _write(db: AsyncSession, pkg: Package, payload: PackageInput) -> None:
    _apply_fields(pkg, payload)
    _apply_itinerary(pkg, payload)
    _apply_departures(pkg, payload)
    pkg.starting_price_paise = recompute_starting_price(pkg, today=dt.date.today())


async def create_package(db: AsyncSession, payload: PackageInput) -> AdminPackage:
    await _assert_destination_exists(db, payload.destination_id)
    await _assert_slug_free(db, payload.slug, except_id=None)
    pkg = Package(status=PackageStatus.DRAFT)
    await _write(db, pkg, payload)
    db.add(pkg)
    await _commit_or_conflict(db)
    out = await to_admin(db, await load(db, pkg.id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def update_package(db: AsyncSession, id: str, payload: PackageInput) -> AdminPackage:
    pkg = await load(db, id)
    await _assert_destination_exists(db, payload.destination_id)
    await _assert_slug_free(db, payload.slug, except_id=id)
    old_slug, old_destination_slug = pkg.slug, pkg.destination.slug
    await _write(db, pkg, payload)
    await _commit_or_conflict(db)
    out = await to_admin(db, await load(db, id))
    await revalidate(
        revalidate_tags(out.slug, out.destination.slug, old_slug, old_destination_slug)
    )
    return out
```

Add `PackageStatus` to the `app.models.enums` import at the top of the module.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: PASS — 23 passed

- [ ] **Step 5: Commit**

```bash
git add api/app/services/catalog/admin_packages.py api/tests/test_admin_packages.py
git commit -m "feat(F18): transactional nested package create and update

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Status, duplicate and delete

**Files:**

- Modify: `api/app/services/catalog/admin_packages.py`
- Test: `api/tests/test_admin_packages.py` (append)

**Interfaces:**

- Produces: `set_status(db, id, status) -> AdminPackage`, `duplicate_package(db, id) -> AdminPackage`, `delete_package(db, id) -> None`.
- Consumes: everything from Tasks 2 to 4.

- [ ] **Step 1: Write the failing tests** — append to `api/tests/test_admin_packages.py`:

```python
@pytest.mark.db
async def test_publishing_is_blocked_until_every_rule_passes(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    draft = await svc.create_package(db, payload(destinationId=await goa_id(db)))
    revalidated.calls.clear()

    with pytest.raises(ApiError) as exc:
        await svc.set_status(db, draft.id, PackageStatus.LIVE)
    assert exc.value.code == "conflict"
    assert exc.value.field_errors == {"images": "At least one photo"}
    assert revalidated.calls == []

    db.add(
        PackageImage(package_id=draft.id, url="https://blob.test/a.jpg", width=1600, height=1000)
    )
    await db.commit()
    live = await svc.set_status(db, draft.id, PackageStatus.LIVE)
    assert live.status is PackageStatus.LIVE
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:konkan-coast", "destination:goa"]
    ]


@pytest.mark.db
async def test_unpublishing_is_always_allowed(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    out = await svc.set_status(db, pkg.id, PackageStatus.DRAFT)
    assert out.status is PackageStatus.DRAFT
    assert revalidated.calls


@pytest.mark.db
async def test_setting_the_status_it_already_has_is_a_no_op_that_still_revalidates(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    out = await svc.set_status(db, pkg.id, PackageStatus.LIVE)
    assert out.status is PackageStatus.LIVE


@pytest.mark.db
async def test_duplicate_deep_copies_everything_as_a_draft(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    source = await package_by_slug(db, "north-goa-beaches")
    original = await svc.get_package(db, source.id)
    revalidated.calls.clear()

    copy = await svc.duplicate_package(db, source.id)
    assert copy.id != original.id
    assert copy.slug == "north-goa-beaches-copy"
    assert copy.name == "North Goa Beaches (copy)"
    assert copy.status is PackageStatus.DRAFT
    assert len(copy.itinerary) == len(original.itinerary)
    assert len(copy.departures) == len(original.departures)
    assert {d.id for d in copy.departures}.isdisjoint({d.id for d in original.departures})
    assert [i.url for i in copy.images] == [i.url for i in original.images], "same blobs, no re-upload"
    assert {i.id for i in copy.images}.isdisjoint({i.id for i in original.images})
    assert copy.cover_image_id in {i.id for i in copy.images}, "cover remapped to the copy"
    assert copy.hotels == original.hotels and copy.faq == original.faq
    assert copy.starting_price_paise == original.starting_price_paise

    again = await svc.duplicate_package(db, source.id)
    assert again.slug == "north-goa-beaches-copy-2"


@pytest.mark.db
async def test_delete_is_blocked_while_enquiries_reference_the_package(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    pkg = await package_by_slug(db, "north-goa-beaches")
    db.add(
        Enquiry(
            ref="TS-DEL001",
            type=EnquiryType.STANDARD,
            name="Asha",
            phone="9845000000",
            email="asha@example.com",
            adults=2,
            children=0,
            status=EnquiryStatus.NEW,
            email_status=EmailStatus.SKIPPED,
            package_id=pkg.id,
        )
    )
    await db.commit()
    revalidated.calls.clear()

    with pytest.raises(ApiError) as exc:
        await svc.delete_package(db, pkg.id)
    assert exc.value.code == "conflict"
    assert exc.value.message == "1 enquiry references this package — it cannot be deleted"
    assert revalidated.calls == []


@pytest.mark.db
async def test_delete_removes_the_package_and_its_children(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seeded(db)
    draft = await svc.create_package(db, payload(destinationId=await goa_id(db)))
    revalidated.calls.clear()

    await svc.delete_package(db, draft.id)
    with pytest.raises(ApiError):
        await svc.get_package(db, draft.id)
    left = (
        await db.execute(select(func.count(Departure.id)).where(Departure.package_id == draft.id))
    ).scalar_one()
    assert left == 0, "ON DELETE CASCADE takes the departures with it"
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:konkan-coast", "destination:goa"]
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: FAIL — `AttributeError: module 'app.services.catalog.admin_packages' has no attribute 'set_status'`

- [ ] **Step 3: Add the three operations** — append to `api/app/services/catalog/admin_packages.py`:

```python
async def set_status(db: AsyncSession, id: str, status: PackageStatus) -> AdminPackage:
    """Going live runs the four rules; unpublishing is always allowed (06 §C4)."""
    pkg = await load(db, id)
    if status is PackageStatus.LIVE:
        rules = publish_rules(pkg, image_count=len(pkg.images), today=dt.date.today())
        failed = [r for r in rules if not r.ok]
        if failed:
            raise ApiError(
                "conflict",
                "This package is not ready to go live yet",
                field_errors={r.key: r.label for r in failed},
            )
    pkg.status = status
    await db.commit()
    out = await to_admin(db, await load(db, id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def _free_copy_slug(db: AsyncSession, slug: str) -> str:
    """`<slug>-copy`, then `-copy-2`, `-copy-3` — the owner duplicating twice is normal."""
    base = f"{slug}-copy"
    candidate, n = base, 1
    while (
        await db.execute(select(Package.id).where(Package.slug == candidate))
    ).scalar_one_or_none() is not None:
        n += 1
        candidate = f"{base}-{n}"
        if n > 50:
            raise ApiError("conflict", "Too many copies of this package already exist")
    return candidate


async def duplicate_package(db: AsyncSession, id: str) -> AdminPackage:
    """Deep copy as a draft. Image rows are copied but the Blob URLs are shared — the bytes
    are identical and re-uploading them would only cost storage."""
    source = await load(db, id)
    copy = Package(
        slug=await _free_copy_slug(db, source.slug),
        destination_id=source.destination_id,
        name=f"{source.name} (copy)",
        summary=source.summary,
        themes=list(source.themes),
        nights=source.nights,
        days=source.days,
        departure_city=source.departure_city,
        highlights=list(source.highlights),
        inclusions=list(source.inclusions),
        exclusions=list(source.exclusions),
        hotels=list(source.hotels),
        faq=list(source.faq),
        status=PackageStatus.DRAFT,
        featured=False,
        starting_price_paise=source.starting_price_paise,
    )
    copy.itinerary = [
        ItineraryDay(
            day_no=d.day_no,
            title=d.title,
            description=d.description,
            meal_b=d.meal_b,
            meal_l=d.meal_l,
            meal_d=d.meal_d,
            stay=d.stay,
        )
        for d in source.itinerary
    ]
    copy.departures = [
        Departure(
            date=d.date,
            seats_total=d.seats_total,
            guaranteed=d.guaranteed,
            price_double_paise=d.price_double_paise,
            price_triple_paise=d.price_triple_paise,
            price_child_paise=d.price_child_paise,
            single_supplement_paise=d.single_supplement_paise,
        )
        for d in source.departures
    ]
    # Keep the source order so the cover can be found again by position after the flush.
    source_images = sorted(source.images, key=lambda i: i.position)
    cover_position = next(
        (i.position for i in source_images if i.id == source.cover_image_id), None
    )
    copy.images = [
        PackageImage(url=i.url, alt=i.alt, width=i.width, height=i.height, position=i.position)
        for i in source_images
    ]
    db.add(copy)
    await db.flush()  # ids for the copied image rows, so the cover can point at one
    if cover_position is not None:
        copy.cover_image_id = next(
            i.id for i in copy.images if i.position == cover_position
        )
    await _commit_or_conflict(db)
    out = await to_admin(db, await load(db, copy.id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def delete_package(db: AsyncSession, id: str) -> None:
    """`enquiries.package_id` is ON DELETE SET NULL, so the guard has to live here (06 §C4):
    an enquiry that silently lost its package is worse than a refused delete."""
    pkg = await load(db, id)
    count = await _enquiry_count(db, id)
    if count:
        noun = "enquiry references" if count == 1 else "enquiries reference"
        raise ApiError("conflict", f"{count} {noun} this package — it cannot be deleted")
    slug, destination_slug = pkg.slug, pkg.destination.slug
    await db.delete(pkg)
    await db.commit()
    await revalidate(revalidate_tags(slug, destination_slug))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: PASS — 29 passed

- [ ] **Step 5: Commit**

```bash
git add api/app/services/catalog/admin_packages.py api/tests/test_admin_packages.py
git commit -m "feat(F18): package publish rules enforcement, duplicate and delete guard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The `/admin/packages` routes

**Files:**

- Create: `api/app/routers/admin/packages.py`
- Modify: `api/app/main.py`
- Modify: `api/tests/test_openapi.py`
- Test: `api/tests/test_admin_packages.py` (append)

**Interfaces:**

- Produces: routes `listAdminPackages`, `createPackage`, `getAdminPackage`, `updatePackage`, `deletePackage`, `setPackageStatus`, `duplicatePackage`. The web's generated `api-types.ts` keys off these operation ids.
- Consumes: the whole service from Tasks 2 to 5.

**Route order matters:** `/{id}/status` and `/{id}/duplicate` are declared before `/{id}` so FastAPI does not match `status` as an id.

- [ ] **Step 1: Write the failing route tests** — append to `api/tests/test_admin_packages.py`:

```python
from httpx import AsyncClient

from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie


async def owner_cookie(db: AsyncSession, db_client: AsyncClient) -> dict[str, str]:
    await seeded_with_owner(db)
    res = await db_client.post(
        "/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}
    )
    return with_cookie(res.cookies["ts_session"])


@pytest.mark.db
async def test_admin_package_routes_require_the_owner(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    assert (await db_client.get("/admin/packages")).status_code == 401
    assert (await db_client.post("/admin/packages", json={})).status_code == 401
    assert (await db_client.get("/admin/packages/x")).status_code == 401
    assert (await db_client.put("/admin/packages/x", json={})).status_code == 401
    assert (await db_client.delete("/admin/packages/x")).status_code == 401
    assert (await db_client.post("/admin/packages/x/status", json={})).status_code == 401
    assert (await db_client.post("/admin/packages/x/duplicate")).status_code == 401
    assert (await db_client.get("/admin/packages")).headers["cache-control"] == "no-store"


@pytest.mark.db
async def test_admin_package_crud_round_trip(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    dest_id = await goa_id(db)
    body = payload(destinationId=dest_id).model_dump(by_alias=True, mode="json")

    created = await db_client.post("/admin/packages", json=body, headers=cookie)
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    new = created.json()
    assert new["status"] == "draft" and new["days"] == 4 and new["canPublish"] is False
    assert [r["key"] for r in new["publishRules"]] == [
        "images", "itinerary", "departures", "prices"
    ]

    listed = await db_client.get("/admin/packages", headers=cookie)
    assert listed.status_code == 200
    assert new["id"] in {r["id"] for r in listed.json()["items"]}

    one = await db_client.get(f"/admin/packages/{new['id']}", headers=cookie)
    assert one.status_code == 200 and one.json()["name"] == "Konkan Coast"
    assert (await db_client.get("/admin/packages/nope", headers=cookie)).status_code == 404

    updated = await db_client.put(
        f"/admin/packages/{new['id']}", json={**body, "name": "Konkan Coast Slow"}, headers=cookie
    )
    assert updated.status_code == 200 and updated.json()["name"] == "Konkan Coast Slow"

    dup_slug = await db_client.post(
        "/admin/packages", json={**body, "slug": "north-goa-beaches"}, headers=cookie
    )
    assert dup_slug.status_code == 409
    assert dup_slug.json()["error"]["fieldErrors"] == {"slug": svc.DUPLICATE_SLUG}

    invalid = await db_client.post("/admin/packages", json={**body, "nights": 0}, headers=cookie)
    assert invalid.status_code == 400 and "nights" in invalid.json()["error"]["fieldErrors"]

    gone = await db_client.delete(f"/admin/packages/{new['id']}", headers=cookie)
    assert gone.status_code == 204


@pytest.mark.db
async def test_status_and_duplicate_routes(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    pkg = await package_by_slug(db, "north-goa-beaches")

    blocked = await db_client.post(
        f"/admin/packages/{pkg.id}/duplicate", headers=cookie
    )
    assert blocked.status_code == 201, blocked.text
    copy = blocked.json()
    assert copy["slug"] == "north-goa-beaches-copy" and copy["status"] == "draft"

    down = await db_client.post(
        f"/admin/packages/{pkg.id}/status", json={"status": "draft"}, headers=cookie
    )
    assert down.status_code == 200 and down.json()["status"] == "draft"

    up = await db_client.post(
        f"/admin/packages/{pkg.id}/status", json={"status": "live"}, headers=cookie
    )
    assert up.status_code == 200 and up.json()["status"] == "live"

    bad = await db_client.post(
        f"/admin/packages/{pkg.id}/status", json={"status": "archived"}, headers=cookie
    )
    assert bad.status_code == 400


@pytest.mark.db
async def test_publishing_an_incomplete_package_is_a_conflict_naming_the_rules(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    body = payload(destinationId=await goa_id(db), itinerary=[], departures=[]).model_dump(
        by_alias=True, mode="json"
    )
    draft = (await db_client.post("/admin/packages", json=body, headers=cookie)).json()
    res = await db_client.post(
        f"/admin/packages/{draft['id']}/status", json={"status": "live"}, headers=cookie
    )
    assert res.status_code == 409
    assert set(res.json()["error"]["fieldErrors"]) == {"images", "itinerary", "departures"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py -q`
Expected: FAIL — the four route tests 404, because the router is not mounted yet

- [ ] **Step 3: Create the router** — `api/app/routers/admin/packages.py`:

```python
"""`/admin/packages` (06 §C-REST, §C4): owner CRUD, publish and duplicate.

Route order matters — `/{id}/status` and `/{id}/duplicate` are declared before `/{id}` so
`status` is never matched as an id.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.catalog import (
    AdminPackage,
    AdminPackageList,
    PackageInput,
    PackageStatusInput,
)
from app.services.auth.deps import require_owner
from app.services.catalog import admin_packages as svc

router = APIRouter(
    prefix="/admin/packages", tags=["admin"], dependencies=[Depends(require_owner)]
)

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("", operation_id="listAdminPackages", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminPackageList:
    response.headers.update(NO_STORE)
    return AdminPackageList(items=await svc.list_packages(db))


@router.post(
    "",
    operation_id="createPackage",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(payload: PackageInput, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.create_package(db, payload)


@router.post("/{id}/status", operation_id="setPackageStatus", response_model_by_alias=True)
async def set_status_route(
    id: str, payload: PackageStatusInput, response: Response, db: Db
) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.set_status(db, id, payload.status)


@router.post(
    "/{id}/duplicate",
    operation_id="duplicatePackage",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def duplicate_route(id: str, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.duplicate_package(db, id)


@router.get("/{id}", operation_id="getAdminPackage", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.get_package(db, id)


@router.put("/{id}", operation_id="updatePackage", response_model_by_alias=True)
async def update_route(
    id: str, payload: PackageInput, response: Response, db: Db
) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.update_package(db, id, payload)


@router.delete(
    "/{id}",
    operation_id="deletePackage",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, db: Db) -> Response:
    await svc.delete_package(db, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
```

- [ ] **Step 4: Mount it** — in `api/app/main.py`, extend the admin import and add the include right after the destinations one:

```python
from app.routers.admin import destinations as admin_destinations
from app.routers.admin import packages as admin_packages
```

```python
    app.include_router(admin_destinations.router)
    app.include_router(admin_packages.router)
```

- [ ] **Step 5: Register the operation ids** — `api/tests/test_openapi.py` asserts ids one by one (it does not keep a set). Append to `test_document_exposes_the_v1_enums_and_operations`, following the `/admin/destinations` block already there:

```python
    packages = doc["paths"]["/admin/packages"]
    assert packages["get"]["operationId"] == "listAdminPackages"
    assert packages["post"]["operationId"] == "createPackage"
    one_package = doc["paths"]["/admin/packages/{id}"]
    assert one_package["get"]["operationId"] == "getAdminPackage"
    assert one_package["put"]["operationId"] == "updatePackage"
    assert one_package["delete"]["operationId"] == "deletePackage"
    assert doc["paths"]["/admin/packages/{id}/status"]["post"]["operationId"] == "setPackageStatus"
    assert doc["paths"]["/admin/packages/{id}/duplicate"]["post"]["operationId"] == (
        "duplicatePackage"
    )
    assert schemas["PackageStatus"]["enum"] == ["draft", "live"]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_packages.py tests/test_openapi.py -q`
Expected: PASS — 33 passed

- [ ] **Step 7: Regenerate the contract and commit**

```bash
cd ../.. && pnpm gen:api && cd .worktrees/f18-packages-crud
git add api/app/routers/admin/packages.py api/app/main.py api/tests/test_openapi.py api/tests/test_admin_packages.py api/openapi.json web/src/lib/api-types.ts
git commit -m "feat(F18): /admin/packages routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Note: `pnpm gen:api` must run from the repo root, but the files it writes belong to this worktree — run it with the worktree as the working directory by using the worktree's own root (`cd` to the worktree root, then `pnpm gen:api`). Verify `git status` shows the two generated files as modified **in the worktree** before committing.

---

## Task 7: Gallery image routes

**Files:**

- Create: `api/app/services/catalog/admin_package_images.py`
- Create: `api/app/routers/admin/package_images.py`
- Modify: `api/app/main.py`
- Modify: `api/tests/test_openapi.py`
- Test: `api/tests/test_admin_package_images.py` (create)

**Interfaces:**

- Produces: service `add_image(db, store, id, data, content_type) -> AdminImage`, `reorder_images(db, id, order, cover_id) -> AdminPackage`, `set_alt(db, id, image_id, alt) -> AdminImage`, `remove_image(db, id, image_id) -> None`; routes `uploadPackageImage`, `reorderPackageImages`, `updatePackageImage`, `deletePackageImage`.
- Consumes: `app.services.images.prepare_image` and `MAX_BYTES` (already built in F17); Task 3's `load`, `to_admin`; Task 2's `revalidate_tags`.

- [ ] **Step 1: Write the failing tests** — create `api/tests/test_admin_package_images.py`:

```python
"""F18 gallery ops: `/admin/packages/{id}/images` (06 §C3, §C4)."""

import datetime as dt
import io
from collections.abc import Sequence

import pytest
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
async def test_upload_refuses_a_non_image(db: AsyncSession, revalidated: RecordingRevalidate) -> None:
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
async def test_image_routes_round_trip(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    cookie = await owner_cookie(db, db_client)
    pkg = await package_by_slug(db, "north-goa-beaches")

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

    gone = await db_client.delete(
        f"/admin/packages/{pkg.id}/images/{image['id']}", headers=cookie
    )
    assert gone.status_code == 204
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_package_images.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.catalog.admin_package_images'`

`tests/test_catalog.py`'s `RecordingStore` does not currently record anything despite its name — it is three lines returning a URL. The upload test above reads `store.puts`, so give it the memory its name promises (a test-helper change, not a production one):

```python
class RecordingStore:
    def __init__(self) -> None:
        self.puts: list[str] = []

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        self.puts.append(pathname)
        return f"https://blob.test/{pathname}"
```

Every existing caller constructs it as `RecordingStore()` and ignores the attribute, so nothing else changes.

- [ ] **Step 3: Create the image service** — `api/app/services/catalog/admin_package_images.py`:

```python
"""Gallery ops for a package (F18, 06 §C3/§C4). Every change revalidates the public pages.

Separate from `admin_packages` because these are immediate, single-row writes made while the
form is open — not part of the package's transactional save.
"""

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.infra.storage import Store
from app.models import PackageImage
from app.models.base import new_id
from app.schemas.catalog import AdminImage, AdminPackage
from app.services.catalog.admin_packages import load, revalidate_tags, to_admin
from app.services.images import ImageError, prepare_image

BAD_ORDER = "The gallery order must list every photo of this package exactly once"
BAD_COVER = "The cover must be one of this package's photos"
NOT_FOUND = "Photo not found"


def _to_admin_image(row: PackageImage) -> AdminImage:
    return AdminImage(
        id=row.id,
        url=row.url,
        alt=row.alt,
        width=row.width,
        height=row.height,
        position=row.position,
    )


async def _revalidate_for(db: AsyncSession, package_id: str) -> AdminPackage:
    out = await to_admin(db, await load(db, package_id))
    await revalidate(revalidate_tags(out.slug, out.destination.slug))
    return out


async def add_image(
    db: AsyncSession, store: Store, package_id: str, data: bytes, content_type: str
) -> AdminImage:
    pkg = await load(db, package_id)
    try:
        image = await asyncio.to_thread(prepare_image, data, content_type)
    except ImageError as exc:
        raise ApiError("validation", str(exc), field_errors={"file": str(exc)}) from exc
    pathname = f"packages/{pkg.slug}/uploads/{new_id()}.{image.ext}"
    url = await store.put(pathname, image.data, image.content_type)
    row = PackageImage(
        package_id=pkg.id,
        url=url,
        alt="",
        width=image.width,
        height=image.height,
        position=max((i.position for i in pkg.images), default=-1) + 1,
    )
    db.add(row)
    await db.flush()
    if pkg.cover_image_id is None:
        pkg.cover_image_id = row.id
    await db.commit()
    await db.refresh(row)
    await _revalidate_for(db, package_id)
    return _to_admin_image(row)


async def reorder_images(
    db: AsyncSession, package_id: str, order: list[str], cover_id: str | None
) -> AdminPackage:
    """One call carries the whole gallery order — a partial order is a bug, not a patch."""
    pkg = await load(db, package_id)
    by_id = {i.id: i for i in pkg.images}
    if len(order) != len(set(order)) or set(order) != by_id.keys():
        raise ApiError("validation", BAD_ORDER, field_errors={"order": BAD_ORDER})
    if cover_id is not None and cover_id not in by_id:
        raise ApiError("validation", BAD_COVER, field_errors={"coverId": BAD_COVER})
    for position, image_id in enumerate(order):
        by_id[image_id].position = position
    if cover_id is not None:
        pkg.cover_image_id = cover_id
    await db.commit()
    return await _revalidate_for(db, package_id)


async def _image_of(db: AsyncSession, package_id: str, image_id: str) -> PackageImage:
    row = (
        await db.execute(
            select(PackageImage).where(
                PackageImage.id == image_id, PackageImage.package_id == package_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise ApiError("not_found", NOT_FOUND)
    return row


async def set_alt(db: AsyncSession, package_id: str, image_id: str, alt: str) -> AdminImage:
    row = await _image_of(db, package_id, image_id)
    row.alt = alt
    await db.commit()
    await db.refresh(row)
    await _revalidate_for(db, package_id)
    return _to_admin_image(row)


async def remove_image(db: AsyncSession, package_id: str, image_id: str) -> None:
    """The FK is `SET NULL`, so deleting the cover would leave the package coverless — hand
    the role to the next photo instead. The Blob object is left behind (portfolio scale)."""
    pkg = await load(db, package_id)
    row = await _image_of(db, package_id, image_id)
    remaining = [i for i in sorted(pkg.images, key=lambda i: i.position) if i.id != image_id]
    if pkg.cover_image_id == image_id:
        pkg.cover_image_id = remaining[0].id if remaining else None
    await db.delete(row)
    for position, image in enumerate(remaining):
        image.position = position
    await db.commit()
    await _revalidate_for(db, package_id)
```

- [ ] **Step 4: Create the router** — `api/app/routers/admin/package_images.py`:

```python
"""`/admin/packages/{id}/images` (06 §C-REST row 286): the multipart proxy and gallery ops.

Collection `PATCH` reorders and sets the cover; item `PATCH` edits alt text. Mounted on the
same prefix as `packages.py` but kept separate so that module stays about the package itself.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.catalog import AdminImage, AdminPackage, ImageAltInput, ImageOrderInput
from app.services.auth.deps import require_owner
from app.services.catalog import admin_package_images as svc
from app.services.images import MAX_BYTES

router = APIRouter(
    prefix="/admin/packages", tags=["admin"], dependencies=[Depends(require_owner)]
)

Db = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "/{id}/images",
    operation_id="uploadPackageImage",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def upload_route(
    id: str, request: Request, response: Response, db: Db, file: Annotated[UploadFile, File()]
) -> AdminImage:
    response.headers.update(NO_STORE)
    store = request.app.state.store
    if store is None:
        raise ApiError("internal", "Image storage is not configured")
    if file.size is not None and file.size > MAX_BYTES:
        # The client reports a Content-Length over our cap: refuse before `await file.read()`
        # buffers the whole thing into memory.
        msg = "Images must be 4 MB or smaller"
        raise ApiError("validation", msg, field_errors={"file": msg})
    data = await file.read()
    return await svc.add_image(db, store, id, data, file.content_type or "")


@router.patch("/{id}/images", operation_id="reorderPackageImages", response_model_by_alias=True)
async def reorder_route(
    id: str, payload: ImageOrderInput, response: Response, db: Db
) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.reorder_images(db, id, payload.order, payload.cover_id)


@router.patch(
    "/{id}/images/{image_id}", operation_id="updatePackageImage", response_model_by_alias=True
)
async def alt_route(
    id: str, image_id: str, payload: ImageAltInput, response: Response, db: Db
) -> AdminImage:
    response.headers.update(NO_STORE)
    return await svc.set_alt(db, id, image_id, payload.alt)


@router.delete(
    "/{id}/images/{image_id}",
    operation_id="deletePackageImage",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, image_id: str, db: Db) -> Response:
    await svc.remove_image(db, id, image_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
```

- [ ] **Step 5: Mount it** — in `api/app/main.py`:

```python
from app.routers.admin import package_images as admin_package_images
```

```python
    app.include_router(admin_package_images.router)
```

Mount it **after** `admin_packages.router`: the image paths are more specific, and FastAPI matches in registration order only within a router, so the two prefixes coexist safely either way — keeping the order predictable is for the reader.

- [ ] **Step 6: Register the operation ids** in `api/tests/test_openapi.py`: `uploadPackageImage`, `reorderPackageImages`, `updatePackageImage`, `deletePackageImage`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest tests/test_admin_package_images.py tests/test_openapi.py -q`
Expected: PASS — 9 passed

- [ ] **Step 8: Run the whole api suite, regenerate the contract, commit**

```bash
TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest -q
uv run --directory api ruff check . && uv run --directory api ruff format . && uv run --directory api pyright
pnpm gen:api
git add -A
git commit -m "feat(F18): package gallery upload, reorder, cover and delete

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Expected: the full api suite passes (318 existing + the new ones), ruff and pyright clean.

---

## Task 8: Web dependencies and the zod mirror

**Files:**

- Modify: `web/package.json`
- Create: `web/src/components/ui/select.tsx`, `switch.tsx`, `checkbox.tsx`, `tabs.tsx`, `alert-dialog.tsx`
- Create: `web/src/lib/admin/package-schema.ts`
- Create: `web/src/lib/admin/sortable.ts`
- Modify: `web/src/lib/admin/client.ts`
- Test: `web/tests/package-schema.test.ts` (create)

**Interfaces:**

- Produces: `packageSchema`, `type PackageFormValues`, `type PackageFieldValues`, `toInput(v) -> PackageInput`, `THEMES`, `blankDay()`, `blankDeparture()`, `emptyPackage(destinationId)` in `@/lib/admin/package-schema`; `uploadPackageImage(packageId, file)` in `@/lib/admin/client`; `useSortableSensors()` and `reorder(list, from, to)` in `@/lib/admin/sortable`.
- Consumes: the generated `components['schemas']['PackageInput']` from Task 6's contract regeneration.

- [ ] **Step 1: Install the dependencies**

```bash
pnpm --filter web add @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2
```

The five shadcn primitives need **no new dependency**: the `radix-ui` package already in `dependencies` bundles `@radix-ui/react-select`, `-switch`, `-checkbox`, `-tabs` and `-alert-dialog` (verified 2026-09-22). This repo writes the wrappers by hand rather than running the shadcn CLI (see `components.json`, added in F17) — copy the upstream `new-york` source for `select`, `switch`, `checkbox`, `tabs` and `alert-dialog` into `web/src/components/ui/`, converting each upstream `import * as XPrimitive from '@radix-ui/react-x'` to the single-package form this repo uses:

```typescript
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Select as SelectPrimitive } from 'radix-ui';
```

Read `web/src/components/ui/dialog.tsx` first — it is the reference for the `data-slot` attributes and the `cn` usage these wrappers follow.

- [ ] **Step 2: Write the failing schema test** — create `web/tests/package-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  blankDay,
  blankDeparture,
  packageSchema,
  THEMES,
  toInput,
} from '../src/lib/admin/package-schema';

const soon = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const valid = {
  slug: 'konkan-coast',
  destinationId: 'd-goa',
  name: 'Konkan Coast',
  summary: 'Three slow nights on the Konkan coast with one free beach day and a fort sunset.',
  themes: ['beach'],
  nights: 3,
  departureCity: 'Ex-Mumbai',
  highlights: ['Sunset at the fort'],
  inclusions: ['3 nights with breakfast'],
  exclusions: ['Flights'],
  hotels: [{ name: 'Lemon Tree', city: 'Candolim', stars: 4, nights: 3 }],
  faq: [{ q: 'Is it family friendly?', a: 'Yes, the beach is calm.' }],
  featured: false,
  itinerary: [1, 2, 3, 4].map((n) => ({
    title: `Day ${n}`,
    description: 'Something real happens on this day of the trip.',
    meals: { breakfast: true, lunch: false, dinner: false },
    stay: 'Lemon Tree, Candolim',
  })),
  departures: [
    {
      id: null,
      date: soon(30),
      seatsTotal: 16,
      guaranteed: false,
      priceDoublePaise: 1_499_900,
      priceTriplePaise: 1_349_900,
      priceChildPaise: 899_900,
      singleSupplementPaise: 600_000,
    },
  ],
};

describe('packageSchema', () => {
  it('accepts a full record and produces the exact wire body', () => {
    const out = packageSchema.parse(valid);
    const body = toInput(out);
    expect(body.slug).toBe('konkan-coast');
    expect(body.departures[0]?.priceDoublePaise).toBe(1_499_900);
    expect(body).not.toHaveProperty('days');
    expect(body).not.toHaveProperty('status');
  });

  it('mirrors the api rules the owner can trip', () => {
    expect(packageSchema.safeParse({ ...valid, slug: 'Konkan Coast' }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, summary: 'too short' }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, nights: 0 }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, nights: 31 }).success).toBe(false);
    expect(packageSchema.safeParse({ ...valid, destinationId: '' }).success).toBe(false);
  });

  it('rejects an itinerary longer than the trip, matching the api model validator', () => {
    const tooLong = { ...valid, itinerary: [...valid.itinerary, blankDay()] };
    const result = packageSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'itinerary')).toBe(true);
    }
  });

  it('rejects two departures on the same date', () => {
    const clash = { ...valid, departures: [valid.departures[0]!, { ...valid.departures[0]! }] };
    const result = packageSchema.safeParse(clash);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'departures')).toBe(true);
    }
  });

  it('allows a parked departure with no prices so a draft can be saved', () => {
    const parked = {
      ...valid,
      departures: [{ ...valid.departures[0]!, priceDoublePaise: 0, priceChildPaise: 0 }],
    };
    expect(packageSchema.safeParse(parked).success).toBe(true);
  });

  it('allows a short itinerary so a draft can be saved half-written', () => {
    expect(packageSchema.safeParse({ ...valid, itinerary: [] }).success).toBe(true);
  });

  it('coerces the numeric text inputs and rejects a cleared one', () => {
    const coerced = packageSchema.parse({ ...valid, nights: '3' });
    expect(coerced.nights).toBe(3);
    expect(packageSchema.safeParse({ ...valid, nights: '' }).success).toBe(false);
  });

  it('drops blank lines from the one-per-line editors', () => {
    const out = packageSchema.parse({ ...valid, highlights: ['  Sunset  ', '', '   '] });
    expect(out.highlights).toEqual(['Sunset']);
  });

  it('offers every theme the api enum defines', () => {
    expect(THEMES.map((t) => t.value)).toEqual([
      'beach',
      'hills',
      'honeymoon',
      'family',
      'adventure',
      'heritage',
    ]);
  });

  it('blank rows parse as valid drafts once filled', () => {
    expect(blankDeparture().id).toBeNull();
    expect(blankDay().meals).toEqual({ breakfast: false, lunch: false, dinner: false });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test package-schema`
Expected: FAIL — cannot resolve `../src/lib/admin/package-schema`

- [ ] **Step 4: Write the schema** — `web/src/lib/admin/package-schema.ts`:

```typescript
import { z } from 'zod';
import type { components } from '@/lib/api-types';

export type PackageInput = components['schemas']['PackageInput'];

const NIGHTS_MAX = 30;

/** `<input type="number">` hands over a string; an emptied one arrives as `''`, which
 *  `z.coerce.number()` would read as 0. Treat blank as absent so clearing a field is a
 *  validation error, not a silent zero. Mirrors `destination-schema.ts`'s `position`. */
const numberField = (message: string, min: number, max: number) =>
  z.preprocess(
    (v: number | string) => (v === '' ? undefined : v),
    z.coerce
      .number<number | string>({ error: message })
      .int(message)
      .min(min, message)
      .max(max, message),
  );

const paise = (label: string) =>
  numberField(`${label} must be a whole number of paise`, 0, 100_000_000);

const lines = z
  .array(z.string())
  .transform((xs) => xs.map((s) => s.trim()).filter(Boolean));

const mealsSchema = z.object({
  breakfast: z.boolean(),
  lunch: z.boolean(),
  dinner: z.boolean(),
});

const daySchema = z.object({
  title: z.string().trim().min(1, 'Required').max(120),
  description: z.string().trim().min(1, 'Required').max(4000),
  meals: mealsSchema,
  stay: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((s) => s || null),
});

const hotelSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  city: z.string().trim().min(1, 'Required').max(80),
  stars: numberField('Stars must be 1 to 5', 1, 5),
  nights: numberField(`Nights must be 1 to ${NIGHTS_MAX}`, 1, NIGHTS_MAX),
});

const faqSchema = z.object({
  q: z.string().trim().min(1, 'Required').max(200),
  a: z.string().trim().min(1, 'Required').max(2000),
});

const departureSchema = z.object({
  /** The api row this edits; null inserts a new one. Never invent an id on the client. */
  id: z.string().nullish().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  seatsTotal: numberField('Seats must be 1 to 200', 1, 200),
  guaranteed: z.boolean(),
  priceDoublePaise: paise('Double'),
  priceTriplePaise: paise('Triple'),
  priceChildPaise: paise('Child'),
  singleSupplementPaise: paise('Single supplement'),
});

/** Mirrors `PackageInput` in api/app/schemas/catalog.py — the api is still the authority. */
export const packageSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, 'Required')
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only'),
    destinationId: z.string().min(1, 'Pick a destination'),
    name: z.string().trim().min(1, 'Required').max(120),
    summary: z.string().trim().min(40, 'Write at least a sentence or two').max(600),
    themes: z.array(z.enum(['beach', 'hills', 'honeymoon', 'family', 'adventure', 'heritage'])),
    nights: numberField(`Nights must be 1 to ${NIGHTS_MAX}`, 1, NIGHTS_MAX),
    departureCity: z.string().trim().min(1, 'Required').max(80),
    highlights: lines,
    inclusions: lines,
    exclusions: lines,
    hotels: z.array(hotelSchema).max(10),
    faq: z.array(faqSchema).max(15),
    featured: z.boolean(),
    itinerary: z.array(daySchema).max(NIGHTS_MAX + 1),
    departures: z.array(departureSchema).max(60),
  })
  .superRefine((v, ctx) => {
    const days = v.nights + 1;
    if (v.itinerary.length > days) {
      ctx.addIssue({
        code: 'custom',
        path: ['itinerary'],
        message: `A ${v.nights}-night trip has ${days} days at most`,
      });
    }
    const seen = new Set<string>();
    v.departures.forEach((d, i) => {
      if (seen.has(d.date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['departures', i, 'date'],
          message: 'Two departures cannot share the same date',
        });
      }
      seen.add(d.date);
    });
  });

/** The parsed output — what `onSubmit` receives; the form's field values are `z.input<...>`. */
export type PackageFormValues = z.output<typeof packageSchema>;
/** What the inputs hold (numbers may be strings until zod coerces them). */
export type PackageFieldValues = z.input<typeof packageSchema>;

export const THEMES = [
  { value: 'beach', label: 'Beach' },
  { value: 'hills', label: 'Hills' },
  { value: 'honeymoon', label: 'Honeymoon' },
  { value: 'family', label: 'Family' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'heritage', label: 'Heritage' },
] as const;

export const blankDay = (): PackageFieldValues['itinerary'][number] => ({
  title: '',
  description: '',
  meals: { breakfast: false, lunch: false, dinner: false },
  stay: '',
});

export const blankDeparture = (): PackageFieldValues['departures'][number] => ({
  id: null,
  date: '',
  seatsTotal: 16,
  guaranteed: false,
  priceDoublePaise: 0,
  priceTriplePaise: 0,
  priceChildPaise: 0,
  singleSupplementPaise: 0,
});

export const emptyPackage = (destinationId: string): PackageFieldValues => ({
  slug: '',
  destinationId,
  name: '',
  summary: '',
  themes: [],
  nights: 3,
  departureCity: 'Ex-Mumbai',
  highlights: [],
  inclusions: [],
  exclusions: [],
  hotels: [],
  faq: [],
  featured: false,
  itinerary: [],
  departures: [],
});

/** The exact wire body; a separate step so a schema tweak cannot silently send extra fields. */
export function toInput(v: PackageFormValues): PackageInput {
  return {
    slug: v.slug,
    destinationId: v.destinationId,
    name: v.name,
    summary: v.summary,
    themes: v.themes,
    nights: v.nights,
    departureCity: v.departureCity,
    highlights: v.highlights,
    inclusions: v.inclusions,
    exclusions: v.exclusions,
    hotels: v.hotels,
    faq: v.faq,
    featured: v.featured,
    itinerary: v.itinerary,
    departures: v.departures,
  };
}
```

- [ ] **Step 5: Add the sortable helper** — `web/src/lib/admin/sortable.ts`:

```typescript
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Pointer plus keyboard, shared by the itinerary and the gallery. The keyboard sensor is what
 * makes drag-to-reorder reachable without a mouse — space to lift, arrows to move, space to
 * drop — so there is no second set of up/down buttons to keep in sync.
 *
 * The pointer sensor needs a small activation distance: without it, a click on a control
 * inside a draggable row starts a drag instead of activating the control.
 */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** `arrayMove` over ids: resolves a drag-end into the new index pair, or null if nothing moved. */
export function movedIndices(
  event: DragEndEvent,
  ids: string[],
): { from: number; to: number } | null {
  const { active, over } = event;
  if (!over || active.id === over.id) return null;
  const from = ids.indexOf(String(active.id));
  const to = ids.indexOf(String(over.id));
  if (from < 0 || to < 0) return null;
  return { from, to };
}
```

- [ ] **Step 6: Add the image upload client** — append to `web/src/lib/admin/client.ts`, next to `uploadCover`:

```typescript
export type AdminImage = components['schemas']['AdminImage'];

export async function uploadPackageImage(packageId: string, file: File): Promise<AdminImage> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`/api/admin/packages/${encodeURIComponent(packageId)}/images`, {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return settle<AdminImage>(res);
}
```

Also widen `adminRequest`'s `Method` union to include `'PATCH'` — the gallery reorder and alt-text calls need it:

```typescript
type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter web test package-schema`
Expected: PASS — 10 passed

- [ ] **Step 8: Commit**

```bash
git add web/package.json pnpm-lock.yaml web/src/components/ui web/src/lib/admin web/tests/package-schema.test.ts
git commit -m "feat(F18): package zod mirror, dnd-kit sensors, shadcn primitives

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The packages list page (mockup A3)

**Files:**

- Create: `web/src/components/admin/packages/PackagesTable.tsx`
- Modify: `web/src/app/(admin)/admin/(shell)/packages/page.tsx` (replaces the F16 placeholder)
- Test: `web/tests/packages-table.test.tsx` (create)

**Interfaces:**

- Produces: `<PackagesTable items={AdminPackageRow[]} />` — a client component owning the tab and search state.
- Consumes: `components['schemas']['AdminPackageRow']`, `inr` and `duration` from `@/lib/format`.

- [ ] **Step 1: Write the failing test** — create `web/tests/packages-table.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PackagesTable } from '../src/components/admin/packages/PackagesTable';
import type { components } from '../src/lib/api-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/packages',
}));

type Row = components['schemas']['AdminPackageRow'];

const row = (over: Partial<Row>): Row => ({
  id: 'p1',
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  coverUrl: 'https://blob.test/a.jpg',
  destination: { slug: 'goa', name: 'Goa' },
  nights: 3,
  days: 4,
  startingPricePaise: 1_499_900,
  departureCount: 4,
  enquiryCount30d: 18,
  status: 'live',
  featured: true,
  updatedAt: '2026-09-20T10:00:00Z',
  ...over,
});

const items = [
  row({}),
  row({ id: 'p2', slug: 'munnar-tea-trails', name: 'Munnar Tea Trails', status: 'draft',
        startingPricePaise: 0, departureCount: 0, enquiryCount30d: 0,
        destination: { slug: 'kerala', name: 'Kerala' } }),
];

describe('PackagesTable', () => {
  it('shows every package with its price and status', () => {
    render(<PackagesTable items={items} />);
    expect(screen.getByText('North Goa Beaches')).toBeDefined();
    expect(screen.getByText('₹14,999')).toBeDefined();
    expect(screen.getByText('Munnar Tea Trails')).toBeDefined();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('filters by the Live and Draft tabs', async () => {
    const user = userEvent.setup();
    render(<PackagesTable items={items} />);
    await user.click(screen.getByRole('tab', { name: /draft/i }));
    expect(screen.queryByText('North Goa Beaches')).toBeNull();
    expect(screen.getByText('Munnar Tea Trails')).toBeDefined();
    await user.click(screen.getByRole('tab', { name: /live/i }));
    expect(screen.getByText('North Goa Beaches')).toBeDefined();
    expect(screen.queryByText('Munnar Tea Trails')).toBeNull();
  });

  it('searches by name and by destination', async () => {
    const user = userEvent.setup();
    render(<PackagesTable items={items} />);
    const search = screen.getByRole('searchbox', { name: /search packages/i });
    await user.type(search, 'munnar');
    expect(screen.queryByText('North Goa Beaches')).toBeNull();
    await user.clear(search);
    await user.type(search, 'goa');
    expect(screen.getByText('North Goa Beaches')).toBeDefined();
    expect(screen.queryByText('Munnar Tea Trails')).toBeNull();
  });

  it('explains an empty result rather than showing a bare table', async () => {
    const user = userEvent.setup();
    render(<PackagesTable items={items} />);
    await user.type(screen.getByRole('searchbox', { name: /search packages/i }), 'zzz');
    expect(screen.getByText(/no packages match/i)).toBeDefined();
  });

  it('only offers View for a live package', () => {
    render(<PackagesTable items={items} />);
    const view = screen.getAllByRole('link', { name: 'View' });
    expect(view).toHaveLength(1);
    expect(view[0]?.getAttribute('href')).toBe('/packages/north-goa-beaches');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test packages-table`
Expected: FAIL — cannot resolve `PackagesTable`

- [ ] **Step 3: Build the table** — `web/src/components/admin/packages/PackagesTable.tsx`. It is a client component holding `tab` and `query` state, rendering:

- shadcn `<Tabs>` with `<TabsList>` / `<TabsTrigger value="all|live|draft">` labelled `All {n}` · `Live {n}` · `Draft {n}` (counts from `items`, not from the filtered list).
- A `<label className="sr-only">` plus `<input type="search">` so the test's `getByRole('searchbox', { name: /search packages/i })` resolves. Filter on `name` and `destination.name`, both lower-cased.
- A shadcn `<Table>` with the mockup A3 columns: Package (56 px `next/image` thumb from `coverUrl` when present, plus the name in bold), Destination, Nights (`{nights}N`), From (`inr(startingPricePaise)` or `—` when 0), Departures (`departureCount` or `—` when 0), `Enquiries · 30 d` (`enquiryCount30d` or `—` when 0), Status (shadcn `<Badge>` reading `Live` / `Draft`), and a right-aligned actions cell.
- Actions: `View` (a `next/link` to `/packages/{slug}` with `target="_blank"`, **rendered only when `status === 'live'`**), `Duplicate` (the `<DuplicatePackage>` button from Task 13), `Edit` (link to `/admin/packages/{id}`).
- An empty state: when `items.length === 0`, "No packages yet — add the first one."; when the filter empties the list, "No packages match this search."

Match `DestinationsTable.tsx` for the wrapper (`overflow-x-auto rounded-card border border-line bg-bg`), cell classes and the `num` class on numeric cells.

- [ ] **Step 4: Replace the placeholder page** — `web/src/app/(admin)/admin/(shell)/packages/page.tsx`:

```typescript
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { PackagesTable } from '@/components/admin/packages/PackagesTable';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Packages' };

export default async function PackagesPage() {
  const { items } = await api('/admin/packages', { auth: true });
  const live = items.filter((p) => p.status === 'live').length;
  const drafts = items.length - live;
  return (
    <>
      <PageHead
        title="Packages"
        subtitle={`${live} live${drafts ? ` · ${drafts} draft` : ''}`}
        actions={
          <Link href="/admin/packages/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New package
          </Link>
        }
      />
      <PackagesTable items={items} />
    </>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test packages-table`
Expected: PASS — 5 passed

- [ ] **Step 6: Commit**

```bash
git add web/src/components/admin/packages/PackagesTable.tsx "web/src/app/(admin)/admin/(shell)/packages/page.tsx" web/tests/packages-table.test.tsx
git commit -m "feat(F18): packages list with live/draft tabs and search

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: The package form shell — basics and list editors

**Files:**

- Create: `web/src/components/admin/packages/PackageForm.tsx`
- Create: `web/src/components/admin/packages/BasicsPanel.tsx`
- Create: `web/src/components/admin/packages/ListEditor.tsx`
- Create: `web/src/components/admin/packages/FaqEditor.tsx`
- Create: `web/src/components/admin/packages/HotelsEditor.tsx`
- Create: `web/src/app/(admin)/admin/(shell)/packages/new/page.tsx`
- Create: `web/src/app/(admin)/admin/(shell)/packages/[id]/page.tsx`

**Interfaces:**

- Produces: `<PackageForm mode="create" destinations={...} />` and `<PackageForm mode="edit" pkg={AdminPackage} destinations={...} />`. Tasks 11 to 13 mount their panels inside it.
- Consumes: Task 8's `packageSchema`, `toInput`, `emptyPackage`, `THEMES`; `adminRequest` and `reportAdminError` from `@/lib/admin`.

The form is one `useForm<PackageFieldValues, unknown, PackageFormValues>` with `zodResolver(packageSchema)`. `PackageForm` owns submission and the server-error mapping; the panels are presentational and read `useFormContext`.

- [ ] **Step 1: Build `PackageForm.tsx`**

Follow `DestinationForm.tsx` closely — it is the settled pattern for this codebase:

- `useForm` with `defaultValues` from `emptyPackage(destinations[0].id)` on create, or from `pkg` on edit (mapping `AdminPackage` to `PackageFieldValues`: `itinerary` keeps `dayNo` out, `departures` carry their `id`, `hotels`/`faq` pass through).
- Wrap everything in shadcn's `<Form {...form}>` so the panels can use `useFormContext`.
- `onSubmit(values)`: `const body = toInput(values)`, then `adminRequest('/admin/packages', { method: 'POST', body })` on create — and on success `router.push(\`/admin/packages/${created.id}\`)` so the gallery becomes available (decision 11) with the toast "Draft saved — add photos, then publish". On edit, `PUT /admin/packages/{id}`, toast "Saved — the public pages refresh in a few seconds", then `router.refresh()` (no navigation; the owner stays on the form).
- The catch block is copied from `DestinationForm`: an `ApiRequestError` carrying `fieldErrors` sets each error on its field and focuses the first, and anything else falls through to `reportAdminError`. **Extend the field mapping** to handle nested paths: the api returns `departures` and `itinerary` as whole-list keys, so map those onto the array field itself (`form.setError('departures', ...)`) rather than dropping them.
- Layout: the mockup's `.fgrid` — `grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]`, left column the editable panels, right column `<StatusPanel>`, `<HotelsEditor>` and the danger zone (Task 13). At `lg` and below it stacks, right column last.
- Header actions live in the page, not the form: Preview (link to `/packages/{slug}`, live only), and the submit button inside the form labelled `Create draft` / `Save changes`.
- Reuse the `panel` and `h3` class constants from `DestinationForm.tsx` verbatim so the two screens match.

- [ ] **Step 2: Build `BasicsPanel.tsx`**

Mockup A4's Basics panel, all via `<FormField control={form.control} name="…">`:

- Row 1: `name` (with the same slugify-follows-name behaviour as `DestinationForm`, create mode only) and `slug` (description: create — "The public address: /packages/<slug>."; edit — "Changing this moves the public page; the old address stops working.").
- Row 2 (`sm:grid-cols-3`): `destinationId` as a shadcn `<Select>` over the `destinations` prop; `nights` as `<Input type="number" min={1} max={30}>` with a `<FormDescription>` reading `{nights + 1} days` computed live from `form.watch('nights')`; `departureCity` as a text input.
- `themes`: the mockup's `.status-sel` chip row — a `role="group"` of toggle buttons with `aria-pressed`, one per `THEMES` entry, toggling membership in the array. Label it with a `useId()` and `aria-labelledby`, exactly as `DestinationForm` does for `bestMonths` (a `role="group"` is not labelable by `<label htmlFor>`).
- `summary`: `<Textarea rows={3}>`.
- `featured`: a shadcn `<Switch>` with the description "Featured packages lead the home page."

- [ ] **Step 3: Build `ListEditor.tsx`**

One reusable one-entry-per-line editor, used three times (highlights, inclusions, exclusions):

```typescript
type Props = { name: 'highlights' | 'inclusions' | 'exclusions'; label: string; description: string; rows?: number };
```

It renders a `<Textarea>` whose value is `field.value.join('\n')` and whose `onChange` splits on `\n` **without** filtering blanks (filtering while typing would eat the newline the moment it is pressed — the zod `lines` transform drops them at submit instead). Show a live count: `{n} {n === 1 ? 'entry' : 'entries'}` in the `<FormDescription>`.

- [ ] **Step 4: Build `FaqEditor.tsx` and `HotelsEditor.tsx`**

Both use `useFieldArray`. FAQ: per row a question `<Input>` and an answer `<Textarea rows={3}>`, a remove button (`<Trash2>` icon, `aria-label={\`Remove question ${i + 1}\`}`), and an "Add question" outline button. Hotels: per row name, city, stars (`<Select>` 1–5) and nights (`<Input type="number">`), same remove/add shape with `aria-label={\`Remove hotel ${i + 1}\`}`. Neither needs drag — order is not meaningful for either.

- [ ] **Step 5: Build the two pages**

`new/page.tsx`:

```typescript
import { PageHead } from '@/components/admin/PageHead';
import { PackageForm } from '@/components/admin/packages/PackageForm';
import { api } from '@/lib/api';

export const metadata = { title: 'New package' };

export default async function NewPackagePage() {
  const { items } = await api('/admin/destinations', { auth: true });
  return (
    <>
      <PageHead title="New package" subtitle="Save the draft first, then add photos and publish." />
      <PackageForm mode="create" destinations={items} />
    </>
  );
}
```

`[id]/page.tsx` mirrors `destinations/[id]/page.tsx`: fetch `GET /admin/packages/{id}` and `GET /admin/destinations` (in parallel with `Promise.all`), map a 404 `ApiRequestError` to `notFound()`, and render a `<PageHead>` whose subtitle is the mockup's `Live · last edited …` line — `{status === 'live' ? 'Live' : 'Draft'} · updated {formatDate(pkg.updatedAt)}` — with a Preview link in `actions` when live.

If the destinations list comes back empty, render an explanatory panel instead of the form: "Add a destination first — every package belongs to one." with a link to `/admin/destinations/new`. A `<Select>` with no options would otherwise make the form unsubmittable with no visible reason.

- [ ] **Step 6: Verify it renders**

Run: `rm -rf web/.next && pnpm --filter web build`
Expected: build succeeds; `/admin/packages/[id]` and `/admin/packages/new` appear in the route list.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/admin/packages "web/src/app/(admin)/admin/(shell)/packages"
git commit -m "feat(F18): package form shell, basics and list editors

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Itinerary editor with drag-to-reorder

**Files:**

- Create: `web/src/components/admin/packages/ItineraryEditor.tsx`
- Test: `web/tests/itinerary-editor.test.tsx` (create)

**Interfaces:**

- Produces: `<ItineraryEditor />` — reads `useFormContext<PackageFieldValues>()`, no props.
- Consumes: Task 8's `blankDay`, `useSortableSensors`, `movedIndices`.

- [ ] **Step 1: Write the failing test** — create `web/tests/itinerary-editor.test.tsx`:

```typescript
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { ItineraryEditor } from '../src/components/admin/packages/ItineraryEditor';
import { blankDay, type PackageFieldValues } from '../src/lib/admin/package-schema';

function Harness({ days = 2, nights = 3 }: { days?: number; nights?: number }) {
  const form = useForm<PackageFieldValues>({
    defaultValues: {
      nights,
      itinerary: Array.from({ length: days }, (_, i) => ({
        ...blankDay(),
        title: `Day ${i + 1} title`,
      })),
    } as PackageFieldValues,
  });
  return (
    <FormProvider {...form}>
      <ItineraryEditor />
    </FormProvider>
  );
}

describe('ItineraryEditor', () => {
  it('numbers the days and shows how many the trip needs', () => {
    render(<Harness />);
    expect(screen.getByText(/2 of 4 days/i)).toBeDefined();
    expect(screen.getByDisplayValue('Day 1 title')).toBeDefined();
  });

  it('adds a day and stops at the trip length', async () => {
    const user = userEvent.setup();
    render(<Harness days={3} nights={3} />);
    const add = screen.getByRole('button', { name: /add day/i });
    await user.click(add);
    expect(screen.getByText(/4 of 4 days/i)).toBeDefined();
    expect(add).toHaveProperty('disabled', true);
  });

  it('removes a day', async () => {
    const user = userEvent.setup();
    render(<Harness days={2} />);
    await user.click(screen.getByRole('button', { name: /remove day 1/i }));
    expect(screen.queryByDisplayValue('Day 1 title')).toBeNull();
    expect(screen.getByText(/1 of 4 days/i)).toBeDefined();
  });

  it('reorders with the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<Harness days={2} />);
    const handle = screen.getAllByRole('button', { name: /reorder day 1/i })[0]!;
    handle.focus();
    await user.keyboard('{ }');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ }');
    const rows = screen.getAllByRole('group', { name: /day \d/i });
    expect(within(rows[0]!).getByDisplayValue('Day 2 title')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test itinerary-editor`
Expected: FAIL — cannot resolve `ItineraryEditor`

- [ ] **Step 3: Build the editor**

`ItineraryEditor.tsx`, a client component:

- `const form = useFormContext<PackageFieldValues>()`; `const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'itinerary' })`.
- `const days = Number(form.watch('nights')) + 1` — the panel header reads `Itinerary` with a `<span className="sub">· {fields.length} of {days} days</span>`, matching the mockup's `.ph3` sub.
- Wrap the rows in `<DndContext sensors={useSortableSensors()} collisionDetection={closestCenter} onDragEnd={...}>` and `<SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>`. `onDragEnd` resolves via `movedIndices(event, fields.map((f) => f.id))` and calls `move(from, to)` — **`useFieldArray`'s own `move`**, so react-hook-form's registered field names stay consistent; never reorder a local copy.
- Each row is its own `SortableDayRow` component (a sortable hook may only be called inside the item), rendered as `role="group"` with `aria-label={\`Day ${index + 1}\`}` so the test can scope into it. Inside: a drag handle `<button type="button" aria-label={\`Reorder day ${index + 1}\`} {...attributes} {...listeners}>` carrying a `<GripVertical>` icon, the day number, a title `<Input>`, a description `<Textarea rows={3}>`, three meal `<Checkbox>`es (B / L / D) grouped and labelled, a `stay` `<Input>`, and a remove button `aria-label={\`Remove day ${index + 1}\`}`.
- The "Add day" button appends `blankDay()` and is `disabled={fields.length >= days}` with the title "This trip is 4 days long — change nights to add more." An empty list shows "No days yet — add the first one."
- Apply `transform` and `transition` from `useSortable` through `CSS.Transform.toString` (from `@dnd-kit/utilities`), and give the lifted row `opacity-50` while `isDragging`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test itinerary-editor`
Expected: PASS — 4 passed

If the keyboard-reorder test proves flaky under jsdom (dnd-kit needs layout measurements jsdom does not provide), do **not** delete it — mock `@dnd-kit/core`'s `useSensors` is not the answer either. Instead assert the reorder through `onDragEnd` directly: export the handler's pure part as `handleDragEnd(fields, move)` and unit-test that, keeping one rendering test that the drag handle exists and is a focusable button with the right accessible name.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/packages/ItineraryEditor.tsx web/tests/itinerary-editor.test.tsx
git commit -m "feat(F18): itinerary editor with keyboard-accessible reordering

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Departures editor with the occupancy pricing grid

**Files:**

- Create: `web/src/components/admin/packages/DeparturesEditor.tsx`
- Test: `web/tests/departures-editor.test.tsx` (create)

**Interfaces:**

- Produces: `<DeparturesEditor />` — reads `useFormContext<PackageFieldValues>()`, no props.
- Consumes: Task 8's `blankDeparture`; `inr` from `@/lib/format`.

Prices are **paise** in state and on the wire, but the owner types **rupees**. Each price cell is a rupee `<input type="number">` bound through a paise-to-rupee adapter — the one place in the app where that conversion happens in a form, so it gets its own test.

- [ ] **Step 1: Write the failing test** — create `web/tests/departures-editor.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { DeparturesEditor } from '../src/components/admin/packages/DeparturesEditor';
import { blankDeparture, type PackageFieldValues } from '../src/lib/admin/package-schema';

const soon = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

let latest: PackageFieldValues | undefined;

function Harness({ rows = 1 }: { rows?: number }) {
  const form = useForm<PackageFieldValues>({
    defaultValues: {
      departures: Array.from({ length: rows }, (_, i) => ({
        ...blankDeparture(),
        id: `dep-${i}`,
        date: soon(30 + i * 30),
        priceDoublePaise: 1_499_900,
        priceTriplePaise: 1_349_900,
        priceChildPaise: 899_900,
        singleSupplementPaise: 600_000,
      })),
    } as PackageFieldValues,
  });
  latest = form.watch();
  return (
    <FormProvider {...form}>
      <DeparturesEditor />
    </FormProvider>
  );
}

describe('DeparturesEditor', () => {
  it('shows prices in rupees while state stays in paise', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/double/i)).toHaveProperty('value', '14999');
    expect(latest?.departures[0]?.priceDoublePaise).toBe(1_499_900);
  });

  it('writes paise back when the owner types rupees', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const double = screen.getByLabelText(/double/i);
    await user.clear(double);
    await user.type(double, '16500');
    expect(latest?.departures[0]?.priceDoublePaise).toBe(1_650_000);
  });

  it('adds and removes a departure', async () => {
    const user = userEvent.setup();
    render(<Harness rows={1} />);
    await user.click(screen.getByRole('button', { name: /add departure/i }));
    expect(latest?.departures).toHaveLength(2);
    expect(latest?.departures[1]?.id).toBeNull();
    await user.click(screen.getByRole('button', { name: /remove departure 2/i }));
    expect(latest?.departures).toHaveLength(1);
  });

  it('keeps the api row id on an existing departure', async () => {
    const user = userEvent.setup();
    render(<Harness rows={1} />);
    await user.clear(screen.getByLabelText(/seats total/i));
    await user.type(screen.getByLabelText(/seats total/i), '20');
    expect(latest?.departures[0]?.id).toBe('dep-0');
  });

  it('says seats left is computed, never typed', () => {
    render(<Harness />);
    expect(screen.getByText(/seats left is computed/i)).toBeDefined();
  });

  it('explains an empty list', () => {
    render(<Harness rows={0} />);
    expect(screen.getByText(/no departures yet/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test departures-editor`
Expected: FAIL — cannot resolve `DeparturesEditor`

- [ ] **Step 3: Build the editor**

`DeparturesEditor.tsx`, a client component:

- `useFieldArray({ control, name: 'departures' })`. No drag — the api returns them sorted by date and the mockup shows a plain table.
- A shadcn `<Table>` with the mockup A4 columns: Date, Seats total, Double, Triple, Child, Single suppl., Guaranteed, and an actions cell.
- Every cell is an input bound through `<FormField>`. Date is `<Input type="date">`; seats is `type="number" min={1} max={200}`.
- The four price cells go through a small local adapter — put it at the top of the file so it is obvious and testable:

```typescript
/** The owner thinks in rupees; the wire and the DB are paise, always (06 §A3). One conversion
 *  point, so a stray `* 100` can never drift into a panel that only renders. */
const toRupees = (paise: number | string) =>
  paise === '' || paise === undefined ? '' : String(Math.round(Number(paise) / 100));
const toPaise = (rupees: string) => (rupees === '' ? 0 : Math.round(Number(rupees) * 100));
```

Each price input reads `value={toRupees(field.value)}` and writes `field.onChange(toPaise(e.target.value))`. Give each an `aria-label` that includes the column name and the row (`aria-label={\`Double, departure ${i + 1}\`}`) — the test looks them up by label, and a table of bare number boxes is unusable with a screen reader otherwise. Prefix each with a `₹` adornment.
- Guaranteed is a shadcn `<Checkbox>` with `aria-label={\`Guaranteed, departure ${i + 1}\`}`.
- Remove button per row: `aria-label={\`Remove departure ${i + 1}\`}`. "Add departure" appends `blankDeparture()`.
- Below the table, the mockup's footnote verbatim: "Seats left is computed from bookings — never edited by hand."
- Empty state: "No departures yet — add the first date."
- A row whose `date` is in the past gets a muted `Past` chip; it stays fully editable (decision 16).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test departures-editor`
Expected: PASS — 6 passed

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/packages/DeparturesEditor.tsx web/tests/departures-editor.test.tsx
git commit -m "feat(F18): departures editor with the occupancy pricing grid

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Gallery, status panel, duplicate and delete

**Files:**

- Create: `web/src/components/admin/packages/GalleryUploader.tsx`
- Create: `web/src/components/admin/packages/StatusPanel.tsx`
- Create: `web/src/components/admin/packages/DuplicatePackage.tsx`
- Create: `web/src/components/admin/packages/DeletePackage.tsx`
- Modify: `web/src/components/admin/packages/PackageForm.tsx` (mount the panels)
- Test: `web/tests/status-panel.test.tsx` (create)

**Interfaces:**

- Produces: `<GalleryUploader packageId images coverImageId disabled />`, `<StatusPanel pkg />`, `<DuplicatePackage id name />`, `<DeletePackage id name enquiryCount />`.
- Consumes: Task 8's `uploadPackageImage`; `adminRequest`, `reportAdminError`.

These four are **immediate writers** (decision 14): each hits the api as it happens and then `router.refresh()`. They are not part of the form's submit.

- [ ] **Step 1: Write the failing status-panel test** — create `web/tests/status-panel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatusPanel } from '../src/components/admin/packages/StatusPanel';
import type { components } from '../src/lib/api-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => '/admin/packages/p1',
}));

const adminRequest = vi.fn();
vi.mock('../src/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));

type AdminPackage = components['schemas']['AdminPackage'];

const rule = (key: string, ok: boolean, detail: string) => ({
  key, ok, detail, label: { images: 'At least one photo', itinerary: 'Full itinerary',
  departures: 'At least one upcoming departure', prices: 'Prices set for every departure' }[key]!,
});

const pkg = (over: Partial<AdminPackage> = {}) =>
  ({
    id: 'p1',
    slug: 'north-goa-beaches',
    status: 'draft',
    canPublish: true,
    publishRules: [
      rule('images', true, '4 uploaded'),
      rule('itinerary', true, '4 of 4 days written'),
      rule('departures', true, '3 upcoming'),
      rule('prices', true, 'All departures priced'),
    ],
    ...over,
  }) as AdminPackage;

describe('StatusPanel', () => {
  it('lists every rule with its detail', () => {
    render(<StatusPanel pkg={pkg()} />);
    expect(screen.getByText('At least one photo')).toBeDefined();
    expect(screen.getByText('4 of 4 days written')).toBeDefined();
  });

  it('disables publishing while a rule fails and says why', () => {
    const blocked = pkg({
      canPublish: false,
      publishRules: [
        rule('images', false, 'No photos yet'),
        rule('itinerary', true, '4 of 4 days written'),
        rule('departures', true, '3 upcoming'),
        rule('prices', true, 'All departures priced'),
      ],
    });
    render(<StatusPanel pkg={blocked} />);
    expect(screen.getByRole('button', { name: /publish/i })).toHaveProperty('disabled', true);
    expect(screen.getByText('No photos yet')).toBeDefined();
  });

  it('publishes a ready draft', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValueOnce({});
    render(<StatusPanel pkg={pkg()} />);
    await user.click(screen.getByRole('button', { name: /publish/i }));
    expect(adminRequest).toHaveBeenCalledWith('/admin/packages/p1/status', {
      method: 'POST',
      body: { status: 'live' },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('offers unpublish for a live package regardless of the rules', () => {
    render(<StatusPanel pkg={pkg({ status: 'live', canPublish: false })} />);
    const button = screen.getByRole('button', { name: /unpublish/i });
    expect(button).toHaveProperty('disabled', false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test status-panel`
Expected: FAIL — cannot resolve `StatusPanel`

- [ ] **Step 3: Build `StatusPanel.tsx`**

Mockup A4's Status side card:

- Top row: a shadcn `<Badge>` reading `Live` or `Draft`, and the action button — `Publish` when draft (`disabled={!pkg.canPublish}`), `Unpublish` when live (never disabled).
- Below it, `pkg.publishRules.map(...)`: a `<Check>` or `<X>` icon (`text-ok` / `text-mute`), the `label` in medium weight and the `detail` beneath it in `text-mute`. Mark the icon `aria-hidden` and give the row `aria-label={\`${r.label}: ${r.ok ? 'done' : 'not done'}\`}`.
- Footnote: "Publishing revalidates the public page, the listing, the destination page and the itinerary PDF."
- The click handler calls `adminRequest(\`/admin/packages/${pkg.id}/status\`, { method: 'POST', body: { status } })`, toasts, then `router.refresh()`. A 409 carries `fieldErrors` keyed by rule — surface `e.body.message` through `reportAdminError` (the panel re-renders with fresh rules on the refresh anyway).

- [ ] **Step 4: Build `GalleryUploader.tsx`**

Mockup A4's Gallery panel — "drag to reorder, first is cover":

- A `<DndContext>` + `<SortableContext>` (`rectSortingStrategy`) over the image tiles, using the same `useSortableSensors()` and `movedIndices` as the itinerary. On drag end, compute the new id order locally, then `adminRequest(\`/admin/packages/${packageId}/images\`, { method: 'PATCH', body: { order, coverId } })` and `router.refresh()`. Show the new order optimistically while the request is in flight so the tile does not snap back.
- Each tile: `next/image` (`fill`, `sizes="200px"`), a `Cover` badge when `image.id === coverImageId`, a drag handle button `aria-label={\`Reorder photo ${i + 1}\`}`, a `Make cover` button (PATCH the collection with the current order and the new `coverId`), an alt-text `<Input>` that PATCHes `\`/admin/packages/${packageId}/images/${image.id}\`` with `{ alt }` **on blur** (not on every keystroke), and a delete button behind an `<AlertDialog>` confirm.
- The upload tile: the mockup's dashed `.add` box reading `Upload · JPG/PNG/WEBP ≤ 4 MB`, wired to a hidden `<input type="file" multiple accept="image/jpeg,image/png,image/webp">`. Upload files **sequentially** in a `for` loop — `position` is derived from the current max on the server, so parallel uploads would race for the same slot. Toast once at the end with the count, then `router.refresh()`.
- `disabled` prop: when true (create mode, decision 11), render the panel greyed with "Save the draft first, then add photos." and no file input.
- Alt-text copy under the panel: "Alt text describes the photo for screen readers and shows if the image fails to load."

- [ ] **Step 5: Build `DuplicatePackage.tsx` and `DeletePackage.tsx`**

`DuplicatePackage` is a button (used both in the A3 table row and the form header): POSTs `\`/admin/packages/${id}/duplicate\``, toasts `"Duplicated — opening the copy"`, then `router.push(\`/admin/packages/${created.id}\`)`.

`DeletePackage` is `DeleteDestination.tsx` with the nouns changed: `disabled={enquiryCount > 0}`, dialog copy "This removes the package, its itinerary, departures and photos. It cannot be undone.", and the footnote `Delete is blocked while ${enquiryCount} ${enquiryCount === 1 ? 'enquiry references' : 'enquiries reference'} this package.` when blocked, otherwise "No enquiries reference this package."

- [ ] **Step 6: Mount the panels in `PackageForm.tsx`**

Left column, in mockup order: `<BasicsPanel>`, `<GalleryUploader>` (edit mode only — pass `disabled` on create), `<ItineraryEditor>`, `<DeparturesEditor>`, then a panel holding the three `<ListEditor>`s and `<FaqEditor>`. Right column: `<StatusPanel>` (edit mode only), `<HotelsEditor>`, and a danger-zone panel with `<DeletePackage>` (edit mode only).

`<GalleryUploader>`, `<StatusPanel>`, `<DuplicatePackage>` and `<DeletePackage>` must sit **outside** the `<form>` element or be `type="button"` — they issue their own requests and must never submit the form. Prefer rendering them as siblings of the `<form>` inside the grid, which also keeps a nested-form mistake impossible.

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter web test status-panel`
Expected: PASS — 4 passed

- [ ] **Step 8: Commit**

```bash
git add web/src/components/admin/packages web/tests/status-panel.test.tsx
git commit -m "feat(F18): gallery uploader, status panel, duplicate and delete

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Docs, manual walk-through and the PR

**Files:**

- Modify: `docs/07-plan.md`
- Modify: `docs/06-data-and-api.md`

- [ ] **Step 1: Update `docs/07-plan.md`**

In the Milestone 1.3 table: fold F19 and F20 into the F18 row (title `**Packages CRUD** ✅ PR #NN`, Who 🟢, the web/ and api/ cells describing the whole A4 screen including the itinerary editor, departures grid and gallery, Est. `4 h`), and delete the separate `F19+F20` and `↳ F20` rows. Adjust the milestone total from ≈ 9 h to ≈ 9 h (the hours move between rows, they do not change). Add a line under the table: `F19 + F20 merged into F18 on 2026-09-22 — the nested write is one transaction (06 §C4), so splitting it would have meant building the endpoint twice.`

- [ ] **Step 2: Update `docs/06-data-and-api.md`**

In §C-REST row 286, change the image row to show both PATCH shapes explicitly:

`POST /admin/packages/:id/images` (multipart proxy upload) · `PATCH /admin/packages/:id/images` (whole gallery order + cover) · `PATCH /admin/packages/:id/images/:imageId` (alt text) · `DELETE /admin/packages/:id/images/:imageId`

- [ ] **Step 3: Run every gate**

```bash
TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@127.0.0.1:5499/tripsmith_test uv run --directory api pytest -q
uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright
rm -rf web/.next
pnpm --filter web test && pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web build
pnpm gen:api && git diff --exit-code -- api/openapi.json web/src/lib/api-types.ts
```

Expected: every command exits 0. The last one printing nothing means the committed contract is fresh.

- [ ] **Step 4: Manual owner walk-through** (lean: no Playwright journey)

Start both servers (`pnpm dev` at the repo root — check ports 3000 and 8000 are free first; they may be held by an unrelated Zapigo process) and sign in at `/admin/login`. Then, in order:

1. `/admin/packages` — tabs and search filter the table; a draft shows `—` for price.
2. `New package` — save a draft; confirm it lands on `/admin/packages/[id]` and the gallery is now live.
3. Upload two photos; reorder them by dragging; reorder again using only the keyboard; make the second one the cover; add alt text; delete one.
4. Add four itinerary days; drag day 3 above day 2; confirm the numbers renumber.
5. Add a departure with real prices; confirm the side panel's four rules all turn green and Publish enables.
6. Publish. Open the public package page in another tab — it should be there within seconds.
7. Change the double price and save; reload the public page (price updated) and download the itinerary PDF (price updated — this is F18's acceptance test).
8. Duplicate the package; confirm the copy is a draft named `… (copy)` with the same photos.
9. Try to delete a package that has an enquiry — the button is disabled with the count.
10. Check the whole form at 360 px width: panels stack, the departures table scrolls horizontally rather than overflowing the page.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/f18-packages-crud
gh pr create --title "feat(F18): packages CRUD — form, itinerary, departures, gallery" --body "$(cat <<'BODY'
Builds mockups A3 and A4: the owner runs the whole package catalogue from `/admin/packages`.

Absorbs F19 (itinerary + departures editors) and F20 (gallery upload) — 06 §C4 specifies the
nested write as one transaction, so splitting it would have meant building the endpoint twice.

**api** — `/admin/packages` CRUD plus `POST /{id}/status` (four publish rules enforced
server-side), `POST /{id}/duplicate` (deep copy as a draft), and four gallery routes. One
transactional nested write: itinerary full-replaced, departures diffed by id so v2 bookings keep
their foreign key, `starting_price_paise` recomputed from upcoming departures, then one
`revalidate` call. Delete is blocked while enquiries reference the package.

**web** — A3 list with live/draft tabs and search; A4 form as one `useForm` over the nested
shape, with dnd-kit (pointer + keyboard) reordering the itinerary and the gallery, a rupee/paise
adapter on the pricing grid, and a status panel rendering the api's rule evaluation rather than
re-deriving it.

Verified: full api suite, web vitest, lint, typecheck, build, contract fresh, plus the manual
owner walk-through — changed a price and saw it reach both the public page and the PDF.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 6: After the merge**

Set tracker rows `F18`, `F19` and `F20` to `done` in the Tripsmith tracker artifact (`rows/<id>` in the artifact db; the artifact is `claude.ai/code/artifact/2f80ceea…`, rebuild kit in the scratchpad `tracker/build.js`) — F19 and F20 are done by absorption, so note that in their row. Update the `tripsmith-status` memory: new main sha, F18 merged with F19+F20 absorbed, next = **F21 Enquiries inbox** (plan first), and add any gotcha this task turned up.

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| `GET/POST/PUT/DELETE /admin/packages[/:id]` (06 C-REST 285) | 3, 4, 6 |
| `POST /admin/packages/:id/status`, live-publish rules (06 C4) | 2, 5, 6 |
| `POST /admin/packages/:id/duplicate`, "(copy)" draft (06 C4) | 5, 6 |
| `deletePackage` blocked by enquiries (06 C4) | 5 |
| Nested write in one transaction incl. `days[]`, `departures[]`, `faq[]`, `hotels[]` (06 C4) | 4 |
| Recompute `starting_price_paise` (06 C4) | 2, 4 |
| Revalidate with tags; PDF cache invalidated by `updated_at` | 2, 4, 5 |
| Image ops: upload proxy, reorder, set cover, remove (06 C-REST 286, C3) | 7 |
| A3 list: search, draft/live filter, duplicate, edit (mockup) | 9 |
| A4 form: basics, themes, gallery, itinerary dnd, departures grid, inclusions/exclusions/FAQ, hotels, status rules, danger zone (mockup) | 10, 11, 12, 13 |
| `PackageForm` typed from `api-types.ts` (07-plan F18) | 8, 10 |
| Owner changes a price → public page and PDF reflect it (F18 done-when) | 14 step 4.7 |

**Placeholder scan** — Tasks 9 to 13 describe several components in prose rather than full source. That is deliberate and bounded: each names its exact file, props, accessible names, copy strings and the existing component it mirrors (`DestinationsTable`, `DestinationForm`, `CoverUploader`, `DeleteDestination`), and each is pinned by a test written out in full first. The api tasks, where the logic actually lives, carry complete source.

**Type consistency** — `AdminPackage.publishRules[].key` is the same four-value literal in the schema (Task 1), the service (Task 2), the 409 `fieldErrors` (Task 5) and the panel (Task 13). `DepartureInput.id` is `str | None` in the api and `string | null` in the zod mirror, with `blankDeparture().id === null` asserted in Task 8 and preserved through editing in Task 12. `toInput` returns the generated `PackageInput`, so a schema drift breaks `pnpm typecheck` rather than failing at runtime.
