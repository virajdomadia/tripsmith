# Tripsmith

**Trips planned in a chat.** A travel-agency site with an AI concierge that plans an itinerary from real packages and starts the booking for you.

> Status: steps 1–7 of 17 done for the whole product (v1, v2, v3); next step 8 (Project Setup) — milestone 1.0 in the shared [project lifecycle](../PROCESS.md). One of six portfolio projects by [Viraj Domadia](https://virajdomadia.vercel.app). **Live (landing page):** https://tripsmith.vercel.app — will move to `tripsmith.virajdomadia.com` later.

## What it proves
AI agent with tool calling · Razorpay payments · SEO content site

## Stack
Next.js (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL (Neon) + Drizzle · Better Auth · Razorpay · Vitest + Playwright · Sentry · Vercel

## In this repo
```
web/        Next.js 15 (App Router, TypeScript, Tailwind 4) — the landing page lives here
  src/app/            layout.tsx, page.tsx, globals.css
  src/components/     landing/ (one component per section), ui/
  src/lib/
api/        FastAPI backend — folder structure only until the build starts
  app/core · routers · models · schemas · services
  tests/
PRD.md      product requirements (v0, being refined)
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
Follows the 17-step lifecycle: Product Discovery → PRD → Requirements & Scope → Technical Design → Architecture → Database + API Design → Development Plan → Project Setup → MVP Development → Testing → Code Review → Security + Performance → CI/CD → Staging → Production → Monitoring → Post-Launch Review. Steps 1–7 are done for v1, v2 and v3; next is step 8 (Project Setup), milestone 1.0.

Versions: **v1** agency website → **v2** booking engine → **v3** AI concierge. All three versions are fully specified (steps 1–7); each later version starts with a short step-3 re-validation before coding.
