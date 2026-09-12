# Tripsmith v1 — Technical Design

**Lifecycle step:** 4 of 17 · **Version:** v1 "Agency website" · **Approved:** 2026-09-12
**Inputs:** [PRD.md](../PRD.md), [03-requirements.md](03-requirements.md) (R1–R13)
**Outputs feeding:** step 5 architecture, step 6 database + API design
**Forward design for v2 / v3 / add-ons:** [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md) — §0 there lists the v1 schema decisions that keep later versions additive (`users.role`, `itinerary_days.location`, derived `seats_left`, `enquiries.conversation_id`, deal columns, `climate[]` in destination content).

## Stack (shared across all six projects — fixed in `projects/README.md`)
Next.js App Router · TypeScript strict · Tailwind 4 + shadcn/ui · PostgreSQL (Neon) + Drizzle · Better Auth · Vitest + Playwright · GitHub Actions · Sentry · Vercel. Package manager: pnpm.

## v1-specific decisions

| Concern | Decision | Alternative rejected |
|---|---|---|
| Media storage | **Vercel Blob**; `next/image` does resize/format | Cloudinary — transforms we don't need, second vendor |
| PDF | **`@react-pdf/renderer`** in a route handler, cached in Blob | Headless Chrome — heavy on serverless |
| Email | **Resend + react-email** | — |
| Rate limiting | **Upstash Redis** (`@upstash/ratelimit`) via a generic `lib/ratelimit.ts` | Postgres counters — Upstash is reused in v3 for chat quotas (v2 seat holds are Postgres, see the v2/v3 design) |
| Page-view analytics | **Own `package_views` table** + `sendBeacon` | Vercel Analytics — no per-page API on the free tier |
| Search | **Single Drizzle SQL query** `searchPackages()` | Search service — 12 rows |
| CMS | **Custom admin** (it is the portfolio) | Sanity / Payload |
| Seed content | **Typed TS files in `content/`**, upserted by `pnpm db:seed` | JSON / CSV — TS gives type-checking of genuine content |
| Maps (contact) | Google Maps embed iframe, no key | Maps Platform billing |

---

## 1. Rendering strategy

| Page | Mode | Notes |
|---|---|---|
| `/`, `/destinations`, `/destinations/[slug]`, `/packages/[slug]`, `/about`, `/contact`, policies | **Static** via `generateStaticParams`, revalidated on demand | Draft packages are excluded from `generateStaticParams`; direct hit → `notFound()` |
| `/packages?…` | **Dynamic** on `searchParams`; DB query wrapped in `unstable_cache` tagged `packages` | Filters live in the URL (R3) |
| `/admin/**` | Dynamic; server components + server actions; `dynamic = 'force-dynamic'` | Behind auth |
| `/packages/[slug]/itinerary.pdf` | Route handler (Node runtime) | See §5 |
| `/api/view` | Route handler (Edge runtime) | See §8 |

**Revalidation:** every admin mutation ends with `revalidateTag('packages')` (listing + home + destination pages read through tagged queries) and `revalidatePath('/packages/[slug]')` / `revalidatePath('/destinations/[slug]')` for the touched slugs. Sitemap is `dynamic = 'force-static'` and revalidated with the same tag.

## 2. Data & search
- Drizzle schema defined in step 6 (`docs/06-data-and-api.md`). Core tables: `destinations`, `packages`, `itinerary_days`, `departures`, `package_images`, `enquiries`, `enquiry_notes`, `testimonials`, `package_views`, plus Better Auth tables.
- `searchPackages(params)` in `lib/catalog/search.ts`: one query with `WHERE status = 'live'`, optional destination `IN`, theme array overlap (`&&`), `nights BETWEEN`, `starting_price <= budget`, and `EXISTS (SELECT 1 FROM departures WHERE package_id = p.id AND date_trunc('month', date) = :month AND seats_left > 0)` for travel month; `ORDER BY` price/duration. Returns cards with a computed badge. The same function is the v3 `searchPackages` tool.
- Pricing helpers in `lib/catalog/pricing.ts`: `startingPrice(package)` = min over live departures of double-sharing price; `badgeFor(departure)` → `filling-fast | sold-out | guaranteed | null`.
- Seed: `content/destinations/*.ts`, `content/packages/*.ts` (one file per package, typed against the Drizzle insert types), `content/testimonials.ts`. `scripts/seed.ts` upserts by slug; safe to re-run. Seed images in `public/seed/**`, uploaded to Blob on first seed with URLs written back to the DB.

## 3. Forms & mutations
- Every write is a **server action** in `app/**/actions.ts`, validated server-side with **zod** schemas from `lib/validation/*.ts`. Client forms use `react-hook-form` with the same schema for inline errors.
- Enquiry form (R5) also works without JS: it is a plain `<form action={submitEnquiry}>`; success redirects to `/enquiry/thanks?ref=…`.
- Spam: hidden honeypot field (reject if filled), Upstash rate limit `5 / 10 min / IP` on `submitEnquiry` and `10 / 10 min / IP` on login, duplicate suppression (same phone + package within 60 s → return the existing enquiry).
- Admin CRUD forms: shadcn `Form` components; itinerary-day and gallery editors use `useFieldArray` with drag-to-reorder (`@dnd-kit`).

