# Tripsmith — Security + Performance

**Lifecycle step:** 12 of 17 · **Milestone:** 1.4 Harden · **Started:** 2026-09-23 (H2 performance)

Two rows live here: **H2 Performance** first, then **H4 Security**.

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

### Not done here

- No `lighthouse.yml` workflow — dropped in the 2026-09-15 lean re-cut. This row is a manual run,
  recorded above.
- **TBT was not tuned.** It is the largest single drag on the home score (300 ms, sub-score 0.78)
  and nothing in this row touches it. The likely candidates are the home `SearchBar` and the
  listing's filter panel hydrating on the main thread. Left for a later row, deliberately: this
  one was scoped to images, fonts, cache headers and query plans.
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
expiry; `safeNext` resolves the post-login target through the URL parser before scoping it to
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
  frame-ancestors 'none'; frame-src https://maps.google.com; form-action 'self';
  script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://*.public.blob.vercel-storage.com;
  font-src 'self'; connect-src 'self' https://*.sentry.io; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

Three of those lines are narrower or wider than the obvious default, each for a reason:

- **`frame-src` names Google rather than `'none'`.** The only iframe on the site is the keyless
  Maps embed on `/contact`; `'none'` blanks it. Both hosts are listed because the embed URL
  redirects `maps.google.com` → `www.google.com` and a frame navigation is checked again at the
  redirect target. Drop the map and this tightens to `'none'`.
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
  visitor can walk into the admin. Anyone can therefore edit the catalog. The blast radius is one
  demo database with no real customers, no payment data and no PII beyond enquiries people chose
  to submit to a demo; restoring it is a `seed.py` run. If this ever stops being a portfolio piece,
  that is the first thing to remove.
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
- **Sessions are never pruned.** Expired rows are deleted when they are next presented, so a
  session that is never used again sits in the table until its row is touched. It cannot
  authenticate — `find_session` checks `expires_at` — so this is table hygiene, not access.

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
