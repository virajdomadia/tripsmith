# Tripsmith — Development Plan

**Lifecycle step:** 7 of 17 · **Written:** 2026-09-12 · **Revised:** 2026-09-13 — backend switched from Hono to FastAPI

> **Revision 2026-09-13: backend switched from Hono to FastAPI.** `api/` is now FastAPI (Python 3.12, uv, SQLAlchemy + Alembic, pydantic, pytest); `shared/` is gone and the contract is `api/openapi.json` → generated `web/src/lib/api-types.ts`. Milestone 1.0 restarts at **1.0.2**: what PR #1 (`feat/1.0.2-workspace`, merged as 270f27e) and PR #3 (`fix/pr1-review-followups`, merged as 1ccf5da) built for the Hono api and `shared/` is replaced; their web-side pieces are kept (see 1.0.2). Task rows below are rewritten where the stack matters; estimates, milestone structure and "done when" criteria are otherwise unchanged.

**Inputs:** steps 3–6 for v1 ([03-requirements.md](03-requirements.md)), v2 ([03-requirements-v2.md](03-requirements-v2.md)) and v3 ([03-requirements-v3.md](03-requirements-v3.md)). **Budget:** v1 ≈ 34 h · v2 ≈ 15 h · v3 ≈ 15 h · v4 ≈ 6 h · add-ons only if hours remain.
**Cadence:** evenings/weekends. Each minor milestone ends **deployed to production** — no long-lived unlaunched branches.

How the lifecycle maps onto milestones: step 8 (setup) is milestone 1.0's first task; steps 13 (CI/CD), 15 (production) and 16 (monitoring) are set up **inside 1.0** and then every later milestone cycles through 9 → 10 → 11 → 14 → 15. Steps 12 and 17 close in 1.4. When a milestone starts, its tasks below are expanded into a detailed execution plan (file-level, TDD) before coding.

---

## v1 — Agency website (≈ 34 h)

### Milestone 1.0 — Catalog live, read-only (≈ 10 h)
Goal: the package model is real, seeded with genuine content, and public pages are live at the production URL with CI.

| # | Task | Est. | Done when |
|---|---|---|---|
| 1.0.1 | Accounts & keys: **two** Vercel projects (`tripsmith` → web/, `tripsmith-api` → api/), Neon project (+ dev branch), Vercel Blob store, Sentry projects, GitHub repo settings, DNS for `tripsmith.` and `api.tripsmith.` | 0.5 h | `.env.example` in web/ and api/; all secrets in Vercel/GitHub |
| 1.0.2 | **Workspace, two toolchains** (restart, 2026-09-13): pnpm for `web/` only (`pnpm-workspace.yaml` drops `shared/`), **uv** for `api/` (`pyproject.toml` + `uv.lock`, Python 3.12). Remove `shared/` and the Hono skeleton (`api/src`, `api/package.json`, `vitest.config.ts`). **api**: FastAPI skeleton — `app/main.py` (`app`, lifespan, error handlers → envelope), `config.py` (pydantic-settings), `errors.py`, routers `GET /health`, `GET /meta`, built-in `/docs` + `/openapi.json`; `app/openapi.py` dumps `api/openapi.json`; `api/vercel.json` (`maxDuration 30`, `bom1`); ruff + pyright config; first pytest (health, meta, validation envelope). **web**: keep the Next.js app, shadcn/ui, eslint/prettier, Playwright, `/api/*` rewrite; api client now typed from **generated** `src/lib/api-types.ts` (`openapi-typescript`, script `gen:api`); delete `web/src/app/api-health`. **Root** `package.json` scripts: `lint` / `typecheck` / `test` fan out to web + `uv run …`, `dev` runs both with `concurrently`, `gen:api`. The PR #3 follow-ups (`fix/pr1-review-followups`) are folded in and carried forward: web `next.config` trailing-slash strip, web api client trusting only the shared error envelope, blank-query-param handling (now in pydantic), `.gitattributes` LF, `.prettierignore`, CI | 2.5 h | `pnpm lint typecheck test` green for both languages; `GET /api/health` and `/api/meta` work through the rewrite locally; `/api/docs` opens; `openapi.json` and `api-types.ts` committed and in sync |
| 1.0.3 | SQLAlchemy models (all v1 tables + ⏩ columns, `users`/`sessions`/`verification`) + Alembic `0001_v1` (enums, tables, indexes, `departure_availability` view as raw SQL) + pytest DB harness (`TEST_DATABASE_URL`, fresh database per session, `alembic upgrade head`, truncate between tests) | 1 h | migration applies on a fresh Neon branch and in the pytest harness; `uv run alembic downgrade base` clean |
| 1.0.4 | `define_package` / `define_destination` pydantic content models (`api/content/_schema.py`) + `api/scripts/seed.py` (import every content module, upsert by slug, Blob REST uploader in `infra/storage.py` with a `--local` fallback that writes file URLs), owner user seeded from `OWNER_*` | 1 h | `uv run python scripts/seed.py` idempotent; seed test on a two-package fixture |
| 1.0.5 | **Genuine content**: 6 destinations, 12 packages (full itineraries, real hotels, 2026 prices, 3–4 departures each), 6 testimonials, seed photos | 2 h | every package passes `setPackageStatus(live)` rules |
| 1.0.6 | api `services/catalog` (`search_packages`, `get_package`, `list_destinations`, `get_destination`, `get_home_data`, `get_departures_for_month`, pricing/badge helpers) + `routers/public/catalog.py` for `GET /packages`, `/packages/:slug`, `/destinations…`, `/home`; pydantic response models (`PackageCard`, `PackageDetail`, …); regenerate `openapi.json` + `api-types.ts`; pytest filter matrix + route tests | 1.5 h | filter matrix tests green; `/docs` lists the endpoints; contract files regenerated without diff |
| 1.0.7 | web pages: `/packages` (listing + FilterBar, URL-driven, tagged fetch) and `/packages/[slug]` (gallery + lightbox, itinerary, inclusions, hotels, departures table, occupancy pricing, FAQ, related) — no CTAs yet; `/revalidate` hook | 1.5 h | static generation works; Lighthouse ≥ 90 on both |
| 1.0.8 | CI: `ci.yml` with jobs `web` (pnpm) and `api` (uv, ruff, pyright, pytest with a `postgres:17` service) plus the `contract` check (`openapi.json` / `api-types.ts` regenerate without diff); `sentry-sdk[fastapi]` in api and `@sentry/nextjs` in web; first production deploys (web + api on the FastAPI preset), UptimeRobot on `/` and `/api/health` | 0.5 h | green run on `main`; both live at their subdomains |
| | Design note | | Before 1.0.7, pick the visual direction from a 3-variant mockup page (home + package page), per the usual variant workflow; the chosen variant sets tokens for everything after |

