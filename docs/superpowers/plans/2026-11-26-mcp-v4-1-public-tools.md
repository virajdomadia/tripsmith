# MCP v4.1 — Phase 0 + 4.1 (green CI, ten public tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `main` CI green again, then grow the anonymous `/mcp` server from 4 to 10 read-only tools that make Tripsmith genuinely useful in ChatGPT and Claude.

**Architecture:** Every new tool is a `ToolArgs` model + a `*_tool` function in `api/app/services/ai/tools.py` that calls an existing service (`get_package`, `list_destinations`, `public_reviews_for_slug`, `compare`, `quote_booking`); the MCP adapter only adds absolute URLs. A per-tool `surfaces` flag decides whether the Gemini chat, MCP, or both list it. All public tools are marked read-only to MCP clients.

**Tech Stack:** FastAPI, SQLAlchemy async, pydantic v2, the official `mcp` Python SDK (`MCPServer`, streamable HTTP), pytest + Postgres 17, Next.js (one small web change).

**Spec:** `docs/superpowers/specs/2026-11-26-mcp-v4-1-design.md` (phases 0 and 4.1 only; 4.2 and 4.3 get their own plans after this ships).

## Global Constraints

- Branch from `main`: `feat/mcp-v4-1-public-tools`. One PR. Do not merge or deploy; production migrations are not needed for this phase.
- `services/mcp` holds **no business logic**: pricing, availability, filtering and review rules stay in the services; a parity test per tool proves MCP output equals `run_tool` output (pattern: `tests/test_mcp_tools.py`).
- Every tool validates with a `ToolArgs` subclass (`extra="forbid"`, camelCase aliases) and returns `{"error": ...}` instead of raising (existing `run_tool` contract).
- **No contact details** in any tool input or output (no name, phone, email fields). `quotePrice` takes no email.
- Every public tool is listed to MCP clients with `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
- Chat (`TOOL_SPECS`) lists: the existing 4 + `getPackageDetails`, `quotePrice`, `getReviews` = 7. MCP lists exactly 10: `listDestinations`, `searchPackages`, `getPackageDetails`, `getReviews`, `comparePackages`, `checkAvailability`, `quotePrice`, `startBooking`, `startEnquiry`, `notifyMe`.
- Anonymous `/mcp` rate limit: **300 calls per hour per server-derived IP**, still fail-closed (was 60).
- Tests: `uv run --directory api pytest …` against Postgres, with `TEST_DATABASE_URL` set as in `.github/workflows/ci.yml` (`postgresql+asyncpg://tripsmith@localhost:5432/tripsmith_test`). `ENVIRONMENT`/`.env` must not leak in; run as CI does.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never touch the `commerce56` GitHub org.

## Review Focus

1. **Draft or unknown slug** passed to `getPackageDetails`, `getReviews`, `comparePackages`, `notifyMe` → `{"error": "No live package called '<slug>'. Use searchPackages."}`, never a crash or a draft's data.
2. **`comparePackages` with 1 slug, more than 3, or duplicates** → an error naming the 2–3 rule; partially unknown slugs listed under `missing`, the rest compared.
3. **`quotePrice` on a full / past / unbookable departure or an invalid coupon** → the service's own reason as `{"error": …}` (the 409 text), not a generic failure.
4. **`searchPackages(onOffer=true)` when no deal is running** → an empty list with a plain note, not an error.
5. **Oversized results**: a long itinerary must not flood the client's context — `getPackageDetails` output is capped (itinerary day text ≤ 400 chars each, ≤ 30 days, reviews summary only).

---

## Phase 0

### Task 1: Make the date-dependent api tests time-proof

**Files:**
- Modify: the fixtures/tests behind these 9 failures on main (CI run 45837876773): `tests/test_admin_packages.py::test_update_can_reuse_a_date_freed_by_a_dropped_departure`, `tests/test_catalog.py::test_badge_uses_the_next_upcoming_departure`, `tests/test_catalog_reads.py::test_departures_without_month_are_all_upcoming`, `tests/test_catalog_reads.py::test_get_package_returns_the_full_detail`, `tests/test_early_bird.py::test_the_quote_route_has_the_line_and_the_ladder`, `tests/test_guardrail.py::test_derived_prices_and_the_visitors_own_budget_pass`, `tests/test_home.py::test_home_hides_draft_packages_and_unlinks_their_testimonials`, `tests/test_home.py::test_home_returns_destinations_packages_testimonials_and_stats`, `tests/test_search.py::test_facets_describe_the_whole_live_catalog`
- Likely sources of fixed dates: `tests/fixture_content/packages/goa_quiet_escape.py`, `tests/fixture_content/packages/north_goa_beaches.py`, `tests/pdf_fixture.py`

