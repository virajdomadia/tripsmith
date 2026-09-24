# Tripsmith — Post-launch review (v1)

**Lifecycle step:** 17 of 17 · **Milestone:** 1.4 Harden · **Written:** 2026-09-24 · **Covers:** v1, the agency website, and the v1.0.1 hardening pass

v1 is live on [tripsmith.vercel.app](https://tripsmith.vercel.app). This is the honest version of what it took, what held up, what did not, and what v2 inherits.

---

## What shipped

|            |                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Span       | 2026-09-13 (S1, clean slate) → 2026-09-24 (H6), PRs #5–#48                                                                    |
| Milestones | 1.0 Skeleton · 1.1 Browse · 1.2 Enquire · 1.3 Manage · 1.4 Harden — all closed                                                |
| Rows       | S1–S12, F1–F22, H1–H6 (H5 dropped 2026-09-15; F19 + F20 absorbed into F18)                                                    |
| Surface    | 12 public pages · 9 admin screens + sign-in · 29 api endpoints (37 operations)                                                |
| Content    | 6 destinations · 12 packages · 45 departures · 78 CC-licensed photos, all licence-checked                                     |
| Tests      | 538 pytest · 360 vitest after v1.0.1 (443 · 283 at v1 sign-off), green in CI on every PR alongside ruff, pyright, eslint, prettier, tsc and a contract-freshness gate |

The acceptance bar for v1 was an owner journey that works end to end without a developer: sign in → change a price → see it on the public page and inside the itinerary PDF. That was met on 2026-09-22 (F18) and re-checked on production.

## What worked

**Generating the contract instead of agreeing on one.** `api/openapi.json` is dumped from the running FastAPI app and committed; `web/src/lib/api-types.ts` is generated from that file; a CI job fails if either is stale. Across 22 feature rows, the web never once called an endpoint that had moved — the failure mode simply cannot survive a commit. It cost about an hour to set up in S5 and repaid it several times over.

**Tag-invalidated caching.** Public pages are prerendered with tagged fetches, and every admin write posts the tags it touched back to `/revalidate`. The owner sees a price change in seconds. The one place this leaked — the api's own edge cache sitting in front of the web's revalidated read — showed up on production as a 4.5-minute delay and was fixed with a `?fresh=1` convention that forces `no-store` on exactly those reads (PR #35).

**Writing the no-JavaScript path first.** The enquiry form posts natively to `/enquire`, the listing filters are a GET form, and the admin inbox keeps every filter in the URL. Building it that way made the JavaScript version a progressive enhancement rather than a rewrite, and it made the whole inbox linkable for free.

**Testing the hard parts only.** The lean re-cut (2026-09-15) dropped blanket test coverage and kept tests for pricing, availability, search, auth, rate limits and the two schema mirrors. The one suite that repeatedly earned its place was `enquiry_cases.json` — a fixture read by _both_ runners, proving the zod mirror in the browser and the pydantic model in the api accept and reject exactly the same inputs.

**The audit rows found real defects, not paperwork.** Each of H1–H4 changed behaviour: a `Disallow` that defeated a `noindex`, an image cache header that Vercel silently overrode, a WhatsApp green that failed AA on every page, an IP column that was reversible. None of them would have surfaced from reading the code alone.

## What did not

**Lighthouse performance could not be measured from this machine.** Nine runs of an unchanged page scored 74–97. The instrument, not the site, was the variable — Lighthouse multiplies observed main-thread time by 4, so background load on a laptop moves the score more than any fix does. H2 closed on HTTP-level facts (cache headers, TTFB, CLS 0.00, LCP element) with the score bar accepted rather than certified. **v2 should measure from PageSpeed Insights with an API key or a CI job**, not from a dev machine. Accessibility had no such problem: axe is deterministic, and H3's 100 across every page means what it says.

**TBT was never tuned.** The home page ships ~193 kB of first-load JavaScript and the sub-score sat at 0.78. It is the one performance risk v1 leaves open. The v1.0.1 review found the cause, and it was not the suspected search bar or filter panel: the Sentry browser SDK, statically imported by `instrumentation-client.ts` and `global-error.tsx`, was ~115 kB gzipped of the chunks every page downloads before `load`. v1.0.1 loads it once the page is idle (errors only, a 51 kB chunk), taking the home page from 192 kB to 134 kB first-load JS (build output) and the JavaScript actually fetched before `load` on a page from 178 kB to 121 kB gzipped; the score itself is still unmeasured (see below).

**Four bugs only appeared when a human used the screen.** A Radix Select that rendered blank, a date formatter printing `undefined NaN`, a gallery grid using viewport breakpoints inside a 320 px sidebar, a dnd-kit id counter causing hydration mismatches. Every one passed its unit tests. The lesson is the obvious one: the admin rows needed a browser pass, and they got one late.

**Deploy ordering bit twice.** A merge deploys web and api independently, so the web's static generation can run against the old api and bake 404s; and Vercel drops a Python package literally named `public` from the bundle (green build, 500 at runtime). Both are recorded in the repo's gotchas because neither is visible from the code.

## Metrics at sign-off

Measured on production, not locally.

|                          |                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighthouse accessibility | **100** on all 13 pages (12 public + sign-in), zero failed audits (H3)                                                                                                                            |
| Lighthouse SEO           | **100** on the listing and package pages; home 92, explained — `force-dynamic` streams metadata into the body for JS-capable clients, and Lighthouse 12 no longer identifies itself as a bot (H1) |
| CLS                      | **0.00** on all three measured pages, every run                                                                                                                                                   |
| TTFB                     | `/` 0.30–0.41 s · `/packages/[slug]` 0.04–0.07 s                                                                                                                                                  |
| Edge cache               | `X-Vercel-Cache: HIT` on the public api GETs at ~0.2 s                                                                                                                                            |
| Images                   | bundled `max-age=31536000, immutable`; Blob `max-age=86400`                                                                                                                                       |
| Hot queries              | every public read sub-millisecond; the inbox at **50,000 enquiries** still 0.43 ms on the status tab (index scan), 38.7 ms on the unfiltered tab                                                  |
| Security headers         | CSP + 5 others on both origins; HSTS platform-provided; `pnpm audit` and `pip-audit` clean                                                                                                        |

There is no traffic data: the site has no audience yet, and the page-view beacon exists so that v2 has a baseline when it does.

## v1.0.1 hardening (2026-09-24)

A deep review of the shipped v1 — every router, every public page, the admin forms and the deploy config — found one class of bug the feature rows had not: things that were correct on the day they shipped and went wrong with time or with a second actor. Five PRs fixed them the same day; prod is migrated to alembic `0003`.

- **#50 backend correctness.** The PDF cache was keyed on `updated_at`, which a departure or seat edit never moved, so the PDF kept stale dates and prices; the key is now a hash of everything the PDF draws. Starting prices went stale as departures passed; a daily `/cron/daily` (01:00 IST) recomputes them and runs the PDF GC. Every "today" is IST. The enquiry dedupe raced under concurrent submits (advisory lock now); no DB connection is held across Blob or Resend calls; `HEAD` returned 404 api-wide; the rate limiter recorded rejected hits; a huge budget 500'd; upload limits disagreed (4 MB everywhere now).
- **#51 public site.** No error boundary and no fetch timeout, so a slow api hung the page; the enquiry form double-submitted; private fields travelled in the no-JS redirect URL (now a short-lived httpOnly cookie); ₹0 departures showed as "₹0"; the form's radio group and error focus failed keyboard users. A demo notice on the form, the thanks page and the privacy policy tells visitors that enquiries are readable with the demo login.
- **#52 infra.** Web functions moved to `bom1`; the Sentry browser SDK is lazy-loaded (First Load JS 192 → 134 kB on `/`); OG tags now follow each page; `alembic` and the seed refuse to run without an explicit database URL.
- **#54 admin.** Save errors on the itinerary and departures lists were invisible; unsaved edits were lost on navigation; two tabs silently overwrote each other (optimistic concurrency via `editedAt`, 409 on a stale save); a slug could change after publish; a live package could be edited out of its publish rules.
- **#53 security.** Sentry events carried the internal secret, visitor IPs and frame locals; sessions were stored as raw tokens (now sha256); the PDF route had no per-IP limit; destination covers accepted any host.

## What v2 inherits

**Ready to build on:** the contract pipeline, the tag-invalidation convention, the seed pipeline with licence-checked photos, the admin shell, the email and PDF services, the rate limiter, and a database whose hot paths have been explained at 50k rows.

**Open items, in the order they should be taken:**

1. **Enquiry types.** The ORM enum carries three forward-compat values (`callback`, `group`, `chat-handoff`) that the wire enum does not. A row with one would 500 the inbox. Resolve before v2 ships callbacks.
2. **Drop `sessions.token`.** `0003` was expand-only; the contract step (drop the nullable raw-token column) goes in the first v2 migration.
3. **A trustworthy performance number** — PSI with a key, or a CI Lighthouse job on a stable host. v1.0.1 removed the known TBT cause; the score has not been re-measured.
4. **Vercel Web Analytics is not switched on.** `@vercel/analytics` is mounted and the CSP allows it, but its script 404s until the owner clicks Enable in the Vercel dashboard. Until then the only page-view data is our own beacon.
5. **Row-lock races are untested by automation.** The `FOR UPDATE` paths (stale-save 409, publish, gallery, the daily price recompute) are reasoned about and hand-checked, not exercised by a concurrent test; only the enquiry dedupe has one.
6. **Enquiry status transitions are unconstrained.** Any status can move to any other; there is no spec for which moves are legal, so v1.0.1 left it alone. Decide before v2 links bookings to enquiries.
7. **The marigold star glyphs on the hotel rows are 2.00:1** against white (H3). Everywhere else
   marigold is a fill with dark text on it, so recolouring the stars is a design decision rather
   than a bug fix — it is the one accessibility item v1 knowingly leaves open, and it is the
   owner's call.
8. **Session hygiene** — sessions are only pruned when presented; a cron sweep is a few lines.
9. **Blob orphans** — deleting a package or photo leaves the object readable at its URL.
10. **Web Sentry source maps** — deferred under the lean rule; web stack traces are minified until a `SENTRY_AUTH_TOKEN` upload is set up.
11. **Accepted residuals from v1.0.1** — each new random query string on the PDF URL still costs one (cheap) function invocation before its 308 is edge-cached; the thanks page carries the visitor's first name in `?name=` (same-origin referrers only); the enquiry draft cookie is `Path=/`, so it also rides the `/api/*` rewrite (httpOnly, 2-minute life, stripped by the web's forwarding hops).
12. **The demo credentials** are public by design; since v1.0.1 the site says so wherever a visitor types personal details. If this ever stops being a portfolio piece, that is the first thing to remove (docs/12 has the full list of accepted risks).
13. **Custom domain** — `tripsmith.virajdomadia.com` is deferred until the domain is bought; four env vars and the Resend sending domain change with it.

**What v2 should not redo:** the visual system, the mockups, or the no-JS discipline. All three are load-bearing and none of them slowed v1 down.

## For the case study

The three things worth telling someone about this build, in order:

1. **The owner journey is the product.** A travel agency site is easy to fake with static pages; the thing that makes it real is that one non-technical person can change a price and watch it reach the public page, the search facets, the OG card and the itinerary PDF. That path is the spine of the whole v1.
2. **Two languages, one contract.** A TypeScript front end and a Python api that cannot drift, because the types are generated and CI refuses staleness.
3. **The hardening rows are where the interesting bugs were.** Not the features — the audits: a robots rule that defeated a noindex, a cache header the platform overrode behind our back, a brand colour that failed contrast on every page, and an anonymisation that anonymised nothing.