### Milestone 1.1 — It looks like an agency (≈ 6 h)
| # | Task | Est. |
|---|---|---|
| 1.1.1 | Home: hero + search box → `/packages`, featured destinations, popular packages, why-us, testimonials, footer | 2 h |
| 1.1.2 | `/destinations` grid and `/destinations/[slug]` (intro, best months, packages) | 1 h |
| 1.1.3 | About, Contact (map embed, phone, WhatsApp, hours; form wired in 1.2), Terms, Privacy, Cancellation policy — real copy | 1 h |
| 1.1.4 | SEO: `generateMetadata` everywhere, JSON-LD components, sitemap, robots, OG images for packages/destinations, breadcrumbs | 1.5 h |
| 1.1.5 | Share buttons (WhatsApp / copy / native) on package page; WhatsApp floating button with package pre-fill | 0.5 h |
| Done | Lighthouse 90/100/100/100 on `/`, `/packages`, one package; OG card renders in WhatsApp | |

### Milestone 1.2 — The funnel closes (≈ 6 h)
| # | Task | Est. |
|---|---|---|
| 1.2.1 | `services/pdf`: `render_itinerary` with **fpdf2** (DM Sans TTF in `api/assets/fonts`, `Document` base for page chrome), Blob cache keyed by `updated_at`, route `itinerary.pdf`, GC cron; pytest asserts a valid PDF under 2 MB | 2 h |
| 1.2.2 | `services/email`: Resend Python SDK, Jinja2 HTML templates (owner notification, customer confirmation with PDF), `email_status` handling | 1 h |
| 1.2.3 | api `POST /enquiries` (pydantic `EnquiryCreate`, honeypot, Upstash rate limit via `infra/ratelimit.py`, dedupe); web EnquiryForm with standard/customise toggle using the zod mirror (`enquiry-schema.ts`, with the mirror test), no-JS proxy route, thanks page; Contact page form | 2 h |
| 1.2.4 | Sticky mobile CTA bar on package page (price · Enquire · PDF · WhatsApp) | 0.5 h |
| 1.2.5 | Tests: enquiry validation unit tests; Playwright visitor journey (home → filter → package → enquire → thanks); `e2e.yml` against the preview with a Neon branch | 0.5 h |
| Done | A stranger can enquire from a phone and both emails arrive with the PDF attached | |

