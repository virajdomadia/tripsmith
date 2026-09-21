# Tripsmith — Development Plan

**Lifecycle step:** 7 of 17 · **Written:** 2026-09-12 · **Revised:** 2026-09-13 — backend switched from Hono to FastAPI; v1 re-cut to milestone structure C (skeleton first, journey milestones) · **2026-09-15 — lean re-cut: setup trimmed, feature rows merged (see note)**

> **Revision 2026-09-13: backend switched from Hono to FastAPI.** `api/` is now FastAPI (Python 3.12, uv, SQLAlchemy + Alembic, pydantic, pytest); `shared/` is gone and the contract is `api/openapi.json` → generated `web/src/lib/api-types.ts`. What PR #1 (`feat/1.0.2-workspace`, merged as 270f27e — old numbering) and PR #3 (`fix/pr1-review-followups`, merged as 1ccf5da) built for the Hono api and `shared/` is removed in **S1**; their web-side pieces are kept. The v1 rows below were then re-cut into structure C the same evening (see the next note).

**Inputs:** steps 3–6 for v1 ([03-requirements.md](03-requirements.md)), v2 ([03-requirements-v2.md](03-requirements-v2.md)) and v3 ([03-requirements-v3.md](03-requirements-v3.md)). **Budget:** v1 ≈ 35 h · v2 ≈ 15 h · v3 ≈ 15 h · v4 ≈ 6 h · add-ons only if hours remain.
**Cadence:** evenings/weekends. Each minor milestone ends **deployed to production** — no long-lived unlaunched branches.

How the lifecycle maps onto milestones: step 8 (setup) **is** milestone 1.0 (the walking skeleton); steps 13 (CI/CD), 15 (production) and 16 (monitoring) are set up **inside 1.0** and then every later milestone cycles through 9 → 10 → 11 → 14 → 15. Steps 12 and 17 close in 1.4. When a milestone starts, its tasks below are expanded into a detailed execution plan (file-level, TDD) before coding.

---

## v1 — Agency website (≈ 35 h)

> **Revision 2026-09-13 (evening): milestone structure C.** The previous 1.0 ("Catalog live, read-only", 10 h before anything was deployed) is replaced by a **walking skeleton first**: 1.0 puts both deployments, CI and monitoring live with nothing but `/health`; every later part deploys on merge. Content grows **2 → 6 → 12** packages alongside the pages instead of all up front. Milestones follow the visitor's and owner's journeys: **Skeleton → Browse → Enquire → Manage → Harden**. Every row below is one branch + one PR. **Row ids:** S = setup (milestone 1.0), F = feature (1.1–1.3), H = hardening (1.4); branches are named after them (e.g. `chore/s1-clean-slate`, `feat/f2-package-page`).

> **Revision 2026-09-15: lean re-cut — "overdo the feature, not the setup."** 1.0 took 11 PRs across three sessions and the live site was still a bare page, so the rule from here on: setup is the minimum needed to deploy with plain CI; every PR ships something visible in the browser; tests only where a bug would embarrass in a demo (pricing, availability, search, auth); no a/b splits or follow-up PRs (fix review findings on the same branch); no e2e / Lighthouse workflows; tracker updated per milestone, not per PR. **S9 is dropped** (both deploys are already live); S8 had already landed as PR #17 before this re-cut, so Sentry + Vercel Analytics are done and cost nothing further. Rows joined with `+` below are **one branch + one PR**. New v1 target: **≈ 24 h / ≈ 20 PRs** (was 35 h / 40 rows) — the saved hours go to the UI, content and photos.

