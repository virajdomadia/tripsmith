# Tripsmith — Security + Performance

**Lifecycle step:** 12 of 17 · **Milestone:** 1.4 Harden · **Started:** 2026-09-23 (H2 performance)

Five sections live here: **H2 Performance**, **H4 Security**, the v2 close **B14** (security + one PageSpeed Insights run), the v2.5 close **P19** (the same again, for the v2.5 surface), and the **v2.6 hardening audit** (2026-10-14) whose findings the v2.6 rows fix.

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
  4× CPU, Slow 4G) — used to _find_ defects, because they expose the LCP subpart breakdown and
  the per-request timings that a Lighthouse score aggregates away.

### Acceptance: Lighthouse mobile, production — **signed off, not independently certified**

The row's bar is "Lighthouse mobile ≥ 90 perf on the three pages". Measured, it is not a number
this machine can produce reliably. Nine runs of the **same unchanged URL** (`/`), same Lighthouse
12, same mobile profile:

|                  | runs | scores                         |
| ---------------- | ---- | ------------------------------ |
| before the fixes | 1    | 91                             |
| after the fixes  | 8    | 97, 79, 74, 95, 80, 78, 78, 79 |

That is a 74–97 spread on a page that did not change between runs, so **no single run of this is
evidence of anything** — including the 91 → 97 that a naive before/after would have reported.

**The cause is this host, not the site.** From the saved reports:

- Lighthouse's throttling _inputs_ are identical in every run (simulated: 150 ms RTT,
  1,638 Kbps, 4× CPU) and every run loaded the same 33 requests / ~818 kB.
- The **slow** run's observed network was _faster_ than the fast run's (longest request 356 ms vs
  1,120 ms), so the network is not what moved the score.
- `https://example.com` scored **100** from this same machine minutes after `/` scored 78 — but it
  is one request with no JS, so it barely exercises the simulated CPU.
- `/packages/[slug]` moved 93 → 81 with no deploy in between, i.e. both Tripsmith pages degraded
  together while the JS-free control did not.

Lighthouse applies the 4× CPU multiplier to _observed_ main-thread task durations, so background
load on the laptop inflates LCP and Speed Index together — which is exactly the signature in the
data. A dev machine running other work is not a valid Lighthouse host.

**What is actually established**, all verified directly on production at the HTTP level and
independent of any score:

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| CLS             | **0.00 on all three pages, every run** — no layout instability anywhere |
| Bundled images  | `public, max-age=31536000, immutable` on a fresh optimizer key          |
| Blob images     | `public, max-age=86400, must-revalidate` (was 3600)                     |
| Hero payload    | 98 kB webp, 67 ms from the edge                                         |
| TTFB            | `/` 0.30–0.41 s across 12 samples · `/packages/[slug]` 0.04–0.07 s      |
| api public GETs | `X-Vercel-Cache: HIT` at ~0.2 s                                         |
| LCP element     | the hero `<img>`, carrying `fetchpriority`, in every run                |