### Milestone 1.3 — Owner side (≈ 8 h)
| # | Task | Est. |
|---|---|---|
| 1.3.1 | Own auth in api: `users`/`sessions` service, argon2 (`argon2-cffi`), `POST /auth/login` (rate-limited) · `POST /auth/logout` · `GET /auth/session`, HttpOnly SameSite=Lax cookie, `require_owner` dependency, owner seeded; web login form posting to `/api/auth/login`, `middleware.ts` gate via `GET /api/auth/session`, `/admin/login`, demo credentials on landing page | 1.5 h |
| 1.3.2 | Admin shell (nav, new-enquiry badge) + Dashboard (api `GET /admin/dashboard`, `POST /views` beacon) | 1.5 h |
| 1.3.3 | Destinations CRUD | 0.5 h |
| 1.3.4 | Packages CRUD: api `/admin/packages*` + image endpoints (multipart **proxy upload** `POST /admin/packages/:id/images` — 5 MB cap, type check, Pillow dimensions + resize ≤ 2000 px, Blob REST PUT) with publish rules, duplicate, delete guards, revalidate hook; web PackageForm (react-hook-form typed from `api-types.ts`, inline `fieldErrors` from the envelope), ItineraryEditor (dnd reorder), GalleryUploader (multipart POST, reorder, cover), departures/FAQ/hotels editors | 3 h |
| 1.3.5 | Enquiries: api list/detail/status/notes/CSV endpoints; web inbox table with filters/search, detail, mailto/WhatsApp links | 1.5 h |
| Done | Owner journey e2e: login → change a price → public page and PDF reflect it | |

### Milestone 1.4 — Hardening & review (≈ 4 h) — closes lifecycle steps 10–12, 17 for v1
| # | Task | Est. |
|---|---|---|
| 1.4.1 | Test gaps: pricing/badge edge cases, CSV formatting, PDF snapshot size, 404 for drafts, rate-limit behaviour | 1 h |
| 1.4.2 | Security pass (`docs/12-security-performance.md`): auth on every admin action, input validation audit, headers (CSP where feasible, HSTS), secrets audit, dependency audit | 1 h |
| 1.4.3 | Performance pass: Lighthouse CI budget in `lighthouse.yml`, image sizes, font loading, bundle check | 1 h |
| 1.4.4 | Accessibility pass at 360/768/1280: keyboard, focus, contrast, alt text | 0.5 h |
| 1.4.5 | README (architecture diagram, how it works), `docs/17-post-launch.md` (what worked, metrics, next), portfolio case-study entry | 0.5 h |
| Stretch | Best-time strip (add-on B, ~2 h) if under budget; storyboard (E) only if 1.0–1.4 came in ≥ 4 h under | |

**v1 total: ≈ 34 h** (10 + 6 + 6 + 8 + 4) — +1 h for the two-package setup, +1 h for the two-toolchain setup (2026-09-13).

---

## v2 — Booking engine (≈ 15 h) — requirements: [03-requirements-v2.md](03-requirements-v2.md)
Starts with a step-3 re-validation (30 min): re-read R14–R25 against what v1 actually shipped, adjust, then go.

### Milestone 2.0 — Checkout (≈ 6 h)
| # | Task | Est. | Done when |
|---|---|---|---|
| 2.0.1 | Razorpay test account, keys, webhook endpoint registered (preview + prod), `infra/razorpay.py` (official `razorpay` Python SDK: orders; `hmac` signature verify) | 0.5 h | order created from a script |
| 2.0.2 | Alembic `0002_v2`: bookings, travellers, payments, cancellations, reviews, enquiry_messages, enums; **replace** `departure_availability` view; SQLAlchemy models + pydantic schemas | 1 h | view returns correct `seats_left` with pending/confirmed/expired fixtures |
| 2.0.3 | `services/booking`: `quote_booking` (occupancy rules, child rate, single supplement, deal), state guards, `create_booking_order` (locked transaction, hold 10 min), `confirm_payment` (HMAC verify, guarded transition) + pytest incl. last-seat concurrency | 2 h | tests green incl. concurrency |
| 2.0.4 | Book-now UI: departure picker (seatsLeft, badges), travellers builder, live breakdown, contact step, Checkout.js integration, success screen | 2 h | flow works with a Razorpay test card at 360 px |
| 2.0.5 | Deploy; CI green | 0.5 h | production accepts a test-mode booking |

### Milestone 2.1 — Webhooks & confirmation (≈ 3 h)
| # | Task | Est. |
|---|---|---|
| 2.1.1 | `POST /api/webhooks/razorpay`: raw body, signature verify, `payment.captured` / `payment.failed`, idempotent upsert, always 200 after recording | 1 h |
| 2.1.2 | `render_voucher` (fpdf2, reuses the `Document` base), private Blob storage, authenticated voucher route | 1 h |
| 2.1.3 | Confirmation email (customer, voucher attached) + owner new-booking email; e2e: order → signed test webhook → confirmed → voucher | 1 h |