Column key — **Who:** 🟢 customer-facing · 🔴 admin (owner) · ⚪ platform/both. **web/** = Next.js frontend work · **api/** = FastAPI backend work (— = none). Endpoint names are from [06-data-and-api.md](06-data-and-api.md) §C-REST; layout from [05-architecture.md](05-architecture.md) §2.

### Milestone 1.0 — Skeleton live (≈ 7.5 h) — lifecycle step 8, plus 13 / 15 / 16 set up here
Goal: `tripsmith.vercel.app` and `tripsmith-api.vercel.app` are live (custom domain `tripsmith.virajdomadia.com` deferred until the domain is bought), CI is green, the database is migrated and seeded with two packages, the visual direction is chosen. No product feature yet.

| # | Part | Who | web/ | api/ | Est. | Done when |
|---|---|---|---|---|---|---|
| S1 | **Clean slate** ✅ PR #5 | ⚪ | Delete `shared/` and `web/src/app/api-health`; drop the `@tripsmith/shared` dep and `transpilePackages`, inline the error-envelope schema in `src/lib/api.ts` (S5 regenerates the client); keep the Next.js app, shadcn/ui, eslint/prettier, Playwright, the `/api/*` rewrite and the PR #3 follow-ups (trailing-slash strip, error-envelope-only client, `.gitattributes` LF, `.prettierignore`) | Delete the Hono skeleton: `api/src`, `api/tests`, `api/package.json`, `tsconfig.json`, `vitest.config.ts`, the Hono-era `.env.example`; `pnpm-workspace.yaml` = `web/` only, lockfile regenerated | 0.5 h | `pnpm-workspace.yaml` lists `web/` only; no TypeScript left under `api/`; `pnpm lint typecheck test` green for web |
| S2 | **Accounts & keys** ✅ PR #7 + #8 | ⚪ | Vercel project `tripsmith` (root `web/`); `web/.env.example` = `API_URL`, `REVALIDATE_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_*` (04 §12) | Vercel project `tripsmith-api` (FastAPI preset, root `api/`, `bom1`); Neon project `tripsmith` (`ap-southeast-1`, PG 18, branches `production` + `dev` — Neon's default is `production`, not `main`); Vercel Blob store `tripsmith-media`; Upstash Redis `tripsmith` (`ap-south-1`); Resend key `tripsmith-api` on the shared account — **no domain yet, so test mode: `onboarding@resend.dev` → owner inbox only, customer emails deferred**; Sentry org `viraj-ad` projects `tripsmith-web` + `tripsmith-api`; `api/.env.example` with every key from 04 §12; `uv` installed. **Domain deferred:** no `virajdomadia.com` for now — production is `tripsmith.vercel.app` / `tripsmith-api.vercel.app`, DNS CNAMEs dropped from 1.0 | 0.5 h | All keys in Vercel (prod/preview/dev; verified names-only 2026-09-13); GitHub Actions needs no secrets (04 §10); both `.env.example` files committed |
| S3 | **Toolchains** ✅ PR #9 + #10 | ⚪ | Root `package.json` scripts `lint` / `typecheck` / `test` / `dev` (`concurrently`) / `gen:api` | `pyproject.toml` + `uv.lock` (Python 3.12), ruff + pyright config; `ci.yml` gains `astral-sh/setup-uv` + `uv sync` so the root scripts run both languages in CI (job split into web · api · contract stays S7) | 0.5 h | `pnpm lint` at the root runs both languages |
| S4 | **FastAPI skeleton** ✅ PR #11 + #12 | ⚪ | — | `app/main.py` (app factory, lifespan — engine arrives in S10, request-id middleware; Sentry hook point for S8), `config.py` (pydantic-settings), `errors.py` (`{ error: { code, message, fieldErrors? } }`, `RequestValidationError` → `validation`), routers `GET /health`, `GET /meta` (`schemas/meta.py`: `Theme`/`Badge`/`EnquiryType` enums + labels, limits; `Cache-Control` per 06 C0), built-in `/docs` + `/openapi.json`, `app/openapi.py` dumps `api/openapi.json` (committed; `pnpm gen:api` runs it first), `api/vercel.json` (`maxDuration 30`, `bom1`); pytest: health, meta, validation envelope, openapi freshness | 1 h | `uv run pytest` green (37); `/docs` opens locally; Vercel `tripsmith-api` preview builds |
| S5 | **Contract + typed client** ✅ PR #13 | ⚪ | `openapi-typescript` → `src/lib/api-types.ts` (generated, committed, prettier-ignored; vitest fails when stale); `src/lib/api.ts` typed GET over the contract's paths/responses (`api('/meta')` → `Meta`), `auth: true` forwards cookies + `no-store`, trusts only the error envelope (zod schema `satisfies` the generated type); `next.config.ts` rewrite `/api/:path*` → `API_URL` (from S1) | `schemas/errors.py` puts the envelope + `ErrorCode` enum in the OpenAPI components as every operation's `default` response; FastAPI's automatic 422 stripped from the doc (validation errors are 400 envelopes) | 0.5 h | `GET /api/health` and `/api/meta` work through the rewrite locally; `pnpm gen:api` produces no diff |
| S6 | **Web shell** ✅ PR #14 | ⚪ | Root layout, `(site)` + `(admin)` route groups, unstyled header/footer shell (`components/site/`) and placeholder home (`ApiStatus`, `force-dynamic`) that shows `/health` + every `/meta` value, with an "API unreachable" state — system font stack, **no brand tokens or styling yet** (S12 locks them; the ported dummy landing page was deleted here); `/revalidate` route handler (`{ secret, tags[] }` → `revalidateTag`, secret checked first, timing-safe, closed when unset) | `infra/revalidate.py` (POST `{WEB_URL}/revalidate`, never raises, logs failures; `httpx` runtime dep) | 0.5 h | Placeholder home renders the API's `/meta` values |
| S7 | **CI** ✅ PR #15 | ⚪ | `ci.yml` job `web`: pnpm lint / typecheck / vitest / `next build` | `ci.yml` job `api`: uv, ruff, pyright, pytest with a `postgres:17` service (`TEST_DATABASE_URL` set, used from S10); job `contract`: `pnpm gen:api` → `git diff --exit-code` on `openapi.json` + `api-types.ts`; `main` requires `web` · `api` · `contract` (not strict/up-to-date) | 0.5 h | Green run on `main`; branch protection requires it |
| S8 | **Observability** ✅ PR #17 | ⚪ | `@sentry/nextjs` (client via `NEXT_PUBLIC_SENTRY_DSN`, server + edge via `SENTRY_DSN`; `src/lib/sentry.ts` = one tested option set: env/release from Vercel, no PII, 10 % traces; `instrumentation.ts` + `onRequestError`, `global-error.tsx`; `withSentryConfig` without source-map upload), Vercel Analytics `<Analytics />` | `sentry-sdk[fastapi]` wired in `infra/observability.py` (`init_sentry` in `create_app`, request-id tag on every event, `capture_exception` wrapper so only infra imports the SDK; tests use a Transport sink, `create_app(settings=…)` keeps Sentry off in tests) | 0.25 h | A thrown test error appears in both Sentry projects |
| S9 | ~~**First production deploys**~~ **dropped 2026-09-15** — already live at `tripsmith.vercel.app` + `tripsmith-api.vercel.app` since S4/S6; domain + UptimeRobot deferred | ⚪ | — | — | 0 | — |
| S10 | **Database layer** ✅ PR #18 | ⚪ | — | SQLAlchemy 2.0 models for all v1 tables + ⏩ forward-compat columns (`users` / `sessions` / `verification`, catalog, enquiries, analytics); Alembic `0001_v1` (enums, tables, indexes, `departure_availability` view as raw SQL); `infra/db.py`; pytest DB harness (`TEST_DATABASE_URL`, fresh DB per session, truncate between tests); `DATABASE_URL` set in Vercel | 1 h | Migration applies on a fresh Neon branch and in the harness; `alembic downgrade base` clean |
| S11 | **Seed pipeline + 2 packages** ✅ PR #18 | ⚪ | Placeholder home lists the seeded packages (cover, price, badge) via `GET /packages` | `content/_schema.py` (`define_package`, `define_destination` pydantic content models); `scripts/seed.py` (upsert by slug, `--local` skips Blob); `infra/storage.py` (Blob REST uploader); owner user from `OWNER_*`; **1 destination, 2 genuine packages** with departures, photos + `content/photos/CREDITS.md` | 1 h | `uv run python scripts/seed.py` idempotent; seed test on the two-package fixture; production DB seeded |
| S12 | **Visual direction** ✅ PR #19 — K confirmed from A/B/C | 🟢 | 3-variant mockup page (home + package page) per the variant workflow, with direction K · Ocean + Marigold from [04-ui-mockups.md](04-ui-mockups.md) as the incumbent variant → chosen variant's tokens + `next/font` locked in `globals.css`; 04-ui-mockups.md updated with the outcome (K confirmed or replaced) | — | 1 h | Tokens committed; no page styled twice after this |
| Done | | | Both deploys live · CI green · `/api/docs` opens · DB migrated and seeded with 2 packages · direction chosen | | **7 h** (3 h left) | |

### Milestone 1.1 — Browse (≈ 8.5 h) 🟢 customer
Goal: a visitor can find and read a package. Content grows 2 → 6 → 12 inside this milestone.

| # | Part | Who | web/ | api/ | Est. | Done when |
|---|---|---|---|---|---|---|
| F1+F2 ⤵ | **Catalog read services** ✅ PR #20 + #21 | 🟢 | — | `services/catalog`: `get_package`, `list_destinations`, `get_destination`, `get_departures_for_month`, pricing + badge helpers (*Filling fast* ≤ 4 · *Sold out* 0 · *Guaranteed*); pydantic `PackageDetail`, `DestinationCard`, …; regenerate contract | 1 h | pytest: badge/pricing edge cases, draft hidden |
| ↳ F2 | **Package page** | 🟢 | `/packages/[slug]`: gallery + lightbox, quick facts, highlights, day-by-day itinerary, inclusions/exclusions, hotels, departures table with badges, occupancy pricing, FAQ, 3 related; draft → 404; SSG + tagged fetch; `generateMetadata` + JSON-LD `TouristTrip` / `Offer`; **no CTAs yet** | `GET /packages/:slug`, `GET /packages/:slug/departures?month=`; `Cache-Control` on public GETs | 1.5 h | Live at production for the 2 seeded packages; Lighthouse mobile ≥ 90 |
| F3 | **Package search** ✅ PR #23 | 🟢 | `/packages`: FilterBar (destination multi, budget max, nights range, theme multi, travel month), sort, filters in URL, result count, empty state, client re-fetch without reload | `search_packages(params)` — the single filter function v3's AI reuses — + `GET /packages`; `PackageCard` schema | 1.5 h | pytest filter matrix green; shareable filter URLs render server-side |
| F4+F5 ⤵ | **Content → 6 packages** ✅ PR #24 | 🟢 | — | 6 genuine packages across 3 destinations, 3–4 departures each, photos | 0.5 h | Every package passes the live-status rules; seeded to production |
| ↳ F5 | **Destinations** ✅ PR #24 | 🟢 | `/destinations` grid (cover, name, package count, from-price), `/destinations/[slug]` (cover, intro, best months, live packages); JSON-LD `TouristDestination` | `GET /destinations`, `GET /destinations/:slug` (destinations with 0 live packages hidden) | 1 h | Unique title/description per page |
| F6 | **Home** ✅ PR #25 | 🟢 | `/`: full-width hero + search form (destination · budget · nights → `/packages?…`), 6 destination tiles, 6 package cards, why-us strip, testimonials, full footer (address / phone / WhatsApp / policy links); hero is the LCP element | `get_home_data` + `GET /home`; `testimonials` seeded | 1.5 h | Search submit lands on `/packages` with matching params; fully server-rendered |
| F7+F8 ⤵ | **Content → 12 packages** ✅ PR #26 | 🟢 | — | 6 destinations, 12 packages (full itineraries, real hotels, 2026 prices), ~40 departures, 6 testimonials | 1 h | Home shows 6 + 6 real tiles; seeded to production |
| ↳ F8 | **Trust pages** ✅ PR #26 | 🟢 | `/about`, `/contact` (address, phone, WhatsApp, hours, map embed; form placeholder until F9), `/terms`, `/privacy`, `/cancellation-policy` — real copy; footer links | — | 0.5 h | No lorem ipsum; all linked from the footer |
| Done | | | A stranger can browse 12 real packages on a phone at the production URL | | **8.5 h** | |

### Milestone 1.2 — Enquire (≈ 6 h) 🟢 customer
Goal: the funnel closes — a visitor can enquire, get the PDF, and share.

| # | Part | Who | web/ | api/ | Est. | Done when |
|---|---|---|---|---|---|---|
| F9 | **Enquiry form** ✅ PR #27 | 🟢 | `EnquiryForm` (Standard / Customise-this-trip toggle), zod mirror `enquiry-schema.ts` (+ mirror test), inline `fieldErrors` from the envelope, thanks state ("we'll call within 2 hours, 10 am–8 pm IST"); `POST /enquire` no-JS proxy → redirect; wired on the package page (package attached) and the Contact page (`type=contact`) | `services/enquiry.submit` + `POST /enquiries`: pydantic `EnquiryCreate` (Indian mobile), honeypot, `infra/ratelimit.py` (Upstash sliding window, 5 / 10 min / IP), 1-minute dedupe, insert `enquiries` with `status=new` | 1.5 h | Works with JS off; duplicate submit within 1 min is deduped |
| F10 | **Emails** ✅ PR #28 | 🟢 | thanks page: "we've emailed this to you" when `emailed=1` | `infra/email.py` (Resend over REST, null when unset), `services/email` (Jinja2 HTML + text: owner notification with reply-to, visitor confirmation with WhatsApp link), `email_status` on the enquiry, `emailed` on the wire; Resend test mode redirects the visitor copy to the owner inbox | 1 h | Both emails arrive from the production API |
| F11 | **Itinerary PDF** ✅ PR #29 | 🟢 | "Download itinerary (PDF)" link (plain `<a>` to the API) | `services/pdf.render_itinerary` (fpdf2, DM Sans TTF, `Document` base): cover, facts, itinerary, inclusions, hotels, departures, pricing, contact block; `GET /packages/:slug/itinerary.pdf` (404 if draft → Blob cache keyed by `updated_at` → 302); attached to the confirmation email; `GET /cron/pdf-gc` | 2 h | Valid A4 PDF < 2 MB, < 3 s cold; content matches the page |
| F12+F13 ⤵ | **CTAs + WhatsApp** ✅ PR #30 | 🟢 | Sticky mobile CTA bar on the package page (price · Enquire · PDF · WhatsApp); site-wide floating WhatsApp button pre-filled "Hi, I'm interested in <package> (<url>)" | — | 0.5 h | CTA visible at 360 px without covering content |
| ↳ F13 | **Share + OG images** ✅ PR #30 | 🟢 | Share buttons (WhatsApp, copy link, `navigator.share`); `opengraph-image` routes for packages and destinations (cover + name + price) | — | 0.5 h | Pasting a package URL into WhatsApp shows the OG card |
| F14 | **Page views** | 🟢 | `recordView` beacon from the package page — *(lean: no Playwright journey, no `e2e.yml`; a manual phone walk-through before merge)* | `POST /views` (UA bot filter, upsert `package_views`, 204) | 0.25 h | View count increments in the DB |
| Done | | | A stranger can enquire from a phone and both emails arrive with the PDF attached | | **6 h** | |

### Milestone 1.3 — Manage (≈ 9 h) 🔴 admin
Goal: the owner runs the business from `/admin` without touching the database.

| # | Part | Who | web/ | api/ | Est. | Done when |
|---|---|---|---|---|---|---|
| F15 | **Owner login** | 🔴 | `/admin/login` form posting to `/api/auth/login`; `middleware.ts` gate on `/admin/*` via `GET /api/auth/session`; logout; demo credentials shown on the public landing page | `services/auth`: `users` / `sessions`, argon2 (`argon2-cffi`), `POST /auth/login` (rate-limited), `POST /auth/logout`, `GET /auth/session`; HttpOnly SameSite=Lax cookie; `require_owner` dependency | 1.5 h | Unauthenticated `/admin` → login; owner journey starts |
| F16+F17 ⤵ | **Admin shell** | 🔴 | `(admin)` layout: nav with new-enquiry badge, table / form / toast primitives (shadcn) | New-enquiry count in the session payload | 1 h | Badge reconciles with the inbox |
| ↳ F17 | **Destinations CRUD** | 🔴 | `/admin/destinations` list + form (cover upload, intro, best months) | `GET /admin/destinations` (all, including those the public list hides) · `POST/PUT/DELETE /admin/destinations[/:id]` (delete blocked if packages exist) → revalidate `destinations`, `destination:slug` | 0.5 h | Public grid updates within seconds of a save |
| F18 | **Packages CRUD** | 🔴 | `/admin/packages` list + `PackageForm` (react-hook-form typed from `api-types.ts`): fields, theme tags, list editors (highlights / inclusions / exclusions / FAQ), occupancy pricing grid, draft ↔ live toggle, duplicate button, delete guard | `GET/POST/PUT/DELETE /admin/packages[/:id]`, `POST …/status` (live-publish rules), `POST …/duplicate` ("(copy)" draft); on save → `infra/revalidate` with tags + bump `updated_at` (invalidates the PDF cache) | 2 h | Owner changes a price → public page and PDF reflect it |
| F19+F20 ⤵ | **Itinerary + departures editors** | 🔴 | `ItineraryEditor` (add / remove / dnd reorder days with meals + stay), hotels list, departures sub-table (date, price, seats total / left, guaranteed) | Nested writes inside the package PUT (days, hotels, departures) with per-row validation | 1 h | No data loss on a validation failure |
| ↳ F20 | **Image upload** | 🔴 | `GalleryUploader`: multi-file, reorder, cover, alt text | `POST /admin/packages/:id/images` (multipart proxy: `jpeg` / `png` / `webp` ≤ 5 MB, Pillow resize ≤ 2000 px, Blob REST PUT → `package_images` row), `PATCH/DELETE …/images/:imageId` | 1 h | Uploaded image appears in the public gallery after revalidation |
| F21 | **Enquiries inbox** | 🔴 | `/admin/enquiries` table (status / type / package / date filters, name-phone search, 50 per page), `/admin/enquiries/[id]` detail (one-click status, append-only notes, `mailto:` + WhatsApp links), Export CSV button | `GET /admin/enquiries`, `GET …/:id`, `PATCH …/status`, `POST …/notes`, `GET /admin/enquiries.csv` | 1.5 h | CSV opens correctly in Excel |
| F22 | **Dashboard + owner e2e** | 🔴 | `/admin`: new enquiries this week vs last, by status, top 5 by enquiries and by views (30 d), departures in the next 30 days with seats left; *(lean: no Playwright owner journey — manual check)* | `GET /admin/dashboard` aggregates over `enquiries`, `package_views`, `departures` | 0.5 h | Loads < 1 s with seeded data; numbers reconcile with the inbox |
| Done | | | Owner journey works by hand: login → change a price → public page and PDF reflect it | | **9 h** | |

### Milestone 1.4 — Harden (≈ 4 h) ⚪ — closes lifecycle steps 10–12, 17 for v1

| # | Part | Who | web/ | api/ | Est. | Done when |
|---|---|---|---|---|---|---|
| H1 | **SEO** | 🟢 | `generateMetadata` audit, canonicals, `sitemap.ts` + `robots.ts` from the public GETs, JSON-LD `Organization` + `FAQPage`, breadcrumbs | — | 0.75 h | Lighthouse SEO 100 on home, listing, package |
| H2 | **Performance** | ⚪ | One manual Lighthouse run per page *(lean: no `lighthouse.yml`)*, `next/image` sizes, font loading | `Cache-Control` review, query indexes checked with `EXPLAIN` | 0.5 h | Lighthouse mobile ≥ 90 perf on the three pages |
| H3 | **Accessibility + responsive** | 🟢 | Keyboard nav, visible focus, alt text, AA contrast; pass at 360 / 768 / 1280 | — | 0.5 h | Lighthouse a11y 100 |
| H4 | **Security** | ⚪ | CSRF-safe forms, headers (CSP where feasible, HSTS), no secrets client-side | Validation audit on every write, rate limits on forms + login verified, `require_owner` on every admin route, dependency audit → `docs/12-security-performance.md` | 0.75 h | Checklist in `docs/12` complete |
| H5 | ~~**Test gaps**~~ **dropped 2026-09-15** — the hard-part tests (pricing, badges, filters, auth, rate-limit) are written with their feature rows; nothing else gets tests | ⚪ | — | — | 0 | — |
| H6 | **Review + docs** | ⚪ | README (architecture diagram, how it works, status line), `docs/17-post-launch.md`, portfolio case-study entry | — | 0.75 h | v1 signed off; PRD status updated |
| Stretch | Best-time strip (add-on B, ~2 h) if under budget; storyboard (E) only if 1.0–1.4 came in ≥ 4 h under | | | | | |

**v1 total: ≈ 34 h on paper; lean target ≈ 24 h** — the estimates above are ceilings, and merged rows share their ceremony.

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
| v1 | 1.0 – 1.4 | 35 | 35 |
| v2 | 2.0 – 2.3 | 15 | 50 |
| v3 | 3.0 – 3.3 | 15 | 65 |
| v4 | 4.0 | 6 | 71 |
| Add-ons (in priority order) | B best-time (2) · A AI drafting (4) · MCP OAuth tools (3) · D split pay (8) · C trip hub (6) · E storyboard (6) · departure-city (3) | up to 32 | up to 102 |

The PRD budget is ~60 h for v1–v3 plus ~6 h for v4 (71 h with the two-package setup, two toolchains and the walking skeleton). **Add-ons are nice-to-have, not priority** (Viraj, 2026-09-17): they are considered only after v4 is fully done (docs and case study included), in the order above, from time saved — and skipping all of them is a fine outcome.

---

## Sequencing rules
1. Never start a milestone with a red CI on `main`.
2. Each task = its own branch + PR into a protected `main`; Viraj reviews and merges; never push to `main` directly. A merge deploys **both** web and api (Vercel ignores a project whose files didn't change).
3. Content grows with the pages — 2 packages in S11, 6 in F4, 12 in F7 — so every page is designed around real data without blocking the first deploy.
4. The visual direction is chosen (variant page, S12) before any customer page is built; no page is styled twice.
5. Add-ons are only considered after v4 is fully done, including its docs and the case study; they are optional feel-good features, never a reason to delay a version.
6. **Lean rule (2026-09-15):** overdo the feature, never the setup. No platform work (observability, uptime, e2e/Lighthouse workflows, contract-freshness tooling, follow-up PRs) unless a feature row needs it; tests only for pricing, availability, search, auth, payments; every PR must change something a visitor or the owner can see.

## Dependencies to unblock before 1.0
- Domain: `virajdomadia.com` not bought yet (2026-09-13 decision) — ship 1.0 on `*.vercel.app`; when bought, add CNAMEs `tripsmith` + `api.tripsmith`, verify the Resend sending domain, and swap the four URL env vars (`API_URL`, `NEXT_PUBLIC_SITE_URL`, `WEB_URL`, `SITE_URL`).
- Accounts: Vercel, Neon, Upstash, Resend, Sentry ✅ (S2); UptimeRobot (S9). GitHub Actions needs no secrets (CI uses a Postgres service container; deploys go through Vercel's Git integration).
- Photos: decide source (own / CC-licensed / generated) for 6 destination covers + ~50 package images — must be licence-clean for a public site.

## Tracking
Progress is tracked in the repo README's status line and the tracker artifact, updated **per milestone** (not per PR). Estimates are re-baselined after 1.1 — if 1.0 + 1.1 run > 16 h, the v1 stretch items are dropped first.
