# Tripsmith — Development Plan

**Lifecycle step:** 7 of 17 · **Written:** 2026-09-12
**Inputs:** steps 3–6 for v1 ([03-requirements.md](03-requirements.md)), v2 ([03-requirements-v2.md](03-requirements-v2.md)) and v3 ([03-requirements-v3.md](03-requirements-v3.md)). **Budget:** v1 ≈ 32 h · v2 ≈ 15 h · v3 ≈ 15 h · v4 ≈ 6 h · add-ons only if hours remain.
**Cadence:** evenings/weekends. Each minor milestone ends **deployed to production** — no long-lived unlaunched branches.

How the lifecycle maps onto milestones: step 8 (setup) is milestone 1.0's first task; steps 13 (CI/CD), 15 (production) and 16 (monitoring) are set up **inside 1.0** and then every later milestone cycles through 9 → 10 → 11 → 14 → 15. Steps 12 and 17 close in 1.4. When a milestone starts, its tasks below are expanded into a detailed execution plan (file-level, TDD) before coding.

---

## v1 — Agency website (≈ 32 h)

### Milestone 1.0 — Catalog live, read-only (≈ 8 h)
Goal: the package model is real, seeded with genuine content, and public pages are live at the production URL with CI.

| # | Task | Est. | Done when |
|---|---|---|---|
| 1.0.1 | Accounts & keys: Vercel project, Neon project (+ dev branch), Vercel Blob store, Sentry project, GitHub repo settings, `tripsmith.virajdomadia.com` DNS | 0.5 h | `.env.example` complete; all secrets in Vercel/GitHub |
| 1.0.2 | Scaffold: `create-next-app` (TS strict, Tailwind 4, App Router, pnpm), shadcn/ui init, eslint/prettier, Vitest, Playwright, `lib/infra` adapters (db, storage, observability), folder layout from step 5 | 1 h | `pnpm lint typecheck test build` all green locally |
| 1.0.3 | Drizzle schema `0001_v1` (all v1 tables + ⏩ columns + `departure_availability` view), migrations, `db:migrate` | 1 h | migration applies on a fresh Neon branch |
| 1.0.4 | `definePackage`/`defineDestination` types + `scripts/seed.ts` (upsert by slug, image upload to Blob) | 1 h | `pnpm db:seed` idempotent |
| 1.0.5 | **Genuine content**: 6 destinations, 12 packages (full itineraries, real hotels, 2026 prices, 3–4 departures each), 6 testimonials, seed photos | 2 h | every package passes `setPackageStatus(live)` rules |
| 1.0.6 | `lib/catalog`: `searchPackages`, `getPackage`, `listDestinations`, pricing/badge helpers + unit tests | 1 h | filter matrix tests green |
| 1.0.7 | Pages: `/packages` (listing + FilterBar, URL-driven) and `/packages/[slug]` (gallery + lightbox, itinerary, inclusions, hotels, departures table, occupancy pricing, FAQ, related) — no CTAs yet | 1.5 h | static generation works; Lighthouse ≥ 90 on both |
| 1.0.8 | CI (`ci.yml`: lint → typecheck → unit → build), Sentry wired, first production deploy, UptimeRobot check | 0.5 h | green run on `main`; site live at the subdomain |
| | Design note | | Before 1.0.7, pick the visual direction from a 3-variant mockup page (home + package page), per the usual variant workflow; the chosen variant sets tokens for everything after |

### Milestone 1.1 — It looks like an agency (≈ 6 h)
| # | Task | Est. |
|---|---|---|
| 1.1.1 | Home: hero + search box → `/packages`, featured destinations, popular packages, why-us, testimonials, footer | 2 h |
| 1.1.2 | `/destinations` grid and `/destinations/[slug]` (intro, best months, packages) | 1 h |
| 1.1.3 | About, Contact (map embed, phone, WhatsApp, hours; form wired in 1.2), Terms, Privacy, Cancellation policy — real copy | 1 h |
| 1.1.4 | SEO: `generateMetadata` everywhere, JSON-LD components, sitemap, robots, OG images for packages/destinations, breadcrumbs | 1.5 h |
| 1.1.5 | Share buttons (WhatsApp / copy / native) on package page; WhatsApp floating button with package pre-fill | 0.5 h |
| Done | Lighthouse 90/100/100/100 on `/`, `/packages`, one package; OG card renders in WhatsApp | |