### Milestone 2.2 — Accounts & admin (≈ 4 h)
| # | Task | Est. |
|---|---|---|
| 2.2.1 | Own email OTP (`POST /auth/otp/request` / `verify` over the `verification` table, Resend), OTP rate limit, `require_user`, `/account` shell, attach booking by email at checkout | 1 h |
| 2.2.2 | `/account/bookings` list + detail (voucher, request cancellation) | 0.5 h |
| 2.2.3 | Admin bookings desk: list/filters/search, detail with payment timeline, mark-paid-offline, CSV, departure manifest | 1.5 h |
| 2.2.4 | Cancellation resolution (approve/reject + refund note + email); reply-from-inbox (Resend + thread) | 1 h |

### Milestone 2.3 — Deals & reviews (≈ 2 h) — closes lifecycle 10–12, 17 for v2
| # | Task | Est. |
|---|---|---|
| 2.3.1 | Deal fields in package form + validation; strikethrough display on cards/page; quote applies deal; home deals strip; JSON-LD `Offer.price` | 1 h |
| 2.3.2 | Reviews: submission for completed bookings, moderation, aggregate on package + `AggregateRating`; `completed` transition (lazy on read) | 0.5 h |
| 2.3.3 | Security/perf pass for v2 (webhook, ownership checks, checkout Lighthouse), `docs/17-post-launch.md` v2 section, case study update | 0.5 h |
| Stretch | Split payment (D, 8 h) → trip hub (C, 6 h) → departure-city pricing (3 h), in that order | |

**v2 total: ≈ 15 h** (6 + 3 + 4 + 2).

## v3 — AI concierge (≈ 15 h) — requirements: [03-requirements-v3.md](03-requirements-v3.md)
Starts with a step-3 re-validation (30 min): confirm the provider/free-tier situation and R26–R33 against v1+v2 as shipped.

### Milestone 3.0 — Chat with search (≈ 6 h)
| # | Task | Est. | Done when |
|---|---|---|---|
| 3.0.1 | Gemini API key (free tier), **pydantic-ai** with the Gemini and Anthropic providers, `services/ai/provider.py` building the `Agent` from `AI_PROVIDER`/`AI_MODEL` | 0.5 h | a script streams a reply from both providers |
| 3.0.2 | Alembic `0003_v3`: conversations, messages, departure_alerts, ai_generations; enforce `enquiries.conversation_id` FK | 0.5 h | |
| 3.0.3 | `POST /chat` (SSE via `sse-starlette`): quotas (per-IP, per-conversation, global), session cookie, persistence, `agent.run_stream` with `searchPackages` + `checkAvailability` tools (`services/ai/tools.py`), named SSE events, system prompt v1 | 2 h | tool calls hit the v1 functions; quotas tested |
| 3.0.4 | Concierge UI: launcher, panel (mobile full-height), in-house `useConcierge` hook (fetch stream over SSE, event reducer), streaming text, package cards + departure lists from tool-result events, example prompts, privacy note, lazy-loaded | 2.5 h | "3 days in Goa under ₹15k" shows correct cards at 360 px |
| 3.0.5 | Deploy; CI green | 0.5 h | live on production |

### Milestone 3.1 — Booking & handoff (≈ 3 h)
| # | Task | Est. |
|---|---|---|
| 3.1.1 | `startBooking` tool → prefilled `/packages/[slug]/book?…`; Book buttons on departure lists; conversation outcome `booking_started` | 1 h |
| 3.1.2 | `createEnquiry` tool → enquiry form pre-filled in the panel; transcript attached; type `chat-handoff`; outcome `enquiry_created`; "Talk to a person" button; admin enquiry detail renders the transcript | 1 h |
| 3.1.3 | Post-turn guardrail (slug/price ⊆ tool results, else replace + forced search); Hinglish instruction; prompt-injection test cases | 1 h |

