# Tripsmith — Technical Design for v2, v3, and add-ons

**Lifecycle step:** 4 of 17 (forward design) · **Written:** 2026-09-12
**Companion to:** [04-technical-design.md](04-technical-design.md) (v1). Same stack, same conventions.
**Status:** approved. Requirements with acceptance criteria: [03-requirements-v2.md](03-requirements-v2.md), [03-requirements-v3.md](03-requirements-v3.md). §0 lists the v1 decisions that keep every later feature additive.

---

## 0. Decisions v1 must make now so v2/v3 are additive

| v1 change | Enables |
|---|---|
| `users.role` column (`owner` \| `customer`) in the Better Auth user table | v2 customer accounts without a migration of auth |
| `itinerary_days.location` (`name`, `lat`, `lng`, nullable) filled in the seed | Storyboard, route map, trip-hub weather |
| `departures.guaranteed`, `seats_total`, `seats_left` as **derived** (`seats_total − confirmed − active holds`) not a mutable counter | v2 holds and bookings without double-counting |
| `enquiries.conversation_id` (nullable FK) and `enquiries.type` enum including `chat-handoff` | v3 human handoff |
| `packages.deal_price`, `deal_label`, `deal_ends_at` (nullable, unused in v1 UI) | v2 deals with no schema change |
| `lib/pdf` takes a generic `Document` component | v2 voucher reuses the renderer |
| `searchPackages()` returns plain serialisable objects, no Drizzle classes | v3 tool result goes straight to the model |
| `lib/ratelimit.ts` generic helper (key, limit, window) | v3 chat quotas |
| `content/destinations/*.ts` includes a `climate[12]` array | Best-time strip |

---

## v2 — Booking engine

### 1. Data model additions
`bookings` (id, package_id, departure_id, user_id nullable, status, hold_expires_at, total_paise, currency, contact snapshot, created_at) · `booking_travellers` (booking_id, name, age, occupancy: double/triple/single/child) · `payments` (id, booking_id, razorpay_order_id, razorpay_payment_id unique, amount_paise, status, raw webhook json) · `booking_cancellations` (booking_id, reason, status, note) · `reviews` (booking_id unique, rating, text, photo_url, approved) · `enquiry_messages` (enquiry_id, direction, subject, body, sent_at).

### 2. Booking state machine
```
draft ──quote──▶ pending (seat hold, 10 min) ──payment captured──▶ confirmed ──departure passed──▶ completed
                     │                                                      │
                     └──expired / failed──▶ cancelled                       └──cancellation approved──▶ cancelled
```
Transitions are single-row `UPDATE … WHERE status = :expected` so a repeated webhook or a double click is a no-op.

### 3. Seat holds — Postgres, not Redis
- Creating a pending booking runs in one transaction: `SELECT … FOR UPDATE` on the departure row → compute `seats_left = seats_total − Σ confirmed travellers − Σ pending travellers where hold_expires_at > now()` → insert booking if enough seats.
- Holds expire **lazily** (the formula ignores expired holds); no cron needed. Vercel Hobby crons are limited to once per day, so nothing time-critical may depend on cron.
- Upstash stays for rate limiting only. (Frontrow, project 2, is where Redis holds get showcased.)

### 4. Pricing
- `quoteBooking(departureId, travellers[])` on the server returns the breakdown: adults × occupancy price, children × child price, single supplements, deal discount if `deal_ends_at > now()`, total. The client **never** sends amounts; the Razorpay order is created from the server quote.

