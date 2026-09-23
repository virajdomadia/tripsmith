# Tripsmith — Security + Performance

**Lifecycle step:** 12 of 17 · **Milestone:** 1.4 Harden · **Started:** 2026-09-23 (H2 performance)

> The security half (H4) is not written yet — this file currently covers **H2 Performance** only.
> H4 appends the security checklist below its own heading.

---

## H2 — Performance

Measured against **production** (`tripsmith.vercel.app`, api `tripsmith-api.vercel.app`), not a
local build: local numbers flatter every one of the things this row is about — edge cache, cold
starts, image-optimizer headers.

Two instruments, for two different jobs:

- **Lighthouse 12 CLI**, mobile form factor, default simulated throttling — this is the row's
  acceptance bar (`≥ 90 perf`) and the only thing that produces a score. A DevTools trace does
  not: the score is ~30 % TBT, 25 % LCP, 10 % each FCP/SI/CLS, and a trace reports no TBT.
- **Chrome DevTools navigation traces** at the same emulation profile (412 × 823 @ DPR 1.75,
  4× CPU, Slow 4G) — used to *find* defects, because they expose the LCP subpart breakdown and
  the per-request timings that a Lighthouse score aggregates away.

### Acceptance: Lighthouse mobile, production

Baseline, 2026-09-23, before the fixes in this row:

| Page | **Score** | FCP | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|---|
| `/` | **91** | 1.1 s | 2.5 s | 300 ms | 0 | 2.1 s |
| `/packages` | **96** | 1.1 s | 2.4 s | 100 ms | 0 | 3.3 s |
| `/packages/[slug]` | **93** | 1.2 s | 3.0 s | 150 ms | 0 | 1.7 s |

All three clear the bar. CLS is a clean zero everywhere — every image is a `fill` inside an
explicit aspect-ratio box. The weakest sub-scores are **home TBT (300 ms, 0.78)** and **package-page
LCP (3.0 s, 0.77)**; those are where a future regression will show first.

<!-- H2-AFTER: re-run the three URLs after this row deploys and add the after-column. -->

### Diagnostics: what the traces found, and what changed

DevTools traces on the same three pages reported LCP 1,395 / 784 / 1,166 ms with CLS 0.00. Those
are **warm-cache reload** figures and are much rosier than the Lighthouse numbers above, which
load on a clean profile — the gap is exactly why the trace is a diagnostic here and not the bar.
What the traces were good for was three concrete defects:

