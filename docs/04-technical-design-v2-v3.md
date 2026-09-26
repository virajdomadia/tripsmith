# Tripsmith — Technical Design for v2, v3, v4, and add-ons

**Lifecycle step:** 4 of 17 (forward design) · **Written:** 2026-09-12 · **Revised:** 2026-09-13 — backend switched from Hono to FastAPI
**Companion to:** [04-technical-design.md](04-technical-design.md) (v1). Same stack, same conventions. **All server logic below lives in `api/`; `web/` only adds pages and components** (see [05-architecture.md](05-architecture.md) §0).
**Status:** approved. Requirements with acceptance criteria: [03-requirements-v2.md](03-requirements-v2.md), [03-requirements-v3.md](03-requirements-v3.md). §0 lists the v1 decisions that keep every later feature additive.

---

## 0. Decisions v1 must make now so v2/v3 are additive

| v1 change | Enables |
|---|---|
| `users.role` column (`owner` \| `customer`) in the own `users` table | v2 customer accounts without a migration of auth |
| `itinerary_days.location` (`name`, `lat`, `lng`, nullable) filled in the seed | Storyboard, route map, trip-hub weather |
| `departures.guaranteed`, `seats_total`, `seats_left` as **derived** (`seats_total − confirmed − active holds`) not a mutable counter | v2 holds and bookings without double-counting |
| `enquiries.conversation_id` (nullable FK) and `enquiries.type` enum including `chat-handoff` | v3 human handoff |
| `packages.deal_price`, `deal_label`, `deal_ends_at` (nullable, unused in v1 UI) | v2 deals with no schema change |
| `api services/pdf` exposes a small `Document` base (page chrome, fonts) | v2 voucher reuses the renderer |
| `search_packages()` returns pydantic models, never SQLAlchemy instances | v3 tool result goes straight to the model |
| `api infra/ratelimit.py` generic helper (key, limit, window) | v3 chat quotas |
| `api/content/destinations/*.py` includes a `climate[12]` list | Best-time strip |

---

## v2 — Booking engine

**Re-validated 2026-09-24** against v1.0.1 as shipped; the decisions are listed at the end of [03-requirements-v2.md](03-requirements-v2.md). Rows B0–B14 in [07-plan.md](07-plan.md).

### 1. Data model additions
Migration `0004_v2` (after B1 has stopped mapping `sessions.token`): drop `sessions.token` · `bookings` (id, ref, package_id, departure_id, user_id nullable, status, hold_expires_at, contact snapshot, quote jsonb, total_paise, paid_paise, cancel_reason, refund_needed, created_at, updated_at) · `booking_travellers` (booking_id, name, age, occupancy) · `payments` (id, booking_id, provider, razorpay_order_id, razorpay_payment_id unique, amount_paise, status, raw webhook json) · `booking_cancellations` (booking_id, reason, status, refund_note) · `reviews` (booking_id unique, rating, text, approved) · `enquiry_messages` (enquiry_id, direction, subject, body, sent_at) · the booking-aware `departure_availability` view (same columns, so live code is unaffected). Add-only apart from the `token` drop, so it runs on prod **before** the B2 code merges.

### 2. Booking state machine
```
draft ──quote──▶ pending (seat hold, 10 min) ──payment captured──▶ confirmed ──departure passed──▶ completed
                     │                                                      │
                     └──expired / failed / seats gone──▶ cancelled          └──cancellation approved──▶ cancelled
```
Transitions are single-row `UPDATE … WHERE status = :expected` so a repeated webhook or a double click is a no-op. `cancel_reason` ∈ `hold_expired`, `payment_failed`, `seats_gone`, `cancellation_approved`, `owner_released`.

