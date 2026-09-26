# Tripsmith

**Trips planned in a chat.** A travel agency that runs on its own website: browse real packages, enquire in two taps, and — from v3 — have an AI concierge plan the itinerary and start the booking for you.

> **Status: v2** (2026-09-26): the booking engine is live on top of the v1 agency website. Visitors can pick a date, build a party and pay by Razorpay with live seats, deals and coupons, then get a PDF voucher and manage the trip (cancel, review) from an email-code account. The owner runs bookings, refunds, cancellations, deals, coupons and reviews from the admin. Payments are in **Razorpay test mode** (use a test card) and emails are in **demo mode** (sign-in codes show on screen). The honest account of v1 and v2 is in [docs/17-post-launch.md](docs/17-post-launch.md). Next: **v2.5 Strengthen**, which brings deposits, a waitlist, date changes, add-ons, real refunds with GST invoices, a trip pack, a departure calendar, reports and counter booking ([requirements](docs/03-requirements-v2-5.md)). **v3**, an AI concierge, comes after it. One of six portfolio projects by [Viraj Domadia](https://virajdomadia.vercel.app).
>
> **Live:** [tripsmith.vercel.app](https://tripsmith.vercel.app) · api [tripsmith-api.vercel.app/docs](https://tripsmith-api.vercel.app/docs) · the owner demo sign-in is printed in the site footer; a demo traveller, `traveller.demo@example.com`, has a past and an upcoming trip.

## What it proves

A real product, not a CRUD demo. It has a public catalog that is fast and indexable, and an enquiry path (enquiry → email → PDF) that works with JavaScript off. It has a payment path where every way money can arrive (Checkout's callback, a signed webhook, a sync, an offline mark-paid) settles through one locked function exactly once. And it has an admin that a non-technical owner could actually run. v3–v4 add an AI agent with tool calling and an MCP server.

## How it works

```
                      browser
                         │
        ┌────────────────┴────────────────┐        Razorpay Checkout.js
        │  web — Next.js 15 (App Router)  │ ◀────  (injected on Pay only)
        │  public site · account · admin  │   Vercel project "tripsmith"
        └───┬───────────────┬─────────────┘
            │               │
   server components   route handlers          middleware gates /admin/* and /account
   (tagged fetch)      /enquire · /api/*       (session check, UX only)
            │               │
            └──────┬────────┘
                   │  same-origin /api/:path* rewrite  (+ X-Client-Ip, signed)
                   ▼
        ┌─────────────────────────────────┐        Razorpay
        │  api — FastAPI (Python 3.12)    │ ◀────▶ orders · payments (httpx)
        │  routers → services → models    │ ◀────  POST /webhooks/razorpay (signed)
        └───┬─────────┬─────────┬─────────┘
            │         │         │
       PostgreSQL  Vercel    Resend · Upstash · Sentry
        (Neon)      Blob     email    limits    errors
            │         │
       SQLAlchemy   photos + itinerary PDFs (vouchers are rendered on demand, never stored)
       + Alembic
                   │
                   └──▶ POST /revalidate back to the web after every admin write
                        (cache tags: packages, package:<slug>, destination:<slug>)
```

Four decisions carry most of the design:

- **Two deployments, one contract.** `api/openapi.json` is generated from the FastAPI app and committed; `web/src/lib/api-types.ts` is generated from it. CI fails if either is stale, so the web cannot drift from the api it calls.
- **The cache is tag-invalidated, not timed.** Public pages are prerendered and their data fetches carry cache tags; every admin write posts the tags it touched to `/revalidate`, so an owner's price change is visible in seconds rather than at the end of an ISR window.
- **Every visitor-facing path works without JavaScript.** The enquiry form posts natively to `/enquire`, the listing's filters are a GET form, the admin inbox keeps all its state in the URL. JavaScript upgrades them; it is never required.
- **The api is the authority.** The web middleware that gates `/admin/*` is a UX nicety; every admin route declares `require_owner` at router level, so a new route is protected by construction. The same goes for money: the browser describes a party, the api prices it to the paisa (deal and coupon included), and the Razorpay order is built from that server quote only.

## Stack

**web/** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · GSAP · react-hook-form + zod · Vitest + Testing Library · pnpm
**api/** FastAPI (Python 3.12) · pydantic v2 · SQLAlchemy 2 + Alembic · PostgreSQL (Neon) · argon2id owner auth + email-code customer sign-in · Razorpay (orders, signed webhook) · fpdf2 (itinerary PDFs, vouchers) · Jinja2 + Resend (email) · Pillow · httpx · pytest · uv
**platform** Vercel (two projects) · Vercel Blob (photos, PDFs) · Upstash Redis (rate limits) · Sentry (both halves) · GitHub Actions (web · api · contract)

After v1 shipped, a deep review led to the **v1.0.1 hardening** (PRs #50–#54): content-hashed PDF caching, a daily IST cron, optimistic concurrency in the admin, Sentry scrubbing, hashed sessions, and a lighter first load. It is written up in [docs/17](docs/17-post-launch.md#v101-hardening-2026-09-24). The v2 security pass and its one PageSpeed Insights run are in [docs/12](docs/12-security-performance.md#b14--v2-close-security--performance).

## What is in v2

|          |                                                                                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Book     | A Book-now side sheet on every package page: live seats with reasons, a party builder (double/triple/single, child rate, single supplement), a server quote with deal and coupon lines, a 10-minute seat hold, Razorpay Checkout, a success screen with the voucher    |
| Pay      | Razorpay orders; a signed confirm; a signed, idempotent webhook; a sync for a Checkout that closes without calling back; a late payment on a lapsed hold re-checks seats and either confirms or is flagged for a refund                                                |
| Customer | Email-code sign-in, My trips (upcoming / past / cancelled), a booking page with the cancellation tier marked, cancellation requests, reviews on completed trips, a PDF voucher by email and on demand                                                                  |
| Owner    | Bookings desk (filters, search, payment timeline, mark paid offline, release a hold, refund made, CSV, printable manifest), cancellation approve/reject with a refund pre-filled from the policy, reply to enquiries from the inbox, deals, coupons, review moderation |
| Under it | Six add-only migrations, each run on production before its code; rate limits on booking starts, code requests, code tries and sync; CSP for Razorpay verified on every page; `AggregateRating` from published reviews                                                  |

## What is in v1

|          |                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public   | Home, destinations index + detail, package listing with faceted search (destination, theme, month, nights, budget, sort), package detail (gallery + lightbox, day-by-day itinerary, departures with live seat counts, occupancy pricing, FAQ), about, contact, three policy pages |
| Convert  | Enquiry form (standard or customised) with no-JS fallback, honeypot + dedupe + rate limit, owner and visitor emails, itinerary PDF attached, WhatsApp CTAs everywhere, thanks page                                                                                                |
| Admin    | Dashboard (enquiry and view trends, top packages, upcoming departures), package editor (itinerary, departures, hotels, FAQ, gallery with drag-reorder), destination editor, enquiry inbox with filters, notes, status and CSV export                                              |
| Under it | Generated OG cards per package, sitemap + robots + JSON-LD, itinerary PDFs cached in Blob, page-view beacon, Lighthouse a11y 100 on every page, CSP and friends on both origins                                                                                                   |

## In this repo

```
web/        Next.js 15 (App Router, TypeScript, Tailwind 4, pnpm)
  src/app/          (site)/ public pages + account/ · (admin)/ owner area · api/ + enquire/ + revalidate/ route handlers
                    sitemap.ts · robots.ts · opengraph-image.tsx per detail route · middleware.ts
  src/components/   site/ (home, package, destinations, enquiry, whatsapp) · admin/ · ui/ (shadcn)
  src/lib/          api.ts (typed client) · api-types.ts (generated) · seo/ · og/ · admin/ · business.ts
  tests/            68 vitest files (466 tests)
api/        FastAPI (Python 3.12, uv)
  app/routers/      site/ (catalog, enquiries, pdf, views, meta, health, bookings, webhooks,
                    vouchers, account) · admin/ (packages, images, destinations, enquiries,
                    dashboard, bookings, coupons, reviews) · auth.py · cron/
  app/services/     catalog/ · booking/ (pricing, orders, payments, webhook, coupons, desk…) · account
                    · reviews · enquiries · admin_enquiries · enquiry_reply · auth/ · email/ · pdf/ · images
  app/infra/        db · razorpay · storage (Blob) · email · ratelimit · revalidate · cache · client_ip · observability
  app/models/ schemas/ · middleware.py (request id, blank params, fresh, security headers) · errors.py
  alembic/ content/ scripts/seed.py · tests/ (723 pytest, DB harness)
docs/       lifecycle steps 3–12: requirements v1–v4, user flows, technical design, architecture,
            data + API, plan, security + performance, post-launch review
mockups/    every v1 screen in the final K · Ocean + Marigold system, plus the direction explorations
brand/      logo, mark, favicon
PRD.md      product requirements (v1 locked; v1–v4 versions, costs, add-ons)
```

## Run it

```
pnpm install                      # web (pnpm workspace) + root scripts
cd api && uv sync                 # api (Python 3.12, uv)
cd .. && pnpm dev                 # web on :3000 (rewrites /api/* → :8000) and api on :8000
```

Database: migrations only run against the URL in `ALEMBIC_URL` — there is no fallback, because `DATABASE_URL` in `api/.env.local` is production. Locally:

```
cd api
ALEMBIC_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/tripsmith uv run alembic upgrade head
uv run python scripts/seed.py --local --database-url postgresql+asyncpg://postgres:postgres@localhost:5432/tripsmith
```

`--local` mirrors photos to `api/.seed-photos` (served at `/seed-photos`); without it they upload to Vercel Blob. The seed is the same: `--database-url` (or `SEED_DATABASE_URL`) is required. Production is a deliberate, separate command with the Neon `production` branch URL pasted in: `ALEMBIC_URL='postgresql+asyncpg://…neon.tech/neondb?ssl=require' uv run alembic upgrade head`, and `uv run python scripts/seed.py --database-url '<same URL>'`.

Checks: `pnpm lint` · `pnpm typecheck` · `pnpm test` — each fans out to both languages. `pnpm gen:api` dumps `api/openapi.json` from the app and regenerates `web/src/lib/api-types.ts`; run it after any route or schema change (a pytest fails while `openapi.json` is stale, a vitest while `api-types.ts` is). DB tests need `TEST_DATABASE_URL` (any throwaway Postgres; CI runs a `postgres:17` service) and skip without it — unless `REQUIRE_DB_TESTS=1` (set in CI), which fails the run instead.

## Roadmap

The 17-step [project lifecycle](../PROCESS.md) — steps 1–7 are done for all four versions, and v1 and v2 have each closed steps 8–17 (v2 re-entered at step 3 with a re-validation).

**v1** agency website ✅ → **v2** booking engine (Razorpay checkout, accounts, deals, reviews, coupons) ✅ → **v2.5** strengthen (17 features from live operators, plus counter booking) → **v3** AI concierge (chat that searches the real catalog, books, and hands off to a human) → **v4** "Tripsmith anywhere" (an MCP server, so the catalog and the booking flow are usable from any AI client).

Each later version re-enters the lifecycle at step 3 with a short re-validation before any code.