**Interfaces:**
- Produces: fixture departure dates computed from `ist_today()` (e.g. `today + timedelta(days=N)`), so "upcoming" stays upcoming.

- [ ] **Step 1:** Run the 9 tests; confirm they fail with the dates shown in CI (e.g. `['2026-12-18'…] == ['2026-11-20'…]`).
- [ ] **Step 2:** Replace every hard-coded departure/deal/early-bird date in the fixtures and expectations with offsets from `ist_today()`; expectations derive from the same offsets. Keep each test's intent (ordering, "next upcoming", early-bird tier boundaries).
- [ ] **Step 3:** Add `tests/test_fixture_dates.py::test_fixture_departures_are_all_in_the_future` — loads fixture content and asserts every departure date `> ist_today()`.
- [ ] **Step 4:** Run the full api suite: `uv run --directory api pytest -q`. Expected: 0 failed.
- [ ] **Step 5:** Commit `test: fixture dates relative to today (main CI was red from 2026-11-20)`.

## Phase 4.1

### Task 2: `surfaces` flag on the shared tool registry

**Files:**
- Modify: `api/app/services/ai/tools.py` (`Tool`, `_tool`, `TOOLS`, `TOOL_SPECS`)
- Modify: `api/app/services/mcp/adapter.py` (`tool_list`)
- Test: `api/tests/test_tool_surfaces.py`

**Interfaces:**
- Produces: `Tool.surfaces: frozenset[Literal["chat", "mcp"]]`; `_tool(name, args, run, description, *, surfaces=frozenset({"chat","mcp"}))`; `TOOL_SPECS` = specs of tools with `"chat"`; `MCP_TOOL_NAMES: tuple[str, ...]` (the listing order) in `adapter.py`.