### 3. Seat holds — Postgres, not Redis
- Creating a pending booking runs in one transaction: `SELECT … FOR UPDATE` on the departure row → `seats_left = seats_total − Σ confirmed travellers − Σ pending travellers where hold_expires_at > now()` → insert booking if enough seats.
- Holds expire **lazily** (the formula ignores expired holds); seat counting never depends on cron. `/cron/daily` (v1.0.1, 01:00 IST) only tidies: pending holds lapsed > 1 h → `cancelled` (`hold_expired`), confirmed with departure < IST today → `completed`, expired sessions deleted, pages of packages whose deal ended yesterday revalidated. Each job's count goes into `DailyReport`.
- **Abuse limits:** `booking:{ip}` 5 / 10 min (through a web forwarding handler, since the rewrite loses the IP); one active hold per email or phone — a new order releases the previous hold in the same transaction. Owner "release hold" on the desk.
- **Freshness:** hold / confirm / cancel call one helper that recomputes the package's `starting_price_paise` and posts its revalidate tags (package, listing, home). Lapsed holds fire no event; the Book-now panel therefore reads availability uncached (`?fresh=1`), and seat counts on prerendered pages are labelled indicative.
- Upstash stays for rate limiting only. (Frontrow, project 2, is where Redis holds get showcased.)

### 4. Pricing
- `quote_booking(departure_id, travellers[])` returns the breakdown: adults × occupancy price, children × child price, single supplements, deal line, total. The client **never** sends amounts; the Razorpay order is created from the server quote, and the quote is snapshotted on the booking.
- **Bookable:** package live; double/triple/child > 0 (0 = "on request", the v1 rule) and supplement ≥ 0; departure date ≥ `ist_today() + 2 days`; enough seats. Otherwise a 409 with the reason (`on_request`, `too_soon`, `sold_out`) the picker also shows.
- **Deal:** active while `now() < deal_ends_at` (the form takes a date and stores the end of that IST day); discount per traveller = `min(starting_price − deal_price, traveller's line price)`.