### 5. Razorpay flow
1. `createOrder` server action: quote → insert pending booking → `razorpay.orders.create({ amount, currency: 'INR', receipt: bookingId })` → return `order_id` + public key.
2. Client opens Razorpay Checkout.js with the order.
3. On success the client posts `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` → server verifies `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` → mark payment `captured`, booking `confirmed`.
4. **Webhook** `POST /api/webhooks/razorpay` (Node runtime, raw body): verify `X-Razorpay-Signature` with the webhook secret; handle `payment.captured` and `payment.failed`; upsert on `razorpay_payment_id`; same guarded transition. Whichever of (3) or (4) arrives first confirms; the other is a no-op.
5. Test mode forever; keys in `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

### 6. Confirmation
- `VoucherDocument` via `lib/pdf` (booking ref, travellers, departure, hotels, inclusions, contact). Email via Resend with the voucher attached; WhatsApp deep link with the booking ref.

### 7. Customer accounts
- Better Auth **email OTP plugin** (no SMS). A booking made while logged out is attached to the account created/logged in at checkout by email. `/account/bookings` lists bookings with voucher download and cancellation request.

### 8. Admin additions
- `/admin/bookings`: list, filters (status, departure, date), detail with payment timeline, **mark paid (offline)** which creates a manual `payments` row, CSV export.
- Reply from inbox: server action → Resend → `enquiry_messages` row; thread shown on the enquiry.
- Reviews moderation: approve/hide.
- Deals: three fields on the package form.

### 9. Reviews
- Only for `completed` bookings (departure date passed). One per booking. Aggregate rating cached on `packages.rating_avg` / `rating_count` and emitted as `AggregateRating` in JSON-LD.

### 10. Testing
- Unit: `quoteBooking`, state-machine guards, signature verification, seat-availability formula.
- E2E: journey to the Razorpay order; the webhook is exercised by POSTing a signed test payload to `/api/webhooks/razorpay` (Checkout.js UI is not automated — brittle).

---

## v3 — AI concierge

### 1. Provider abstraction
- Vercel AI SDK (`ai`) with `@ai-sdk/google` (Gemini Flash, free tier) as default and `@ai-sdk/anthropic` opt-in; `lib/ai/provider.ts` reads `AI_PROVIDER` and `AI_MODEL`. Nothing else in the codebase imports a vendor SDK.

### 2. Chat runtime
- `POST /api/chat` → `streamText({ model, system, messages, tools, maxSteps: 5 })`; client uses `useChat`. Tool results render as **package cards** (tool-result parts → `<PackageCard>`), never as prose tables.
- Anonymous `concierge_session` cookie; `conversations` + `messages` tables persist every turn (for the admin log and the handoff).
- Quotas via `lib/ratelimit.ts`: 20 messages / IP / day, 30 messages per conversation, and a **global** 600 chat requests / day to stay inside the Gemini free quota. Over quota → the UI offers the enquiry form.

### 3. Tools
| Tool | Wraps | Returns |
|---|---|---|
| `searchPackages({destination?, maxBudget?, nights?, theme?, month?})` | v1 `searchPackages()` | up to 5 package cards |
| `checkAvailability({packageSlug, month?})` | departures query | dates, seats left, price per person, badges |
| `startBooking({departureId, adults, children})` | v2 quote | a checkout URL with the selection pre-filled |
| `createEnquiry({name, phone, packageSlug?, summary})` | v1 enquiry pipeline, `type = chat-handoff` | enquiry ref; the transcript is attached |

**Decision on the PRD open question:** the chat **never takes payment**. `startBooking` hands off to the v2 checkout page. Payment UI in a chat is worse UX and doubles the surface to secure.

### 4. Guardrails
- System prompt: Tripsmith sells only the packages returned by tools; never invent packages, prices or dates; if nothing matches, say so and offer the closest match or the enquiry form; ask at most two clarifying questions before searching.
- **Output check** after each assistant turn: every package slug / URL / price in the text must appear in a tool result from this conversation; otherwise the turn is replaced with a safe fallback ("Let me check that for you") and the search tool is forced. Cheap regex, no second model call.
- Input caps: 500 chars per message; conversation trimmed to the last 20 messages plus a running summary.
- **Decision on the PRD open question:** Hinglish is supported by prompt ("reply in the language the customer writes in, Hindi or Hinglish included"); the UI and package content stay English. Gemini handles this natively; no translation layer.

### 5. Evals
- `evals/conversations/*.ts`: ~20 scripted dialogues with assertions (which tool was called with which args, no hallucinated slug, correct refusal for "Maldives", handoff created when asked for a human). Run with Vitest against the real provider, nightly via GitHub Actions (`schedule`), and on demand — never on every push, to protect the daily quota.

### 6. Admin conversation log
- `/admin/conversations`: list with outcome (booking started / enquiry created / dropped), message count, first user message; detail shows the transcript with tool calls inline.

### 7. "Notify me" for new departures
- `departure_alerts` (email, package_id or destination_id). Daily cron `api/cron/departure-alerts` (allowed on Hobby) emails subscribers when departures were added in the last 24 h. Offered by the concierge when `searchPackages` returns nothing for the requested month.

---

## Add-ons (unique nice-to-haves)

### A. Owner-side AI: draft a package (v3 stretch)
- Admin "Draft with AI" button → `generateObject({ schema: packageDraftSchema })` (zod schema mirroring the package insert + itinerary days) from a one-line brief and the destination's existing packages as style examples → result populates the package form **as a draft**; owner edits and saves. Never auto-publishes, never touches prices without the owner. Same provider abstraction.

### B. Best-time strip (v1 nice-to-have)
- `content/destinations/*.ts` carries `climate: Array<{ month, rain: 1|2|3, heat: 1|2|3, crowd: 1|2|3, price: 1|2|3 }>` (static, hand-written from public climate data). `<BestTimeStrip>` renders 12 cells with a colour scale; clicking a month links to `/packages?destination=…&month=…`. When the listing has a month filter, the strip highlights it. No API.

### C. Trip hub after booking (v2/v3 stretch)
- `/account/bookings/[id]/hub` (customer auth). Sections: countdown (departure date), departure details, documents checklist (`booking_checklist_items`, owner-editable defaults per package), **packing list** via `generateObject` cached in `packing_lists (destination_id, month)` so it's generated once per destination-month, weather via **Open-Meteo** forecast when within 16 days, else climate averages from B, WhatsApp group link (`departures.whatsapp_group_url`, set by owner).

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
v2: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
v3: `AI_PROVIDER` (`google` | `anthropic`), `AI_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY` (optional), `CHAT_GLOBAL_DAILY_LIMIT`.

## Risks specific to v2/v3
| Risk | Mitigation |
|---|---|
| Gemini free-tier quota exhausted by a traffic spike | Global daily cap + per-IP cap; UI degrades to the enquiry form |
| Free-tier data usage terms | Catalog is fictional; no real customer PII reaches the model (names/phones are collected by the enquiry form, not sent to the model) |
| Razorpay webhook arrives before the client callback (or never) | Both paths idempotent; pending bookings expire lazily |
| Model changes behaviour after a provider update | Nightly evals catch regressions; provider pinned by `AI_MODEL` |
| MapLibre bundle size on the package page | Load only when the storyboard is in view (`next/dynamic`, `ssr: false`) |