## 4. Media
- Uploads go client → `/api/upload` (server action returning a Blob client token) → Vercel Blob (`@vercel/blob` client upload) → URL stored in `package_images.url`. Validate type (`image/jpeg|png|webp`) and size (≤ 5 MB) server-side. `next/image` with `remotePatterns` for the Blob host.
- Gallery order stored as `position`; cover = position 0.

## 5. PDF
- `GET /packages/[slug]/itinerary.pdf` (Node runtime): look up package + `updatedAt`; key `pdf/{slug}-{updatedAtEpoch}.pdf`. If it exists in Blob → 302 to it. Else render `<ItineraryDocument package={…} />` with `@react-pdf/renderer` → `renderToBuffer` → put to Blob (public) → 302. Old versions are garbage-collected by a weekly cron (`app/api/cron/pdf-gc`).
- The same `renderToBuffer` is used by the enquiry confirmation email to attach the PDF (R6). Template lives in `lib/pdf/itinerary-document.tsx`; fonts (Newsreader, Inter) registered from `public/fonts`.
- Target: A4, < 2 MB, < 3 s cold.

## 6. Email
- Resend via `lib/email/send.ts`; templates in `emails/` with react-email: `enquiry-owner.tsx` (all fields, link to admin detail), `enquiry-customer.tsx` (thanks, what happens next, PDF attached, WhatsApp link).
- Sent **after** the DB write, inside a `try/catch`; failure → `Sentry.captureException`, enquiry flagged `email_status = 'failed'` for the owner to see. The visitor still gets the thanks page.

## 7. Auth
- Better Auth, email + password provider only, `emailAndPassword.disableSignUp = true`; the owner row is created by the seed script from `OWNER_EMAIL` / `OWNER_PASSWORD` env.
- `middleware.ts` protects `/admin/:path*` (redirect to `/admin/login`). Server actions under `/admin` re-check the session (defence in depth).
- Demo credentials on the landing page are rendered from `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` (portfolio demo only).

## 8. Page-view analytics
- Client component on the package page fires `navigator.sendBeacon('/api/view', {slug})` once per session (`sessionStorage` key `viewed:{slug}`).
- Edge route handler validates the slug and does `INSERT … ON CONFLICT (package_id, day) DO UPDATE SET count = count + 1`.
- Dashboard (R12) aggregates the last 30 days. Bots are ignored via a simple UA check; good enough for a portfolio.

## 9. SEO & sharing
- `generateMetadata` per route; canonical from `NEXT_PUBLIC_SITE_URL`.
- JSON-LD components in `components/seo/`: `Organization` (layout), `TouristDestination`, `TouristTrip` + `Offer` (package), `FAQPage` (package FAQ), `BreadcrumbList`.
- `app/sitemap.ts`, `app/robots.ts`.
- `opengraph-image.tsx` for packages and destinations via `next/og` (cover image + name + "from ₹X").

## 10. Testing & CI
- **Vitest**: `searchPackages` filter matrix (against a test DB), `pricing.ts`, zod schemas, `ItineraryDocument` renders to a buffer, CSV export formatting.
- **Playwright**: visitor journey (home → filter → package → enquire → thanks; assert email via Resend test mode or a stubbed sender) and owner journey (login → edit price → public page shows new price). Runs against a **Neon branch** created per CI run from `main`, seeded, deleted afterwards.
- **GitHub Actions**: `ci.yml` — pnpm install → lint (eslint) → typecheck → vitest → build; `e2e.yml` — waits for the Vercel preview deployment, runs Playwright against it. Lighthouse CI on the preview for `/`, `/packages`, one package page with the ≥ 90 / 100 / 100 / 100 budget.

## 11. Observability
- `@sentry/nextjs` (client, server, edge), source maps uploaded in CI. Vercel Analytics for traffic. UptimeRobot HTTP check on `/` every 5 min.

## 12. Environment variables
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_NOTIFY_EMAIL`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD`, `CRON_SECRET`.

## 13. Trade-offs accepted
- **No CMS**: the admin is part of what the portfolio proves.
- **No search service**: SQL over 12 rows; the AI tool reuses it.
- **Static + on-demand revalidation** over SSR: more revalidation plumbing, but ~0 ms pages and free hosting.
- **Own page-view counter** over an analytics API: crude but free and sufficient for a dashboard.
- **Blob-cached PDFs** over pure on-demand: avoids re-rendering on every download; a weekly GC cron handles stale versions.

## 14. Risks
| Risk | Mitigation |
|---|---|
| `@react-pdf/renderer` font/layout quirks | Register fonts explicitly; snapshot-test the buffer size; keep layout simple |
| Vercel Hobby function limits (10 s default) | PDF route on Node runtime with `maxDuration = 30`; measured cold time target < 3 s |
| Blob free-tier storage | 12 packages × 8 images ≈ 30 MB; PDFs GC'd weekly |
| Neon branch creation in CI | Use the Neon GitHub Action; fall back to a shared test DB with per-run schema if quota is hit |
