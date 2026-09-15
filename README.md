# Tripsmith

**Trips planned in a chat.** A travel-agency site with an AI concierge that plans an itinerary from real packages and starts the booking for you.

> Status: step 8 in progress — v1 re-planned as structure C (Skeleton → Browse → Enquire → Manage → Harden); milestone 1.0 *Skeleton live* started 2026-09-13 (S1 clean slate ✅, S2 accounts & keys ✅ — Neon, Upstash, Blob, Resend, Sentry wired into Vercel; S3 toolchains ✅ — uv/ruff/pyright/pytest for api, root scripts run both languages, CI runs both; S4 FastAPI skeleton ✅ — app factory, settings, error envelope, `/health`, `/meta`, committed `openapi.json`, `vercel.json`; S5 contract + typed client ✅ — generated `api-types.ts`, typed `api()` client; S6 web shell ✅ — `(site)`/`(admin)` route groups, unstyled placeholder home showing `/meta`, `/revalidate` hook; S7 CI ✅ — jobs `web` · `api` (postgres:17) · `contract`, required on `main`; S8 observability ✅ — Sentry in both halves + Vercel Analytics; S9 dropped in the 2026-09-15 lean re-cut — both deploys already live; S10 database ✅ + S11 seed ✅ — SQLAlchemy models, Alembic `0001_v1`, 2 genuine Goa packages seeded with CC photos in Vercel Blob, `GET /packages` on the placeholder home; S12 visual direction ✅ — K · Ocean + Marigold confirmed, tokens + DM Sans locked in `globals.css`; **milestone 1.0 done** — next 1.1 Browse: F1+F2 catalog reads). Steps 1–7 of 17 are done for the whole product (v1–v4) in the shared [project lifecycle](../PROCESS.md). One of six portfolio projects by [Viraj Domadia](https://virajdomadia.vercel.app). **Live:** https://tripsmith.vercel.app (skeleton: tokens locked, real pages arrive in 1.1) · api https://tripsmith-api.vercel.app (`/docs`, `/health`, `/meta`); custom domain `tripsmith.virajdomadia.com` deferred until the domain is bought.

## What it proves
AI agent with tool calling · MCP server · Razorpay payments · SEO content site

## Stack
**web/** Next.js (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Playwright · pnpm — **api/** FastAPI (Python 3.12) · pydantic · OpenAPI · PostgreSQL (Neon) + SQLAlchemy + Alembic · own session auth · fpdf2 · Razorpay · pydantic-ai · `mcp` SDK · pytest · uv — **contract** `api/openapi.json` → generated `web/src/lib/api-types.ts` — Sentry · Vercel (two projects)

## In this repo
```
web/        Next.js 15 (App Router, TypeScript, Tailwind 4, pnpm)
  src/app/            layout.tsx · (site)/ public pages · (admin)/admin owner area · revalidate/route.ts · globals.css
  src/components/     site/ (header, footer, ApiStatus placeholder), ui/
  src/lib/            api.ts (typed client) · api-types.ts (generated from api/openapi.json)
api/        FastAPI (Python 3.12, uv) REST API — skeleton from S4; services/ infra/ models/ arrive with their parts (target layout:)
  app/      main.py · config.py · errors.py · middleware.py · openapi.py · routers/ · services/catalog · infra/ (db, storage, revalidate, observability) · models/ · schemas/
  alembic/  0001_v1 · content/ typed seed content (destinations/, packages/, testimonials.py, photos/ + CREDITS.md) · scripts/seed.py · tests/ (pytest, DB harness)
  openapi.json (generated, committed) · pyproject.toml · uv.lock · vercel.json
PRD.md      product requirements (v1 locked; v1-v4 versions, costs, add-ons)
docs/       lifecycle outputs (steps 3-7): requirements v1-v4, user flows, technical design, architecture, data + API, plan
mockups/    screens.html — ALL v1 screens (S1–S13, A1–A7) in the final K · Ocean + Marigold system; directions-3.html — the direction/palette explorations that led to it; img/ (CC photos, CREDITS.md); showcase.html — Home + Package with motion; directions-2.html (E–H) and direction-variants.html (A–D) — earlier explorations; landing.html — old dummy
brand/      logo, mark and favicon
```

### Run it
```
pnpm install            # web (pnpm workspace) + root scripts
cd api && uv sync       # api (Python 3.12, uv)
cd .. && pnpm dev       # web on :3000 (rewrites /api/* → :8000) and api on :8000, via concurrently
```
Database: `cd api && uv run alembic upgrade head` (uses `DATABASE_URL` from `api/.env.local`, or `ALEMBIC_URL`), then `uv run python scripts/seed.py --local` (photos mirrored to `api/.seed-photos`, served at `/seed-photos`; without `--local` they upload to Vercel Blob). DB tests need `TEST_DATABASE_URL` (any throwaway Postgres; CI runs a `postgres:17` service) and are skipped without it.

Or separately: `cd web && pnpm dev` · `cd api && uv run uvicorn app.main:app --port 8000 --reload` — `http://localhost:8000/docs` is Swagger UI. Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (each fans out to web and `uv run --directory api …`); `pnpm gen:api` dumps `api/openapi.json` from the app (`python -m app.openapi`) and regenerates `web/src/lib/api-types.ts` from it — run it after any route or schema change (a pytest fails while `openapi.json` is stale, a vitest while `api-types.ts` is).

## Roadmap
Follows the 17-step lifecycle: Product Discovery → PRD → Requirements & Scope → Technical Design → Architecture → Database + API Design → Development Plan → Project Setup → MVP Development → Testing → Code Review → Security + Performance → CI/CD → Staging → Production → Monitoring → Post-Launch Review. Steps 1–7 are done for v1–v4; step 8 (Project Setup) is milestone 1.0 "Skeleton live" — restarted at S1 on 2026-09-13 with the FastAPI backend and the structure-C plan.

Versions: **v1** agency website → **v2** booking engine → **v3** AI concierge → **v4** MCP server ("Tripsmith anywhere"). All four versions are fully specified (steps 1–7); each later version starts with a short step-3 re-validation before coding.