### 5. Razorpay flow
1. `POST /bookings` (via the web handler `POST /api/bookings`, which forwards the visitor IP): quote → insert pending booking → create the order with `infra/razorpay.py` — **httpx** against `POST https://api.razorpay.com/v1/orders` (basic auth, `receipt` = booking ref), **no SDK** (the official one is sync `requests`) → return `orderId`, `amountPaise`, `keyId`.
2. The client injects Checkout.js **on the Pay click** and opens it with `timeout: 600`.
3. On success the client posts `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` to `POST /bookings/:ref/confirm` → verify `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` with `hmac.compare_digest` → payment `captured`, booking `confirmed`. If Checkout closes **without** calling back (dismissed, or a popup that lost its opener), the sheet posts `POST /bookings/:ref/sync` (B5): for a pending booking the api reads the order's payments from Razorpay with the key secret and applies a `captured` one through the same capture path; any other status answers from the database.
4. **Webhook** `POST https://tripsmith-api.vercel.app/webhooks/razorpay` (raw body; registered on production only — previews are SSO-gated): verify `X-Razorpay-Signature` with the webhook secret; handle `payment.captured` and `payment.failed`; upsert on `razorpay_payment_id`; same guarded transition; always 200 once recorded. Whichever of (3) or (4) arrives first confirms; the other is a no-op. When the custom domain arrives, the URL changes in the Razorpay dashboard.
5. **Late capture / offline:** `confirm_payment` and `mark_paid_offline` both lock the departure and re-check seats if the hold has lapsed. Enough → confirm. Not enough → payment recorded, booking `cancelled` (`seats_gone`), `refund_needed = true`, owner + customer emailed; offline mark-paid refuses instead.
6. Test mode forever; keys in `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. CSP adds `checkout.razorpay.com` (script) and `api.razorpay.com` (frame, connect) site-wide, plus any host a real test payment shows — verified on a deployment across every page.

### 6. Confirmation
- `render_voucher` on the `services/pdf` `Document` base (booking ref, travellers, departure, hotels, inclusions, contact), **rendered on demand, never stored** — no Blob, no cache key to go stale, no private objects. Served by `GET /account/bookings/:ref/voucher.pdf` (booking owner or admin) through a web handler, and by `GET /bookings/:ref/voucher.pdf?exp=&sig=` (HMAC over ref + expiry with `SESSION_SECRET`, 30 minutes) from the success screen.
  *B7 (2026-09-26):* the signed link is handed out only to a caller who proved the payment — `/confirm` (Razorpay's signature) or `/sync` with the booking's order id (`voucherUrl` on `PaymentResult`); the ref alone never gets it, since the voucher carries names, ages and a phone number. The account route answers the owner in B7; B8 adds the customer the booking belongs to and the web `/account/bookings/[ref]/voucher.pdf` handler with My bookings. All booking emails hang on one `on_new_capture` hook (services/booking/after_capture.py) that runs only for a new capture, never a replay.
- Email via Resend with the voucher attached, owner new-booking email, WhatsApp deep link with the booking ref. **Demo mode:** while `EMAIL_FROM` is `@resend.dev`, customer emails are redirected to `OWNER_NOTIFY_EMAIL` (the v1 `is_test_mode` rule in `services/email/send.py`).

### 7. Customer accounts
- **Own email code** (no SMS): `POST /auth/otp/request` writes a 6-digit code to the `verification` table (hashed, 10-min expiry; `otp:{email}` 5 / 15 min and `otp-ip:{ip}` limits) and emails it — in demo mode it returns the code in the response and the UI shows it labelled. `POST /auth/otp/verify` (5 wrong tries kill the code) creates the `users` row if needed (`role = 'customer'`) and a `sessions` row — the same cookie as the owner login. Both go through web forwarding handlers (IP + `Set-Cookie`).
- `require_user` sits beside `require_owner`. `GET /auth/session` returns the role and `newEnquiries` only for the owner; the web `/admin` gate admits `role = owner` only and redirects a customer to `/account`.
- Bookings are attached to the account by email at verify time. `/account/bookings` lists bookings with voucher download and cancellation request.
  *B8 (2026-09-26):* ownership is "attached to me, or unattached and made with my verified email" (`services/account.py::owned_by`), so a booking made later while signed out shows at once; verify still sets `user_id` (B13 reviews read it). Only the newest code per email is live (issuing one retires the rest); wrong tries are counted in `verification.attempts` (migration 0005), not Redis, so the cap holds while the limiter fails open. Codes are stored as an HMAC of `otp:{email}:{code}` under `SESSION_SECRET`. `otp-ip:{ip}` is 20 / 15 min. The owner's email is refused by both code routes (in demo mode the code is on screen). Demo mode emails nothing — the code is only in the response. `/cron/daily` also deletes expired sessions and codes expired over a day.

### 8. Admin additions
- `/admin/bookings`: list, filters (status, departure, package, date), search, detail with payment timeline and refund-needed flag, **mark paid (offline)** with seat re-check, **release hold**, CSV export, printable departure manifest — built on the enquiry inbox's patterns (URL filters, status tabs, streamed CSV).
- Reply from inbox: `POST /admin/enquiries/:id/reply` → Resend → `enquiry_messages` row; thread shown on the enquiry.
- Enquiries: the admin schemas accept all six `enquiry_type` values with labels; `PATCH /admin/enquiries/:id/status` enforces the transition table in R24 (409 otherwise).
- Reviews moderation: approve/hide. Deals: three fields on the package form.

### 9. Reviews
- Only for `completed` bookings. One per booking, rating + text (no photo). Aggregate cached on `packages.rating_avg` / `rating_count`, recomputed on moderation, emitted as `AggregateRating` — from approved reviews only, never testimonials. The seed adds a demo traveller with a completed past booking and an approved review. Stars use a darker amber (≥ 3:1 on white) everywhere.

### 10. Testing
- Db/unit, embarrass-in-a-demo only: `quote_booking` to the paisa, last-seat concurrency (two parallel orders on a 1-seat departure), webhook 5× replay → 1 payment + 1 email, forged signature → 400, late capture with no seats.
- Journey (api level, no browser): order → signed test webhook → confirmed → voucher 200 for the owner of the booking, 403 otherwise. Checkout.js is not automated.
- Performance: one PageSpeed Insights run on a package page with Book now open (≥ 85), recorded in docs/12.

---

## v3 — AI concierge

### 1. Provider abstraction
- **pydantic-ai** in **api/** with Gemini Flash (free tier) as the default model and Anthropic opt-in; `api/app/services/ai/provider.py` reads `AI_PROVIDER` and `AI_MODEL` and builds the `Agent`. Nothing else in the codebase imports a model-provider SDK.

### 2. Chat runtime
- api `POST /chat` (SSE via `sse-starlette`) → `agent.run_stream(...)` with the system prompt, trimmed history, tools and a step cap of 5; events (`text-delta`, `tool-call`, `tool-result`, `done`, `error`) are emitted as named SSE events. web's in-house `useConcierge` hook (fetch stream over `ReadableStream`, no `useChat`) reaches it through the rewrite and reduces events into the message list. Tool results render as **package cards** (tool-result events → `<PackageCard>`), never as prose tables.
- Anonymous `concierge_session` cookie; `conversations` + `messages` tables persist every turn (for the admin log and the handoff).
- Quotas via `infra/ratelimit.py`: 20 messages / IP / day, 30 messages per conversation, and a **global** 600 chat requests / day to stay inside the Gemini free quota. Over quota → the UI offers the enquiry form.

### 3. Tools
Plain typed Python functions in `api/app/services/ai/tools.py` (pydantic-validated arguments, docstring = description) registered on the agent with `@agent.tool`; the same functions are exported to MCP in v4.

| Tool | Wraps | Returns |
|---|---|---|
| `searchPackages({destination?, maxBudget?, nights?, theme?, month?})` | v1 `search_packages()` | up to 5 package cards |
| `checkAvailability({packageSlug, month?})` | departures query | dates, seats left, price per person, badges |
| `startBooking({departureId, adults, children})` | v2 `quote_booking` | a checkout URL with the selection pre-filled |
| `createEnquiry({name, phone, packageSlug?, summary})` | v1 enquiry pipeline, `type = chat-handoff` | enquiry ref; the transcript is attached |

**Decision on the PRD open question:** the chat **never takes payment**. `startBooking` hands off to the v2 checkout page. Payment UI in a chat is worse UX and doubles the surface to secure.

### 4. Guardrails
- System prompt: Tripsmith sells only the packages returned by tools; never invent packages, prices or dates; if nothing matches, say so and offer the closest match or the enquiry form; ask at most two clarifying questions before searching.
- **Output check** after each assistant turn: every package slug / URL / price in the text must appear in a tool result from this conversation; otherwise the turn is replaced with a safe fallback ("Let me check that for you") and the search tool is forced. Cheap regex, no second model call.
- Input caps: 500 chars per message; conversation trimmed to the last 20 messages plus a running summary.
- **Decision on the PRD open question:** Hinglish is supported by prompt ("reply in the language the customer writes in, Hindi or Hinglish included"); the UI and package content stay English. Gemini handles this natively; no translation layer.

### 5. Evals
- `api/evals/conversations/*.py`: ~20 scripted dialogues with assertions (which tool was called with which args, no hallucinated slug, correct refusal for "Maldives", handoff created when asked for a human). Run with pytest (`-m evals`, excluded from the default run) against the real provider, nightly via GitHub Actions (`schedule`), and on demand — never on every push, to protect the daily quota.

### 6. Admin conversation log
- `/admin/conversations`: list with outcome (booking started / enquiry created / dropped), message count, first user message; detail shows the transcript with tool calls inline.

### 7. "Notify me" for new departures
- `departure_alerts` (email, package_id or destination_id). Daily cron `api/cron/departure-alerts` (allowed on Hobby) emails subscribers when departures were added in the last 24 h. Offered by the concierge when `searchPackages` returns nothing for the requested month.

---

## v4 — "Tripsmith anywhere" (MCP server)

### 1. Transport & hosting
- Official **`mcp` Python SDK** (`FastMCP`) built in `api/app/services/mcp/` and mounted in the FastAPI app at `/mcp` (Streamable HTTP, stateless, JSON responses — no SSE session store needed; Vercel Hobby has no long-lived processes). `maxDuration 30`. Public URL `https://api.tripsmith.virajdomadia.com/mcp` — clients hit the api domain directly.
- Server metadata: name `tripsmith`, version from `pyproject.toml`, instructions string = the v3 system prompt's catalog-only rules.

### 2. Tools, resources, prompts
- Tools are registered from the **same tool definitions as v3** (`api/app/services/ai/tools.py` exports the typed functions; the chat agent registers them with `@agent.tool`, the MCP server with `@mcp.tool()`). One definition, two transports.
- Resources: `tripsmith://packages` (list), `tripsmith://packages/{slug}`, `tripsmith://destinations/{slug}` rendered to markdown by `api/app/services/catalog/markdown.py` (also reusable for the PDF text and the concierge context).
- Prompt `plan-a-trip(destination?, month?, budget?, party?)` returns a single user message that steers the client into the two-question flow.

### 3. Guardrails, limits, logging
- pydantic on every tool input (same models); tool errors returned as `isError: true` content, never raised.
- `infra/ratelimit`: `mcp:{ip}:{hour}` ≤ 60 calls; `mcp-enquiry:{ip}:{day}` ≤ 5.
- `mcp_requests` row per call: client name/version captured from `initialize` (stateless transport → clients resend it; fall back to `User-Agent`), method, tool/resource name, args with `phone`/`name` stripped, latency ms, `ok`.
- Dashboard tile reads `mcp_requests` (7 / 30 days, top tools, `startBooking` count = "trips planned via MCP").

### 4. Auth (stretch R38)
- MCP authorization spec: an own OAuth 2.1 authorization server (PKCE) on top of the `users` / `sessions` tables, `/.well-known/oauth-authorization-server` metadata, bearer tokens checked by the `mcp` SDK's auth hooks; `myBookings` and `getVoucher` tools registered only when a valid token is present.

### 5. Evals & proof
- `api/evals/` gains an MCP driver: the same 20 conversations executed by the `mcp` SDK's client against a preview deployment; assertions unchanged.
- web `/developers` page (static) with copy-paste config blocks for Claude Desktop (`claude_desktop_config.json` remote server entry), Cursor, ChatGPT connectors; README GIF recorded from Claude Desktop.

### 6. Risks
| Risk | Mitigation |
|---|---|
| Stateless transport loses `initialize` client info | log `User-Agent` as fallback; correctness of tools does not depend on it |
| Abuse via `createEnquiry` | daily per-IP cap, honeypot-equivalent (reject empty summaries), owner can block by IP hash |
| MCP spec drift | pin the `mcp` package in `uv.lock`; Inspector run in CI as a smoke test |

## Add-ons (unique nice-to-haves)

### A. Owner-side AI: draft a package (v3 stretch)
- Admin "Draft with AI" button → a pydantic-ai agent with `output_type=PackageDraft` (pydantic model mirroring the package insert + itinerary days) from a one-line brief and the destination's existing packages as style examples → result populates the package form **as a draft**; owner edits and saves. Never auto-publishes, never touches prices without the owner. Same provider abstraction.

### B. Best-time strip (v1 nice-to-have)
- `content/destinations/*.py` carries `climate: list[ClimateMonth]` (`month, rain: 1|2|3, heat: 1|2|3, crowd: 1|2|3, price: 1|2|3`) (static, hand-written from public climate data). `<BestTimeStrip>` renders 12 cells with a colour scale; clicking a month links to `/packages?destination=…&month=…`. When the listing has a month filter, the strip highlights it. No API.

### C. Trip hub after booking (v2/v3 stretch)
- `/account/bookings/[id]/hub` (customer auth). Sections: countdown (departure date), departure details, documents checklist (`booking_checklist_items`, owner-editable defaults per package), **packing list** via a pydantic-ai structured-output call cached in `packing_lists (destination_id, month)` so it's generated once per destination-month, weather via **Open-Meteo** forecast when within 16 days, else climate averages from B, WhatsApp group link (`departures.whatsapp_group_url`, set by owner).

### D. Split payment for groups (v2 stretch)
- `booking_shares` (booking_id, name, email, amount_paise, token, razorpay_order_id, status). Leader chooses "split" at checkout → one share per traveller with a pay link `/pay/[token]`; each share is its own Razorpay order; booking is `partially_paid` until Σ captured = total, then `confirmed`. Leader can "cover the rest" (one order for the remainder). Daily cron sends reminders for unpaid shares. Seat hold for split bookings is 48 h instead of 10 min (accepted risk, owner can release manually).

### E. Itinerary storyboard (v1/v2 stretch)
- **MapLibre GL** with the OpenFreeMap style (no key). Route from `itinerary_days.location` in day order; GSAP ScrollTrigger pins the map beside the itinerary, draws the route line progressively (`line-gradient` on scroll progress), flies to each stop as its day card enters. `prefers-reduced-motion` → static map with the full route and a plain list. Falls back to the plain itinerary when any day lacks coordinates.

### Standard nice-to-haves (one line each)
- **Route map**: subset of E without animation — a static MapLibre map with the route.
- **Departure-city pricing**: `departure_prices (departure_id, origin_city, price_double, price_triple, price_child, single_supplement)`; the package page gets an origin selector; quote takes `originCity`.
- **Blog / travel guides**: MDX in `content/guides/`, rendered at `/guides/[slug]`, linked from destination pages.
- **Compare packages**: client-only, slugs in the URL (`/compare?p=a,b,c`), table of quick facts + inclusions.
- **Wishlist / recently viewed**: `localStorage`, hydrated client components, no server.
- **Request a callback**: enquiry `type = callback` with `preferred_time`; same pipeline.

---

## Environment variables added later
v4: `MCP_PUBLIC_URL` (defaults to `NEXT_PUBLIC_SITE_URL`), stretch: OAuth issuer settings for the own authorization server.
v2: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (api only — the order response carries the public key id, so the web needs no Razorpay variable).
v3: `AI_PROVIDER` (`google` | `anthropic`), `AI_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY` (optional), `CHAT_GLOBAL_DAILY_LIMIT`.

## Risks specific to v2/v3
| Risk | Mitigation |
|---|---|
| Gemini free-tier quota exhausted by a traffic spike | Global daily cap + per-IP cap; UI degrades to the enquiry form |
| Free-tier data usage terms | Catalog is fictional; no real customer PII reaches the model (names/phones are collected by the enquiry form, not sent to the model) |
| Razorpay webhook arrives before the client callback (or never) | Both paths idempotent; pending bookings expire lazily |
| Payment captured after the hold lapsed and the seat was resold | Checkout `timeout: 600`; re-check under the departure lock; refund-needed path with its own test |
| Seat-hold griefing | 5 starts / 10 min / IP, one active hold per email or phone, owner release; rotation accepted |
| Model changes behaviour after a provider update | Nightly evals catch regressions; provider pinned by `AI_MODEL` |
| MapLibre bundle size on the package page | Load only when the storyboard is in view (`next/dynamic`, `ssr: false`) |