### Milestone 3.2 — Evals & admin (≈ 4 h)
| # | Task | Est. |
|---|---|---|
| 3.2.1 | `api/evals/` harness (pytest `-m evals`, real provider, excluded from CI's default run), 20 scripted conversations with assertions (tools+args, no hallucination, off-catalog refusal, handoff, language, injection); nightly GitHub Actions workflow + manual dispatch | 2 h |
| 3.2.2 | Admin conversation log (list, filters, transcript with tool calls); dashboard tiles (conversations, % booking started, % handoff, quota hits); token usage recorded | 1.5 h |
| 3.2.3 | Notify-me: subscribe action (chat + package page), unsubscribe route, daily cron, emails | 0.5 h |

### Milestone 3.3 — Polish & review (≈ 2 h) — closes lifecycle 10–12, 17 for v3
| # | Task | Est. |
|---|---|---|
| 3.3.1 | Quota-exhausted UX, reduced-motion, error states, bundle check | 0.5 h |
| 3.3.2 | Security pass on chat inputs/tools (pydantic on every tool, caps, PII audit) → `docs/12-security-performance.md` v3 section | 0.5 h |
| 3.3.3 | Post-launch review (`docs/17-post-launch.md`), README "how the agent works" with diagram, portfolio case study update | 1 h |
| Stretch | Owner-side AI drafting (A, 4 h) → trip-hub packing list (2 h) | |

**v3 total: ≈ 15 h** (6 + 3 + 4 + 2).

## v4 — "Tripsmith anywhere": MCP server (≈ 6 h) — requirements: [03-requirements-v4.md](03-requirements-v4.md)
Starts after 3.3 with a step-3 re-validation (20 min): confirm the MCP SDK/spec version and client landscape.

### Milestone 4.0 — MCP server (≈ 6 h) — the final portfolio version
| # | Task | Est. | Done when |
|---|---|---|---|
| 4.0.1 | Alembic `0004_v4` (`mcp_requests`); confirm the v3 tools in `services/ai/tools.py` are plain typed functions registrable by both the chat agent and MCP | 1 h | chat unchanged; unit tests still green |
| 4.0.2 | `services/mcp` with the official **`mcp` Python SDK** (`FastMCP`, Streamable HTTP, stateless) mounted at `/mcp` by `routers/mcp.py`: register 4 tools, rate limits, request logging, error mapping; MCP Inspector smoke test script | 1.5 h | Inspector lists and calls all tools against local |
| 4.0.3 | Resources (`packages`, `packages/{slug}`, `destinations/{slug}`) via `services/catalog/markdown.py`; `plan-a-trip` prompt | 1 h | a client reads a package and quotes its price |
| 4.0.4 | Dashboard tile "trips planned via MCP" + top tools; evals MCP driver running the 20 conversations against preview; Inspector smoke test in CI | 1 h | evals pass via MCP |
| 4.0.5 | `/developers` page with install configs; README section + 30 s GIF from Claude Desktop; post-launch review; case study final | 1.5 h | a stranger installs it in < 1 min |
| Stretch | R38 authenticated tools via MCP OAuth (own OAuth 2.1 server over `users`/`sessions`) — `myBookings`, `getVoucher` | 3 h | |

**v4 total: ≈ 6 h.**

## Whole-product summary
| Version | Milestones | Hours | Cumulative |
|---|---|---|---|
| v1 | 1.0 – 1.4 | 34 | 34 |
| v2 | 2.0 – 2.3 | 15 | 49 |
| v3 | 3.0 – 3.3 | 15 | 64 |
| v4 | 4.0 | 6 | 70 |
| Add-ons (in priority order) | B best-time (2) · A AI drafting (4) · MCP OAuth tools (3) · D split pay (8) · C trip hub (6) · E storyboard (6) · departure-city (3) | up to 32 | up to 102 |

The PRD budget is ~60 h for v1–v3 plus ~6 h for v4 (70 h with the two-package and two-toolchain setup). Add-ons are taken only from time saved.

---

## Sequencing rules
1. Never start a milestone with a red CI on `main`.
2. Each task = its own branch + PR into a protected `main`; Viraj reviews and merges; never push to `main` directly. A merge deploys **both** web and api (Vercel ignores a project whose files didn't change).
3. Content (1.0.5) is written before the pages that show it — the pages are designed around real data.
4. The visual direction is chosen (variant page) before 1.0.7; no page is styled twice.
5. Add-ons are only picked up when the enclosing version is fully done, including its docs.

## Dependencies to unblock before 1.0
- Domain DNS: `tripsmith` and `api.tripsmith` CNAMEs → Vercel (two projects).
- Accounts: Vercel, Neon, Upstash, Resend (verify sending domain `virajdomadia.com`), Sentry, UptimeRobot, GitHub Actions secrets.
- Photos: decide source (own / CC-licensed / generated) for 6 destination covers + ~50 package images — must be licence-clean for a public site.

## Tracking
Progress is tracked in the repo README's status line and a checklist in each milestone PR description. Estimates are re-baselined after 1.0 — if 1.0 runs > 10 h, the v1 stretch items are dropped first.
