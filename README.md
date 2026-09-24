# Tripsmith

**Trips planned in a chat.** A travel agency that runs on its own website: browse real packages, enquire in two taps, and — from v3 — have an AI concierge plan the itinerary and start the booking for you.

> **Status: v1 shipped** (2026-09-24) — the agency website is live and complete: 12 packages across 6 destinations, faceted search, itinerary PDFs, WhatsApp-first enquiries, and an owner admin that runs the catalog and the inbox. Milestones 1.0–1.4 are done, including the SEO, performance, accessibility and security rows — the honest account of what that took is in [docs/17-post-launch.md](docs/17-post-launch.md). Next: **v2** booking engine (Razorpay checkout, accounts, reviews). One of six portfolio projects by [Viraj Domadia](https://virajdomadia.vercel.app).
>
> **Live:** [tripsmith.vercel.app](https://tripsmith.vercel.app) · api [tripsmith-api.vercel.app/docs](https://tripsmith-api.vercel.app/docs) · owner demo sign-in is printed on the site footer.

## What it proves

A real product, not a CRUD demo: a public catalog that is fast and indexable, a transactional path (enquiry → email → PDF) that has to work with JavaScript off, and an admin that a non-technical owner could actually run. v2–v4 add payments, an AI agent with tool calling, and an MCP server.

## How it works

```
                      browser
                         │
        ┌────────────────┴────────────────┐
        │  web — Next.js 15 (App Router)  │   Vercel project "tripsmith"
        │  12 public pages · owner admin  │
        └───┬───────────────┬─────────────┘
            │               │
   server components   route handlers          middleware gates /admin/*
   (tagged fetch)      /enquire · /api/*       (session check, UX only)
            │               │
            └──────┬────────┘
                   │  same-origin /api/:path* rewrite  (+ X-Client-Ip, signed)
                   ▼
        ┌─────────────────────────────────┐
        │  api — FastAPI (Python 3.12)    │   Vercel project "tripsmith-api"
        │  routers → services → models    │
        └───┬─────────┬─────────┬─────────┘
            │         │         │
       PostgreSQL  Vercel    Resend · Upstash · Sentry
        (Neon)      Blob     email    limits    errors
            │         │
       SQLAlchemy   photos + generated itinerary PDFs
       + Alembic
                   │
                   └──▶ POST /revalidate back to the web after every admin write
                        (cache tags: packages, package:<slug>, destination:<slug>)
```

Four decisions carry most of the design:

- **Two deployments, one contract.** `api/openapi.json` is generated from the FastAPI app and committed; `web/src/lib/api-types.ts` is generated from it. CI fails if either is stale, so the web cannot drift from the api it calls.
- **The cache is tag-invalidated, not timed.** Public pages are prerendered and their data fetches carry cache tags; every admin write posts the tags it touched to `/revalidate`, so an owner's price change is visible in seconds rather than at the end of an ISR window.
- **Every visitor-facing path works without JavaScript.** The enquiry form posts natively to `/enquire`, the listing's filters are a GET form, the admin inbox keeps all its state in the URL. JavaScript upgrades them; it is never required.
- **The api is the authority.** The web middleware that gates `/admin/*` is a UX nicety; every admin route declares `require_owner` at router level, so a new route is protected by construction.

## Stack

**web/** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · GSAP · react-hook-form + zod · Vitest + Testing Library · Playwright · pnpm
**api/** FastAPI (Python 3.12) · pydantic v2 · SQLAlchemy 2 + Alembic · PostgreSQL (Neon) · argon2id session auth · fpdf2 (itinerary PDFs) · Jinja2 + Resend (email) · Pillow · httpx · pytest · uv
**platform** Vercel (two projects) · Vercel Blob (photos, PDFs) · Upstash Redis (rate limits) · Sentry (both halves) · GitHub Actions (web · api · contract)

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
  src/app/          (site)/ 12 public pages · (admin)/ owner area · api/ + enquire/ + revalidate/ route handlers
                    sitemap.ts · robots.ts · opengraph-image.tsx per detail route · middleware.ts
  src/components/   site/ (home, package, destinations, enquiry, whatsapp) · admin/ · ui/ (shadcn)
  src/lib/          api.ts (typed client) · api-types.ts (generated) · seo/ · og/ · admin/ · business.ts
  tests/            46 vitest files (283 tests)
api/        FastAPI (Python 3.12, uv)
  app/routers/      site/ (catalog, enquiries, pdf, views, meta, health) · admin/ (packages, images,
                    destinations, enquiries, dashboard) · auth.py · cron/
  app/services/     catalog/ · enquiries · admin_enquiries · analytics · auth/ · email/ · pdf/ · images
  app/infra/        db · storage (Blob) · email · ratelimit · revalidate · cache · client_ip · observability
  app/models/ schemas/ · middleware.py (request id, blank params, fresh, security headers) · errors.py
  alembic/ content/ scripts/seed.py · tests/ (443 pytest, DB harness)
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

`--local` mirrors photos to `api/.seed-photos` (served at `/seed-photos`); without it they upload to Vercel Blob. Production migrations are a deliberate, separate command with the Neon `production` branch URL pasted in: `ALEMBIC_URL='postgresql+asyncpg://…neon.tech/neondb?ssl=require' uv run alembic upgrade head`.

Checks: `pnpm lint` · `pnpm typecheck` · `pnpm test` — each fans out to both languages. `pnpm gen:api` dumps `api/openapi.json` from the app and regenerates `web/src/lib/api-types.ts`; run it after any route or schema change (a pytest fails while `openapi.json` is stale, a vitest while `api-types.ts` is). DB tests need `TEST_DATABASE_URL` (any throwaway Postgres; CI runs a `postgres:17` service) and skip without it.

## Roadmap

The 17-step [project lifecycle](../PROCESS.md) — steps 1–7 are done for all four versions, and v1 has now closed steps 8–17.

**v1** agency website ✅ → **v2** booking engine (Razorpay checkout, accounts, deals, reviews) → **v3** AI concierge (chat that searches the real catalog, books, and hands off to a human) → **v4** "Tripsmith anywhere" (an MCP server, so the catalog and the booking flow are usable from any AI client).

Each later version re-enters the lifecycle at step 3 with a short re-validation before any code.