### Milestone 1.2 — The funnel closes (≈ 6 h)
| # | Task | Est. |
|---|---|---|
| 1.2.1 | `lib/pdf`: `ItineraryDocument` (react-pdf, fonts), `renderToBuffer`, Blob cache keyed by `updatedAt`, route `itinerary.pdf`, GC cron | 2 h |
| 1.2.2 | `lib/email`: Resend client, react-email templates (owner notification, customer confirmation with PDF), `email_status` handling | 1 h |
| 1.2.3 | `lib/enquiry.submit` + `submitEnquiry` action: zod, honeypot, Upstash rate limit, dedupe, thanks page; EnquiryForm with standard/customise toggle, progressive enhancement; Contact page form | 2 h |
| 1.2.4 | Sticky mobile CTA bar on package page (price · Enquire · PDF · WhatsApp) | 0.5 h |
| 1.2.5 | Tests: enquiry validation unit tests; Playwright visitor journey (home → filter → package → enquire → thanks); `e2e.yml` against the preview with a Neon branch | 0.5 h |
| Done | A stranger can enquire from a phone and both emails arrive with the PDF attached | |

### Milestone 1.3 — Owner side (≈ 8 h)
| # | Task | Est. |
|---|---|---|
| 1.3.1 | Better Auth (email+password, sign-up disabled, owner seeded), middleware, `/admin/login`, `requireOwner`, demo credentials on landing page | 1 h |
| 1.3.2 | Admin shell (nav, new-enquiry badge) + Dashboard (`getDashboard`, `package_views` beacon + edge route) | 1.5 h |
| 1.3.3 | Destinations CRUD | 0.5 h |
| 1.3.4 | Packages CRUD: PackageForm (react-hook-form + zod), ItineraryEditor (dnd reorder), GalleryUploader (Blob client upload, reorder, cover), departures editor, FAQ/hotels editors, draft ↔ live with publish rules, duplicate, delete guards, revalidation | 3.5 h |
| 1.3.5 | Enquiries inbox: table with filters/search, detail with status, notes, mailto/WhatsApp links, CSV export | 1.5 h |
| Done | Owner journey e2e: login → change a price → public page and PDF reflect it | |

### Milestone 1.4 — Hardening & review (≈ 4 h) — closes lifecycle steps 10–12, 17 for v1
| # | Task | Est. |
|---|---|---|
| 1.4.1 | Test gaps: pricing/badge edge cases, CSV formatting, PDF snapshot size, 404 for drafts, rate-limit behaviour | 1 h |
| 1.4.2 | Security pass (`docs/12-security-performance.md`): auth on every admin action, input validation audit, headers (CSP where feasible, HSTS), secrets audit, dependency audit | 1 h |
| 1.4.3 | Performance pass: Lighthouse CI budget in `lighthouse.yml`, image sizes, font loading, bundle check | 1 h |
| 1.4.4 | Accessibility pass at 360/768/1280: keyboard, focus, contrast, alt text | 0.5 h |
| 1.4.5 | README (architecture diagram, how it works), `docs/17-post-launch.md` (what worked, metrics, next), portfolio case-study entry | 0.5 h |
| Stretch | Best-time strip (add-on B, ~2 h) if under budget; storyboard (E) only if 1.0–1.4 came in ≥ 4 h under | |

**v1 total: ≈ 32 h** (8 + 6 + 6 + 8 + 4).

---

