# Tripsmith — Post-launch review (v1, v2)

**Lifecycle step:** 17 of 17 · **Milestones:** 1.4 Harden (v1), 2.3 (v2) · **Written:** 2026-09-24 (v1), 2026-09-27 (v2) · **Covers:** v1, the agency website, and the v1.0.1 hardening pass; v2, the booking engine

v1 is live on [tripsmith.vercel.app](https://tripsmith.vercel.app). This is the honest version of what it took, what held up, what did not, and what v2 inherits. **v2 (the booking engine) has its own section at the end: [v2 — Booking engine](#v2--booking-engine).**

---

## What shipped

|            |                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Span       | 2026-09-13 (S1, clean slate) → 2026-09-24 (H6), PRs #5–#48                                                                                                            |
| Milestones | 1.0 Skeleton · 1.1 Browse · 1.2 Enquire · 1.3 Manage · 1.4 Harden — all closed                                                                                        |
| Rows       | S1–S12, F1–F22, H1–H6 (H5 dropped 2026-09-15; F19 + F20 absorbed into F18)                                                                                            |
| Surface    | 12 public pages · 9 admin screens + sign-in · 29 api endpoints (37 operations)                                                                                        |
| Content    | 6 destinations · 12 packages · 45 departures · 78 CC-licensed photos, all licence-checked                                                                             |
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

**Open items, in the order they should be taken.** Re-validated 2026-09-24 at the start of v2: each item now names where it lands — a v2 row in [07-plan.md](07-plan.md), or why it stays out. (Vercel Web Analytics, formerly item 4, was enabled and redeployed on 2026-09-24 and is removed.)

1. **Enquiry types.** The ORM enum carries three forward-compat values (`callback`, `group`, `chat-handoff`) that the wire enum does not. A row with one would 500 the inbox. Resolve before v2 ships callbacks. → **v2 B1:** the admin schemas take all six with labels; the public form keeps three.
2. **Drop `sessions.token`.** `0003` was expand-only; the contract step (drop the nullable raw-token column) goes in the first v2 migration. → **v2 B1** stops mapping it, **B2** (`0004_v2`) drops it.
3. **A trustworthy performance number** — PSI with a key, or a CI Lighthouse job on a stable host. v1.0.1 removed the known TBT cause; the score has not been re-measured. → **v2 B14:** one PageSpeed Insights run, recorded in docs/12.
4. **Row-lock races are untested by automation.** The `FOR UPDATE` paths (stale-save 409, publish, gallery, the daily price recompute) are reasoned about and hand-checked, not exercised by a concurrent test; only the enquiry dedupe has one. → Not in v2 beyond the last-seat test (B3); the rest stay hand-checked under the lean rule.
5. **Enquiry status transitions are unconstrained.** Any status can move to any other; there is no spec for which moves are legal, so v1.0.1 left it alone. Decide before v2 links bookings to enquiries. → **v2 B1:** a transition table (nothing returns to `new`; `closed` can reopen to `contacted`), 409 otherwise; automatic enquiry → booking linking is a v2 add-on.
6. **The marigold star glyphs on the hotel rows are 2.00:1** against white (H3). Everywhere else
   marigold is a fill with dark text on it, so recolouring the stars is a design decision rather
   than a bug fix — it is the one accessibility item v1 knowingly leaves open, and it is the
   owner's call. → **Decided for v2 (B0/B13):** a darker amber (≥ 3:1) for every star, hotels and reviews, with the number beside it.
7. **Session hygiene** — sessions are only pruned when presented; a cron sweep is a few lines. → **v2 B8:** `/cron/daily` deletes expired sessions.
8. **Blob orphans** — deleting a package or photo leaves the object readable at its URL. → Not in v2: v2 stores no new objects (vouchers rendered on demand, reviews without photos).
9. **Web Sentry source maps** — deferred under the lean rule; web stack traces are minified until a `SENTRY_AUTH_TOKEN` upload is set up. → Not in v2.
10. **Accepted residuals from v1.0.1** — each new random query string on the PDF URL still costs one (cheap) function invocation before its 308 is edge-cached; the thanks page carries the visitor's first name in `?name=` (same-origin referrers only); the enquiry draft cookie is `Path=/`, so it also rides the `/api/*` rewrite (httpOnly, 2-minute life, stripped by the web's forwarding hops).
11. **The demo credentials** are public by design; since v1.0.1 the site says so wherever a visitor types personal details. If this ever stops being a portfolio piece, that is the first thing to remove (docs/12 has the full list of accepted risks). → **v2 B5/B8:** the demo login now also shows bookings, so the notice extends to checkout and sign-in.
12. **Custom domain** — `tripsmith.virajdomadia.com` is deferred until the domain is bought; four env vars and the Resend sending domain change with it. → Not in v2; until then v2 runs in **demo mode** (sign-in codes on screen, customer emails to the owner). The Razorpay webhook URL joins the switch-over list.

**What v2 should not redo:** the visual system, the mockups, or the no-JS discipline. All three are load-bearing and none of them slowed v1 down.

