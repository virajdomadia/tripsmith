# Tripsmith

**Trips planned in a chat.** A travel-agency site with an AI concierge that plans an itinerary from real packages and starts the booking for you.

> Status: step 8 in progress — backend switched to FastAPI on 2026-09-13; v1 re-planned as structure C (Skeleton → Browse → Enquire → Manage → Harden), starting at 1.0.1 (clean slate). Steps 1–7 of 17 are done for the whole product (v1–v4) in the shared [project lifecycle](../PROCESS.md). One of six portfolio projects by [Viraj Domadia](https://virajdomadia.vercel.app). **Live (landing page):** https://tripsmith.vercel.app — will move to `tripsmith.virajdomadia.com` later.

## What it proves
AI agent with tool calling · MCP server · Razorpay payments · SEO content site

## Stack
**web/** Next.js (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Playwright · pnpm — **api/** FastAPI (Python 3.12) · pydantic · OpenAPI · PostgreSQL (Neon) + SQLAlchemy + Alembic · own session auth · fpdf2 · Razorpay · pydantic-ai · `mcp` SDK · pytest · uv — **contract** `api/openapi.json` → generated `web/src/lib/api-types.ts` — Sentry · Vercel (two projects)

## In this repo
```
web/        Next.js 15 (App Router, TypeScript, Tailwind 4, pnpm) — the landing page lives here
  src/app/            layout.tsx, page.tsx, globals.css
  src/components/     landing/ (one component per section), ui/
  src/lib/            api.ts (typed client) · api-types.ts (generated from api/openapi.json)
api/        FastAPI (Python 3.12, uv) REST API — rebuilt from 1.0.4 onwards
  app/      main.py · config.py · errors.py · routers/ · services/ · infra/ · models/ · schemas/
  alembic/  migrations · content/ seed content (Python modules) · scripts/seed.py · tests/ (pytest)
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
cd .. && pnpm dev       # web on :3000 (rewrites /api/* → :8787) and api on :8787, via concurrently
```
Or separately: `cd web && pnpm dev` · `cd api && uv run uvicorn app.main:app --port 8787 --reload`. Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (each fans out to web and `uv run …`); `pnpm gen:api` regenerates `web/src/lib/api-types.ts` from `api/openapi.json`.

## Roadmap
Follows the 17-step lifecycle: Product Discovery → PRD → Requirements & Scope → Technical Design → Architecture → Database + API Design → Development Plan → Project Setup → MVP Development → Testing → Code Review → Security + Performance → CI/CD → Staging → Production → Monitoring → Post-Launch Review. Steps 1–7 are done for v1–v4; step 8 (Project Setup) is milestone 1.0 "Skeleton live" — restarted at 1.0.1 on 2026-09-13 with the FastAPI backend and the structure-C plan.

Versions: **v1** agency website → **v2** booking engine → **v3** AI concierge → **v4** MCP server ("Tripsmith anywhere"). All four versions are fully specified (steps 1–7); each later version starts with a short step-3 re-validation before coding.
