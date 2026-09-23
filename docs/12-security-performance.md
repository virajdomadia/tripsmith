# Tripsmith — Security + Performance

**Lifecycle step:** 12 of 17 · **Milestone:** 1.4 Harden · **Started:** 2026-09-23 (H2 performance)

> The security half (H4) is not written yet — this file currently covers **H2 Performance** only.
> H4 appends the security checklist below its own heading.

---

## H2 — Performance

Measured 2026-09-23 against **production** (`tripsmith.vercel.app`, api `tripsmith-api.vercel.app`),
not a local build: local numbers flatter every one of the things this row is about (edge cache,
cold starts, image optimizer headers).

**Method.** Chrome DevTools performance traces through `chrome-devtools-mcp`, emulating
Lighthouse's mobile profile — 412 × 823 at DPR 1.75, **4× CPU throttling, Slow 4G** — one
navigation trace per page. Backend plans come from `EXPLAIN (ANALYZE, BUFFERS)` (see
[Database](#database-indexes-and-explain)).

### Results

| Page | Rendering | LCP | CLS | TTFB (cold, `curl`) | HTML | First-load JS |
|---|---|---|---|---|---|---|
| `/` | dynamic | **1,395 ms** | 0.00 | 310–420 ms | 163 kB | 193 kB |
| `/packages` | dynamic | **784 ms** | 0.00 | ~300 ms | 121 kB | 193 kB |
| `/packages/[slug]` | prerendered (SSG) | **1,166 ms** | 0.00 | **57–73 ms** | 150 kB | 237 kB |

All three are inside the "good" CWV thresholds (LCP ≤ 2,500 ms, CLS ≤ 0.1) on a throttled
mid-range phone, which is what the milestone's "Lighthouse mobile ≥ 90 perf" bar asks for. CLS is
zero on every page because every image is a `fill` inside an explicit aspect-ratio box.

The numbers above are the **baseline**, measured before the three fixes below. They are re-measured
on production after this row deploys; the after-column lands here in the same pass.

### What the traces found, and what changed

**1. The optimized hero was re-validated on every single visit.** Vercel's image optimizer
inherits the upstream `Cache-Control` of a file served out of `public/`, which is
`public, max-age=0, must-revalidate`. So `/_next/image?url=/home/hero.jpg&…` — the home page's LCP
element — answered `304` after a full round trip on every navigation: **605 ms of the 1,395 ms
LCP** on Slow 4G. Blob-hosted photos were unaffected (`max-age=3600`, inherited from Blob).
→ `images.minimumCacheTTL = 86400` in [next.config.ts](../web/next.config.ts). One day is long
enough to cover a session and short enough that a redeployed photo at the same path settles
within a day; the optimizer URL is stable across deploys, so a longer TTL would strand a changed
hero. Verified locally: `public, max-age=0` → `public, max-age=86400, must-revalidate`.

**2. No LCP image carried `fetchpriority="high"`.** Chrome's *LCP request discovery* check failed
on all three pages. `priority` on `next/image` emits the `<link rel=preload>` in Next 15 but
leaves it at default priority, so the hero was requested at **Low** and only promoted to High once
layout reached it — 758 ms of load delay on `/`, 633 ms on the package page.
→ Explicit `fetchPriority="high"` on the home hero and on any `priority` [Photo](../web/src/components/site/Photo.tsx),
which covers the package and destination heroes. The preload link now carries it too.

**3. `PackageCard` asked for a full-width image on tablets.** Its `sizes` jumped from `100vw`
straight to the 1024 px breakpoint, but the card sits in a `sm:grid-cols-2 lg:grid-cols-3` grid,
so between 640 px and 1023 px each card is ~50vw. Every card on `/packages` and `/` downloaded
roughly a 2× candidate in that range. `DestinationTile`, same grid, already had the step.
→ `(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw`.

All three are guarded by [tests/image-perf.test.tsx](../web/tests/image-perf.test.tsx) so a future
`priority` image or card cannot quietly drop them.

**Already correct, checked and left alone:** `sizes` on every other `next/image` (they match their
containers); `priority` only on above-the-fold heroes; `next/font/google` DM Sans self-hosted,
`display: swap`, `latin` subset, preloaded via the `Link` header — no external font request, no
FOIT; no render-blocking third-party script (Sentry and Vercel Analytics both load after paint).

### Cache-Control

| Response | Header | Notes |
|---|---|---|
| api public `GET`s (`/home`, `/packages`, `/packages/:slug`, `/destinations`, `/meta`) | `public, s-maxage=60, stale-while-revalidate=300` | Confirmed serving **`X-Vercel-Cache: HIT`** at ~0.2 s on repeat requests. Vercel consumes `s-maxage`/`stale-while-revalidate` at the edge and forwards a bare `Cache-Control: public` to the client — that is the CDN doing its job, not a stripped header. |
| api reads tagged by web (`?fresh=1`) | `no-store` | `FreshQueryMiddleware`, by design (06 §C0): on-demand revalidation must not wait out the edge TTL. |
| api writes, admin, auth, `/views`, errors | `no-store` | Verified: every `Cache-Control` in `api/` comes from `app/infra/cache.py` or an explicit `no-store`. |
| `/packages/[slug]` HTML | `public, max-age=0, must-revalidate` + `X-Vercel-Cache: PRERENDER` | SSG with a 1 h stale time. |
| `/`, `/packages`, `/destinations`, `/about`, `/contact` HTML | `private, no-cache, no-store` | `force-dynamic` — see the ruling below. |
| optimized images | `public, max-age=86400, must-revalidate` | Was `max-age=0` for `public/` sources; fixed above. |

**Ruling — the dynamic public pages stay dynamic.** `/`, `/packages`, `/destinations`, `/about`
and `/contact` are `force-dynamic` because CI builds with no api reachable and a static page would
bake whatever the api said at deploy time. The data is not re-fetched per request — each `api()`
call is tagged and cached in Next's data cache for an hour — so the per-visit cost is the SSR
render alone: a measured 300–420 ms TTFB against the package page's 57–73 ms. That is worth
roughly 300 ms on three pages and it is recoverable later with `export const revalidate` plus a
build-time api stub; it is not worth a build-fragility trade in a hardening row. Revisit if TTFB
regresses past ~500 ms.

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
| inbox date range — 50k rows | Bitmap Index Scan `ix_enquiries_status_created_at` | 1.5 ms |
| inbox "All" tab, page 1 — 50k rows | Seq scan + top-N heapsort (no status to narrow on) | 38.7 ms |
| inbox `q` search — 50k rows | Seq scan (`ILIKE '%…%'` cannot use a b-tree) | 6.1 ms |

`(status, created_at)` is the right composite for the inbox: equality on the tab, ordered scan for
the sort, and the `LIMIT 50` stops the scan after 56 rows. Nothing needs adding for v1 — the two
seq scans are the unfiltered tab and the substring search, both under 40 ms at a volume the site
will not reach for years. If the inbox ever does slow down, the fixes in order are a
`created_at DESC` index for the "All" tab and `pg_trgm` on `name`/`phone` for the search box; both
are cheap to add later and neither earns its keep now.

### Not done here

- No `lighthouse.yml` workflow — dropped in the 2026-09-15 lean re-cut. This row is a manual run,
  recorded above.
- The 14.4 kB of legacy-JavaScript polyfills Chrome flags is Next's own build output; changing
  `browserslist` to drop it is a framework-level tweak with no measured FCP/LCP saving (Chrome
  estimates 0 ms for both). Left alone.
