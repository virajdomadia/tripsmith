# Tripsmith

**Trips planned in a chat.** A travel agency that runs on its own website: browse real packages, enquire in two taps, book and pay online, or let an AI concierge find the trip, check live dates and open the booking for you.

> **Status: complete — v3** (2026-11-14). An AI concierge on every public page plans a trip from the real catalogue: it searches live packages, checks dates and seats, opens the Book-now sheet pre-filled, or hands the chat to a person. It runs on Google Gemini's free tier, so it costs ₹0. Every package and price it shows comes from a tool result, and a streaming guardrail stops anything else. When the free turns run out, a no-AI quick finder takes its place. Underneath is the booking engine from v2–v2.6: Razorpay checkout, deposits and balances, waitlists, refunds with GST documents, accounts, deals, coupons, reviews and an owner admin. Payments are in **Razorpay test mode** (use a test card) and emails are **real** (sent from a Tripsmith Gmail; addresses ending in `@example.com` are never mailed and get their sign-in code on screen). The owner sign-in is public for the demo, so what it sends goes to the demo owner's own inbox. The honest account of every version is in [docs/17-post-launch.md](docs/17-post-launch.md). One of six portfolio projects by [Viraj Domadia](https://virajdomadia.com).
>
> **Live:** [tripsmith.virajdomadia.com](https://tripsmith.virajdomadia.com) · api [tripsmith-api.virajdomadia.com/docs](https://tripsmith-api.virajdomadia.com/docs) · the owner demo sign-in is printed in the site footer; a demo traveller, `traveller.demo@example.com`, has a past and an upcoming trip.

## What it proves

A real product, not a CRUD demo. It has a public catalog that is fast and indexable, and an enquiry path (enquiry → email → PDF) that works with JavaScript off. It has a payment path where every way money can arrive (Checkout's callback, a signed webhook, a sync, an offline mark-paid) settles through one locked function exactly once. And it has an admin that a non-technical owner could actually run. v3 adds an AI agent with tool calling that is held to the same rule as the rest of the site: it can only say what the database says.

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
        │  api — FastAPI (Python 3.12)    │ ◀────▶ orders · payments · links · refunds (httpx)
        │  routers → services → models    │ ◀────  POST /webhooks/razorpay (signed)
        │                                 │        upkeep on demand; weekly keep-awake only
        └───┬─────────┬─────────┬─────────┘
            │         │         │
       PostgreSQL  Vercel    Gmail SMTP · Upstash
    (Supabase)      Blob     email    limits
            │         │
       SQLAlchemy   photos + itinerary PDFs (vouchers, GST documents and trip packs are
       + Alembic    rendered on demand, never stored)
                   │
                   └──▶ POST /revalidate back to the web after every admin write
                        (cache tags: packages, package:<slug>, destination:<slug>)
```

Four decisions carry most of the design:

- **Two deployments, one contract.** `api/openapi.json` is generated from the FastAPI app and committed; `web/src/lib/api-types.ts` is generated from it. CI fails if either is stale, so the web cannot drift from the api it calls.
- **The cache is tag-invalidated, not timed.** Public pages are prerendered and their data fetches carry cache tags; every admin write posts the tags it touched to `/revalidate`, so an owner's price change is visible in seconds rather than at the end of an ISR window.
- **Every visitor-facing path works without JavaScript.** The enquiry form posts natively to `/enquire`, the listing's filters are a GET form, the admin inbox keeps all its state in the URL. JavaScript upgrades them; it is never required.
- **The api is the authority.** The web middleware that gates `/admin/*` is a UX nicety; every admin route declares `require_owner` at router level, so a new route is protected by construction. The same goes for money: the browser describes a party, the api prices it to the paisa (deal and coupon included), and the Razorpay order is built from that server quote only.

## How the agent works

The concierge (v3) is a tool-calling agent with no framework: our own loop over the official `google-genai` SDK, about 250 lines in `api/app/services/ai/`.

```mermaid
flowchart LR
  B["Browser<br/>concierge panel<br/>(state in React memory)"] -- "POST /chat (api domain, CORS)" --> L
  L["Limits<br/>500 chars · 30 / chat<br/>20 / IP / day (Upstash)<br/>100 / day · 1,500 / month"] -- "turn allowed" --> R["Redact phones + emails"]
  L -- "429 / 503" --> F["No-AI quick finder<br/>GET /packages (cached)"]
  R --> T["Tool loop ≤ 5 model calls<br/>Gemini 3.5 Flash Lite<br/>fallback on 429"]
  T <--> TO["Tools (pydantic, extra keys refused)<br/>searchPackages · checkAvailability<br/>startBooking · createEnquiry"]
  T --> G["Guardrail<br/>packages + ₹ amounts ⊆ tool results"]
  G -- "SSE: text-delta · tool-call · tool-result · replace · done / error" --> B
  TO & G --> DB[("Postgres<br/>conversations · messages<br/>chat_budget")]
  L --> DB
  DB --> O["Owner log<br/>/admin/conversations"]
  TO -. "startBooking" .-> S["Book-now sheet, pre-filled<br/>(Razorpay pays, never the chat)"]
  TO -. "createEnquiry" .-> E["Enquiry form in the panel<br/>→ inbox with transcript"]
```

1. **The browser calls the api directly.** It posts to `POST /chat` on the api's domain, not through the web's `/api` rewrite, because the rewrite would hide the visitor's IP from the per-IP limit and could buffer the stream. CORS allows the web origin on `/chat` only, and the CSP's `connect-src` names the api origin.
2. **Limits run before a model is called.** In order: the chat's own cap, the per-IP limit (Upstash), then the site-wide budget. The budget is a row-locked `chat_budget` row in Postgres, so it still holds if Upstash fails open. A refusal is an ordinary `429 { reason }`, and the panel swaps its message box for the **quick finder**: destination · month · budget, run on the listing's own cached search, with no AI and ₹0 cost.
3. **Contact details are redacted.** Phone numbers and emails are removed before the message is stored or sent to the model. Names, phones and emails belong in the forms.
4. **The tool loop.** The model sees a system prompt, the last 20 messages and four tools. Each tool's arguments are a pydantic model that refuses unknown keys, and a bad call goes back to the model as an error. The loop allows at most five model calls, and the last one may not call tools. A 429 or 5xx switches to the fallback model.
5. **The guardrail checks the reply as it streams.** The reply may only name packages and ₹ amounts that a tool returned in this conversation. Prices derived from them (× travellers, a deal's saving) and the visitor's own numbers count as known. On a violation, a `replace` event swaps the text for "Let me check that for you" and the last search runs again, with no model call. An invented price never reaches the browser.
6. **Nothing happens without a person.** `startBooking` opens the Book-now sheet pre-filled; payment stays in Razorpay. `createEnquiry` opens the enquiry form in the panel, and the transcript goes to the owner's inbox.
7. **Everything is logged for the owner.** Each turn's messages, tool calls, results, tokens and errors are saved, even if the visitor closes the tab mid-answer. `/admin/conversations` shows them with each chat's outcome (booking started, enquiry created, no hand-off).
8. **Evals run in two layers.**
   - Fake-model tests run in CI.
   - 23 real-model conversations (`api/evals/`) are run by hand on a second Google project's key: 23/23 at the close.

## Stack

**web/** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui (+ charts, Recharts) · GSAP · react-hook-form + zod · Vitest + Testing Library · pnpm
**api/** FastAPI (Python 3.12) · pydantic v2 · SQLAlchemy 2 + Alembic · PostgreSQL (Supabase, Mumbai) · argon2id owner auth + email-code customer sign-in · Razorpay (orders, Payment Links, refunds, signed webhook) · fpdf2 (itinerary PDFs, vouchers, GST documents, trip packs) · cryptography (Fernet, traveller ID numbers) · Jinja2 + Gmail SMTP (email; Resend as fallback) · Pillow · httpx · pytest · uv
**platform** Vercel (two projects) · Vercel Blob (photos, PDFs) · Upstash Redis (rate limits) · GitHub Actions (web · api · contract) · no crons: the upkeep a cron would do (prices, the bookings sweep, session pruning, PDF cleanup) runs on demand from the reads that need it (2026-11-04)

After v1 shipped, a deep review led to the **v1.0.1 hardening** (PRs #50–#54): content-hashed PDF caching, a daily IST cron, optimistic concurrency in the admin, Sentry scrubbing, hashed sessions, and a lighter first load. It is written up in [docs/17](docs/17-post-launch.md#v101-hardening-2026-09-24). The v2 and v2.5 security passes and their PageSpeed Insights runs are in [docs/12](docs/12-security-performance.md#p19--v25-close-security--performance).

## What is in v3

The AI concierge (rows C1–C6, 2026-11-12 → 14):

- **The panel.** A "trip ticket" panel that stamps what the concierge searched. It shows streaming answers with package cards and live departure lists, and replies in English, Hindi or Hinglish.
- **Booking hand-off.** "Book" opens the package page with the Book-now sheet pre-filled.
- **A person, any time.** "Talk to a person" opens the enquiry form inside the panel, with the transcript attached for the owner.
- **Notify me.** "Email me when new dates are added" sends one email when the owner saves new departures.
- **The quick finder.** It takes over when the free turns run out, and every error state offers a retry, the finder or a person.
- **The owner log.** `/admin/conversations` and a dashboard tile: conversations this week, % booking started, % handed off, days the cap was hit, tokens.
- **Security pass and evals.** Both are in [docs/12](docs/12-security-performance.md#v3-close--concierge-security-pass--final-evals-c6-2026-11-14).

## What is in v2.5

|          |                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Book     | A wide Book-now sheet with a live receipt: add-ons, early-bird tiers and a price ladder, pay in full or a 25 % deposit, GST state and optional GSTIN; honest urgency labels (exact seats left, booked N× in 30 days, likely to sell out); a waitlist on sold-out dates with 24-hour claim holds |
| Browse   | Saved trips (guest → account), compare up to three at `/compare`, trip-leader pages, verified-traveller reviews                                                                                                                                                                                 |
| Customer | Pay the balance in parts, add extras, change date (fee tier, pay or get back the difference), traveller details with a readiness bar, Google/Apple calendar, a trip pack 7 days out, an Activity log                                                                                            |
| Money    | Real refunds through the Razorpay refund API and refund webhooks; receipts, tax invoices and credit notes with gap-free FY numbering; counter booking with a manual discount and Payment Links                                                                                                  |
| Owner    | Every admin page redesigned; a departure calendar; reports with a table and CSV each; automatic trip emails with previews; move any booking; an append-only history per booking                                                                                                                 |
| Under it | Fifteen add-only migrations (`0010`–`0024`); a forced-race test on every new lock path; `PUBLIC_DEMO_OWNER` keeps the public owner login out of real inboxes and full ID numbers                                                                                                                |

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
  tests/            95 vitest files (707 tests)
api/        FastAPI (Python 3.12, uv)
  app/routers/      site/ (catalog, enquiries, pdf, views, meta, health, bookings, webhooks,
                    vouchers, account) · admin/ (packages, images, destinations, enquiries,
                    dashboard, bookings, coupons, reviews) · auth.py
  app/services/     catalog/ · booking/ (pricing, orders, payments, webhook, coupons, desk…) · account
                    · reviews · enquiries · admin_enquiries · enquiry_reply · auth/ · email/ · pdf/ · images
  app/infra/        db · razorpay · storage (Blob) · email · ratelimit · revalidate · cache · client_ip · observability
  app/models/ schemas/ · middleware.py (request id, blank params, fresh, security headers) · errors.py
  alembic/ content/ scripts/seed.py · tests/ (1,073 pytest, DB harness)
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

`--local` mirrors photos to `api/.seed-photos` (served at `/seed-photos`); without it they upload to Vercel Blob. The seed is the same: `--database-url` (or `SEED_DATABASE_URL`) is required. Production is a deliberate, separate command with Supabase's **session pooler** URL (port 5432) pasted in: `ALEMBIC_URL='postgresql+asyncpg://postgres.<ref>:…@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?ssl=require' uv run alembic upgrade head`, and `uv run python scripts/seed.py --database-url '<same URL>'`. The api's `DATABASE_URL` is the **transaction pooler** (port 6543), where `make_engine` turns the statement caches off.

Checks: `pnpm lint` · `pnpm typecheck` · `pnpm test` — each fans out to both languages. `pnpm gen:api` dumps `api/openapi.json` from the app and regenerates `web/src/lib/api-types.ts`; run it after any route or schema change (a pytest fails while `openapi.json` is stale, a vitest while `api-types.ts` is). DB tests need `TEST_DATABASE_URL` (any throwaway Postgres; CI runs a `postgres:17` service) and skip without it — unless `REQUIRE_DB_TESTS=1` (set in CI), which fails the run instead. CI also gates api coverage at 94 % (`uv run --directory api coverage run -m pytest`, then `coverage report`), audits both lockfiles, runs gitleaks, and runs the Playwright journeys (`pnpm --filter web e2e` with `E2E_DATABASE_URL` set to a throwaway database whose name contains `e2e`; see `web/playwright.config.ts`).

## Roadmap

The 17-step project lifecycle (kept with the portfolio's planning notes, outside this repo) — v1, v2, v2.5, v2.6 and v3 have each closed steps 8–17 (each later version re-entered at step 3 with a re-validation).

**v1** agency website ✅ → **v2** booking engine (Razorpay checkout, accounts, deals, reviews, coupons) ✅ → **v2.5** strengthen (17 features from live operators, plus counter booking and an admin redesign) ✅ → **v2.6** hardening ✅ → **v3** AI concierge (chat that searches the real catalog, books, and hands off to a human) ✅ — **Tripsmith is complete.** v4 "Tripsmith anywhere" (an MCP server) and the add-ons are parked, out of plan.

Each later version re-enters the lifecycle at step 3 with a short re-validation before any code.
