# Tripsmith v2 — Requirements & Scope (Booking engine)

**Lifecycle step:** 3 of 17 for v2 · **Locked:** 2026-09-12 (re-validated, not re-designed, when v2 starts)
**Builds on:** [03-requirements.md](03-requirements.md) (v1 R1–R13). Design: [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md), [06-data-and-api.md](06-data-and-api.md).

## What v2 is
The site starts taking money. Every package page gains **Book now** beside Enquire; a booking is a specific departure, a set of travellers, a server-computed price, and a Razorpay payment — confirmed idempotently by client callback or webhook, whichever lands first. Customers get accounts and vouchers; the owner gets a bookings desk.

## Actors
- **Customer** — a visitor who pays. Gets an account (email OTP) at checkout.
- **Owner** — the admin; now also handles bookings, cancellations, reviews, deals.
- **Razorpay** — test mode; sends webhooks.

---

## Customer requirements

### R14. Book now
- On the package page beside Enquire. Flow: choose departure (only with `seatsLeft > 0`) → travellers (adults with occupancy double/triple/single, children 5–11) → **live price breakdown** (per-line, deal discount, total) → contact (name, phone, email) → Razorpay Checkout → success screen with booking ref.
- Party size 1–12. Occupancy rules: `single` needs 1 adult; `double` 2; `triple` 3; children priced at child rate regardless of room.
- **Accept:** the amount charged equals the server quote to the paisa; changing travellers re-quotes without reload; a departure that sells out mid-flow shows "no longer available" and returns to departure selection; the whole flow works at 360 px.

### R15. Seat holds
- Creating the order holds the party's seats for **10 minutes**; `seatsLeft` seen by everyone else drops immediately.
- If payment doesn't complete, the hold lapses on its own and seats return — no cron.
- **Accept:** two customers cannot both pay for the last seat (verified by a concurrency test with two parallel `createBookingOrder` calls on a 1-seat departure); an expired hold never blocks a new booking.

### R16. Payment verification
- Client callback: signature `HMAC_SHA256(order_id|payment_id, secret)` verified server-side before confirming.
- Webhook `payment.captured` verified with the webhook secret; **idempotent** on `razorpay_payment_id`.
- **Accept:** replaying the same webhook 5× yields one payment row and one confirmation email; a forged signature is rejected with 400 and logged; `payment.failed` leaves the booking pending until the hold lapses.

### R17. Confirmation
- Success screen + email with **voucher PDF** (booking ref, travellers, departure, hotels, inclusions, contact) + WhatsApp link.
- **Accept:** voucher generated < 3 s; the same voucher is downloadable from My bookings; owner receives a new-booking email.

### R18. Customer accounts
- Email OTP / magic link (no passwords, no SMS). The booking's email creates or logs into the account at checkout.
- `/account/bookings`: list with status, voucher download, "request cancellation".
- **Accept:** a booking made while logged out appears in the account after OTP verification with the same email; sessions persist 30 days; logout works.

### R19. Cancellation requests
- Customer submits a reason; status `requested`; owner approves/rejects with a refund note (refunds are handled outside the system in v2).
- **Accept:** approved cancellation frees the seats immediately; the customer is emailed on resolution; the cancellation policy page is linked from the form.

### R20. Deals
- Owner sets `deal_price`, `deal_label`, `deal_ends_at` on a package. Listing card and package page show the strikethrough original + label; the quote applies the deal only while `deal_ends_at > now()`.
- Home gets a "Deals" strip when ≥ 1 active deal exists.
- **Accept:** an expired deal disappears everywhere without a deploy; JSON-LD `Offer.price` reflects the active deal.

### R21. Reviews
- Only customers with a `completed` booking (departure date passed) can review that package: rating 1–5, text, optional photo. One review per booking. Hidden until the owner approves.
- Package page shows approved reviews and the aggregate; `AggregateRating` in JSON-LD.
- **Accept:** a customer without a completed booking never sees the form; rating averages update on approval.

---

## Owner requirements

### R22. Bookings desk
- `/admin/bookings`: list newest first; filters by status, departure, package, date range; search by ref/name/phone.
- Detail: travellers, quote breakdown, payment timeline (orders, captures, failures, webhooks), voucher link, cancellation state.
- **Mark paid (offline)**: for bank-transfer customers — records an `offline` payment and confirms the booking.
- **CSV export** of the filtered list.
- Departure view: for an upcoming departure, the passenger manifest (all confirmed travellers).
- **Accept:** numbers match `departure_availability`; the manifest prints cleanly.

### R23. Reply from inbox
- On an enquiry: subject + body, optional itinerary PDF attachment; sent via Resend; logged as a thread on the enquiry.
- **Accept:** replies appear in order with timestamps; failed sends are visible.

### R24. Reviews moderation & deals
- Reviews: approve / hide. Deals: three fields in the package form with validation (`deal_price < starting price`, `deal_ends_at > now`).

---

## Platform requirements

### R25. v2 quality
- Unit: `quoteBooking` matrix (occupancies, children, deal on/off, single supplement), state-machine guards, signature verification, `departure_availability` formula, concurrency test for the last seat.
- E2E: package → Book now → order created (Checkout.js not automated) → signed test webhook → booking confirmed → voucher downloadable from the account.
- Security: raw-body webhook verification, no amounts accepted from the client, customer routes check ownership, rate limit on OTP requests (5 / 15 min / email).
- Lighthouse budgets unchanged on public pages; checkout page ≥ 85 perf (Razorpay script).

## Explicitly out of scope for v2
Refund API · partial payments (unless add-on D is picked up) · multi-currency · dynamic pricing · coupons · invoices/GST · agent commissions · seat maps.

## Add-ons that attach to v2 (only if hours remain)
- **D. Split payment for groups** (~8 h) — see design §D; requirements: one pay link per traveller, booking confirms when fully paid or the leader covers the rest, 48 h hold, daily reminders.
- **C. Trip hub** (~6 h, needs v3's model for the packing list; can ship with a static list first).
- **Departure-city pricing** (~3 h).

## Budget
≈ 15 h across milestones 2.0–2.3 (see [07-plan.md](07-plan.md)).
