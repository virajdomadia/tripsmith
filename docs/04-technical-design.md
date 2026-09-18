# Tripsmith v1 — Technical Design

**Lifecycle step:** 4 of 17 · **Version:** v1 "Agency website" · **Approved:** 2026-09-12 · **Revised:** 2026-09-12 for the `web/` + `api/` split (see [05-architecture.md](05-architecture.md) §0) · **Revised:** 2026-09-13 — backend switched from Hono to FastAPI
**Inputs:** [PRD.md](../PRD.md), [03-requirements.md](03-requirements.md) (R1–R13)
**Outputs feeding:** step 5 architecture, step 6 database + API design
**Forward design for v2 / v3 / add-ons:** [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md) — §0 there lists the v1 schema decisions that keep later versions additive (`users.role`, `itinerary_days.location`, derived `seats_left`, `enquiries.conversation_id`, deal columns, `climate[]` in destination content).

## Stack (shared across all six projects — fixed in `projects/README.md`)
**web/**: Next.js App Router · TypeScript strict · Tailwind 4 + shadcn/ui · Playwright · pnpm. **api/**: FastAPI (Python 3.12) · uvicorn · pydantic v2 · PostgreSQL (Neon) + SQLAlchemy 2.0 async (asyncpg) + Alembic · own session auth · pytest · uv. **Contract:** FastAPI's OpenAPI document (`api/openapi.json`, committed) → generated `web/src/lib/api-types.ts` (`openapi-typescript`). No `shared/` package. GitHub Actions · Sentry · Vercel (two projects; api uses Vercel's FastAPI preset).

**Split rule:** `web/` renders and collects input; `api/` owns data and logic. Every write below is an HTTP endpoint on `api/`; `web/` calls it through the same-origin `/api/*` rewrite.

**Backend conventions (2026-09-13):** one `FastAPI` instance named `app` in `api/app/main.py`; one Vercel Function on Fluid compute, region `bom1`, `api/vercel.json` → `functions: { "app/main.py": { "maxDuration": 30 } }`; lifespan events create the SQLAlchemy engine lazily. Local dev: `uv run uvicorn app.main:app --port 8000 --reload`. Layout in [05-architecture.md](05-architecture.md) §2.

## v1-specific decisions

| Concern | Decision | Alternative rejected |
|---|---|---|
| Media storage | **Vercel Blob** via its REST API from `infra/storage.py` (no official Python SDK); uploads go through the api as a **server-side proxy** (Pillow checks dimensions, resizes to ≤ 2000 px); `next/image` does resize/format on the way out | Cloudinary — transforms we don't need, second vendor; Blob client uploads from the browser — need a token endpoint and a JS SDK we no longer share |
| PDF | **fpdf2** (pure Python; DM Sans TTF bundled in `api/assets/fonts`) in a route, cached in Blob | Headless Chrome — heavy on serverless; WeasyPrint — native deps on Vercel |
| Email | **Resend REST API (httpx) + Jinja2 HTML/text templates** | Resend Python SDK — synchronous (requests) for a one-POST API |
| Rate limiting | **Upstash Redis REST** (`upstash-redis` package) behind a small sliding-window helper in `infra/ratelimit.py` | Postgres counters — Upstash is reused in v3 for chat quotas (v2 seat holds are Postgres, see the v2/v3 design) |
| Page-view analytics | **Own `package_views` table** + `sendBeacon` | Vercel Analytics — no per-page API on the free tier |
| Search | **Single SQLAlchemy query** `search_packages()` | Search service — 12 rows |
| CMS | **Custom admin** (it is the portfolio); admin forms post to pydantic-validated endpoints and render `fieldErrors` from the envelope | Sanity / Payload |
| Backend | **FastAPI (Python) on Vercel's FastAPI preset**, REST + built-in OpenAPI; the contract crosses the boundary as generated TS types | Hono (TypeScript) — one language, but the Python ecosystem wins for AI agents, MCP and PDF, and the portfolio wants a second language; Next.js server actions — no separate backend. Decided 2026-09-13 |
| Seed content | **Typed Python content modules in `api/content/`** (pydantic `PackageContent` / `DestinationContent`, `define_package(...)`), upserted by `uv run python scripts/seed.py` | JSON / CSV — pydantic gives validation of genuine content at import time |
| Maps (contact) | Google Maps embed iframe, no key | Maps Platform billing |

---

## 1. Rendering strategy

| Page | Mode | Notes |
|---|---|---|
| `/`, `/destinations`, `/destinations/[slug]`, `/packages/[slug]`, `/about`, `/contact`, policies | **Static** via `generateStaticParams`, revalidated on demand | Draft packages are excluded from `generateStaticParams`; direct hit → `notFound()` |
| `/packages?…` | **Dynamic** on `searchParams`; DB query wrapped in `unstable_cache` tagged `packages` | Filters live in the URL (R3) |
| `/admin/**` | Dynamic; server components fetching the API with cookies; `dynamic = 'force-dynamic'` | Behind auth |
| `api GET /packages/:slug/itinerary.pdf` | FastAPI route | See §5 |
| `api POST /views` | FastAPI route | See §8 |

**Revalidation across the split:** web fetches carry `next: { tags }` (`packages`, `package:<slug>`, `destination:<slug>`). After every admin mutation the api calls `POST {WEB_URL}/revalidate` with `REVALIDATE_SECRET` and the affected tags; the web route handler runs `revalidateTag`. Sitemap uses the `packages` tag.

## 2. Data & search
- Lives entirely in `api/app/services/catalog` + `api/app/infra/db.py` + `api/app/models/`. SQLAlchemy 2.0 async ORM (asyncpg driver, Neon pooled URL `postgresql+asyncpg://…`); schema defined in step 6 (`docs/06-data-and-api.md`); migrations by Alembic (`uv run alembic upgrade head`). Core tables: `destinations`, `packages`, `itinerary_days`, `departures`, `package_images`, `enquiries`, `enquiry_notes`, `testimonials`, `package_views`, plus the own `users` / `sessions` / `verification` tables.
- `search_packages(params)` in `api/app/services/catalog/search.py`, exposed as `GET /packages`: one `select()` with `WHERE status = 'live'`, optional destination `IN`, theme array overlap (`&&`), `nights BETWEEN`, `starting_price <= budget`, and `EXISTS (SELECT 1 FROM departures JOIN departure_availability … WHERE package_id = p.id AND date_trunc('month', date) = :month AND seats_left > 0)` for travel month; `ORDER BY` price/duration. Returns pydantic `PackageCard` objects with a computed badge. The same function is the v3 `searchPackages` tool.
- Pricing helpers in `api/app/services/catalog/pricing.py`: `starting_price(package)` = min over live departures of double-sharing price; `badge_for(departure)` → `filling-fast | sold-out | guaranteed | null`.
- Seed: `api/content/destinations/*.py`, `api/content/packages/*.py` (one module per package, each a `define_package(...)` call returning a validated pydantic `PackageContent`), `api/content/testimonials.py`. `api/scripts/seed.py` upserts by slug; safe to re-run. Seed images in `api/content/photos/**`, uploaded to Blob on first seed (REST uploader in `infra/storage.py`, `--local` flag writes file URLs instead) with URLs written back to the DB.

## 3. Forms & mutations
- Every write is an **api endpoint** validated by a pydantic v2 model in `api/app/schemas/` — the single source of the contract. The request/response types reach `web/` as generated TypeScript (`web/src/lib/api-types.ts`, from `api/openapi.json` via `openapi-typescript`, `pnpm gen:api`); the web form uses `react-hook-form`, posts JSON via the typed client (`web/src/lib/api.ts`) and renders `fieldErrors` from the error envelope inline.
- Constants both sides need (themes, badge labels, limits such as max travellers) live once in `api/app/schemas/meta.py`: they are baked into the generated types as OpenAPI enums and served at runtime by `GET /meta` (public, cached) for anything the UI renders as labels.
- **Client-side mirror (accepted duplication):** the enquiry form (1.2) keeps a small zod schema that mirrors the pydantic rules (phone regex, required fields, adults/children bounds) so validation runs before the round trip. The pydantic model is authoritative; the zod mirror is documented next to it and checked by a test that posts each zod-rejected case to the api and expects `code: "validation"`.
- Enquiry form (R5) also works without JS: a plain `<form method="post" action="/enquire">` hits a tiny web route handler that forwards to `POST /api/enquiries` and redirects to `/enquiry/thanks?ref=…`.
- Spam: hidden honeypot field (reject if filled), Upstash rate limit `5 / 10 min / IP` on `POST /enquiries` and `10 / 10 min / IP` on `POST /auth/login`, duplicate suppression (same phone + package within 60 s → return the existing enquiry).
- Admin CRUD forms: shadcn `Form` components typed from `api-types.ts`; itinerary-day and gallery editors use `useFieldArray` with drag-to-reorder (`@dnd-kit`).

## 4. Media
- Uploads are a **server-side proxy**: browser POSTs `multipart/form-data` to `POST /api/admin/packages/:id/images` (owner) → api checks type (`image/jpeg|png|webp`) and size (≤ 5 MB), Pillow reads dimensions and resizes to ≤ 2000 px on the long edge → `infra/storage.py` PUTs to Vercel Blob over its REST API (`PUT https://blob.vercel-storage.com/<pathname>`, `Authorization: Bearer $BLOB_READ_WRITE_TOKEN`, `x-api-version: 7`, `x-content-type`, `x-add-random-suffix: 0`, `x-allow-overwrite: 1`) → row in `package_images` (`url`, `width`, `height`, `position`). No client-upload token endpoint. `next/image` with `remotePatterns` for the Blob host.
- Gallery order stored as `position`; cover = position 0.

## 5. PDF
- api `GET /packages/:slug/itinerary.pdf`: look up package + `updated_at`; key `pdf/{slug}-{updated_at_epoch}.pdf`. If it exists in Blob → 302 to it. Else `render_itinerary(package) -> bytes` with **fpdf2** → put to Blob (public, REST) → 302. Old versions are garbage-collected by a weekly cron (api `GET /cron/pdf-gc`, api project's `vercel.json`).
- The same `render_itinerary` is used by the enquiry confirmation email to attach the PDF (R6). Renderer lives in `api/app/services/pdf/itinerary.py` (a small `Document` base so the v2 voucher reuses page chrome); DM Sans TTF (regular/bold) bundled in `api/assets/fonts` and registered with `add_font` — Unicode (₹, en dashes) works only through registered TTFs, never the core fonts.
- Target: A4, < 2 MB, < 3 s cold.

## 6. Email
- Resend over its REST API from `infra/email.py` (`EmailSender` protocol; `ResendSender` with httpx, `NullSender` when `RESEND_API_KEY` is unset — the official SDK is synchronous, and the API is one POST). Jinja2 templates in `services/email/templates/`: `enquiry_owner` (every field, reply-to the visitor, link to the admin detail) and `enquiry_visitor` (thanks, reference, what happens next, WhatsApp link; the PDF attaches in F11), each as HTML + plain text, rendered from a plain `EnquiryEmailContext`.
- Sent **after** the enquiry commits, both concurrently, inside the request (nothing after the response is guaranteed on Vercel). Any failure → log + `sentry_sdk.capture_exception`, `email_status = 'failed'`; unconfigured → `'skipped'`; the visitor still gets the 201 and the thanks page. `EnquiryCreated.emailed` is true only when the confirmation reached the visitor's own address.
- **Resend test mode** (`EMAIL_FROM` at `@resend.dev`, no verified domain): Resend delivers only to the account's inbox, so the visitor copy is redirected to `OWNER_NOTIFY_EMAIL` with a `[Test → visitor]` subject and `emailed` stays false. Verifying a domain and changing `EMAIL_FROM` turns real delivery on with no code change.
- The IST timestamp in emails uses a fixed +05:30 offset (no tzdata dependency).

## 7. Auth
- **Own implementation in api/** (`app/services/auth`, `app/routers/auth.py`): `users` (with `role`) and `sessions` tables (see 06 §A2); passwords hashed with argon2 (`argon2-cffi`); no sign-up route in v1 — the owner row is created by the seed script from `OWNER_EMAIL` / `OWNER_PASSWORD` env. Routes: `POST /auth/login` (rate-limited `10 / 10 min / IP`), `POST /auth/logout`, `GET /auth/session`.
- The session cookie carries the opaque `sessions.token` (HttpOnly, `SameSite=Lax`, `Secure` in prod, expiry from `sessions.expires_at`); it is set on the site origin because web proxies `/api/*`. FastAPI dependencies `require_owner` / `require_user` (v2) load the session row and reject with the `unauthorized` / `forbidden` envelope.
- web `middleware.ts` gates `/admin/:path*` by asking `GET /api/auth/session` (redirect to `/admin/login`); api enforces `require_owner` on every `/admin/*` route regardless.
- Demo credentials on the landing page are rendered from `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` (portfolio demo only).

## 8. Page-view analytics
- Client component on the package page fires `navigator.sendBeacon('/api/views', {slug})` once per session (`sessionStorage` key `viewed:{slug}`).
- api route validates the slug and does `INSERT … ON CONFLICT (package_id, day) DO UPDATE SET count = count + 1`.
- Dashboard (R12) aggregates the last 30 days. Bots are ignored via a simple UA check; good enough for a portfolio.

## 9. SEO & sharing
- web: `generateMetadata` per route; canonical from `NEXT_PUBLIC_SITE_URL`. Data comes from the same API reads as the page (deduped by `fetch` cache).
- JSON-LD components in `components/seo/`: `Organization` (layout), `TouristDestination`, `TouristTrip` + `Offer` (package), `FAQPage` (package FAQ), `BreadcrumbList`.
- `app/sitemap.ts`, `app/robots.ts`.
- `opengraph-image.tsx` for packages and destinations via `next/og` (cover image + name + "from ₹X").

## 10. Testing & CI
- **pytest (api)**: pytest + pytest-asyncio + httpx `AsyncClient` against the app. `search_packages` filter matrix, `pricing.py`, pydantic schema edge cases, `render_itinerary` returns a PDF under the size budget, CSV export formatting, plus route tests through the client (auth gates, validation envelope, rate limits). DB-backed tests run against a **real Postgres** from `TEST_DATABASE_URL` (locally PostgreSQL 18 at `C:\Program Files\PostgreSQL\18`; in CI a `postgres:17` service container): the session fixture creates a fresh database, runs `alembic upgrade head`, and truncates all tables between tests. No secrets needed in CI.
- **web**: vitest for the api client and the zod mirror; **Playwright**: visitor journey (home → filter → package → enquire → thanks; assert email via Resend test mode or a stubbed sender) and owner journey (login → edit price → public page shows new price). Runs against a **Neon branch** created per CI run from `main`, seeded, deleted afterwards.
- **Lint / format / types**: ruff (lint + format) and pyright (`basic`) for api; eslint + prettier + tsc for web. Root `package.json` scripts fan out — `pnpm lint` = web eslint/prettier + `uv run ruff check . && uv run ruff format --check .`; `pnpm typecheck` = web tsc + `uv run pyright`; `pnpm test` = web vitest + `uv run pytest`; `pnpm dev` runs both servers with `concurrently`.
- **GitHub Actions**: `ci.yml` — job `web` (pnpm install → lint → typecheck → test → build), job `api` (uv sync → ruff → pyright → pytest with a `postgres:17` service), job `contract` (regenerate `api/openapi.json` and `web/src/lib/api-types.ts`, fail on diff); `e2e.yml` — waits for **both** Vercel preview deployments, runs Playwright against the web preview (whose `API_URL` points at the api preview). Lighthouse CI on the preview for `/`, `/packages`, one package page with the ≥ 90 / 100 / 100 / 100 budget.

## 11. Observability
- web: `@sentry/nextjs` (client, server, edge), source maps uploaded in CI. api: `sentry-sdk[fastapi]` initialised in `infra/observability.py` (the only place it is imported), request + exception capture, release tagged from the Vercel commit SHA. Vercel Analytics for traffic. UptimeRobot HTTP check on `/` and `/api/health` every 5 min.

## 12. Environment variables
**api/** (read by pydantic-settings in `app/config.py`): `DATABASE_URL` (the asyncpg URL, `postgresql+asyncpg://…`, Neon pooled), `SESSION_SECRET`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_NOTIFY_EMAIL`, `WHATSAPP_NUMBER`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`, `CRON_SECRET`, `WEB_URL`, `REVALIDATE_SECRET`, `SITE_URL`; dev/CI only: `TEST_DATABASE_URL`.
**web/**: `API_URL` (server-side base for rewrites/fetch), `REVALIDATE_SECRET`, `SENTRY_DSN` (server + edge), `NEXT_PUBLIC_SENTRY_DSN` (browser; same value), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD`.

## 13. Trade-offs accepted
- **Separate api/ instead of server actions**: two deploys and a revalidation hook, in exchange for a real documented API and a backend that other clients (MCP, future mobile) can use.
- **Python backend instead of one-language TS** (2026-09-13): the trade is a generated-types step (`openapi.json` → `api-types.ts`, checked in CI) instead of a shared package, plus one small zod mirror for the enquiry form, in exchange for the Python ecosystem for AI (pydantic-ai), MCP (official SDK) and PDF (fpdf2), and a language-diverse portfolio.
- **No CMS**: the admin is part of what the portfolio proves.
- **No search service**: SQL over 12 rows; the AI tool reuses it.
- **Static + on-demand revalidation** over SSR: more revalidation plumbing, but ~0 ms pages and free hosting.
- **Own page-view counter** over an analytics API: crude but free and sufficient for a dashboard.
- **Blob-cached PDFs** over pure on-demand: avoids re-rendering on every download; a weekly GC cron handles stale versions.

## 14. Risks
| Risk | Mitigation |
|---|---|
| fpdf2 fonts / Unicode: core fonts are Latin-1 only, so `₹` and dashes need a registered TTF; long itinerary text needs manual page breaks | Bundle DM Sans TTF in `api/assets/fonts` and `add_font` at render; `multi_cell` with auto page breaks; test asserts the PDF opens and stays < 2 MB; keep layout simple |
| Cold start of the Python function (SQLAlchemy + pydantic import, engine creation) | Fluid compute keeps instances warm between requests; engine created lazily in lifespan and reused; no heavy imports at module top (fpdf2, Pillow, pydantic-ai loaded inside the service that needs them); measured cold time target < 3 s |
| Vercel Hobby function limits (10 s default) | `api/vercel.json` `maxDuration = 30` for the single function; measured cold time target < 3 s |
| Extra hop web → api on SSR | public pages are static (tags + revalidation), so the hop happens at build/revalidate, not per request; admin pages are owner-only |
| Blob free-tier storage | 12 packages × 8 images ≈ 30 MB; PDFs GC'd weekly |
| Neon branch creation in CI | Use the Neon GitHub Action; fall back to a shared test DB with per-run schema if quota is hit |