**Resolved — owner sign-off, 2026-09-23.** Making the `≥ 90` gate rigorous needs a stable host:
a CI job, or PageSpeed Insights with an API key (the keyless PSI quota is exhausted). The
2026-09-15 lean re-cut deliberately dropped `lighthouse.yml`, and Viraj chose to keep it dropped
rather than reinstate CI for this — the score can be spot-checked by hand at
[pagespeed.web.dev](https://pagespeed.web.dev/) whenever it matters. **H2 is therefore marked
complete on the verified deliverables above, with the score bar accepted rather than measured.**

Two things follow from that, and they are the reason this section stays in the file rather than
being deleted with the open item:

- **A future Lighthouse run on a dev machine may well come back in the 70s. That is not a
  regression** — re-read the spread above before investigating. Check the HTTP-level facts first;
  they are cheap, deterministic, and the ones this row actually guarantees.
- The **real** risk this row leaves open is `TBT` (see _Not done here_), not LCP. If the score is
  ever measured properly and falls short, that is where to look — the home page ships ~193 kB of
  first-load JS, and no part of H2 touched it.

### Diagnostics: what the traces found, and what changed

DevTools traces on the same three pages reported LCP 1,395 / 784 / 1,166 ms with CLS 0.00. Those
are **warm-cache reload** figures and are rosier than a clean-profile load — which is why the
trace is a diagnostic here and not the bar. What the traces were good for was three concrete
defects:

**1. Optimized images from `public/` were served with `max-age=0`.** Vercel's image optimizer
inherits the upstream `Cache-Control` of a file served out of `public/`, which is
`public, max-age=0, must-revalidate`. Blob-hosted photos came back with `max-age=3600` on the same
optimizer (`api/app/infra/storage.py` sets no max-age, so that value is Blob's own default).

This took **two passes**, and the first one was wrong on production:

- `images.minimumCacheTTL = 86400` in [next.config.ts](../web/next.config.ts) raises the floor for
  **remote** sources: every Blob photo went `max-age=3600` → `max-age=86400`, confirmed on
  production. That is most of the images on the site.
- It did **not** fix a `public/` source. Vercel forwards the upstream `max-age=0` for a
  same-deployment static asset and the floor does not apply; verified on production against three
  never-before-requested optimizer keys (`X-Vercel-Cache: MISS`, `Age: 0`, still `max-age=0`).
  **`next build && next start` does not reproduce this** — Next's own optimizer applies the floor,
  so a local check reports a fix that Vercel will not honour. Check this one on a deployment.
- The actual fix is a **static import**. Moving the six files from `web/public/` to
  `web/src/assets/` and importing them (`import hero from '@/assets/home/hero.jpg'`) makes Next
  emit a content-hashed `/_next/static/media/hero.<hash>.jpg` served
  `public, max-age=31536000, immutable`; the optimized variant then inherits
  `public, max-age=315360000, immutable`.

**Be precise about what this buys**, because the trace is easy to misread. The trace showed the
hero answering **`304` after a 605 ms round trip** — but a `304` only happens when the response is
_already_ in the browser cache, i.e. on a **repeat** visit. So:

- _Repeat visitor:_ was a 605 ms revalidation round trip on Slow 4G before the LCP could paint;
  now no network at all. This is the real win and it is large.
- _First visit_ (what Lighthouse grades): the bytes must be downloaded either way. **The home LCP
  in the table above should therefore be expected to move only modestly, if at all.**

The content hash also removes the staleness trade-off entirely: a replaced photo is a new hash and
a new URL, so the `immutable` year is free. (That is why the static import beats simply raising the
TTL on the raw `public/` path — `/home/hero.jpg` has no hash, so a long TTL there would strand a
changed hero.)

**2. No LCP image carried `fetchpriority="high"`.** Chrome's _LCP request discovery_ check failed
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

| Response                                        | Header                                                            | How verified                                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| api public `GET`s                               | `public, s-maxage=60, stale-while-revalidate=300`                 | **Production.** `X-Vercel-Cache: HIT` at ~0.2 s on repeats. The bare `Cache-Control: public` a client sees is Vercel consuming `s-maxage` at the edge, not a stripped header.                    |
| api reads tagged by web (`?fresh=1`)            | `no-store`                                                        | Source + 06 §C0. `FreshQueryMiddleware`, by design: on-demand revalidation must not wait out the edge TTL.                                                                                       |
| api writes, admin, auth, `/views`, errors       | `no-store`                                                        | Source audit: every `Cache-Control` in `api/` comes from `app/infra/cache.py` or an explicit `no-store`.                                                                                         |
| `/packages/[slug]` HTML                         | `public, max-age=0, must-revalidate`, `X-Vercel-Cache: PRERENDER` | **Production.** SSG, 1 h stale time.                                                                                                                                                             |
| `/`, `/destinations`, `/about`, `/contact` HTML | `private, no-cache, no-store`                                     | **Production.** `force-dynamic` — see the ruling.                                                                                                                                                |
| `/packages` HTML                                | `private, no-cache, no-store`                                     | **Production.** Dynamic because it awaits `searchParams`, _not_ via `force-dynamic`.                                                                                                             |
| optimized images, remote (Blob) source          | `public, max-age=86400, must-revalidate`                          | **Production.** `minimumCacheTTL` raised the floor from Blob's `3600`.                                                                                                                           |
| optimized images, bundled source                | `public, max-age=315360000, immutable`                            | Inherited from the content-hashed `/_next/static/media/` original. Local build; **re-check on the deployment** — Vercel and `next start` disagree about optimizer cache headers (see finding 1). |

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

The per-visit cost is _mostly_ the SSR render — measured TTFB 310–420 ms on `/`, ~300 ms on
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

| Query                                         | Plan                                                                                                                                    | Time        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `search_packages`, no filters                 | Index Scan `ix_packages_status_featured` → quicksort                                                                                    | 0.17 ms     |
| `search_packages`, every filter set           | Nested loop over the same index + `uq_destinations_slug`; departures seq-scanned at 45 rows                                             | 7.0 ms      |
| `get_package` by slug                         | Index Scan `uq_packages_slug`                                                                                                           | 0.46 ms     |
| departures for a package from today           | `uq_packages_slug` + departures seq scan (45 rows)                                                                                      | 0.07 ms     |
| `departure_availability`, upcoming with seats | Seq scan (45 rows)                                                                                                                      | 0.03 ms     |
| **inbox page 1, status tab — 50k rows**       | **Index Scan Backward `ix_enquiries_status_created_at`** + Memoize on the package join                                                  | **0.43 ms** |
| inbox status count — 50k rows                 | Bitmap Index Scan `ix_enquiries_status_created_at`                                                                                      | 3.8 ms      |
| inbox date range (no status) — 50k rows       | Bitmap Index Scan on the same index, `Index Searches: 5` — Postgres 18 skips the leading `status` column rather than ignoring the index | 1.5 ms      |
| inbox "All" tab, page 1 — 50k rows            | Seq scan + top-N heapsort (no status to narrow on)                                                                                      | 38.7 ms     |
| inbox `q` search — 50k rows                   | Seq scan (`ILIKE '%…%'` cannot use a b-tree)                                                                                            | 6.1 ms      |

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

- ~~the six files under `web/public/`~~ — resolved: they are static imports under
  `web/src/assets/` now, so each one's URL carries a content hash;
- `scripts/seed.py`, which writes `packages/{slug}/{file}.jpg` through a store configured with
  `x-add-random-suffix: 0` and `x-allow-overwrite: 1`.

So replacing a seeded photo in place and re-running `seed.py` against production leaves the old
optimized image served for up to 24 hours (the `minimumCacheTTL` floor). Rename the file instead,
or accept the delay.

**v1.0.1 (2026-09-24).** The Sentry browser SDK no longer ships in the eagerly loaded chunks:
`lib/sentry-browser.ts` imports it once the page is idle (errors only, a 51 kB chunk), taking `/`
from 192 kB to **134 kB** First Load JS and the JavaScript fetched before `load` on `/terms` from
178 kB to 121 kB gzipped. Web functions now run in **`bom1`** (`web/vercel.json`), beside the api
and the database, instead of Vercel's default US region. The score was not re-measured, for the
reason above.

### Not done here

- No `lighthouse.yml` workflow — dropped in the 2026-09-15 lean re-cut. This row is a manual run,
  recorded above.
- **TBT was not tuned.** It is the largest single drag on the home score (300 ms, sub-score 0.78)
  and nothing in this row touches it. Left for a later row, deliberately: this one was scoped to
  images, fonts, cache headers and query plans. (The candidates guessed here — the home
  `SearchBar` and the listing's filter panel — were wrong. The v1.0.1 review traced it to the
  Sentry browser SDK in the eagerly loaded chunks, now loaded after the page is idle;
  docs/17.)
- The 14.4 kB of legacy-JavaScript polyfills Chrome flags is Next's own build output; Chrome
  estimates 0 ms FCP/LCP saving from removing it. Left alone.

---

## H4 — Security

**Method.** Every write endpoint, every auth path and every secret in the repository was read
against the checklist below, then the claims that can be observed from outside were probed against
a build (headers, `/docs`, the login and enquiry paths). Where the audit found something already
correct, the row says so and names the file rather than re-describing it — most of this list was
built into the feature rows, and the useful output of a hardening pass is the short list of things
that were _not_.

### The checklist (the row's acceptance bar)

|                                      | Verdict                                  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSRF-safe forms                      | **Was already safe, now stated**         | The session cookie is `SameSite=Lax`, so a cross-site `POST` never carries it. On top of that both auth route handlers refuse a post whose `Sec-Fetch-Site` is `cross-site` or `same-site` (`web/src/lib/auth/forward.ts` `isSameOriginPost`). The admin write path is `fetch` + cookie through the same-origin `/api` rewrite. The two anonymous writes (`/enquiries`, `/views`) carry no ambient authority, so CSRF does not apply to them.                                                                                                                                                                                                                                                                                                                                                         |
| Security headers                     | **Was missing — added**                  | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy` and `Permissions-Policy` on both origins: `web/next.config.ts` `headers()` and `api/app/middleware.py` `SecurityHeadersMiddleware`. See _Headers_ below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| HSTS                                 | **Platform-provided, verified**          | Vercel already sends `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every response from both projects — checked on production for `tripsmith.vercel.app` and `tripsmith-api.vercel.app`. Setting it again in the app would append a duplicate, not a stronger policy, so it is deliberately absent from both header lists (and a test asserts that).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| No secrets client-side               | **Clean, with one deliberate exception** | The only `NEXT_PUBLIC_*` values are the Sentry DSN (public by design), the site URL, the WhatsApp number, and the **demo owner credentials** — the portfolio's sign-in pill, intentional and documented under _Accepted risks_. `API_URL`, `REVALIDATE_SECRET` and every api secret are read on the server only; no client component reads `process.env`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Validation on every write            | **Clean**                                | All fifteen write routes take a pydantic model or a validated `UploadFile`; none accepts a free-form `dict`. Uploads are gated on `Content-Length`, then on real bytes, then on decoded pixels (`services/images.py`: 4 MB, jpeg/png/webp, ≤ 40 MP, decompression-bomb guard). Request-validation failures render the `validation` envelope with per-field messages (`api/app/errors.py`).                                                                                                                                                                                                                                                                                                                                                                                                            |
| Rate limits verified                 | **Two were right, one was missing**      | `POST /enquiries` 5 / 10 min / IP and `POST /auth/login` 10 / 10 min / IP, both as _router_ dependencies so they run before the body is parsed. `POST /views` had no ceiling at all — the only unauthenticated write without one — and now takes 60 / 10 min / IP behind the bot filter. Real visitor addresses reach the limiter via `X-Client-Ip` + `X-Internal-Secret` (`api/app/infra/client_ip.py`), compared with `secrets.compare_digest` — which is why all three limited endpoints are reached through a **web route handler** rather than the `/api/:path*` rewrite: Vercel rewrites `X-Forwarded-For` to the web function's own egress address on that hop, so a rule keyed off it would bucket every visitor together. H4 added `web/src/app/api/views/route.ts` for exactly that reason. |
| `require_owner` on every admin route | **Clean**                                | All five admin routers declare it at router level (`dependencies=[Depends(require_owner)]`), so a new route in those files is protected by construction rather than by remembering. The web middleware gate is UX only and says so. `/cron/*` is bearer-checked against `CRON_SECRET` with a timing-safe compare and kept out of the OpenAPI document.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Dependency audit                     | **Four advisories, all fixed**           | `pnpm audit --prod`: four postcss advisories reaching us through `next` — two high (arbitrary `.map` file read via an attacker-controlled `sourceMappingURL`), two moderate. Pinned with a `pnpm-workspace.yaml` override to `>= 8.5.23`; re-audit is clean and the production build is green. Python: `pip-audit` over the 343-line resolved `uv` lock — no known vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                                                                   |

Also checked and found clean, because a checklist that only lists what it fixed is not an audit:
no raw SQL anywhere (every query goes through SQLAlchemy constructs, so no injection surface);
argon2id password hashing with an unknown email verified against a cached dummy hash, so login
timing does not reveal which addresses exist; opaque 32-byte session tokens with server-side
expiry (stored hashed since v1.0.1); `safeNext` resolves the post-login target through the URL parser before scoping it to
`/admin`, so `//evil.example/admin` and `/admin/../x` both fall back to the dashboard; the
enquiry detail response never includes `ip_hash`; error envelopes carry no internals (unhandled
exceptions render `Internal server error` plus a request id); `.env*.local` is gitignored and only
the two `.env.example` templates are committed.

### Headers

Both origins are covered because both are reachable: the browser talks to the web, but
`tripsmith-api.vercel.app` answers the internet directly too.

**web** (`next.config.ts`, applied to `/:path*`):

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none';
  frame-src https://maps.google.com https://www.google.com https://api.razorpay.com;
  form-action 'self';
  script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.public.blob.vercel-storage.com; font-src 'self';
  connect-src 'self' https://*.sentry.io https://api.razorpay.com https://lumberjack.razorpay.com;
  upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin-allow-popups
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

These lines are narrower or wider than the obvious default, each for a reason:

- **`frame-src` names Google rather than `'none'`.** The only iframe on the site is the keyless
  Maps embed on `/contact`; `'none'` blanks it. Both hosts are listed because the embed URL
  redirects `maps.google.com` → `www.google.com` and a frame navigation is checked again at the
  redirect target. Drop the map and this tightens to `'none'`.
- **Razorpay hosts, site-wide (B5).** Checkout.js is injected on the Pay click only, but the
  policy is one for every page so there is one thing to verify. A real test payment showed what it
  needs beyond the documented `checkout.razorpay.com` / `api.razorpay.com`: its risk bundle from
  `cdn.razorpay.com` and a tracking call to `lumberjack.razorpay.com`. It asks for `eval` once;
  that stays refused and payments work without it.
- **`Cross-Origin-Opener-Policy: same-origin-allow-popups`, not `same-origin` (B5).** Checkout
  opens the bank / 3-D Secure page as a popup from its frame and writes into it; `same-origin`
  severs that popup from its opener and it stays blank. Other sites' windows still cannot reach
  this one.
- **No `blob:` in `img-src`.** Nothing in the app creates an object URL — the admin uploader posts
  its `File` straight to the api — so the grant would have been decoration.
- **No `interest-cohort` in `Permissions-Policy`.** FLoC is gone and browsers log it as an
  unrecognized feature on every response; a header that prints an error is worse than the absence.

The rule is scoped to `/((?!api/).*)`, i.e. everything the web itself answers. `/api/*` is
rewritten to the api, which sets its own; matching both would put two CSP headers on one response
and browsers enforce the intersection — the api's `/docs` would lose its jsdelivr allowance when
reached through this origin.

`poweredByHeader` is off: `X-Powered-By: Next.js` tells an attacker which advisories to try and
buys nothing.

**api** (`SecurityHeadersMiddleware`): the same non-CSP headers with `Referrer-Policy: no-referrer`,
plus `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` — nothing
the api returns is a document that may load anything. The exception is `/docs` (and the `/docs/oauth2-redirect` helper mounted beside it,
unreachable while the api declares no OAuth2 scheme), whose Swagger UI pulls its bundle from
jsdelivr and boots from an inline script; it gets its own policy, still unframeable. Two implementation notes worth keeping:

- The headers are added in the ASGI send wrapper, not as a route dependency, so they also cover
  the 400/401/404 envelopes that never reach a route function.
- Starlette's `ServerErrorMiddleware` renders the unhandled-500 envelope **outside** every user
  middleware, so a 500 would otherwise ship bare. `errors.envelope()` merges `security_headers()`
  in itself, and the middleware skips keys that are already present. A test asserts the 500 path.

### The CSP trade: `'unsafe-inline'` instead of a nonce

`script-src` allows inline scripts. That is the weaker of the two available policies and it is a
deliberate choice, not an oversight:

- Next's page bootstrap (`self.__next_f.push(…)`) and the JSON-LD blocks are generated per page,
  so they cannot be hashed at build time. The strict alternative is a per-request nonce issued
  from middleware — which makes **every page dynamic** and gives up the static rendering that H2
  measured (13 of 15 public routes are prerendered today).
- What the policy still buys is not nothing: with no remote script origin allowed at all, an
  injected `<script src="https://evil.example/x.js">` does not load, and `object-src 'none'`,
  `base-uri 'self'` and `form-action 'self'` close the three classic injection escalations.
- The residual surface is inline injection, which needs an XSS to begin with. The app renders no
  user-supplied HTML: React escapes everything, `dangerouslySetInnerHTML` appears only in the
  JSON-LD blocks, and those are covered by `web/tests/jsonld-escape.test.ts`.

Revisit if v2 adds user-generated content, where the calculus flips.

### Accepted risks

- **The demo owner credentials are public.** `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD`
  are printed on the sign-in page and in the footer, because the point of the site is that a
  visitor can walk into the admin. Anyone can therefore edit the catalog and read the inbox. The
  blast radius is one demo database with no real customers, no payment data and no PII beyond
  enquiries people chose to submit to a demo; restoring it is a `seed.py` run. **Mitigated in
  v1.0.1:** a `DemoNotice` above the enquiry submit button and on the thanks page, plus a `#demo`
  block in the privacy policy, tells visitors that anyone with the demo login can read enquiries
  and asks for made-up details. If this ever stops being a portfolio piece, that is the first
  thing to remove.
- **`/docs` is public.** It lists the admin routes, which are all `require_owner`-gated. For a
  portfolio api the contract being readable is a feature; nothing in the document is a secret.
- **The rate limiter fails open.** If Upstash is unreachable the request is allowed and the failure
  is reported to Sentry (`infra/ratelimit.py`). Chosen so an outage at a third party cannot stop a
  visitor enquiring; it means a limiter outage is also an unlimited window.
- **Per-IP limits are bypassable by rotating addresses.** True of every IP-keyed limiter; the
  honeypot, the 60-second dedupe and the bot filter are the other layers.
- **Blob objects are not deleted with their rows.** Deleting a package or a photo leaves the
  object at its URL, unreferenced but readable by anyone holding it. Deliberate at portfolio scale
  (v2 add-on).
- ~~**Sessions are never pruned.**~~ Closed in v2 (B8): `/cron/daily` now deletes expired
  sessions. In v1, an expired row was deleted only when next presented; it could never
  authenticate (`find_session` checks `expires_at`), so this was table hygiene, not access.
- **The PDF URL absorbs random query strings one invocation at a time** (v1.0.1). `?anything` is
  a 308 to the bare URL, edge-cached for a day, so a repeated variant never reaches the function;
  each _new_ variant still costs one cheap invocation (no DB, no Blob, no limiter).
- **The enquiry draft cookie is `Path=/`** (v1.0.1). No single path covers the three form pages, so
  the browser also sends it through the `/api/*` rewrite, where FastAPI ignores it. httpOnly,
  SameSite=Lax, Secure on https, 2-minute life, and the web's own cookie-forwarding hops strip it.

**Closed in v1.0.1** (PR #53):

- **Sentry scrubbing.** api: `before_send` drops the secret, client-IP, cookie, auth and forwarding
  headers, request cookies, `REMOTE_ADDR` and `user.ip_address`; stack-frame locals are off
  (`include_local_variables=False`); every configured `SecretStr` is masked anywhere in the event,
  keys included. web server/edge: `lib/sentry-scrub.ts` scrubs the same headers and masks the
  values of server-only `*SECRET` / `*TOKEN` / `*PASSWORD` / `*_KEY` variables.
- **Hashed sessions.** Rows store `sha256(token)` in `token_hash`; the raw token exists only in the
  cookie, so a database read no longer yields a live session (migration `0003`, expand-only; the
  legacy `token` column is dropped in v2).
- **PDF per-IP limit.** `pdf:{ip}` 60 GET / 10 min, keyed on the visitor through a web handler
  (`/packages/[slug]/itinerary.pdf`) like the other limited endpoints.
- **Cover URL host restriction.** A destination cover must be this Blob store's host once a Blob
  token is configured; `http://localhost` is refused on Vercel (`services/catalog/cover_url.py`).

### What changed

1. `web/next.config.ts` — `headers()` and `poweredByHeader: false`.
2. `api/app/middleware.py` — `SecurityHeadersMiddleware` + `security_headers()`, merged into
   `errors.envelope()` for the 500 path.
3. `api/app/routers/site/views.py` — the beacon takes 60 / 10 min / IP, behind the bot check so
   crawlers cost no Upstash quota. Over the limit it stays a silent 204: the browser fires this
   with `keepalive` and ignores the answer, and a 429 would only tell a prober where the ceiling is.
4. `api/app/services/enquiries.py` — `hash_ip` is keyed (blake2b with `SESSION_SECRET`, which was
   provisioned and otherwise unused). IPv4 has ~4.3 billion values, so the previous unsalted sha256
   column was reversible by anyone who could read it — it identified the visitor as precisely as
   the address would have. Unkeyed in dev and CI, where there is nothing to protect — and because
   that degradation is otherwise silent (nothing else reads `SESSION_SECRET` until v2's OTP),
   `create_app` logs an ERROR when the variable is missing on a deployment. It **is** set on the
   production api project, confirmed with `vercel env ls`. Rows written before this change keep
   their old unkeyed digest and are the same 32 hex characters, so old and new values for the same
   visitor do not match; nothing is migrated, and nothing in the product compares them.
5. `web/src/app/api/views/route.ts` — a route handler for the beacon, so the ceiling above is
   keyed on the visitor and not on the rewrite hop.
6. `api/app/main.py` — the startup check above; `SecurityHeadersMiddleware` is also added last,
   which in Starlette means outermost.
7. `pnpm-workspace.yaml` — postcss floor at 8.5.23.

Tests: `api/tests/test_security_headers.py` (7), the two beacon-limit cases and the two `hash_ip`
cases in the existing api files, and `web/tests/security-headers.test.ts` (5 — each assertion is a
decision recorded above, so widening `script-src` or dropping `frame-ancestors` fails a test rather
than passing quietly).

### Verified

- 441 pytest, 280 vitest, ruff/pyright/eslint/prettier/tsc clean, `next build --turbopack` green.
- Headers read off a local production build (`next start`), and every public page plus the admin
  shell walked in Chrome with the console open: **no CSP violations**, photos, fonts, chunks, the
  GSAP page and the `/contact` map all loading. The only console error is the Vercel Analytics
  script 404ing locally; it exists only on Vercel and is same-origin there.
- The first pass of this row shipped `frame-src 'none'`, which blanks the `/contact` map. It was
  caught in review because the page was not in the first verification set — the reason the set is
  now every page rather than three of them.
- HSTS confirmed on production for both origins before deciding not to duplicate it.

---

## B14 — v2 close: security + performance

**Method.** I read the v2 surface (B1–B15: quote and hold, Razorpay orders, confirm and sync, the
webhook, vouchers, customer accounts, My trips, cancellations, the bookings desk, refunds, enquiry
replies, deals, reviews, coupons) against the R25 checklist below. Then I re-checked the headers
in a headless browser against **every page of the production deployment**. The v1 items above
were not re-audited. Two low-severity findings were fixed in their own PR (#78) before this
write-up. A third is recorded as a precondition. The one PageSpeed Insights run missed the bar at 84, so #79 fixed it before sign-off.

### The checklist (R25)

|                                 | Verdict                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw-body webhook verification   | **Clean**                         | `routers/site/webhooks.py` reads the body as bytes and checks `X-Razorpay-Signature` (HMAC-SHA256 under `RAZORPAY_WEBHOOK_SECRET`, `compare_digest`). It does this before parsing JSON and before a database session exists. No secret → 503. Unknown orders → 200, ignored. A replay on a settled payment id records nothing and sends nothing (`test_booking_webhook.py`: 5 replays → 1 payment, 1 email).                                                                                                                                                                        |
| No amounts from the client      | **Clean**                         | No request schema carries an amount. The quote, the hold, the order and the coupon line are computed on the server. The Razorpay order is built from the server quote. An amount in the body is ignored (`test_booking_orders.py`). Capture applies the payment row's own amount, not the event's. Mark-paid takes a reference only, and a refund is capped at what was paid.                                                                                                                                                                                                       |
| Customer routes check ownership | **Clean**                         | `services/account.owned_by`: the booking is mine if its `user_id` is mine, or if it is unattached and its `contact_email` is my verified email. My trips, the booking page, cancellation requests, reviews and the account voucher all use it. The signed voucher link is an HMAC over `voucher:{ref}:{exp}` under `SESSION_SECRET`: the ref is bound and the expiry checked. The link is issued only after a signed confirm, or a sync that carries the booking's order id. The journey test checks voucher 200 for the owner and 403 for anyone else (`test_booking_voucher.py`). |
| Admin routes                    | **Clean**                         | Every admin router, including v2's bookings, coupons, reviews, enquiry replies and the manifest, declares `require_owner` at router level. A customer session gets 403 from the api and a 303 to `/account` from the web.                                                                                                                                                                                                                                                                                                                                                           |
| Rate limits                     | **Clean after #78**               | Booking starts: `booking:{ip}` 5 / 10 min. Code requests: 5 / 15 min per email and 20 / 15 min per IP. 5 tries per code. The try counter is in the database, so it still holds if Upstash fails open. All three limits reach the api through web route handlers that forward the visitor's address. **#78 added** `sync:{ref}` 20 / 10 min, plus the 429 tests for booking starts and sync.                                                                                                                                                                                         |
| CSP allows Razorpay, every page | **Clean, verified on production** | 57 URLs on `tripsmith.vercel.app`, loaded in headless Chromium with a `securitypolicyviolation` listener: the sitemap's 28 pages, a package page with the Book-now sheet open (`#book`), `/account/sign-in`, `/enquiry/thanks`, the 404 page, 24 admin screens signed in as the demo owner, and My trips plus two booking pages signed in as the demo traveller. **Zero violations.** The only report is zod's `new Function("")` probe. The policy refuses it by design and zod falls back without it.                                                                             |
| Input validation and escaping   | **Clean**                         | Coupon, review, cancellation, refund and reply bodies are pydantic models with length, enum and control-character checks. Email templates autoescape. Review text is rendered by React. The only `dangerouslySetInnerHTML` is JSON-LD, which escapes `<`; that now includes the review data in `AggregateRating`.                                                                                                                                                                                                                                                                   |
| Sign-in codes and sessions      | **Clean**                         | Codes are 6 digits from `secrets`, stored as an HMAC under `SESSION_SECRET`, and live 10 minutes. Only the newest code per email works. The customer session cookie is HttpOnly, SameSite=Lax and Secure. Sign-out deletes the session row. Owner addresses cannot use the code flow.                                                                                                                                                                                                                                                                                               |
| Secrets                         | **Clean**                         | `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are `SecretStr` and masked out of Sentry events. The key id is public by design. No new `NEXT_PUBLIC_*` secret.                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Fixed in #78

- **The quote told anyone whether an address had a paid booking.** `POST /bookings/quote` has no
  rate limit and answered `coupon_used_by_email`. So a public code (WELCOME10) plus any address
  worked as an enumeration oracle. "Already used by this email" is now answered only when Pay
  starts the hold, which is rate-limited. The sheet already showed that refusal there. The quote
  keeps the email for one job only: leaving the visitor's own live hold out of the use count.
- **Sync had no limit.** Each sync of a pending booking is a Razorpay API call under the merchant
  key, so looping sync on your own hold could use up the account's API quota. It is now limited
  to 20 per 10 min per booking.

### Accepted risks added in v2

- **Razorpay auto-capture must stay on.** `/confirm` treats a signed Checkout callback as
  captured. Razorpay's signature proves authorisation, not capture. With auto-capture on (the
  account default, and what every production test payment did), the two happen together. If
  auto-capture is ever switched off, a booking would confirm on an authorised payment that
  Razorpay later auto-refunds. The webhook's `payment.captured` stays the source of truth, and
  sync already captures an `authorized` payment.
- ~~**Demo mode lets anyone sign in as any customer email.**~~ **Closed in v2.5 P0:** production
  sends real email through Gmail SMTP, so a sign-in code reaches only the inbox it was asked
  for. What remains is deliberate: addresses at `example.com/.org/.net` (the seeded demo
  traveller, and any made-up address there) still show their code on screen, so anyone can open
  those demo accounts — they hold no real person's data. Real customer emails also go to
  whatever address is typed, so the existing per-email and per-IP limits on codes, enquiries and
  booking starts are what stops the site being used to mail strangers; Gmail's ~500/day cap is
  the backstop.
- **One email can use a coupon twice** by paying two orders (a released hold's order and a new
  one). This is documented in `services/booking/coupons.py`. It costs one extra discount.
- **A narrower coupon oracle remains in the quote.** When a limited coupon's last use is held, a
  quote carrying the holder's email gets a price, while any other address is told
  `coupon_used_up`. This needs a coupon at its exact limit and lasts one 10-minute hold. Closing
  it would make the holder's own re-quote refuse their code.
- **Holding with someone else's email or phone releases their live hold.** R15 allows one live
  hold per email and per phone. A late payment on the released hold still confirms if seats are
  free.
- **Live holds reserve coupon uses**, so someone rotating addresses can tie up a limited coupon
  10 minutes at a time.
- **Bookings made before migration 0006 list travellers in id order**, not the order entered.
- The v1.0.1 residuals above still stand: a new random query string on the PDF URL costs one
  cheap invocation, the thanks page carries the first name in `?name=`, and the enquiry draft
  cookie is `Path=/`.

### Performance: one PageSpeed Insights run (R25)

The run was on [pagespeed.web.dev](https://pagespeed.web.dev/), mobile (emulated Moto G Power, Slow 4G, Lighthouse 13), on production,
against `/packages/kasol-weekend-camp#book`. `#book` opens the Book-now sheet on arrival, and
the report's final frame shows it open. There was no local Lighthouse run, for the reasons in H2. Both runs were
done by hand by Viraj. The first missed the bar, so the fix came before sign-off.

|                                     | Performance | FCP   | LCP   | TBT    | CLS | Speed Index |
| ----------------------------------- | ----------- | ----- | ----- | ------ | --- | ----------- |
| 2026-09-26 23:41 IST, before #79    | 84          | 0.9 s | 4.2 s | 30 ms  | 0   | 4.3 s       |
| **2026-09-27 00:09 IST, after #79** | **94**      | 1.2 s | 3.0 s | 100 ms | 0   | 2.4 s       |

Accessibility 100, Best Practices 96, SEO 100 on both runs.

**What was wrong.** The LCP element was the package's hero photo, not the sheet. Lighthouse's
breakdown put 77 % of LCP in _render delay_: the photo itself arrived in about 1 s (TTFB 0.6 s,
load 0.3 s). `#book` opened the sheet on hydration, and that fetched its five lazy chunks
(~135 kB, 112 kB of it unused at load) inside the LCP window. Lighthouse's simulation charges
everything requested before the LCP to the LCP. Same-host Lighthouse runs, compared only by their
LCP phases and never reported as scores, agreed: the plain page's LCP was ~0.85 s shorter than
`#book`'s, twice in a row.

**The fix (#79).** `afterLoad()` opens the sheet from `#book` after `load` plus an idle
callback (1.5 s cap), so the hero paints before the sheet's code competes for the connection.
A `touched` ref stops a late auto-open from reopening a sheet the visitor already closed. Real
visitors benefit too: on a slow phone the photo now arrives before the booking code, not
alongside it.

**Left as it is.** TBT rose from 30 to 100 ms. The sheet's hydration now lands after `load`, where
TBT counts it, instead of before FCP. That is well inside the budget. PSI still lists "improve
image delivery" (it suggests stronger compression on the hero). Re-encoding the photo as AVIF
was measured: at comparable quality it was no smaller for this photo, so the image path is
unchanged. The ~14 kB of legacy polyfills are Next's own, as in H2.

## P19 — v2.5 close: security + performance

**Method.** v2.5 added a lot of surface: payment links, real refunds, GST documents, traveller
IDs, a waitlist with claim links, counter booking, a trip pack with calendar links, automatic
emails with unsubscribe tokens, saved trips and compare, and reports. Each flow was read against
the checklist below twice: by me, and by three independent read-only reviewers (money; documents
and personal data; signed links, public endpoints and cron). I checked every reviewer finding
against the code. Then, on production and read-only: every new route was called unauthenticated,
every signed link was forged, and the demo traveller's session was tried against someone else's
booking. The CSP sweep was re-run over every page, including the v2.5 ones. `pip-audit` (api) and
`pnpm audit --prod` (web) covered the dependencies. B14's v1 and v2 verdicts were not re-audited.
Two medium findings, two lows, one hardening fix and four outdated dependencies were fixed in #120 before this write-up; one low (L1) is accepted below. The package page's PageSpeed run missed the bar at 82, so
#121 fixed it before sign-off.

### The checklist (R58)

|                                              | Verdict                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payment links and the callback               | **Clean**                         | The callback's HMAC (over `link_id`, `reference_id`, `status`, `payment_id`; `compare_digest`) must name this ref's link and our payment row, and even then it only triggers a sync that reads the paid state from Razorpay (`services/booking/links.py`). A link payment that reaches the webhook as an unknown order is matched only through the signed event's notes, to a row with that link, the same amount and no other order. Capture applies our row's amount, never the event's; links are created with `accept_partial: false`. A forged callback on production → 404.                                              |
| Counter booking and manual discounts         | **Clean**                         | Owner-only. The manual discount comes after deal, early-bird and coupon, in whole rupees, never below ₹1 of fare, with a required reason; there is no upward override. `expectedTotalPaise` only guards against a stale screen (409 `price_changed`): the amount charged is always the server's quote.                                                                                                                                                                                                                                                                                                                         |
| Refunds and the refund webhook               | **Clean**                         | One refund function. What is owed is recomputed under the booking lock and capped at what was paid. The refund row's id is Razorpay's idempotency key; a 4xx is believed only after Razorpay confirms no refund exists under that key; `refund.processed` / `refund.failed` change a row only while it is `requested`. A double click is a 409. A forged webhook on production → 400.                                                                                                                                                                                                                                          |
| Customer money: balance, extras, date change | **Clean**                         | Each route checks ownership with `services/account.owned_by`. Balance parts are bounded by the server (at least ₹1,000 or the rest, at most what is left); extras and date-change amounts are computed by the api, and the client's figure is only a 409 check. Two parts paid at once refund the surplus automatically.                                                                                                                                                                                                                                                                                                       |
| GST documents                                | **Clean**                         | A document key is looked up only among that booking's own documents, so another booking's payment or refund id is a 404. Customers get 401/403 unless they own the booking; the web proxy validates ref and key and answers `private, no-store`. On production the demo traveller got 403 for another customer's invoice.                                                                                                                                                                                                                                                                                                      |
| Traveller details and IDs                    | **Clean after #120**              | IDs are Fernet-encrypted and only the manifest ever shows a decrypted number (the one other `reveal` compares a re-typed number on save and outputs nothing). The desk, CSV, emails, history and Sentry only ever see `XXXX XXXX 1234`; Sentry's denylist scrubs every details field. Customers edit only their own travellers, and details are purged 30 days after return. **#120:** see M2 below.                                                                                                                                                                                                                           |
| Trip pack and calendar links                 | **Clean**                         | The pack's content is added only once it is open (7 days out and fully paid), and its PDF answers 409 to anyone but the owner before that. Calendar links are an HMAC over `calendar:{ref}:{exp}` with a checked expiry (forged → 403 on production); they carry only the trip name, dates and meeting place, and the Google redirect goes to a fixed host. **#120 (hardening):** `.ics` text now also drops a lone CR (it was already unreachable: meeting fields refuse control characters).                                                                                                                                 |
| Waitlist claim links                         | **Clean**                         | HMAC over `waitlist:{entry}:{offer_no}`: a re-offer kills the older link, a lapsed or booked entry fails, and the claim's email must be the entry's. The owner's remove and offer-by-hand are owner-only. A forged claim on production → 404.                                                                                                                                                                                                                                                                                                                                                                                  |
| Unsubscribe and the other signed tokens      | **Clean**                         | Four link signers (`waitlist:`, `unsub:`, `calendar:`, `voucher:`), plus the sign-in code's keyed hash (`otp:`), each with its own prefix and `compare_digest` under `SESSION_SECRET`. The four links fail closed without the secret; the code hash falls back to unkeyed only in local dev. Unsubscribe only reads on GET and acts on POST; `List-Unsubscribe` carries nothing user-controlled.                                                                                                                                                                                                                               |
| Cron                                         | **Clean**                         | Every `/cron/*` router requires the `CRON_SECRET` bearer (timing-safe; unset → 401). The GitHub tick has `permissions: {}` and no inputs. All four (`daily`, `emails`, `waitlist`, `pdf-gc`) declare it; the three probed → 401 on production.                                                                                                                                                                                                                                                                                                                                                                                 |
| Reports and CSVs                             | **Clean**                         | Owner-only (403 for the demo traveller, 401 signed out). The section is an enum, and every text cell goes through `csv_safe`, so a customer's name or reason can't become a formula.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Saved trips and compare                      | **Clean after #120**              | Saves need a session, are rate-limited and capped; compare takes at most three well-formed slugs. **#120:** writes now carry the same-origin guard (L2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Admin routes                                 | **Clean**                         | Every v2.5 admin router (calendar, reports, counter, leaders, emails, and bookings, which carries the waitlist routes) declares `require_owner`; the demo traveller got 403 on each one probed.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| CSP, every page                              | **Clean, verified on production** | 92 URLs on `tripsmith.virajdomadia.com` in headless Chromium with a `securitypolicyviolation` listener: the sitemap's pages, `/compare`, `/leaders`, two package pages with Book now open (`#book`), `/account/sign-in`, `/unsubscribe/…`, `/pay/…`, `/enquiry/thanks` and the 404 page; 47 admin pages signed in as the demo owner (every nav screen, the counter, calendar, reports, email settings, 30+ booking pages and a departure manifest); and My trips plus a booking page signed in as the demo traveller. **Zero violations** apart from zod's `new Function("")` probe, which the policy refuses by design (B14). |
| Dependencies                                 | **Clean after #120**              | `next` 15.5.25 had two moderate ISR cache-poisoning advisories; its `sharp` (librsvg) and postcss's `source-map-js` had one high each; `urllib3` (under sentry-sdk) had three. #120 moves `next` to 15.5.27, floors `sharp` at 0.35.5 and `source-map-js` at 1.2.2, and takes urllib3 2.8.0. Both audits are now clean.                                                                                                                                                                                                                                                                                                        |

### Fixed in #120

- **M1 — the public owner login could make Tripsmith email anyone.** B14 accepted the public demo
  owner login while customer email was held back. P0 made email real. From then on, anyone could
  sign in as the owner, make a counter booking for any address (or reply to an enquiry, with their
  own words) and have Tripsmith's Gmail send it, as often as they liked. That meant phishing under
  the brand, and a way to burn the ~500/day cap that sign-in codes depend on. Now, with
  `PUBLIC_DEMO_OWNER` on (production), every customer email on a booking made at the counter (now
  and from the cron) and every inbox reply goes to the owner's inbox as `[Test → …]`. A web
  booking, whose address the customer typed, still mails them. Sending a booking its details link
  is limited to 3 a day.
- **M2 — the public owner login could read full ID numbers.** P9 promised customers their IDs are
  masked everywhere except the printed manifest, and the manifest was one public sign-in away.
  With `PUBLIC_DEMO_OWNER` on, the manifest masks every real customer's ID. The seeded demo
  bookings (`@example.com`) still print in full, so the feature still shows. The other details
  (date of birth, emergency contact, medical notes) stay readable to the owner, as enquiries
  always were, so the copy on the details form, the booking sheet and `/privacy#demo` now says so
  plainly.
- **L2 — `/account` writes had no explicit same-origin check.** Five of them reach the api through
  the web's rewrite with no route handler in front. Only SameSite=Lax and the JSON body's CORS
  preflight stood between them and another `*.virajdomadia.com` page. Every `/account` and
  `/account/saved` write now refuses `Sec-Fetch-Site: cross-site` or `same-site`.
- **L3 — the waitlist form didn't say the demo login can read it.** It does now.

### Accepted risks added in v2.5

- **L1 — the waitlist tells whether an address is waiting.** Joining with an address already on that
  date's list answers 409 `already_waiting`. Using it needs the victim's email and the exact
  sold-out date, and is limited to 5 tries per 10 minutes per IP. Closing it would mean
  telling a real customer the wrong place in the queue.
- **The public owner login still reads what the owner reads:** bookings, waitlists, traveller
  details other than full IDs, and reports. That is the point of the demo. The site says so
  wherever someone types personal data, and `PUBLIC_DEMO_OWNER` keeps owner actions out of other
  people's inboxes.
- **A demo counter booking's emails reach the owner, not the person typing.** A visitor who tries
  the counter with their own address won't receive the payment link; the desk shows it to copy
  instead.
- **Upstash fails open.** If the rate limiter is down, the new limits (details link, saved trips)
  lapse with it, as all of them do; the database-backed checks still hold.

### Performance: PageSpeed Insights (R58)

Both runs were on [pagespeed.web.dev](https://pagespeed.web.dev/), mobile (emulated Moto G
Power, Slow 4G, Lighthouse 13), on production, done by hand by Viraj, as in B14. There was no
local Lighthouse score, for the reasons in H2; local runs were used only to compare LCP phases and
the requests that start before the LCP.

|                                                                    | Performance | FCP   | LCP   | TBT    | CLS   | Speed Index |
| ------------------------------------------------------------------ | ----------- | ----- | ----- | ------ | ----- | ----------- |
| `/compare?p=munnar-…,kasol-…,old-goa-…`, 2026-10-14 01:29 IST      | **95**      | 1.1 s | 2.8 s | 80 ms  | 0     | 2.8 s       |
| `/packages/munnar-alleppey-houseboat#book`, 01:31 IST, before #121 | 82          | 1.4 s | 4.1 s | 20 ms  | 0.107 | 3.5 s       |
| **Same page, 14:07 IST, after #121**                               | **88**      | 1.4 s | 3.2 s | 150 ms | 0.002 | 5.0 s       |

Accessibility 100 on all three; Best Practices 100 (96 before #121); SEO 100 on the package page.
`/compare` scores 66 for SEO only because it is `noindex` by design (R39: a compare URL is a
visitor's own selection, not a page to rank).

**Why the package page missed.** B14 measured Kasol, which has no early-bird and no deposit; the
v2.5 sheet on Munnar has both, and that is where the time went.

- **Layout shift.** On a phone the sheet opens before its first quote. When the quote landed,
  two things appeared above the fold: the early-bird price ladder in step 1, pushing "Who's
  travelling" down about 214 px, and the ₹15,000 test-mode note, which grew the bottom drawer.
  Together that was a 0.10 shift.
- **JavaScript before the hero paints.** Lighthouse's simulation charges every request started
  before the LCP to the LCP; render delay was most of it. Two imports had pulled all of zod
  (~90 kB) into the package page: the shared error-envelope parser and the contact-field regexes
  the sheet borrowed from the enquiry schema. GSAP for the itinerary (~40 kB) also loaded up
  front, though the itinerary is well below the fold.

**The fix (#121).** The ladder holds its place with a same-shaped placeholder until the quote
lands, and the test-mode note is decided from the date's price before the first quote. The error
envelope is now a hand-written guard pinned to the contract in a test, the contact rules moved to a
zod-free module, and GSAP loads when the itinerary comes near the viewport. The package page's
first-load JS went from 272 to 177 kB; measured on the same throttled profile, CLS went from 0.100
to 0.0014.

**Left as it is.** Speed Index read 5.0 s on the passing run (3.5 s before). It is the filmstrip's
visual-progress measure, and with `#book` the sheet slides over the page after load, so the frames
keep changing after the hero has painted; it moved without a change to anything above the fold,
and the score still clears the bar. TBT rose from 20 to 150 ms for the same reason as in B14: the
sheet's work lands after load, where TBT counts it. PSI still suggests stronger compression on the
hero (53 kB); B14 measured AVIF for this kind of photo and it was no smaller.

---

## v2.6 — Hardening audit

**Method.** On 2026-10-14, before v3, main `d567c60` was reviewed in four tracks, each by an independent read-only reviewer: security (access, auth, input/output, secrets, dependencies), money (payments, refunds, discounts, holds), code quality and the database, and best practices plus production readiness. I re-checked every P1 against the code myself.

The four tracks used:

- **Route × guard matrix:** built from the live FastAPI app. It covers 139 operations, the 20 Next route handlers and every page.
- **Tools:** gitleaks over the full history, `pnpm audit` and `pip-audit`, and ruff with `S`/`ASYNC`/`SIM`/`RET`.
- **Type checks:** pyright strict on `services/`, and tsc with `noUncheckedIndexedAccess`.
- **Dead code:** knip and vulture.
- **Throwaway database (Postgres 18):** coverage on a throwaway database, and alembic upgrade → downgrade → upgrade plus `alembic check`.
- **Production probes, read-only:** headers, `/docs`, `/cron/*`, a forged webhook, signed links, `vercel ls` / `env ls`, and the GitHub tick history.

No load test or active scan touched prod. There was no ZAP baseline either: Docker isn't available on this machine.

**Result.** No P0. The guards, ownership checks, signed links, webhook verification, server-side amounts, integer paise, refund idempotency, migrations and model drift all pass. The scorecard has 29 PASS, 16 RISK, 8 FAIL and 1 UNVERIFIED across 54 areas; the full table with evidence is the artifact _Tripsmith Readiness Scorecard_.

**Two docs/12 claims were wrong.** The B14 _Rate limits_ row says the sign-in try counter holds if Upstash fails open. It holds per code, but a new code resets it (SA-2). P19's accepted risk says `PUBLIC_DEMO_OWNER` keeps owner actions out of other people's inboxes. It covers counter bookings and inbox replies only (SA-1). Both are fixed in v2.6, and the B14 sentence is corrected in V3.

P0 = exploitable now. P1 = a real weakness that needs a precondition or has limited reach. P2 = hardening. **Row** is the v2.6 fix row in [07-plan.md](07-plan.md).

| ID    | Sev | Finding                                                                                                                                                                                                                                                                                                     | Where                                                                                                                                                    | Proposed fix                                                                                                                                                                                                         | Size | Row |
| ----- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --- |
| SB-1  | P1  | **Late capture after an approved cancellation is kept silently on deposit bookings.** Rs 40,000 total, Rs 10,000 deposit refunded on approval, then a Rs 30,000 balance captures: ever = 40,000, surplus = 0, owed = min(30,000, 10,000 + 0 - 10,000) = 0. Verified: refunded payments stay in HOLDS_MONEY. | `api/app/services/booking/refunds.py:92-111; payments.py:138-146`                                                                                        | Store kept_paise at the decision (expand-only column, written by resolve.py and balance._cancel_overdue); refund_owed for a decided cancellation = max(0, paid - kept). Add the deposit + approval + late-part test. | M    | V1  |
| SA-1  | P1  | **Public owner login can email real customers text it controls.** _owner_made is True only for channel != WEB; the waitlist path calls deliver() without db, so it is always False. Verified.                                                                                                               | `api/app/services/email/bookings.py:271-281; email/waitlist.py:187-193`                                                                                  | While PUBLIC_DEMO_OWNER is on, mail a customer's real address only for mail the customer triggered in that request (sign-in code, their own capture receipt); route everything else to OWNER_NOTIFY_EMAIL as [Test]. | M    | V2  |
| SA-2  | P1  | **Sign-in code issuance is capped only by Upstash, which fails open.** Each new code starts at 0 tries; the only per-email cap is limiter.hit(otp:{email}). Upstash down means unlimited codes with 5 guesses each. Verified.                                                                               | `api/app/routers/auth.py:156-162; services/auth/otp.py:62-71; infra/ratelimit.py:81`                                                                     | A database cap in issue_code: refuse at 5 or more Verification rows for the identifier in 15 min, or 20 in 24 h. Correct the B14 sentence in docs/12.                                                                | S    | V3  |
| OP-4  | P1  | **Customer personal data reaches Sentry in request bodies.** No max_request_body_size, so the SDK attaches JSON bodies; the denylist lacks name, email, phone and gstin. SMTPRecipientsRefused is chained into EmailSendError. The browser init has no beforeSend.                                          | `api/app/infra/observability.py:150-168; infra/email.py:148; web/src/lib/sentry-browser.ts:43-52`                                                        | max_request_body_size='never'; raise EmailSendError from None; a browser beforeSend that strips query strings from URLs and breadcrumbs.                                                                             | S    | V4  |
| OP-5  | P1  | **Privacy and terms pages contradict what the code does.** No code deletes enquiries (the promise is 12 months). Terms: 30% advance, balance 21 days out, seats not held. Code: 25%, 30 days, 2-day grace, 10-minute hold. Verified.                                                                        | `web/src/lib/policies.ts:76-77, :156; api/app/services/booking/deposit.py:17-19`                                                                         | Add the enquiry purge to /cron/daily beside purge_details; rewrite 'What we collect' and 'How long we keep it' from the models; render the payment terms from the deposit.py constants.                              | M    | V5  |
| OP-3  | P1  | **No backups beyond Neon Free's short history; restore never tested.** grep finds no pg_dump, backup or PITR text; the project is on Neon Free.                                                                                                                                                             | `Repo-wide: no backup workflow, docs silent`                                                                                                             | Nightly workflow: pg_dump -Fc with a read-only role, age-encrypted (the repo is public), 30-day artifact. Write and run the restore drill once: branch, alembic current, smoke, count compare.                       | M    | V6  |
| OP-1  | P1  | **No uptime or heartbeat monitoring.** Nothing external; /health answers ok without touching the database; Vercel Hobby keeps logs about 1 h.                                                                                                                                                               | `api/app/routers/site/health.py`                                                                                                                         | UptimeRobot on / and the api /health every 5 min; /health/ready (SELECT 1, no-store) checked hourly; healthchecks.io pings at the end of /cron/daily and /cron/emails.                                               | S    | V4  |
| OP-2  | P1  | **The 15-minute tick runs about 5 times a day and will auto-disable.** gh run list: 60 runs from 10-01 to 10-14, gaps of 3-8 h. Skip paths still exit 0.                                                                                                                                                    | `.github/workflows/waitlist-tick.yml`                                                                                                                    | Call /cron/waitlist and /cron/emails from cron-job.org every 15 min with the bearer; keep the workflow as workflow_dispatch only; make skip paths exit 1.                                                            | S    | V4  |
| SA-3  | P2  | **Demo-owner safety switch fails unsafe if the env var is lost.** public_demo_owner defaults False with no alarm; an rzp_live_ key is not refused.                                                                                                                                                          | `api/app/config.py:30; main.py:66-77`                                                                                                                    | Default True when VERCEL_ENV=production unless explicitly 'false'; refuse to build the Razorpay client with an rzp_live_ key while it is on.                                                                         | S    | V2  |
| SB-4  | P2  | **Owner routes that call Razorpay have no rate limit.** link/check makes one Razorpay GET per unsettled link on every call; the owner login is public.                                                                                                                                                      | `api/app/routers/admin/bookings.py:198-221, :309-322`                                                                                                    | While PUBLIC_DEMO_OWNER is on, one limiter on every owner route that reaches Razorpay (owner-rzp:{ref} 10 per 10 min, plus a per-IP cap).                                                                            | S    | V2  |
| SA-4  | P2  | **/admin writes have no same-origin check.** same_origin_write is only on routers/site/account.py:47 and saved.py:25; bodiless POSTs need no preflight.                                                                                                                                                     | `api/app/routers/admin/*.py (router dependencies)`                                                                                                       | Add Depends(same_origin_write) to every admin router.                                                                                                                                                                | S    | V2  |
| SA-5  | P2  | **Anyone can burn the Gmail daily cap through code requests.** Per-email 5 per 15 min and per-IP 20 per 15 min; about 500 requests from rotating IPs empty the ~500/day cap.                                                                                                                                | `api/app/routers/auth.py:145-180`                                                                                                                        | A global daily code-email budget in the database (200/day); above it, code requests get 429, leaving headroom for booking mail.                                                                                      | S    | V3  |
| SB-2  | P2  | **A deal can take a traveller line or the whole fare to Rs 0.** dealt = min(off, unit_price). Probe: double Rs 24,999, deal Rs 10,000, triple Rs 12,000 gives a 3x triple fare of 0.                                                                                                                        | `api/app/services/booking/pricing.py:263; admin_packages.py:673-689`                                                                                     | Clamp like early-bird: min(off, unit_price - MIN_TOTAL_PAISE), with a test.                                                                                                                                          | S    | V1  |
| SB-3  | P2  | **Hold liveness judged at transaction start, not at lock time.** func.now() is the transaction start, and a capture runs a SELECT before it takes the departure lock.                                                                                                                                       | `api/app/services/booking/locking.py:545; changes.py:829-831`                                                                                            | Use func.clock_timestamp() in _lock_row and the change-hold check.                                                                                                                                                   | S    | V1  |
| OP-6  | P2  | **/cron/daily has no time budget under a 30 s maxDuration.** Each overdue balance does a Razorpay refund (10 s timeout), an inline SMTP send (15 s) and a revalidate.                                                                                                                                       | `api/app/routers/cron/daily.py:82-113; services/booking/balance.py:374-405`                                                                              | Budget it like run_due (stop near 20 s, report more); move the balance-cancellation email onto the email ledger.                                                                                                     | M    | V4  |
| OP-7  | P2  | **Webhook signature failures are invisible.** log.warning only, and it logs the caller IP.                                                                                                                                                                                                                  | `api/app/routers/site/webhooks.py:44-46`                                                                                                                 | log.error when the header is present but wrong (one fingerprinted Sentry issue); drop the IP.                                                                                                                        | S    | V4  |
| OP-8  | P2  | **No runbooks.** Unwritten: webhook failing, SMTP quota, Neon down, SESSION_SECRET rotation (single key, 12 consumers), CRON_SECRET rotation, restore, Razorpay go-live.                                                                                                                                    | `docs/ (no runbook file)`                                                                                                                                | docs/18-runbook.md with the seven entries; add SESSION_SECRET_PREVIOUS, accepted for verification only.                                                                                                              | M    | V6  |
| OP-9  | P2  | **Rollback order is undocumented.** The web prerenders against whichever api is live; the api's 'Canceled' rows in vercel ls are ignore-skips, not failures.                                                                                                                                                | `docs/17 (deploy race)`                                                                                                                                  | Runbook entry: roll back the api, wait for Ready, vercel redeploy the web; expand-only migrations mean no downgrade; confirm both top rows and the GitHub deployment sha.                                            | S    | V6  |
| DOC-1 | P2  | **Docs name an api host that does not resolve.** api.tripsmith.virajdomadia.com fails DNS (curl exit 6); the live api is tripsmith-api.vercel.app. .env.example calls WEB_URL a CORS allow-list, but there is no CORS middleware.                                                                           | `docs + README (3 places); api/.env.example`                                                                                                             | Fix the three references and the stale comment.                                                                                                                                                                      | S    | V6  |
| Q-2   | P2  | **Invoice render timeout makes a test flaky and can drop prod attachments.** RENDER_TIMEOUT = 5.0; the test failed once in two full runs.                                                                                                                                                                   | `api/app/services/gst/files.py:22, :139-143; tests/test_extras.py:148`                                                                                   | Make the timeout a setting (30 s in tests, 5 s in prod) and test the timeout branch explicitly.                                                                                                                      | S    | V7  |
| Q-3   | P2  | **N+1 on the admin money desk.** Per refund-needed booking: one Refund query plus refund_owed (at least one more).                                                                                                                                                                                          | `api/app/services/money.py:193-225`                                                                                                                      | Two IN (...) queries for requested refunds and approved cancellations; refund_owed takes the prefetched rows.                                                                                                        | S    | V7  |
| Q-4   | P2  | **Missing indexes on the desk, reports and FK deletes.** FK-without-index query on the migrated database; bookings has only (departure_id, status) and (user_id, created_at).                                                                                                                               | `bookings.package_id, bookings.created_at, enquiry_notes.enquiry_id, coupon_packages.package_id, email_sends.package_id, date_changes.from_departure_id` | One migration adding the six indexes.                                                                                                                                                                                | S    | V7  |
| Q-6   | P2  | **Dead code and an unrelated npm dependency.** knip and vulture; no references anywhere.                                                                                                                                                                                                                    | `web/package.json (cn); web/src/components/ui/tabs.tsx; changes.py:883; counter.py:186; admin_leaders.py:36`                                             | Delete all five.                                                                                                                                                                                                     | S    | V7  |
| Q-8   | P2  | **Unchecked index in the order body.** tsc --noUncheckedIndexedAccess: TS2532 at 249:13.                                                                                                                                                                                                                    | `web/src/lib/booking.ts:249-250`                                                                                                                         | Use the same ?? fallback as the validator at :219.                                                                                                                                                                   | S    | V7  |
| OP-11 | P2  | **Image transformations redone daily.** minimumCacheTTL is 1 day; owner uploads already mint new paths.                                                                                                                                                                                                     | `web/next.config.ts:84`                                                                                                                                  | Raise it to 30 days; keep 'rename, don't overwrite' for seeds.                                                                                                                                                       | S    | V7  |
| OP-10 | P2  | **Error reason codes are not in the contract.** About 60 reason strings emitted against 3 documented; the web branches on them.                                                                                                                                                                             | `api/app/schemas/errors.py:34-38`                                                                                                                        | Make reason a StrEnum so api-types.ts carries the union.                                                                                                                                                             | S    | V8  |
| Q-5   | P2  | **Business constants copied by hand between web and api.** suggested_refund_paise also hard-codes 30/15 apart from CANCELLATION_TIERS.                                                                                                                                                                      | `PayChoice.tsx:9 / deposit.py:18; policies.ts:34 / business.py:28; booking.ts:30-32 / schemas/bookings.py; gst.ts:49 / schemas/bookings.py:25`           | Serve balanceDays, the tiers and the age limits from /meta; derive suggested_refund_paise from the tiers; add a GSTIN_RE parity test.                                                                                | M    | V8  |
| Q-1   | P2  | **Coverage config misreports the api.** Default config: 88%, money modules 47-67%. With greenlet concurrency: 96%.                                                                                                                                                                                          | `api/pyproject.toml (no [tool.coverage.run])`                                                                                                            | concurrency = [greenlet, thread], source = [app]; gate at 94 in CI.                                                                                                                                                  | S    | V9  |
| Q-7   | P2  | **Payment and money UI barely tested on web.** vitest v8 coverage: web 65% lines, 56% branches.                                                                                                                                                                                                             | `web/src/lib/razorpay-checkout.ts (30%); RefundMadeButton, CouponForm, DeleteCoupon (0%)`                                                                | vitest for razorpay-checkout and RefundMadeButton; add @vitest/coverage-v8 as a dev dependency.                                                                                                                      | M    | V9  |
| SA-6  | P2  | **Dev-only dependency advisories.** shell-quote below 1.11.0 critical (via concurrently), braces 3.0.3 high (via eslint). The prod audit is clean.                                                                                                                                                          | `root pnpm audit`                                                                                                                                        | pnpm overrides: shell-quote >=1.11.0, braces >=3.0.4.                                                                                                                                                                | S    | V9  |

**Viraj to check in dashboards (not visible from the repo):** Sentry alert rules on both projects; Neon's restore window; that the Preview `DATABASE_URL` on `tripsmith-api` points to the `dev` branch; the Razorpay webhook is Active and auto-capture is on; GitHub emails on failed workflows.

### Fixed in V1 — money correctness

- **SB-1:** `bookings.kept_paise` (0025, add-only) is fixed at the decision — by the owner's approval (`min(paid, total) − refund`) and by the tidy's unpaid-balance cancel (`paid − policy refund`). `refund_owed` then owes `paid − kept`, so a balance captured after the deposit was refunded goes back in full. Bookings decided before 0025 (null) keep the old amounts-only sum. Test: `test_deposits.py::test_a_balance_that_lands_after_an_approved_cancellation_goes_back_in_full`.
- **SB-2:** the deal per traveller is `min(off, unit − ₹1)`, as early-bird already was. Test: `test_booking_pricing.py::test_the_biggest_deal_leaves_every_traveller_at_least_a_rupee` (the audit's triple probe now costs ₹1 a head).
- **SB-3:** `_lock_row` and the date-change hold check (`changes.change_hold`) compare with `clock_timestamp()`. Tests in `test_lock_paths.py` start a transaction while a hold is live and lock after it lapses. `departure_availability` still uses `now()`; on that race it counts the lapsed hold as held, which can only refuse a seat, never oversell one.