## For the case study

The three things worth telling someone about this build, in order:

1. **The owner journey is the product.** A travel agency site is easy to fake with static pages; the thing that makes it real is that one non-technical person can change a price and watch it reach the public page, the search facets, the OG card and the itinerary PDF. That path is the spine of the whole v1.
2. **Two languages, one contract.** A TypeScript front end and a Python api that cannot drift, because the types are generated and CI refuses staleness.
3. **The hardening rows are where the interesting bugs were.** Not the features — the audits: a robots rule that defeated a noindex, a cache header the platform overrode behind our back, a brand colour that failed contrast on every page, and an anonymisation that anonymised nothing.

---

# v2 — Booking engine

**Milestones:** 2.0 Checkout · 2.1 Webhooks & confirmation · 2.2 Accounts & desk · 2.3 Deals, reviews, coupons, close · **Written:** 2026-09-27 (B14)

v2 turned the enquiry site into a shop: a visitor can pick a date, build a party, pay by Razorpay, get a voucher, sign in to see the trip, cancel it or review it. The owner can run all of that from the admin. Payments are in **Razorpay test mode** and emails are in **demo mode**. Both are deliberate for a portfolio piece, and both are explained on the site where a visitor meets them.

## What shipped

|               |                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Span          | 2026-09-24 (re-validation, #56) → 2026-09-27 (B14), PRs #56–#80                                                                                                                                                                                                                                                                                                                                                                |
| Rows          | B0–B15. B15 (coupon codes) was added on 2026-09-26 and built before this close. Budget went 15 → 17 → 20.5 h                                                                                                                                                                                                                                                                                                                   |
| Checkout      | Live seats and bookable-date reasons; a party builder (double/triple/single + child rates, single supplement); a server-built quote to the paisa with deal and coupon lines; a 10-minute seat hold; Razorpay Checkout in a side sheet; success screen with the voucher. The quote is re-asked on every change and the price counts to its new value                                                                            |
| Payments      | Razorpay orders over httpx; signed confirm; a signed, idempotent webhook (`payment.captured` / `payment.failed`); `sync` for a Checkout that closes without calling back. A late payment on a lapsed hold re-checks seats and confirms, or is marked for a refund                                                                                                                                                              |
| After payment | A PDF voucher rendered on demand (never stored) and attached to the customer's email; the owner's new-booking email; a 30-minute signed voucher link                                                                                                                                                                                                                                                                           |
| Customers     | Email-code sign-in (no passwords); My trips (upcoming / past / cancelled); a booking page with the policy tier marked; cancellation requests; reviews on completed trips                                                                                                                                                                                                                                                       |
| Owner         | Bookings desk (filters, search, payment timeline, mark paid offline, release a hold, refund made, CSV, printable manifest); cancellation approve/reject with a refund pre-filled from the policy tier; reply to an enquiry from the inbox with a package PDF; deals (flat ₹ off per traveller, with an end date); review moderation; coupons (flat ₹ or %, cap, dates, minimum, use limit, one use per email, chosen packages) |
| Daily cron    | Adds to v1's job: tidies lapsed holds, completes departed bookings, prunes sessions and expired codes, and revalidates ended deals                                                                                                                                                                                                                                                                                             |
| Data          | Six add-only migrations (`0004`–`0009`). Each was run on production before its code merged                                                                                                                                                                                                                                                                                                                                     |
| Surface       | 58 documented api paths / 69 operations (v1: 29 / 37) plus the webhook; 3 customer pages; 7 new admin screens                                                                                                                                                                                                                                                                                                                  |
| Tests         | 723 pytest · 466 vitest (538 · 360 at v1.0.1), including the R25 list: the quote to the paisa, last-seat concurrency, 5 webhook replays → 1 payment + 1 email, a forged signature, a late capture with no seats, and the api-level journey (order → signed webhook → confirmed → voucher 200 for the owner, 403 for anyone else)                                                                                               |

v2's bar was a real booking on production, and it was met by test payments: TB-HDLJB7 (confirmed by the Checkout callback), TB-QZ9A7D (the webhook arrived first, then 5 signed replays recorded one payment), and TB-FQEX4P (the voucher emailed and downloaded, then found again after an email-code sign-in).

## What worked

**One path for every way money arrives.** A payment can reach the api four ways: Checkout's callback, the webhook, a sync, or the owner marking it paid offline. All four settle through the same locked function, and a single after-capture hook sends the emails and refreshes the page. Five replays, a callback after the webhook, and a sync after both each leave one payment row and one email. Because of that design, the late-payment and refund cases took a few lines each instead of a rewrite.

**The server owns the price.** The sheet never sends an amount. The deal, the coupon, the child rate and the supplement are all worked out on the api, and the Razorpay order is built from that quote. Deals and coupons arrived late (B12, B15) and slotted in as quote lines without touching Checkout.

**Expand-first migrations.** Each of the six migrations only added things, and each ran on production before the code that used it merged. The site never ran against a schema it did not expect, even though the web and api deploy separately.

**Deciding before building.** Every row started with the open questions written down and answered one at a time, and the answers went into the plan row. Rows B8–B15 were built in a single day largely because of that.

## What did not

**The payment provider's limits were found by paying.** Razorpay's test account caps one payment at ₹15,000, and every Tripsmith trip cost more than ₹20,000. This surfaced at B5, on the first real payment. The fix was two trips under the cap plus a notice in the sheet explaining the limit. The same first payment showed that the CSP needed two undocumented Razorpay hosts, and that `Cross-Origin-Opener-Policy: same-origin` blanks the bank's 3-D Secure popup. None of this was visible from the documentation.

**Checkout does not always call back.** Checkout sometimes closed after a captured payment without running its success handler. That is why `sync` exists, and why the webhook, not the browser, is the source of truth.

**A desk tab shipped broken.** The "Cancellation requested" filter returned a 500 from B10 until B11 found it on production: SQLAlchemy auto-correlated an `EXISTS` subquery against the outer join. The unit tests exercised the service, not that filter through the route.

**Email never left demo mode.** Without a verified sending domain, Resend's test sender reaches only the owner. So sign-in codes are shown on screen and customer emails go to the owner's inbox. It works as a demo, and it is the biggest thing standing between this site and a real one.

**The deep link to the sheet cost the LCP.** `#book` opened the sheet on hydration, so its code downloaded alongside the hero photo, and the one PageSpeed Insights run scored 84 against a bar of 85. Opening it after `load` (#79) took the same run to 94. The sheet was lazy-loaded "on first intent" from B5, but the deep link had quietly been a first intent on every arrival.

**Every migration and prod seed is a handoff.** Writes to the production database are run by the owner by hand, from the PR's worktree, before the merge. That is safe, but it added a pause to six rows.

## Metrics at sign-off

Measured on production.

|                                                              |                                                                                                                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PageSpeed Insights (mobile), package page with Book now open | **94** (FCP 1.2 s · LCP 3.0 s · TBT 100 ms · CLS 0 · SI 2.4 s). The first run scored 84, and #79 fixed that; details in [docs/12](12-security-performance.md#performance-one-pagespeed-insights-run-r25) |
| CSP                                                          | 57 URLs, including admin and the signed-in customer pages: **zero violations**                                                                                                                           |
| Webhook                                                      | 5 signed replays on production → 1 payment row, 1 confirmation                                                                                                                                           |
| Voucher                                                      | rendered on demand (under 3 s in the journey test); the signed link and the account download both verified on production                                                                                 |
| Tests                                                        | 723 pytest · 466 vitest, green in CI alongside ruff, pyright, eslint, prettier, tsc and the contract gate                                                                                                |

## What v3 inherits

v1's twelve open items, as they end v2:

- **Closed in v2:** 1 enquiry types (B1); 2 `sessions.token` dropped (B2); 3 a trustworthy performance number (the PSI run above); 5 enquiry transitions (B1); 6 star contrast (B13, `--color-star`); 7 session pruning (B8).
- **Dropped:** 9 web Sentry source maps. This is setup, not a feature. v2 never needed a readable web trace, and api traces are readable. 10 the v1.0.1 residuals. These are accepted and documented rather than open work, so they now live with v2's in [docs/12](12-security-performance.md#accepted-risks-added-in-v2).

**Open, in the order they should be taken:**

1. **Real email delivery.** Buy the domain (or send over Gmail SMTP), verify it in Resend, and leave demo mode. The switch-over list: four URL env vars, the Resend sending domain, and the Razorpay webhook URL. This is the owner's call and does not block v3.
2. **The demo credentials.** They are public by design. v2 widened what they show (bookings, contact details, cancellations, coupons), and demo mode lets anyone sign in as any customer. v3's concierge conversations will join that list. If this stops being a portfolio piece, these are the first thing to remove.
3. **Lock paths are hand-checked, except the last seat.** The only automated concurrency tests are the last seat (B3) and the enquiry dedupe. The stale-save 409, publish, gallery and daily price recompute are reasoned about, not tested, and so are v2's newer paths: a coupon's last use at hold (contact → departure → coupon lock order) and cancellation approval racing a late capture. Add a concurrent test when v3's agent starts creating bookings, since that is when two writers become real.
4. **Blob orphans.** Deleting a package or photo leaves the object readable at its URL. v2 stored nothing new in Blob. Fix this in the first version that stores user-uploaded objects.

## For the case study (v2)

1. **Money has exactly one door.** Four ways a payment can arrive, one locked function that settles it, one hook that reacts. Replays, races and late payments are dull by construction, which is what you want from the part of a site that takes money.
2. **The price is the server's.** The browser describes a party; the api prices it, deals and coupons included, and Razorpay is asked for exactly that. Adding coupons in the last row meant one new quote line and nothing in Checkout.
3. **The provider taught more than the docs.** A ₹15,000 test cap, two undocumented script hosts, a popup blanked by a security header, a success callback that sometimes never fires. Each one was found by paying for real, which is why the webhook, not the browser, has the last word.
