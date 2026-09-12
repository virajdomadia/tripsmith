# Tripsmith

**Trips planned in a chat.** A travel-agency site with an AI concierge that plans an itinerary from real packages and starts the booking for you.

> Status: steps 1–7 of 17 done for the whole product (v1–v4); next step 8 (Project Setup) — milestone 1.0 in the shared [project lifecycle](../PROCESS.md). One of six portfolio projects by [Viraj Domadia](https://virajdomadia.vercel.app). **Live (landing page):** https://tripsmith.vercel.app — will move to `tripsmith.virajdomadia.com` later.

## What it proves
AI agent with tool calling · MCP server · Razorpay payments · SEO content site

## Stack
**web/** Next.js (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Playwright — **api/** Hono (TypeScript) · OpenAPI · PostgreSQL (Neon) + Drizzle · Better Auth · Razorpay · Vercel AI SDK · MCP SDK · Vitest — **shared/** zod schemas + types — Sentry · Vercel (two projects)

## In this repo
```
web/        Next.js 15 (App Router, TypeScript, Tailwind 4) — the landing page lives here
  src/app/            layout.tsx, page.tsx, globals.css
  src/components/     landing/ (one component per section), ui/
  src/lib/
api/        Hono (TypeScript) REST API — folder structure only until milestone 1.0
  src/routes · modules · infra · openapi.ts
  content/  seed content · scripts/seed.ts · tests/
shared/     zod schemas + TS types shared by web and api (created in 1.0)
PRD.md      product requirements (v1 locked; v1-v4 versions, costs, add-ons)
docs/       lifecycle outputs (steps 3-7): requirements v1-v4, user flows, technical design, architecture, data + API, plan
mockups/    landing.html — the design source the web/ page was ported from
brand/      logo, mark and favicon
```

### Run the landing page
```
cd web
pnpm install
pnpm dev
```

## Roadmap
Follows the 17-step lifecycle: Product Discovery → PRD → Requirements & Scope → Technical Design → Architecture → Database + API Design → Development Plan → Project Setup → MVP Development → Testing → Code Review → Security + Performance → CI/CD → Staging → Production → Monitoring → Post-Launch Review. Steps 1–7 are done for v1–v4; next is step 8 (Project Setup), milestone 1.0.

Versions: **v1** agency website → **v2** booking engine → **v3** AI concierge → **v4** MCP server ("Tripsmith anywhere"). All four versions are fully specified (steps 1–7); each later version starts with a short step-3 re-validation before coding.
