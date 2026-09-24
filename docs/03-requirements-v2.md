# Tripsmith v2 — Requirements & Scope (Booking engine)

**Lifecycle step:** 3 of 17 for v2 · **Locked:** 2026-09-12 · **Re-validated:** 2026-09-24 against v1.0.1 as shipped (main `9fcc296`) — see [Re-validation decisions](#re-validation-decisions-2026-09-24) at the end
**Builds on:** [03-requirements.md](03-requirements.md) (v1 R1–R13). Design: [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md), [06-data-and-api.md](06-data-and-api.md). Plan: rows B0–B14 in [07-plan.md](07-plan.md).

## What v2 is
The site starts taking money. Every package page gains **Book now** beside Enquire; a booking is a specific departure, a set of travellers, a server-computed price, and a Razorpay payment — confirmed idempotently by client callback or webhook, whichever lands first. Customers get accounts and vouchers; the owner gets a bookings desk.

## Actors
- **Customer** — a visitor who pays. Gets an account (email code) at checkout.
- **Owner** — the admin; now also handles bookings, cancellations, reviews, deals.
- **Razorpay** — test mode; sends webhooks.

## Demo mode (applies to every email in v2)
While `EMAIL_FROM` is the Resend test sender (`@resend.dev` — no verified domain until the custom domain is bought), Resend delivers only to the owner's inbox. v2 therefore runs in **demo mode** until a verified sender is configured, and leaves it by itself when one is:
- sign-in codes are **shown on screen**, labelled "Demo mode — email delivery is off";
- customer emails (voucher, cancellation outcome, inbox replies) are redirected to `OWNER_NOTIFY_EMAIL` with a `[Test → customer]` subject, exactly as v1 enquiry emails are;
- the voucher is always downloadable from the success screen and My bookings, so nothing depends on email arriving.

---

## Customer requirements

### R14. Book now
- On the package page beside Enquire. Flow: choose departure → travellers (adults with occupancy double/triple/single, children 5–11) → **live price breakdown** (per-line, deal discount, total) → contact (name, phone, email) → Razorpay Checkout → success screen with booking ref.
- **Bookable departure:** the package is live; double, triple and child prices are all > 0 (single supplement ≥ 0); the date is **at least 2 days after today in IST**; enough seats for the whole party. Other dates show greyed with the reason — "On request — enquire" (unpriced), "Departs too soon", "Sold out".
- The Book-now panel reads **live** availability (uncached); seat counts on the prerendered page are indicative.
- Party size 1–12. Occupancy rules: `single` needs 1 adult; `double` 2; `triple` 3; children priced at child rate regardless of room.
- The Razorpay script loads only when the customer presses Pay. Without JavaScript the panel shows **Enquire to book**.
- A demo notice at checkout: bookings are visible to anyone using the public demo owner login; use test details (Razorpay is in test mode).
- **Accept:** the amount charged equals the server quote to the paisa; changing travellers re-quotes without reload; a departure that sells out mid-flow shows "no longer available" and returns to departure selection; an unbookable departure is refused by the api even when called directly; the whole flow works at 360 px.

### R15. Seat holds
- Creating the order holds the party's seats for **10 minutes**; `seatsLeft` seen by everyone else drops immediately.
- If payment doesn't complete, the hold lapses on its own and seats return — seat counting never depends on cron.
- **Hold abuse limits:** 5 booking starts / 10 min / IP; at most **1 active hold per email or phone** — starting a new one releases the previous hold. The owner can release a hold by hand from the desk. (IP + identity rotation remains an accepted risk, recorded in docs/12.)
- Hold, confirm and cancel recompute the package's starting price and revalidate its pages.
- **Accept:** two customers cannot both pay for the last seat (verified by a concurrency test with two parallel `createBookingOrder` calls on a 1-seat departure); an expired hold never blocks a new booking.

### R16. Payment verification
- Client callback: signature `HMAC_SHA256(order_id|payment_id, key_secret)` verified server-side before confirming.
- Webhook `payment.captured` verified with the webhook secret; **idempotent** on `razorpay_payment_id`. Registered on production only.
- Checkout opens with `timeout: 600`, closing itself when the hold lapses.
- **Late capture** (payment captured after the hold lapsed): re-check seats under the departure lock — enough seats → confirm as normal; none → record the payment, cancel the booking with reason `seats_gone`, flag **refund needed**, email owner and customer ("we couldn't hold your seat; your ₹X will be refunded within 5–7 days"). Refunds are made by hand in the Razorpay dashboard.
- **Accept:** replaying the same webhook 5× yields one payment row and one confirmation email; a forged signature is rejected with 400 and logged; `payment.failed` leaves the booking pending until the hold lapses; a late capture with no seats left never confirms the booking.

### R17. Confirmation
- Success screen + email with **voucher PDF** (booking ref, travellers, departure, hotels, inclusions, contact) + WhatsApp link.
- The voucher is **rendered on demand** and never stored; the success screen offers it via a signed link valid 30 minutes, so a customer who isn't signed in can download it straight after paying.
- **Accept:** voucher generated < 3 s; the same voucher is downloadable from My bookings; owner receives a new-booking email.

### R18. Customer accounts
- Email code (6 digits, 10-minute expiry, no passwords, no SMS). In demo mode the code is shown on screen. A code dies after **5 wrong tries**. The booking's email creates or logs into the account.
- `/account/bookings`: list with status, voucher download, "request cancellation".
- A signed-in customer who opens `/admin` is redirected to `/account`; the session endpoint reveals owner-only data (new-enquiry count) to the owner only.
- **Accept:** a booking made while logged out appears in the account after code verification with the same email; sessions persist 30 days; logout works.

### R19. Cancellation requests
- Customer submits a reason; status `requested`; owner approves/rejects with a refund note (refunds are handled outside the system in v2).
- **Accept:** approved cancellation frees the seats immediately; the customer is emailed on resolution; the cancellation policy page is linked from the form.

### R20. Deals
- Owner sets `deal_price`, `deal_label` and an end **date** on a package (stored in the existing `deal_ends_at` as the end of that day in IST — no schema change).
- **Rule:** the deal is a **flat amount off per traveller** = starting price − deal price (e.g. ₹24,999 → ₹21,999 = ₹3,000 off per person), applied to every departure and occupancy, never more than that traveller's own price. The quote shows it as its own line ("Deal −₹3,000 × 4").
- The deal ends at the **end of the chosen day in IST**. Validation: `0 < deal_price < starting price`; end date ≥ today (IST).
- Listing card and package page show the strikethrough starting price + deal price + label. Home gets a "Deals" strip when ≥ 1 active deal exists.
- **Accept:** an expired deal disappears everywhere without a deploy (quotes immediately; prerendered pages by the daily cron); JSON-LD `Offer.price` reflects the active deal.

### R21. Reviews
- Only customers with a `completed` booking (departure date passed) can review that package: rating 1–5 and text (no photo). One review per booking. Hidden until the owner approves.
- Package page shows approved reviews and the aggregate; `AggregateRating` in JSON-LD comes **only from approved reviews** — seeded testimonials never count.
- Stars everywhere (hotel rows and reviews) use a darker amber with ≥ 3:1 contrast on white, the number printed beside them (closes the H3 star-contrast item).
- The seed adds a demo traveller account with a completed booking on a past departure and one approved review, so the whole loop can be shown.
- **Accept:** a customer without a completed booking never sees the form; rating averages update on approval.

---

## Owner requirements

### R22. Bookings desk
- `/admin/bookings`: list newest first; filters by status, departure, package, date range; search by ref/name/phone.
- Detail: travellers, quote breakdown, payment timeline (orders, captures, failures, webhooks), voucher link, cancellation state; a red **refund needed** flag when set.
- **Mark paid (offline)**: for bank-transfer customers — re-checks seats under the departure lock (the 10-minute hold will usually have lapsed); records an `offline` payment and confirms, or refuses with the seat shortfall.
- **Release hold** on a pending booking.
- **CSV export** of the filtered list.
- Departure view: for an upcoming departure, the passenger manifest (all confirmed travellers).
- The daily cron marks holds lapsed > 1 h `cancelled` (reason `hold_expired`) and departed confirmed bookings `completed`.
- **Accept:** numbers match `departure_availability`; the manifest prints cleanly.

### R23. Reply from inbox
- On an enquiry: subject + body, optional itinerary PDF attachment; sent via Resend (demo-mode redirect applies); logged as a thread on the enquiry.
- **Accept:** replies appear in order with timestamps; failed sends are visible.

### R24. Reviews moderation, deals, enquiry hygiene
- Reviews: approve / hide. Deals: three fields in the package form with the R20 validation.
- Enquiry status moves are constrained: `new → contacted | converted | closed`, `contacted → converted | closed`, `converted → closed`, `closed → contacted` (reopen); nothing returns to `new`. Illegal moves are not offered and the api answers 409.
- The inbox understands all six enquiry types (`callback`, `group`, `chat-handoff` get labels); the public form still submits only the v1 three.

---

## Platform requirements

### R25. v2 quality
- Unit / db tests — only what would embarrass in a demo: `quoteBooking` to the paisa (occupancies, children, deal on/off, single supplement, unbookable dates), last-seat concurrency, webhook 5× replay → 1 payment + 1 email, forged signature rejected, late capture with no seats.
- **Journey test (api level, no browser):** order → signed test webhook → booking confirmed → voucher 200 for the booking's owner, 403 for anyone else. Checkout.js is not automated.
- Security: raw-body webhook verification, no amounts accepted from the client, customer routes check ownership, rate limits on booking starts (5 / 10 min / IP), code requests (5 / 15 min / email, plus per IP) and code verification (5 tries per code); CSP allows Razorpay's hosts and is re-checked on every page on a deployment.
- Performance: public-page budgets unchanged; one **PageSpeed Insights** run (not a local Lighthouse) on a package page with Book now open, target ≥ 85, recorded in docs/12.

## Explicitly out of scope for v2
Refund API · partial payments (unless add-on D is picked up) · multi-currency · dynamic pricing · coupons · invoices/GST · agent commissions · seat maps · review photos · automatic enquiry → booking linking.

## Add-ons that attach to v2 (optional, considered only after v4)
- **D. Split payment for groups** (~8 h) — see design §D; requirements: one pay link per traveller, booking confirms when fully paid or the leader covers the rest, 48 h hold, daily reminders.
- **C. Trip hub** (~6 h, needs v3's model for the packing list; can ship with a static list first).
- **Departure-city pricing** (~3 h).
- **Auto-link enquiry → booking** (~0.5 h) — a confirmed booking with the same email or phone + package marks the open enquiry `converted` and links it.
- **Review photos** (~1 h).

## Budget
≈ 17 h across milestones 2.0–2.3, rows B0–B14 (see [07-plan.md](07-plan.md)). Raised from 15 h at re-validation: the late-capture path, hold limits, demo mode, the role gate and the seeded demo trip.

---

## Re-validation decisions (2026-09-24)

Re-read against v1.0.1 as shipped. What changed and why, in the order decided:

| # | Finding | Decision |
|---|---|---|
| 1 | Resend test mode delivers only to the owner — codes and vouchers could never reach a customer | Demo mode (above); switches off by itself with a verified sender |
| 2 | `GET /auth/session` answers 200 for any role and includes `newEnquiries` — a customer cookie would pass the `/admin` gate | Role-aware session; customers redirected `/admin` → `/account` (B1) |
| 3 | Nothing limited `POST /bookings` — one script could hold every seat | 5 / 10 min / IP; 1 active hold per email or phone; manual release; residual risk accepted |
| 4 | One package-level `deal_price` vs prices per departure × occupancy — spec undefined | Flat amount off per traveller, capped; date-granular end in IST |
| 5 | Late capture after a lapsed hold; offline mark-paid on a lapsed hold | Checkout `timeout: 600`; re-check under lock; refund-needed path; its own test |
| 6 | Webhook URL named a domain that doesn't exist; previews are SSO-gated | Production only at `tripsmith-api.vercel.app/webhooks/razorpay`; tests sign payloads locally |
| 7 | The `razorpay` SDK blocks the async api (`requests`) | `infra/razorpay.py` on httpx + stdlib `hmac`, no SDK |
| 8 | Voucher "Blob-cached by updatedAt" repeats the v1.0.1 stale-key bug; Blob wrapper is public-only | Render on demand, never stored; 30-minute signed link on the success screen |
| 9 | Bookings change seats left, but prerendered pages only refresh on admin writes / cron | Booking events recompute + revalidate; Book-now panel reads live; lapsed holds refresh on the next event or the daily cron |
| 10 | Price 0 = "on request" and IST dates unknown to the booking spec | Bookable rules in R14 (priced, ≥ 2 days out in IST, live, seats) |
| 11 | Spec assumed no cron; v1.0.1 added `/cron/daily` | Cron also sweeps lapsed holds, completes departed bookings, prunes sessions, refreshes ended deals — never needed for correctness |
| 12 | Browser E2E and a local Lighthouse gate contradict v1.0.1 decisions | Api-level journey test; one PSI run recorded |
| 13 | CSP blocks Razorpay | Razorpay hosts site-wide; script on click; CSP verified on a deployment across every page; no-JS → Enquire to book |
| 14 | The `/api` rewrite loses the visitor IP and can't set cookies | Forwarding handlers for bookings, code request, code verify, voucher |
| 15 | Reviews invisible in a fresh demo; testimonials must not feed ratings; photos add uploads | Seeded demo trip + review; ratings from approved reviews only; no photo |
| 16 | v2 screens were never mocked | B0: Book now, success, demo sign-in, My bookings; desk/reviews/deal fields reuse existing patterns |
| 17 | Doc drift (`conversation_id` comment, migration table) | Fixed in B1 / this revision |