## v2 — Booking engine (≈ 15 h) — requirements: [03-requirements-v2.md](03-requirements-v2.md)
Starts with a step-3 re-validation (30 min): re-read R14–R25 against what v1 actually shipped, adjust, then go.

### Milestone 2.0 — Checkout (≈ 6 h)
| # | Task | Est. | Done when |
|---|---|---|---|
| 2.0.1 | Razorpay test account, keys, webhook endpoint registered (preview + prod), `lib/infra/razorpay.ts` (orders, signature verify) | 0.5 h | order created from a script |
| 2.0.2 | Migration `0002_v2`: bookings, travellers, payments, cancellations, reviews, enquiry_messages, enums; **replace** `departure_availability` view; Drizzle types | 1 h | view returns correct `seats_left` with pending/confirmed/expired fixtures |
| 2.0.3 | `lib/booking`: `quoteBooking` (occupancy rules, child rate, single supplement, deal), state guards, `createBookingOrder` (locked transaction, hold 10 min), `confirmPayment` (HMAC verify, guarded transition) + unit tests incl. last-seat concurrency | 2 h | tests green incl. concurrency |
| 2.0.4 | Book-now UI: departure picker (seatsLeft, badges), travellers builder, live breakdown, contact step, Checkout.js integration, success screen | 2 h | flow works with a Razorpay test card at 360 px |
| 2.0.5 | Deploy; CI green | 0.5 h | production accepts a test-mode booking |

### Milestone 2.1 — Webhooks & confirmation (≈ 3 h)
| # | Task | Est. |
|---|---|---|
| 2.1.1 | `POST /api/webhooks/razorpay`: raw body, signature verify, `payment.captured` / `payment.failed`, idempotent upsert, always 200 after recording | 1 h |
| 2.1.2 | `VoucherDocument` (react-pdf), private Blob storage, authenticated voucher route | 1 h |
| 2.1.3 | Confirmation email (customer, voucher attached) + owner new-booking email; e2e: order → signed test webhook → confirmed → voucher | 1 h |

### Milestone 2.2 — Accounts & admin (≈ 4 h)
| # | Task | Est. |
|---|---|---|
| 2.2.1 | Better Auth email-OTP plugin, OTP rate limit, `/account` shell, attach booking by email at checkout | 1 h |
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
| 3.0.1 | Gemini API key (free tier), `ai` + `@ai-sdk/google` (+ `@ai-sdk/anthropic` optional), `lib/ai/provider.ts` with `AI_PROVIDER`/`AI_MODEL` | 0.5 h | a script streams a reply from both providers |
| 3.0.2 | Migration `0003_v3`: conversations, messages, departure_alerts, ai_generations; enforce `enquiries.conversation_id` FK | 0.5 h | |
| 3.0.3 | `/api/chat`: quotas (per-IP, per-conversation, global), session cookie, persistence, `streamText` with `searchPackages` + `checkAvailability` tools, system prompt v1 | 2 h | tool calls hit the v1 functions; quotas tested |
| 3.0.4 | Concierge UI: launcher, panel (mobile full-height), `useChat`, streaming text, package cards + departure lists from tool parts, example prompts, privacy note, lazy-loaded | 2.5 h | "3 days in Goa under ₹15k" shows correct cards at 360 px |
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
| 3.2.1 | `evals/` harness (Vitest, real provider), 20 scripted conversations with assertions (tools+args, no hallucination, off-catalog refusal, handoff, language, injection); nightly GitHub Actions workflow + manual dispatch | 2 h |
| 3.2.2 | Admin conversation log (list, filters, transcript with tool calls); dashboard tiles (conversations, % booking started, % handoff, quota hits); token usage recorded | 1.5 h |
| 3.2.3 | Notify-me: subscribe action (chat + package page), unsubscribe route, daily cron, emails | 0.5 h |