- [ ] **Step 1: Failing test** `test_chat_lists_only_chat_tools`: `{s.name for s in TOOL_SPECS} == {"searchPackages","checkAvailability","startBooking","createEnquiry"}` (grows to 7 in Task 6). `test_create_enquiry_is_chat_only`: `"mcp" not in TOOLS["createEnquiry"].surfaces`.
- [ ] **Step 2:** Run → FAIL (`surfaces` missing).
- [ ] **Step 3:** Implement the field and filter; `createEnquiry` gets `surfaces={"chat"}` (MCP's `startEnquiry` wraps it already).
- [ ] **Step 4:** Run the new test + `tests/test_chat.py tests/test_mcp_tools.py` → PASS.
- [ ] **Step 5:** Commit `feat(tools): per-surface tool registry`.

### Task 3: `listDestinations` and `getPackageDetails`

**Files:**
- Modify: `api/app/services/ai/tools.py`
- Test: `api/tests/test_tools_catalogue.py`

**Interfaces:**
- Consumes: `list_destinations(db, *, now) -> list[DestinationCard]`; `get_package(db, slug, *, today, now, with_related=False) -> PackageDetail | None`.
- Produces: `ListDestinationsArgs` (no fields); `GetPackageDetailsArgs(package_slug: str 1..120)`; `list_destinations_tool(ctx, args) -> dict`; `get_package_details_tool(ctx, args) -> dict`. Both registered with `surfaces={"mcp"}` for now (Task 6 adds chat to `getPackageDetails`).
- Output shapes (camelCase):
  - `listDestinations` → `{"destinations": [{"slug","name","fromPricePerPerson" (₹ string via inr()),"packageCount","bestMonths"?}]}` — include `bestMonths` only if `DestinationCard` has it.
  - `getPackageDetails` → `{"slug","name","destination","nights","pricePerPerson","deal"?,"itinerary":[{"day","title","text"}],"inclusions":[…],"exclusions":[…],"cancellationPolicy":[{"daysBefore","refundPercent"}],"leader"?:{"name","slug"},"rating"?:{"average","count"},"itineraryPdfUrl"(site path),"pageUrl"(site path)}`; itinerary text truncated to 400 chars, at most 30 days.

- [ ] **Step 1: Failing tests** (seeded DB via `scripts.seed.seed` + `fixture_content()` like `test_mcp_tools.py`): `test_list_destinations_matches_the_service` (names/slugs equal `list_destinations` order); `test_package_details_has_itinerary_inclusions_and_policy` (seeded Goa package: itinerary length = fixture days, cancellation tiers equal the fixture's); `test_package_details_refuses_a_draft_and_unknown_slug` (both → `{"error": "No live package called '<slug>'. Use searchPackages."}`); `test_package_details_caps_long_itinerary_text` (a 2,000-char day → ≤ 400 chars).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as thin mappers over the services; the error string above is the exact copy.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(tools): listDestinations, getPackageDetails`.

### Task 4: `getReviews` and `comparePackages`

**Files:**
- Modify: `api/app/services/ai/tools.py`
- Test: `api/tests/test_tools_reviews_compare.py`

**Interfaces:**
- Consumes: `public_reviews_for_slug(db, slug, *, page) -> PublicReviewPage | None`; `compare(db, raw: str | None) -> CompareResult` (raw = comma-joined slugs).
- Produces: `GetReviewsArgs(package_slug, page: int = 1, ge=1 le=50)`; `ComparePackagesArgs(package_slugs: list[str], min 2, max 3, unique)`; `get_reviews_tool`, `compare_packages_tool`.
- Output: `getReviews` → `{"rating","reviews":[{"stars","title"?,"customerWrote","travelledIn"}],"page","pages"}` — review text goes under `customerWrote` (spec: customer text clearly labelled); no reviewer surname beyond what the public page shows. `comparePackages` → the `CompareResult` trips mapped to `{slug,name,nights,pricePerPerson,inclusions,…}` plus `missing`.

- [ ] **Step 1: Failing tests:** `test_reviews_are_labelled_customer_text`; `test_reviews_for_a_package_with_none` → `{"reviews": [], "rating": None, …}`; `test_compare_two_live_packages`; `test_compare_rejects_one_and_four_slugs_and_duplicates` (validation error text mentions "2 to 3"); `test_compare_lists_unknown_slugs_as_missing`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; `surfaces`: `getReviews` {"mcp"} for now, `comparePackages` {"mcp"}.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(tools): getReviews, comparePackages`.

### Task 5: `quotePrice` and `searchPackages(onOffer)`

**Files:**
- Modify: `api/app/services/ai/tools.py`, `api/app/services/ai/handoff.py` (extract the party→`QuoteRequest` builder if it is private), `api/app/schemas/catalog.py` (`SearchParams.on_offer: bool = False`), `api/app/services/catalog/search.py` (`apply_filters`)
- Test: `api/tests/test_tools_quote.py`, `api/tests/test_search.py` (add cases)

**Interfaces:**
- Consumes: `quote_booking(db, req: QuoteRequest, *, now) -> Quote` (no side effects; raises `ApiError` 404/409 with reason).
- Produces: `quote_request_for(departure_id: str, adults: int, children: int, coupon_code: str | None) -> QuoteRequest` in `handoff.py` (shared with `start_booking`); `QuotePriceArgs(departure_id, adults 1..MAX, children 0.., coupon_code: str | None ≤40)`; `quote_price_tool`. Output: `{"total","perPerson","deposit"?{"amount","balanceDueBy"},"lines":[{"label","amount"}],"coupon"?{"code","off"}}` in ₹ strings.
- `SearchPackagesArgs.on_offer: bool | None` → `SearchParams.on_offer`; `apply_filters` keeps packages with a deal running now (same rule as `deals.shown_price`). Site search also accepts `onOffer` (harmless; same filter).

- [ ] **Step 1: Failing tests:** `test_quote_matches_the_quote_route` (same departure/party → same total as `POST /bookings/quote`); `test_quote_full_departure_returns_the_service_reason`; `test_quote_bad_coupon_returns_its_reason`; `test_quote_has_no_side_effects` (row counts of bookings/holds unchanged); `test_search_on_offer_only_returns_running_deals`; `test_search_on_offer_with_no_deals_is_empty_not_an_error`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; map `ApiError` to `{"error": exc.message}`. `quotePrice` surfaces {"mcp"} for now.
- [ ] **Step 4:** Run → PASS, plus `tests/test_concierge_handoff.py tests/test_early_bird.py` (handoff refactor).
- [ ] **Step 5:** Commit `feat(tools): quotePrice, searchPackages onOffer`.

### Task 6: `notifyMe`, agency info on `startEnquiry`, MCP listing of all 10, read-only hints, chat surfaces

**Files:**
- Modify: `api/app/services/mcp/adapter.py` (`MCP_TOOL_NAMES`, `tool_list`, `call`), `api/app/services/mcp/server.py` (`list_tools` passes annotations), `api/app/services/ai/tools.py` (surfaces of `getPackageDetails`, `quotePrice`, `getReviews` → {"chat","mcp"}; `NotifyMeArgs`, `notify_me_tool`)
- Modify: `web/src/app/(site)/packages/[slug]/page.tsx` — wrap the `NotifyMe` block in `<div id="notify">` so a link can land on it
- Test: `api/tests/test_mcp_tools.py` (update `NAMES` to the 10 and add cases), `api/tests/test_tool_surfaces.py`

**Interfaces:**
- Produces: `McpTool.annotations: ToolAnnotations` (SDK type; `readOnlyHint=True, destructiveHint=False, openWorldHint=False` for all ten); `NotifyMeArgs(package_slug, departure_id: str | None)`; `notify_me_tool` → if `departure_id` is given and that departure has 0 seats: `{"kind":"waitlist","url": <startBooking-style booking sheet path for that date>}`; if the package has no upcoming departure: `{"kind":"newDates","url": "/packages/<slug>#notify"}`; otherwise `{"error": "That trip still has seats — use startBooking."}`. The adapter makes `url` absolute and adds `next` copy: "Give the customer this link; they leave their email on Tripsmith's site. Nothing is sent by this tool."
- `startEnquiry` result gains `contact: {"phone","email","hours"}` from `build_meta()` (the agency's public contact, not a customer's).

- [ ] **Step 1: Failing tests:** `test_exactly_the_ten_tools_are_listed` (names == the 10, in `MCP_TOOL_NAMES` order); `test_every_tool_is_marked_read_only` (each listed tool's `annotations.readOnlyHint is True`); parity tests for each new tool (`adapter.call` result == `run_tool` result except absolute URLs) — one per tool; `test_notify_me_full_departure_gives_waitlist_link`; `test_notify_me_no_dates_gives_new_dates_link`; `test_notify_me_with_seats_points_to_start_booking`; `test_start_enquiry_includes_agency_contact`; `test_chat_lists_seven_tools` (update Task 2 test to the 7 names in Global Constraints).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Confirm by hand in `pnpm --dir web dev` that a full departure's booking-sheet link shows the waitlist join and `/packages/<slug>#notify` scrolls to the form.
- [ ] **Step 4:** Run `uv run --directory api pytest tests/test_mcp_tools.py tests/test_mcp_server.py tests/test_tool_surfaces.py tests/test_chat.py -q` → PASS; `pnpm --dir web lint && pnpm --dir web typecheck` (or the repo's equivalents in `web/package.json`) → clean.
- [ ] **Step 5:** Commit `feat(mcp): ten public tools, read-only hints, notifyMe`.

### Task 7: Rate limit, smoke job, docs

**Files:**
- Modify: `api/app/services/mcp/server.py` (limiter: 300/h per IP, fail-closed unchanged), `api/scripts/mcp_smoke.py` (expects the 10 names; calls `getPackageDetails` and `quotePrice` on a seeded package), `README.md` (MCP section: 10 tools table, ChatGPT + Claude connect steps), the web `/developers` page (same tool list), `docs/03-requirements-v4.md` (R36: 300/h; R34: ten tools; boundary 1)
- Test: `api/tests/test_mcp_limits.py`

- [ ] **Step 1: Failing tests:** in `test_mcp_limits.py` change the boundary: the 300th call passes, the 301st is refused with the existing `too_many` copy; Redis down still refuses.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Change the constant. **Step 4:** Run → PASS; run the smoke script locally as CI does (`.github/workflows/ci.yml` lines 84–90) → lists 10 tools, both new calls answer.
- [ ] **Step 5:** README connect steps — Claude: Settings → Connectors → Add custom connector → `https://tripsmith-api.virajdomadia.com/mcp`. ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode → Create → same URL, authentication "No authentication". Mark both "verify by hand after deploy".
- [ ] **Step 6:** Full suite `uv run --directory api pytest -q` → 0 failed. Commit `feat(mcp): 300/h limit, smoke and docs for ten tools`. Push the branch and open the PR (body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

## After merge (Viraj, by hand)

1. Connect Claude and ChatGPT to `/mcp`; ask "plan 3 days in Goa for 2 in January, what's included and the exact price" — expect `searchPackages` → `getPackageDetails` → `quotePrice` → `startBooking`.
2. Record the Claude Desktop GIF for the README.