**1. Optimized images from `public/` were served with `max-age=0`.** Vercel's image optimizer
inherits the upstream `Cache-Control` of a file served out of `public/`, which is
`public, max-age=0, must-revalidate`. Blob-hosted photos came back with `max-age=3600` on the same
optimizer (observed on the response; `api/app/infra/storage.py` sets no max-age, so that value
comes from Blob's own default, not from us).
→ `images.minimumCacheTTL = 86400` in [next.config.ts](../web/next.config.ts).

**Be precise about what this buys**, because the trace is easy to misread. The trace showed the
hero answering **`304` after a 605 ms round trip** — but a `304` only happens when the response is
*already* in the browser cache, i.e. on a **repeat** visit. So:

- *Repeat visitor:* was a 605 ms revalidation round trip on Slow 4G before the LCP could paint;
  now zero network for 24 h. This is the real win and it is large.
- *First visit* (what Lighthouse grades): the bytes must be downloaded either way. `max-age=0`
  also expires Vercel's own optimizer cache entry, so a cold request could re-fetch and re-encode
  the source rather than serve a stored variant — a smaller, origin-side saving.

**The home LCP in the table above should therefore be expected to move only modestly, if at all.**
A day is long enough to cover a session and short enough that a redeployed photo settles within a
day; the optimizer URL (`/_next/image?url=/home/hero.jpg&…`) is stable across deploys, so a longer
TTL would strand a changed hero.

**2. No LCP image carried `fetchpriority="high"`.** Chrome's *LCP request discovery* check failed
on all three pages. `priority` on `next/image` emits the `<link rel=preload>` in Next 15 but
passes `fetchPriority` straight through from props — nothing derives it from `priority` — so the
hero was requested at **Low** and only promoted once layout reached it: 758 ms of load delay on
`/`, 633 ms on the package page.
→ explicit `fetchPriority="high"` on the home hero, on any `priority` [Photo](../web/src/components/site/Photo.tsx)
(package and destination heroes) and on the admin login cover. That is every `priority` image in
`web/src`, and exactly one renders per viewport on each page, so none compete.

**3. `PackageCard` asked for a full-width image on tablets.** Its `sizes` jumped from `100vw`
straight to the 1024 px breakpoint, but the card sits in a `sm:grid-cols-2 lg:grid-cols-3` grid,
so between 640 px and 1023 px each card is ~50vw. `DestinationTile`, same grid, already had the
step. → `(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw`.
**This one cannot move the score**: at Lighthouse's 412 px viewport `sizes` resolves to `100vw`
and the same 750w candidate is chosen before and after. It is a real saving for tablet users and
nothing else.

All three are pinned by [tests/image-perf.test.tsx](../web/tests/image-perf.test.tsx), including
an assertion on `minimumCacheTTL` itself — it reads as an arbitrary number in the config and would
otherwise be a tempting cleanup.

**Checked and left alone:** `sizes` on every other `next/image` matches its container to within a
candidate step (the listing's `ResultsGrid` resolves ~446 px against a declared 400 px at ≥1280 px,
which lands on the same 828w candidate at DPR 2); `next/font/google` DM Sans is self-hosted with
`display: swap` and the `latin` subset, preloaded — no external font request, no FOIT; no
render-blocking third party (Sentry and Vercel Analytics both load after paint).

### Cache-Control

| Response | Header | How verified |
|---|---|---|
| api public `GET`s | `public, s-maxage=60, stale-while-revalidate=300` | **Production.** `X-Vercel-Cache: HIT` at ~0.2 s on repeats. The bare `Cache-Control: public` a client sees is Vercel consuming `s-maxage` at the edge, not a stripped header. |
| api reads tagged by web (`?fresh=1`) | `no-store` | Source + 06 §C0. `FreshQueryMiddleware`, by design: on-demand revalidation must not wait out the edge TTL. |
| api writes, admin, auth, `/views`, errors | `no-store` | Source audit: every `Cache-Control` in `api/` comes from `app/infra/cache.py` or an explicit `no-store`. |
| `/packages/[slug]` HTML | `public, max-age=0, must-revalidate`, `X-Vercel-Cache: PRERENDER` | **Production.** SSG, 1 h stale time. |
| `/`, `/destinations`, `/about`, `/contact` HTML | `private, no-cache, no-store` | **Production.** `force-dynamic` — see the ruling. |
| `/packages` HTML | `private, no-cache, no-store` | **Production.** Dynamic because it awaits `searchParams`, *not* via `force-dynamic`. |
| optimized images | `public, max-age=86400, must-revalidate` | **Local only** (`next build && next start`, cold optimizer cache: `max-age=0` → `max-age=86400`). Not yet observed on Vercel — this row's change is not deployed at the time of writing. |

The public-GET row covers every public `GET` in 06 §C-REST — `/health`, `/meta`, `/packages`,
`/packages/:slug`, `/packages/:slug/departures`, `/packages/:slug/itinerary.pdf`, `/destinations`,
`/destinations/:slug`, `/home` — all of which take their header from `PUBLIC_CACHE_CONTROL`; the
five listed above were additionally confirmed against production by hand.

> **Method note.** An early reading that showed `no-store` on every api GET was `curl -I` tripping
> the known api-wide `HEAD → 404`; the 404 handler sets `no-store`. Use `curl -s -o /dev/null -D -`
> against this api, never `-I`.

**Ruling — the dynamic public pages stay dynamic.** `/`, `/destinations`, `/about` and `/contact`
declare `force-dynamic` because CI builds with no api reachable and a static page would bake
deploy-time data. `/packages` is dynamic for a different and permanent reason: it awaits
`searchParams`, so it opts out of the full route cache no matter what is declared — adding
`revalidate` there would buy nothing.

The per-visit cost is *mostly* the SSR render — measured TTFB 310–420 ms on `/`, ~300 ms on
`/packages`, against the prerendered package page's 57–73 ms — but not purely, and the exception
matters:

- `/` makes two tagged calls, `/home` at `revalidate: 3600` and `/packages` at `revalidate: 60`,
  so once a minute a render blocks on a live api round trip.
- `/packages` caches per query key at `revalidate: 60`, so the **first visit to any filter
  combination is a cold key** and pays a full api round trip on top of the render. The ~300 ms
  above is the unfiltered listing; a deep filter on a slow connection will be worse.

Neither is worth a build-fragility trade inside a hardening row, and the `/` case is recoverable
later with `revalidate` plus a build-time api stub. Revisit if the unfiltered TTFB regresses past
~500 ms, or if filtered listings turn out to be a common entry point.

### Database: indexes and EXPLAIN

`EXPLAIN (ANALYZE, BUFFERS)` over the hot read paths, run through the real query builders
(`services/catalog/search.apply_filters`, `services/admin_enquiries._with_package`) so the plans
are for the SQL the app actually sends.

At production volume (12 packages, 6 destinations, 45 departures, 60 enquiries) every query is
sub-millisecond, and the planner picks a sequential scan wherever a table is a few dozen rows —
correct behaviour, and it tells you nothing about whether an index is right. So the one table that
grows without bound, `enquiries`, was also checked at **50,000 rows** in a throwaway clone.
(`packages`, `destinations` and `testimonials` are hand-made; `package_views` is one row per
package per day, ~4,400 a year at twelve packages — neither can run away.)

| Query | Plan | Time |
|---|---|---|
| `search_packages`, no filters | Index Scan `ix_packages_status_featured` → quicksort | 0.17 ms |
| `search_packages`, every filter set | Nested loop over the same index + `uq_destinations_slug`; departures seq-scanned at 45 rows | 7.0 ms |
| `get_package` by slug | Index Scan `uq_packages_slug` | 0.46 ms |
| departures for a package from today | `uq_packages_slug` + departures seq scan (45 rows) | 0.07 ms |
| `departure_availability`, upcoming with seats | Seq scan (45 rows) | 0.03 ms |
| **inbox page 1, status tab — 50k rows** | **Index Scan Backward `ix_enquiries_status_created_at`** + Memoize on the package join | **0.43 ms** |
| inbox status count — 50k rows | Bitmap Index Scan `ix_enquiries_status_created_at` | 3.8 ms |
| inbox date range (no status) — 50k rows | Bitmap Index Scan on the same index, `Index Searches: 5` — Postgres 18 skips the leading `status` column rather than ignoring the index | 1.5 ms |
| inbox "All" tab, page 1 — 50k rows | Seq scan + top-N heapsort (no status to narrow on) | 38.7 ms |
| inbox `q` search — 50k rows | Seq scan (`ILIKE '%…%'` cannot use a b-tree) | 6.1 ms |

`(status, created_at)` is the right composite for the inbox: equality on the tab, ordered scan for
the sort, and the `LIMIT 50` stops the scan after 56 rows. Nothing needs adding for v1 — the two
seq scans are the unfiltered tab and the substring search, both under 40 ms at a volume the site
will not reach for years. If the inbox ever does slow down, the fixes in order are a
`created_at DESC` index for the "All" tab and `pg_trgm` on `name`/`phone` for the search box; both
are cheap to add later and neither earns its keep now.

### Known risk: `seed.py` overwrites photos at a stable URL

Owner-uploaded images are safe from the 24 h image TTL — every upload mints a fresh pathname
(`packages/{slug}/uploads/{new_id()}.{ext}`), so an edited photo is a new URL and a new optimizer
key. Two paths do reuse a URL for new bytes:

- the six files under `web/public/` (`home/hero.jpg`, `home/about-{1,2}.jpg`, `about/{beach,lake}.jpg`,
  `auth/login.jpg`), whose optimizer URLs are stable across deploys;
- `scripts/seed.py`, which writes `packages/{slug}/{file}.jpg` through a store configured with
  `x-add-random-suffix: 0` and `x-allow-overwrite: 1`.

So replacing a seeded photo in place and re-running `seed.py` against production leaves the old
optimized image served for up to 24 hours. Rename the file instead, or accept the delay.

### Not done here

- No `lighthouse.yml` workflow — dropped in the 2026-09-15 lean re-cut. This row is a manual run,
  recorded above.
- **TBT was not tuned.** It is the largest single drag on the home score (300 ms, sub-score 0.78)
  and nothing in this row touches it. The likely candidates are the home `SearchBar` and the
  listing's filter panel hydrating on the main thread. Left for a later row, deliberately: this
  one was scoped to images, fonts, cache headers and query plans.
- The 14.4 kB of legacy-JavaScript polyfills Chrome flags is Next's own build output; Chrome
  estimates 0 ms FCP/LCP saving from removing it. Left alone.