### Milestone 3.3 — Polish & review (≈ 2 h) — closes lifecycle 10–12, 17 for v3
| # | Task | Est. |
|---|---|---|
| 3.3.1 | Quota-exhausted UX, reduced-motion, error states, bundle check | 0.5 h |
| 3.3.2 | Security pass on chat inputs/tools (zod on every tool, caps, PII audit) → `docs/12-security-performance.md` v3 section | 0.5 h |
| 3.3.3 | Post-launch review (`docs/17-post-launch.md`), README "how the agent works" with diagram, portfolio case study update | 1 h |
| Stretch | Owner-side AI drafting (A, 4 h) → trip-hub packing list (2 h) | |

**v3 total: ≈ 15 h** (6 + 3 + 4 + 2).

## v4 — "Tripsmith anywhere": MCP server (≈ 6 h) — requirements: [03-requirements-v4.md](03-requirements-v4.md)
Starts after 3.3 with a step-3 re-validation (20 min): confirm the MCP SDK/spec version and client landscape.

### Milestone 4.0 — MCP server (≈ 6 h) — the final portfolio version
| # | Task | Est. | Done when |
|---|---|---|---|
| 4.0.1 | Migration `0004_v4` (`mcp_requests`); refactor v3 tools into shared `lib/ai/tools.ts` (name, description, schema, execute) consumed by both `/api/chat` and MCP | 1 h | chat unchanged; unit tests still green |
| 4.0.2 | `app/api/mcp/route.ts` with `mcp-handler`: register 4 tools, rate limits, request logging, error mapping; MCP Inspector smoke test script | 1.5 h | Inspector lists and calls all tools against local |
| 4.0.3 | Resources (`packages`, `packages/{slug}`, `destinations/{slug}`) via `lib/catalog/markdown.ts`; `plan-a-trip` prompt | 1 h | a client reads a package and quotes its price |
| 4.0.4 | Dashboard tile "trips planned via MCP" + top tools; evals MCP driver running the 20 conversations against preview; Inspector smoke test in CI | 1 h | evals pass via MCP |
| 4.0.5 | `/developers` page with install configs; README section + 30 s GIF from Claude Desktop; post-launch review; case study final | 1.5 h | a stranger installs it in < 1 min |
| Stretch | R38 authenticated tools via MCP OAuth (Better Auth as AS) — `myBookings`, `getVoucher` | 3 h | |

**v4 total: ≈ 6 h.**

## Whole-product summary
| Version | Milestones | Hours | Cumulative |
|---|---|---|---|
| v1 | 1.0 – 1.4 | 32 | 32 |
| v2 | 2.0 – 2.3 | 15 | 47 |
| v3 | 3.0 – 3.3 | 15 | 62 |
| v4 | 4.0 | 6 | 68 |
| Add-ons (in priority order) | B best-time (2) · A AI drafting (4) · MCP OAuth tools (3) · D split pay (8) · C trip hub (6) · E storyboard (6) · departure-city (3) | up to 32 | up to 100 |

The PRD budget is ~60 h for v1–v3 plus ~6 h for v4 (68 h). Add-ons are taken only from time saved.

---

## Sequencing rules
1. Never start a milestone with a red CI on `main`.
2. Each milestone = one branch, squash-merged; the merge is the production deploy.
3. Content (1.0.5) is written before the pages that show it — the pages are designed around real data.
4. The visual direction is chosen (variant page) before 1.0.7; no page is styled twice.
5. Add-ons are only picked up when the enclosing version is fully done, including its docs.

## Dependencies to unblock before 1.0
- Domain DNS: `tripsmith` CNAME → Vercel.
- Accounts: Vercel, Neon, Upstash, Resend (verify sending domain `virajdomadia.com`), Sentry, UptimeRobot, GitHub Actions secrets.
- Photos: decide source (own / CC-licensed / generated) for 6 destination covers + ~50 package images — must be licence-clean for a public site.

## Tracking
Progress is tracked in the repo README's status line and a checklist in each milestone PR description. Estimates are re-baselined after 1.0 — if 1.0 runs > 10 h, the v1 stretch items are dropped first.
