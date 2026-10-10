# Tripsmith v2.5 — Requirements & Scope (Strengthen)

**Lifecycle step:** 3 of 17 for v2.5 · **Locked:** 2026-09-27, each item agreed one by one with Viraj · **Builds on:** v1 (R1–R13) and v2 (R14–R26) as shipped (main `cc084b2`) · **Plan:** rows P0–P19 in [07-plan.md](07-plan.md).

## Why v2.5 exists
v2 closed with a complete booking path. Before v3, it was compared with two groups.

**Live package sites:**
- Thrillophilia, Veena World, SOTC, MakeMyTrip Holidays, Pickyourtrail
- Indiahikes, Bikat
- Intrepid, Contiki, G Adventures
- GetYourGuide, Viator, Klook, Airbnb Experiences

**Operator software:**
- FareHarbor, Rezdy, Peek, Bókun, Checkfront, WeTravel, Xola, Sembark

The gaps fall into three groups:
- **How people pay:** deposits, waitlists, date changes, add-ons.
- **What happens between paying and travelling:** traveller details, a checklist, a trip pack, reminders.
- **How the owner sees and runs the business:** a calendar, reports, real refunds, GST documents, counter booking.

Viraj approved 17 researched items plus a full admin counter-booking screen, all to be built **before v3**. Every item costs ₹0 to run.

**Numbering.** Requirement numbers follow the plan rows: **R(38+n) belongs to row Pn**. R52 (phone bookings) was merged into R56. v2's coupon requirement already reused R26, and v3/v4 hold R26–R38. v3's re-validation renumbers its own list.

## Rules that apply to every row
- **Money has one door in and one door out.** Every payment settles through the existing locked capture function: web, deposit, part, balance, extras, a date-change difference or a payment link. Every refund goes out through one refund function (R51). The server builds every amount; no amount is ever taken from the client.
- **Every booking change is logged** in the history (R54), from the moment that row ships.
- **Honest data only.** There are no fake counters, and seed data is marked as seed data.
- **IST everywhere** for days, deadlines and months.
- **Migrations are expand-first.** Each is rehearsed on Neon dev; Viraj runs it on prod before the code merges.
- Each row gets its own branch, worktree and PR, in a new chat. Row-level details not fixed here are settled at the start of the row.

---

## Customer — before booking

### R39. Wishlist and compare (P1)
- **Saving:**
  - A ♡ on every package card and package page saves the trip.
  - Guests' saves live in the browser; on sign-in they copy into the account, shown as a **Saved** tab in My trips.
- **Comparing:**
  - Tick Compare on up to **3** packages, and a tray opens `/compare?p=a,b,c`.
  - One row per fact: price from, nights, places, hotels, inclusions and exclusions, next 3 departures with seats, and rating, plus Book and Enquire.
  - Rows that differ are highlighted, and the link is shareable.
  - On a phone you swipe between packages while the row labels stay pinned.
- Saved lists can't be shared, and there are no price or seat alerts (v3's Notify me covers those). The owner's dashboard shows the most-saved packages.
- **Accept:** a guest's saves survive sign-in; the compare page renders from the URL alone and reads well at 360 px.

### R40. Honest urgency labels (P2)
- The existing badges stay, with the exact count added: "Filling fast · 3 left" at 4 seats or fewer.
- New labels:
  - "**Booked N× this month**": confirmed bookings in the last 30 days, shown only at 3 or more.
  - "**Likely to sell out**": 70 %+ full and 2+ bookings in the last 14 days.
  - "**Last booked N days ago**": shown only within 7 days.
- No view counts. The labels are computed by the api, cached with the page, and refreshed by booking events and the cron.
- The seed adds a small set of realistic past bookings so the labels appear.
- **Accept:** every label traces to a query, and none shows without data behind it.

### R41. Trip leader (P3)
- **Admin:** a Trip leaders page with photo, name, languages, years, regions, a 2–3 line bio and a fun fact. Each package has a default leader, and any departure can switch to another.
- **Public:**
  - A "Your trip leader" card on the package page, and an avatar on each departure row.
  - A `/leaders/[slug]` page with the leader's upcoming trips.
  - Reviews show "Led by X".
- **Voucher and phone:** the voucher names the leader. The leader's phone number appears only in the trip pack (R48).
- **Demo:** 4 leaders with illustrated monogram avatars. There are no real photos of made-up people; real uploads remain supported.
- **Accept:** changing a departure's leader updates the page and the next voucher.
- **Decided at row start (Viraj, 2026-10-02):**
  - **Storage (migration 0020, expand-first):** a `trip_leaders` table — slug (unique, made from the name, editable), name, photo URL (optional), languages, years leading, regions, bio (≤ 300 characters), fun fact (≤ 140), phone, active. `packages.leader_id` is the default leader (optional — a package without one shows no card); `departures.leader_id` overrides it (empty = the package's default). Both keys refuse a delete.
  - **Delete or switch off:** a leader who was never assigned (past departures included) can be deleted. Anyone else is switched off instead, which is refused while they are a package's default or lead an upcoming departure (the refusal names them, so the owner reassigns first). A switched-off leader leaves the pickers, `/leaders/<slug>` returns 404, and past reviews still say "Led by X" without a link.
  - **Monogram avatars are drawn, never stored:** with no photo, a circle in one of six site colours picked from the slug, a faint mountain-contour line and two initials (one `LeaderAvatar` SVG: about 96 px on the card, 24 px on a departure row, 160 px on the leader's page). Real photos upload through the destination-cover path (BlobStore, `leaders/uploads/…`).
  - **The voucher** prints a text line — "Trip leader: Name · languages" — with no image, so its render makes no network call.
  - **Read live, never snapshotted:** a booking's leader is its departure's override, else the package default, read when the page or voucher is made. So a change shows on the next voucher, and after a date change (R45) the booking follows its new departure. Reviews' "Led by" reads the same way: review → booking → departure.
  - **`/leaders/[slug]`:** SSG + ISR, tags `leader:<slug>` and `leaders`; the static params come from one list read. JSON-LD `Person` (name, image, knowsLanguage, jobTitle "Trip leader", worksFor the site's Organization); in the sitemap. "Upcoming trips" = live packages' bookable future departures this leader actually leads (overrides count), grouped by package with the next dates. A small `/leaders` index ("Meet your trip leaders") is linked from the footer and the About page.
  - **Revalidation:** a leader edit revalidates `leader:<slug>`, `leaders` and `package:<slug>` for every package they lead by default or on an upcoming date; a package default or departure override change revalidates that package and the old and new leaders.
  - **Admin:** "Trip leaders" in the nav after Destinations (style A list of cards: avatar, name, regions, upcoming departures, active switch; panel editor like the destination form). Package editor B gets a "Trip leader" section (picker with avatars) and each departure row a compact leader select ("Package default (Name)"). The manifest header shows the leader's name and phone (owner only); booking detail C shows a Leader line. The calendar's leader filter waits for P11.
  - **Seed:** four made-up leaders with monogram avatars — Tenzin Norbu (both Leh trips, Manali–Kasol–Tosh), Kavya Rawat (Kasol weekend, Shimla–Manali, both Rajasthan trips), Meera Nair (both Kerala and both Andaman trips), Rohan D'Souza (the three Goa trips); one Kasol date overridden to Tenzin and one Andaman date to Rohan. Phones are the site's demo contact number, never an invented one. `seed.py --leaders` upserts the four by slug and fills package defaults and overrides only where they are still empty — it touches nothing else.
  - **Two PRs:** P3a — migration 0020, leaders CRUD + upload, the live leader read, the voucher line, the admin page, the package editor section and departure selects, manifest + desk lines, `--leaders`; P3b — the public card and row avatars, `/leaders` and `/leaders/[slug]`, sitemap + JSON-LD, "Led by X" on the review card (P4 finishes the verified card).
  - **Built in P3a (2026-10-02):**
    - **A changed default keeps the past:** when a package's default leader changes (or is cleared), its departures already gone that had no leader of their own are given the old default as their own — so a live read never rewrites who led a past trip (and "Led by" on its reviews).
    - **Picks must be switched on:** a package default or date leader the owner picks must exist and be switched on; a row that already has a switched-off leader keeps them when the form sends them back.
    - **Older forms are safe:** `leaderId` left out of the package body (or a departure row) leaves it as saved — a form from before P3 can't clear a leader (the web/api deploy race).
    - Routes: `GET|POST /admin/leaders`, `GET|PUT|DELETE /admin/leaders/{id}`, `POST /admin/leaders/{id}/active`, `POST /admin/leaders/photo`; `AdminPackage.leaderId`, `AdminDeparture.leaderId`, `AdminBooking.leader` and `Manifest.leader` (with the phone, owner only).
  - **Built in P3b (2026-10-02):**
    - Public reads: `PackageDetail.leader` (the default, as a card), `DepartureOut.leader` (each date's leader, own else default), `PublicReview.ledBy` (`slug` null once switched off — named, not linked); `GET /leaders` (switched-on, by name, with upcoming dates) and `GET /leaders/{slug}` (404 when off; live packages with upcoming dates they lead, soonest first). No phone anywhere public.
    - The package page gets a "Your trip leader" section before Dates & prices (and a "Leader" pill in the section nav); dates led by someone else are named under the card; each departure row says "Led by <first name>" with the avatar.
    - `/leaders` renders on request (like `/destinations`); `/leaders/[slug]` is SSG + ISR from one list read, tagged `leader:<slug>`, `leaders` and `packages` (a package change refreshes the trip cards); JSON-LD `Person` (no image for a monogram); both in the sitemap; linked from the footer and the About page.
    - Leaders are not drawn on the itinerary PDF, so they are left out of its version hash — a leader change never mints a new PDF.

### R42. Verified traveller label (P4)
- Each review card shows: ★ · name · **✓ Verified traveller** · Travelled <Mon YYYY> · with N others · Led by X.
- Under the package rating: "All reviews are from travellers who completed this trip."
- The label is automatic and can't be edited by the owner. No invented schema field is added.

## Customer — booking

### R43. Deposit now, balance later (P5)
- **At checkout:** the Book-now sheet offers "Pay in full" or "Reserve with 25 % now".
  - The deposit is 25 % of the total after deal and coupon, add-ons included, rounded to the rupee. It's set per package and on by default.
  - The balance is **due 30 days before departure** (the start of the full-refund window). Dates inside that window can only pay in full.
- **After the deposit:**
  - The deposit confirms the booking and holds the seats.
  - My trips shows "Balance due ₹X by <date>". The balance can be **paid in parts** (any amount, minimum ₹1,000), each through the same capture path. This also keeps every payment under Razorpay's ₹15,000 test cap.
  - The voucher shows "Balance due". The trip pack (R48) unlocks only once the booking is fully paid.
- **Reminders and cancellation:**
  - Reminders go out 7 and 3 days before the due date, and on the day (R53).
  - After **2 days' grace** the booking is cancelled with reason `balance_unpaid` and the seats are freed.
  - The refund follows the policy table, capped at what was paid, and is paid through R51.
- **Owner:**
  - A desk filter and column for balances due; paid, due and due-by on the booking, voucher and CSV.
  - Mark a balance paid offline, extend one booking's due date (logged), or switch deposits off per package.
- **Accept:** the deposit plus all parts equals the quote to the paisa; a replayed part-payment webhook records one payment; the cron cancels an unpaid booking and frees its seats.
- **Decided at row start (Viraj, 2026-09-29):**
  - **State:** a paid deposit moves the booking from `pending` to `partially_paid` (the status already existed, and the seat view already counts it); the part that clears the balance moves it to `confirmed`, so `confirmed` always means paid in full. Migration 0016 adds `bookings.deposit_paise` (null = pay in full) and `bookings.balance_due_on`, `packages.deposit_on` (default on), and the cancel reason `balance_unpaid`. The 25 %, the 30 days, the 2 days' grace and the ₹1,000 minimum are constants in code. Add-on D's unused `split` column is left alone.
  - **Rounding:** the deposit is rounded **up** to the whole rupee, so it is never under 25 % and the balance stays in whole rupees. A part is at least ₹1,000 unless less than that is left, when the remainder is the last part.
  - **Add-ons** picked at checkout count in the 25 %. **Extras added later** stay as P8b built them: paid in full at once with their own invoice; the balance does not move. When the owner removes a checkout add-on from a booking still on its deposit, its price comes off the balance first, and only money paid beyond the new total is refunded.
  - **Reminders are built in this row:** `/cron/daily` sends −7, −3 and due-day reminders, each recorded once in the history log so a re-run sends nothing twice, and the customer is emailed when the booking is cancelled. P15 later puts them under its switches and previews.
  - **GST as P13:** a receipt for every part, the tax invoice once paid in full. A `balance_unpaid` cancellation never had an invoice, so its refund has no credit note. The cancel lands 28 days out (the 50 %-retained tier), so the refund is paid − half the price, usually ₹0: the deposit is kept.
  - **Two PRs:** P5a customer path (0016 with all the schema, pay choice on the sheet, deposit capture, pay the balance in My trips, voucher "Balance due", reminders and the overdue cancel), then P5b owner (desk filter and column, CSV, mark the balance paid offline, extend the due date up to the departure day, logged, and the per-package switch).
  - **Built in P5b (2026-10-01):** an extension may move the due day as late as departure − 3 days (not the departure day itself), so the 2-day grace ends before the trip and the tidy's cancel lands on the departure day at the latest; it can't be set in the past. The desk gets a "Deposit paid" tab and a "Balance due" tile; marking the balance paid records the whole balance as one offline payment.

### R44. Waitlist (P6)
- **Joining:**
  - A sold-out departure shows "**Join waitlist · N waiting**".
  - The form asks for name, email and party size. No account is needed.
  - One entry per email per departure, plus the booking-start IP limit.
  - The waitlist closes 3 days before departure.
- **Offers:**
  - Seats can be freed by an approved cancellation, a lapsed hold, an unpaid balance, a date change away, or the owner adding seats.
  - When that happens, the list is walked **in order**, and the first party that fits gets an offer. A bigger party is skipped but keeps its place.
  - The claim link **holds the seats for 24 h**, shortened so it always ends before the 2-days-out cutoff. It opens the Book-now sheet with the date locked, for full payment or a deposit.
  - An unclaimed offer moves to the next entry.
  - Offers also show in My trips after sign-in.
- **Owner:** the waitlist per departure (position, party, state), remove an entry, offer seats by hand.
- **Accept:** two offers never promise the same freed seat (concurrency test); an expired claim moves on; a party that doesn't fit is skipped, not dropped.
- **Decided at row start (Viraj, 2026-09-30):**
  - **One walk, many triggers.** A single `walk(departure)` runs under the departure's row lock (after the contact lock, the order used everywhere) and counts lapsed holds and lapsed offers as free. It runs:
    - in the same transaction as every event that frees seats: an approved cancellation, a `balance_unpaid` cancel, Cancel link / release hold on the desk, the owner raising `seats_total`, and the departures the daily tidy's expired links gave back;
    - **before any new hold** on that departure (the web order and the counter), so the list gets first call on seats a lapsed 10-minute hold gave back before a walk-in can take them — a lapsed web hold fires no event, and this is where it's noticed. *Built:* this walk commits on its own just before the order's transaction, so an order refused as sold out doesn't take the offers it made back with it;
    - on every waitlist read (joining, opening a claim link, My trips, the owner's list);
    - every 15 minutes from a GitHub Actions schedule calling `/cron/waitlist` (the repo is public, so it costs ₹0; it needs `CRON_SECRET` as a repo secret), with the daily tidy as the backstop.
    - *Built:* money on any booking for the same email and date marks the entry `booked`; the emails are owed on the row (`mail_due`) and sent after the commit, each claimed once, so a route and the tick never send one twice.
  - **An offer holds seats on its own row,** not as a pending booking (a waitlister has no phone, travellers or quote). Migration 0018 replaces `departure_availability` so it also subtracts the party of every entry with `state = 'offered' and offer_expires_at > now()`; an offer lapses lazily, exactly like a hold. Other visitors keep seeing the date sold out while it's offered.
  - **The claim link** is HMAC-signed like the voucher link (`waitlist:{entry}:{offer_no}`) and opens `/packages/<slug>?claim=<token>#book`: sheet B with the date locked and the email fixed, pay in full or deposit by the usual rules. Claiming turns the offer into an ordinary pending web booking whose hold ends when the offer would have (the rest of the 24 h, not 10 minutes); the entry becomes `claimed` and links the booking, and a failed payment can be retried inside that window. The party may shrink (the seats it no longer needs are walked on at once) and may grow only into seats nobody holds, else a 409 "Only N seats are held for you".
  - **Offer length:** until `min(now + 24 h, 00:00 IST on departure − 1 day)`, the last moment the web still books; no offer goes out with under 6 hours left. One live offer per entry; the walk skips entries already offered.
  - **An expired offer, or a claimed booking left unpaid,** sends the entry to the **back** of the list, still waiting (keeping its place would re-offer the same seats to the same person).
  - *Built (review, 2026-10-01):* the walk that lapses an entry never re-offers it in the same pass, and after **3** offers that ran out an entry stays on the list but only the owner offers it seats again (P6b), so nobody is emailed a hold every day until departure. A list that closes sends no "back on the list" email. A claim's 24 h hold survives the same person starting another booking. If Razorpay can't open a claim's order, the offer comes back only while its seats are still free; otherwise the entry goes to the back. No offer goes out for a date the web can't sell (package not live, or priced on request). Joining needs no email confirmation (R44: no account) — the booking-start IP limit is the guard.
  - **Emails,** sent directly until P15 puts them under its switches: the offer (link and end time in IST), and once, when the walk finds it lapsed, "Your offer expired — you're back on the list at #N". Both are recorded on the entry. The owner gets no email; the list is on the admin.
  - **Owner (until P11's calendar):** a Waitlist section on the departure manifest page — position, name, email, party, state, offer end, joined — with Remove and **Offer seats** (any waiting entry, out of order, when its party fits the free seats). A "N waiting" chip on the package editor's departure rows and on the desk's departure card links to it.
  - **Migration 0018 (expand-first):** `waitlist_entries` (`departure_id`, `name`, `email` lower-cased, `party` 1–12, `position` bigint — "back of the list" = current max + 1, `state` waiting / offered / claimed / booked / removed / closed, `offer_expires_at`, `offer_no`, `offered_by_user_id` (null = automatic), `booking_id`, `joined_ip`, timestamps), a partial unique index on `(departure_id, email)` while waiting, offered or claimed, an index on `(departure_id, state, position)`, and the new view. With no rows the view returns exactly what it did.
  - **Joining** uses the booking-start IP limit and closes once IST today is past departure − 3 days. The departure data carries the waiting count; the package page revalidates on join and removal.
  - *Built in P6b (2026-10-01):* the manifest page carries the Waitlist panel (never printed, and the manifest still loads if it fails). Reading it walks the list first. **Offer seats** works on any waiting place, out of order and past the 3 automatic offers, when its party fits the free seats; it is refused when the place isn't waiting, the date can't take offers, or the seats are short. If the walk has just offered that place on its own, the request counts as done. **Remove** passes an offer's seats down the list at once and leaves a started booking alone. "N waiting" shows on the desk's seat strip and panel, on the package editor's dates, and on the collapsed "Dates and prices" subtitle. A hand offer counts towards the 3.
  - **Two PRs:** P6a customer and engine (0018, join, the walk and all its triggers, claim, emails, My trips offers, the 15-minute tick, the concurrency tests); P6b owner (the manifest section, remove, offer by hand, the chips).

### R45. Change date (P7)
- **Customer, from My trips:**
  - Change date is **instant self-serve**, and the owner is notified.
  - The customer picks another bookable departure of the same trip, for the same party, and sees a re-quote: new fare − current fare + fee = pay or refund.
- **Fee**, by days before the **original** departure:
  - 30+ days: free
  - 15–29 days: ₹1,000 per traveller
  - 14 days or fewer: not available online
  - Only one self-serve change per booking.
- **Pricing:** discounts already earned (deal, early-bird, coupon) stay as the same ₹ amounts; only the base fare is re-priced.
- **Paying or refunding the difference:**
  - Price goes up: the new seats are held for 10 minutes while the customer pays, then the move happens in one atomic swap.
  - Price goes down: the difference is refunded through R51, or taken off an outstanding balance.
- **Knock-on effects:**
  - A deposit booking's due date is recalculated.
  - The freed seats feed the waitlist.
  - A new voucher and emails go out; the history records old → new.
- **Owner:** can move any booking from the desk at any time, including changing the party, with the fee editable or waived.
- **Accept:** seat counts on both departures stay exact under concurrency; a date change that raises the price confirms only after the difference is paid.
- **Decided at row start (Viraj, 2026-10-01):**
  - **The hold on the new date:** a `date_changes` row (migration 0019), never a second booking. It records the booking, the old and new departure, the party, a state (`held` / `done` / `lapsed` / `cancelled`), when the hold ends, the fee, the net difference, the new quote, and who made the change (with the owner's reason for a changed fee). `departure_availability` also subtracts the party of every live `held` row, as P6's offers do.
  - **One capture path:** the change's Razorpay order has a `payments` row with `date_change_id` (like P8b's `payments.extras`). `settle_capture` sends it to `changes.settle_change`, which makes the swap: the booking moves, the row becomes `done`, the quote is replaced, history records old → new, and the old date's waitlist is walked (`waitlist.walk_locked`) in the same transaction. The Checkout callback, sync, the webhook and replays all land there.
  - **Locks:** contact → both departures in id order → booking (`lock_change`). The new date's waitlist is walked first, in its own committed transaction; if offers take the seats, the change is refused.
  - **Late capture** after the 10 minutes: within an hour of the change, with seats free on the new date and no cancellation request open → the swap; otherwise the payment is refunded in full (reason `surplus`: it never bought anything, so no credit note), the booking stays on its date and the change is `lapsed`. A Razorpay order never expires, so a payment days later never moves a booking at a stale quote or fee tier. (Added after the P7a review.)
  - **Net amount** = new fare − current fare + fee. Above ₹0 → pay (the 10-minute hold); ₹0 or less → instant swap, and the gap is refunded (or taken off the balance).
  - **The fee joins the booking total**, so a later cancellation applies the tier % to it, as R46 does for add-ons.
  - **GST:** a price-up after the tax invoice exists gets a supplementary tax invoice for the change payment (`TS/FY/NNNN`, the P8b extras-invoice pattern, 5 %, SAC 998555, "Date change <old> → <new>"); the first invoice never changes. A price-down refund gets a credit note through R51. A deposit booking has no invoice yet, so its full-payment invoice covers the new total.
  - **Add-ons** carry over unchanged at their snapshot price, even if the owner has since switched one off.
  - **Deposit bookings:** deposit re-based to 25 % of the new total, balance due = `deposit.due_on(new departure)`. Pay now = the top-up to the new 25 % (usually ₹0) while that due day is ahead; everything still owed when the new date is inside 30 days. A price-down comes off the balance first; money goes back only when what is paid exceeds the new total.
  - **Discounts kept as ₹:** the deal, early-bird, coupon and the counter's manual discount keep their exact amounts — no upgrade when the new date's tier is bigger, no loss when the deal has ended. The fare never goes below ₹1, so on a much cheaper date a discount can be cut to fit.
  - **Self-serve:** a `confirmed` or `partially_paid` booking with no open cancellation request and no live change, while IST today ≤ original departure − 15; any other bookable date of the same package; one completed customer change per booking (owner moves don't count).
  - **Owner move (desk):** date and/or party, at any time, any status but cancelled or completed. Fee pre-filled from the tier, editable down to ₹0; a changed fee needs a reason (history + invoice). Price up → the move is made at once and the owner picks: paid now offline (cash/UPI/bank, through `settle_capture`) or added to the balance (the booking becomes/stays `partially_paid`, due on the new date's due day, today if that has passed — extendable as in P5). Price down → refund through R51 (amount editable) or off the balance. A party change re-prices the fare for the new party; deal and early-bird stay at their per-traveller ₹, coupon and manual as flat ₹; per-night add-ons are re-multiplied by the new party and per-traveller ones capped at it. The target date needs seats for the whole party (no overselling, as at the counter). The customer gets "Your trip has moved" with the new voucher.
  - **Owner notified** of a self-serve change by email (owner address) plus the history entry.
  - **Two PRs:** P7a — migration 0019, the engine, self-serve in My trips, emails, the swap concurrency test; P7b — the owner's Move dialog on the desk.
  - **Built in P7b (2026-10-02):**
    - A pending booking isn't moved — release it and book again (its Razorpay order is for the old amount). Confirmed and part-paid bookings move at any time, even inside the website's 2-day window, but never onto a date already gone or priced on request.
    - The fee the desk suggests is the self-serve tier on the booking's date for the new party (inside 14 days, the ₹1,000-a-traveller rate).
    - A fall refunds exactly what the booking then holds beyond its new total; it isn't editable (a smaller refund would only leave the rest flagged as owed).
    - GST: payments captured after a change made on an invoiced booking fund its rise first (the change's own payment, then later ones), each getting a supplementary invoice — so a rise added to the balance is invoiced when the balance is paid.
    - A party change on the same date re-prices the booking in place; the customer gets "Your booking has been updated".
    - After the P7b review: a party change re-counts only the add-ons that came with the booking (Add extras purchases keep their count and their own invoice; the owner takes one off if the party shrank); a room type new to the party gets the biggest per-head deal and early-bird the booking earned; renames ride on a move; the same date with the same party suggests no fee (a typed fee needs a reason); the owner's move ends a customer change still waiting for its payment (a late payment is refunded in full).

### R46. Add-ons (P8)
- **Owner, in the package form:** an Add-ons panel. Each add-on has a name, description and price, is charged per booking, per traveller, or per traveller per night (with a maximum number of nights), and can be switched on or off.
- **Customer, in the Book-now sheet:**
  - A "Make it yours" step after travellers: toggles, per-traveller steppers, a nights picker.
  - One quote line per add-on, priced by the server only.
- **Pricing rules:**
  - Deals, coupons and early-bird **never** apply to add-ons.
  - Add-ons count toward the deposit and follow the same cancellation table.
- **Later purchases:** "Add extras" in My trips until 7 days before departure.
- The voucher, manifest and CSV list the add-ons. There are no stock limits; the owner switches an add-on off instead.
- The seed gives each package 3–4 realistic add-ons.
- **Decided at row start (Viraj, 2026-09-28):**
  - **GST for extras bought after the tax invoice exists:** a **second tax invoice** for the extras, numbered at the event (`TS/FY/NNNN`), its total = the extras payment. The first invoice never changes. A later credit note may cover several invoices (GST s.34 allows it), capped at their sum. Same 5 % rate, SAC 998555: the extras are part of the tour supply.
  - **Cancellation:** add-ons follow the same tier table as the trip; the tier's % applies to the whole total, add-ons included.
  - **Removing extras:** customers can only add. The owner can remove an add-on from the desk: a full refund of that line through `refunds.refund()`, a credit note, and a history entry.
  - **Coupons:** a coupon's %, cap and minimum amount are measured on the trip fare after the deal, never on add-ons.
  - **Snapshot:** each booking keeps the name and price it bought at (`booking_addons`). Editing, switching off or deleting the package's add-on never changes an existing booking.
  - **Per-night add-ons** are charged for the whole party × the nights chosen (1 to the owner's maximum). A per-traveller one is charged × the travellers who take it (at most the party).
  - **"Add extras" deadline:** open while the IST date is on or before departure − 7 days. A payment that captures after that still stands: the money is in. If the booking is cancelled before an extras payment captures, that payment is refunded automatically.
  - **Seed:** 53 add-ons across the 14 packages, each with a photo from its package's gallery.
  - **Two PRs:**
    - **P8a:** migration 0014 (every P8 table, including the P8b ones), the package-form panel, the "Make it yours" step in Book now B (wide sheet + live receipt), server quote lines, voucher/emails/manifest/CSV/invoice line, and the seed.
    - **P8b:** Add extras in My trips, the second invoice, owner remove, and the replay test.

### R47. Early-bird pricing (P17)
- **Owner:** up to **2 tiers** per package, each "₹X off per traveller when booked N+ days before departure", switchable on or off.
- **Customer:**
  - Departure rows show "Early bird −₹X · book by <date>", and cards carry an "Early-bird savings" tag.
  - The quote has its own line.
  - A price ladder under the departure picker shows the price if you book today, after tier 1 ends, and after tier 2 ends.
- **Order and scope:**
  - Discounts apply in the order deal → early-bird → coupon.
  - Early-bird applies per traveller, children included, never below ₹1, and never on add-ons.
  - It's counted from the booking day in IST.
- The "from ₹" price and JSON-LD are unchanged. The cron revalidates pages when a tier ends.
- The seed switches it on for 4 of the 14 packages.
- **Accept:** the discount appears and disappears exactly at each threshold in IST.
- **Decided at row start (Viraj, 2026-09-28):**
  - **Storage:** five columns on `packages` (migration 0015): `early_bird_on`, `eb1_days` + `eb1_off_paise`, `eb2_days` + `eb2_off_paise`. Tier 2 is optional; when set, tier 1 is further out **and** bigger. A switched-off package keeps its tiers.
  - **Which tier:** the furthest-out tier that fits applies; tiers never add up. It applies while the IST booking day ≤ departure − N days, so "book by" = departure − N, inclusive.
  - **When it counts:** at the moment the booking starts (the quote and the hold), the same rule as the deal. A hold started on the last day keeps it through its 10 minutes. The copy says "counted in IST from the day you book".
  - **Snapshot:** each booking (and each open hold) keeps the early-bird line in its `quote`. The owner may change or switch off a live tier at any time; that changes new quotes only, and the form says so.
  - **Stacking:** early-bird always stacks with the deal, with no combined cap. Per traveller it comes off what the deal left and never takes that traveller below ₹1. The admin form shows the worst case: deal + tier 1 as ₹ and % of the cheapest double.
  - **Coupons** are measured on the fare after the deal and the early-bird.
  - **Later rows:** a date change (P7) keeps the early-bird as a fixed ₹ amount; counter booking (P18) gets it from the same `build_quote`.
  - **Seed:** Munnar + Alleppey houseboat 90 d −₹1,500 / 45 d −₹750 · Leh, Nubra and Pangong 120 d −₹2,500 / 60 d −₹1,000 · Havelock honeymoon 120 d −₹2,000 / 60 d −₹1,000 · Jaisalmer desert nights 60 d −₹1,000 / 30 d −₹500. Production gets them with `seed.py --early-bird`, which touches nothing else.
  - **One PR** (migration 0015 + api + web + seed).
  - **What flips exactly at IST midnight** (added in review): the quote, the Book-now date rows, the ladder and the page's dates table (worked out on the visitor's IST day). The cards' "Early-bird savings" tag is prerendered and moves when the daily cron rebuilds the page, within the hour after midnight. It is a hint; the price always comes from the quote.
  - **Seed:** a full re-seed sets tiers only on packages it creates. On an existing package they are the owner's, like a deal.

## Customer — after booking

### R48. Add to calendar and the trip pack (P10)
- **Add to calendar** on the success screen, the booking page and the confirmation email:
  - a Google Calendar link and an `.ics` download;
  - all-day, from departure to return, with the meeting point as the location;
  - a stable UID, so a date change replaces the event instead of duplicating it.
- **Trip pack:** a booking-page tab plus a PDF on the voucher design.
  - It unlocks **7 days before departure, once fully paid**. Before that, a locked card shows the unlock date.
  - Contents: meeting point and time with a Maps link, the leader's name and phone, hotel names, addresses and phones, the day-by-day plan, the owner's "Know before you go" notes (packing as plain text, weather, network, cash, local rules) and the emergency number.
- **Owner:** meeting point and time per package, overridable per departure, and a "Know before you go" field. The seed fills notes for all 12 packages.
- The interactive packing list stays in the Trip-hub add-on.
- **Accept:** the `.ics` imports correctly into Google Calendar and Apple Calendar.
- **Decided at row start (Viraj, 2026-10-09):**
  - **Storage (migration 0022, expand-first, all nullable or defaulted):**
    - Packages get `meet_place`, `meet_time` (time), `meet_maps_url` and `meet_note` (≤140 characters, e.g. "look for the blue Tripsmith board"), plus `know_before`, a JSONB object with five fixed keys: weather, network, cash, rules, packing. Each is plain text up to 500 characters; blank ones are hidden.
    - Departures get the same four `meet_*` columns. A null place means the date uses the package's meeting point; a date overrides the set as a whole, never field by field.
    - Hotels (`packages.hotels` JSONB) gain optional `address` and `phone` — a schema change, no column.
    - Bookings get `pack_read_at`, `calendar_added_at` and `calendar_via` ('google' or 'ics').
    - The emergency number is the business 24×7 line (`BUSINESS`), no new field.
  - **Calendar event:** all-day; DTSTART = departure, DTEND = departure + `days` (exclusive end). SUMMARY "<Package> (TB-…)", LOCATION = the effective meeting place (the destination's name when none is set), DESCRIPTION = the booking page link + "Meeting time and your leader's phone are in the trip pack from <date>". UID `<ref>@tripsmith.virajdomadia.com`, SEQUENCE from the booking's `updated_at` (only rises), METHOD:PUBLISH.
  - **Date changes:** a Google Calendar link can't carry a UID, so after a date change (P7 self-serve or owner move) the calendar part goes back to not done with "Date changed — update your calendar", and the coupon recommends the `.ics`, which replaces the old event.
  - **Where:** the success screen (a 30-minute signed link like the voucher's, so a signed-out payer can use it), the booking page's calendar coupon, and the first confirmation email (deposit or full) plus the date-change and move emails. Email links go through a signed api redirect that records the click, then redirects to Google or serves the `.ics` — no attachment, so email clicks count too.
  - **"Added to calendar"** = a click on either button. We can't know the calendar accepted it.
  - **Trip pack:** a coupon on My trip D (no tab — D has none), under "Opens later" with the locked "What's inside" preview; unlocked, it moves to "Now" and opens into the pack (meeting point box, leader, hotels, day plan, Know before you go, emergency number, PDF button); deep link `#pack`. The PDF is rendered on demand on the voucher design and never stored (it holds the leader's phone): customer `/account/bookings/{ref}/trip-pack.pdf`, owner preview any time from the desk (P10b).
  - **"Trip pack read"** = the first open of the unlocked coupon or the first PDF download; recorded once, never reset.
  - **Lock rule:** open when status `confirmed` and IST today ≥ departure − 7; readable while `confirmed` or `completed` until return + 30 days (the details purge day). Booked inside the 7 days → opens once paid. A counter booking paid offline is `confirmed` like any other; `partially_paid` or an unpaid link never opens it. No leader yet → "Your leader will be confirmed soon" + the 24×7 number. Locked copy: "Unlocks <date> — 7 days before departure, once the booking is fully paid." + "₹X still to pay." or "You're fully paid, so it opens on the day."
  - **Readiness:** equal parts — details, balance, pack, calendar, each checklist item (3 items → 7 parts, the mockup's 7). A locked pack counts 0 with "Opens <date>". `booking_percent`, the desk Ready %, `departure_readiness` and the CSV share the one function. Existing bookings' % drops once (two new parts at 0) — accepted.
  - **Emails:** no new automatic email; P10 only adds the calendar links to the existing confirmation, date-change and move emails. The "pack is open" and −3 day emails are R53 (P15).
  - **Seed:** all 12 seeded packages get a meeting point at a real public place (airport or station) with a Google Maps search URL, Know before you go text and area-level hotel addresses; hotel phones use the site's demo number, never real hotels'. Prod: `seed.py --pack` fills only empty fields, by slug.
  - **Two PRs:** P10a customer — migration 0022, `.ics` + Google link, the pack api + PDF, readiness parts, My trip coupons, success screen, email links, `seed --pack`; P10b owner — Package editor B "Meeting point & Know before you go" section + hotel address/phone, the per-departure override, desk booking detail pack preview + read/calendar status, the meeting point in the manifest header.

### R49. Traveller details and a pre-trip checklist (P9)
- **Details, collected after payment** on the booking page, one card per traveller. The lead booker can fill everyone in.
  - Fields: ID type and number (Aadhaar, passport, DL, voter ID), date of birth, emergency contact, food (veg, non-veg, Jain, vegan, allergies), medical notes.
  - Required by default: ID, emergency contact and food, configurable per package.
  - Details lock 3 days before departure.
- **Checklist in My trips:** a countdown and a readiness bar made of:
  - details complete;
  - balance paid;
  - trip pack read;
  - added to calendar;
  - the owner's tick-box items per package (no uploads).
- **Owner:** the manifest shows every field; a "details missing" desk filter; a readiness % per departure.
- **Privacy:**
  - ID numbers are masked everywhere except the owner's printable manifest.
  - The cron deletes them 30 days after the trip ends.
  - The form carries a demo notice, and the seed uses fake IDs.
- **Accept:** a customer only ever sees their own booking; ID numbers never appear unmasked in lists, emails or the CSV.
- **Decided at row start (Viraj, 2026-10-08):**
  - **Storage (migration 0021, expand-first):** a `traveller_details` table, one row per `booking_travellers` row (delete cascades): ID type, the ID number, its last four digits, date of birth, emergency contact (name, relation, phone), food, allergies, medical notes, updated at/by. Its own table keeps the sensitive data in one place, and the purge is a plain DELETE.
  - **ID numbers are encrypted at rest** (Fernet from `cryptography`, key in the `ID_NUMBER_KEY` env var on Vercel prod + preview and in `.env.local`; tests make their own). Lists, emails, the CSV and every page read only the type and the last four, so nothing but the owner's printable manifest ever decrypts.
  - **Per package:** `packages.details_required` (any of ID, date of birth, emergency contact, food, medical; default ID + emergency + food) and `packages.checklist` — up to six owner items `{key, label, note}` with stable keys, so a renamed item keeps the customers' ticks. Customers tick them on My trips; the ticks are stored per booking.
  - **Who and when:** details open on `confirmed` and `partially_paid` bookings only, never `pending`. The lead booker fills everyone in. The customer's form locks when IST today ≥ departure − 3; the owner can still edit from the desk until the purge.
  - **Counter "details later" (R56):** those travellers simply count as details missing (filter and readiness). Names stay editable in the form, so "Traveller 2" becomes the real name. A date of birth must agree with the booked child/adult rate at departure, and it fills an age left empty.
  - **Readiness:** equal parts — traveller details (complete travellers ÷ travellers), balance paid (0 or 1) and each owner item (0 or 1). The api returns it as a list of parts, so R48 (P10) adds "trip pack read" and "added to calendar" without placeholders for unbuilt features. Per departure: the mean of its seat-holding bookings' percentages, plus the count of travellers missing details (the calendar, P11, reuses it).
  - **Masking:** Aadhaar `XXXX XXXX 1234`; passport, DL and voter ID `XXXX 1234`. Unmasked only on the owner's printable manifest — not the desk detail. After saving, the customer (and the owner) see it masked and must re-enter the whole number to change it; blank keeps it. Format checks only (Aadhaar 12 digits, passport a letter + 7 digits, voter ID 3 letters + 7 digits, DL 10–16 letters/digits), no checksums, so made-up numbers pass.
  - **Purge:** the daily cron deletes the whole details row 30 days after the trip's return date (date of birth, medical notes and emergency contact have no use after the trip either) and writes one history entry per booking, "Traveller details deleted (30 days after the trip)", by cron. The history log can't be edited (R54's trigger), so it never holds an ID number, date of birth or medical note — only who changed which fields ("Added Mira Rao's ID (Aadhaar ending 4821)").
  - **Emails:** nothing automatic — the −14/−5 day reminders are R53 (P15). The desk gets a manual **Send details link** (one email that opens the booking page at the details step, plus a history entry).
  - **Seed:** no prod seed (the seed's demo bookings are past trips the purge would clear). Fake IDs such as `0000 0000 4821` in local scenarios and tests only.
  - **Two PRs:** P9a customer — migration 0021, encryption, the details api and the per-traveller form on the booking page (demo notice, lock), the My trip D pass (countdown, readiness punch holes, owner-item ticks), the purge in `/cron/daily`; P9b owner — Package editor B required fields + tick items, the printable manifest with every field, the desk "details missing" filter + Ready % column, booking detail C with masked details and owner edit, readiness % per departure, Send details link, masked CSV columns.

## Owner

### R50. Departure calendar (P11)
- **`/admin/calendar` month grid:**
  - a chip per departure with a sold / held / free fill bar and a waitlist dot, coloured by how full it is;
  - a month strip: departures, seats sold %, revenue, balances due, details missing;
  - filters by destination, package and leader.
- **Side panel** when a chip is clicked:
  - seats, price, leader, meeting point, readiness;
  - bookings and the waitlist;
  - buttons for the manifest, editing the departure, and offering seats to the waitlist.
- **Add a departure** by clicking an empty day. There is no drag-to-move; that goes through R45.
- Revenue shows only in the side panel and the month strip.
- On a phone it becomes an agenda list by week, and it's keyboard-navigable.
- **Motion:** the fill bars grow in and months slide.
- **Accept:** the numbers match `departure_availability` and the desk.

### R51. Real refunds and GST documents (P13)
- **Refunds:** one refund function through the Razorpay refund API. Test mode is verified first thing in the row.
  - **Triggers:**
    - An approved cancellation: the amount is pre-filled from the policy tier and editable, and approval sends the real refund.
    - A late payment with no seats: an automatic full refund.
    - A cheaper date change, or an unpaid balance: automatic.
  - A refund is split across payments, newest first.
  - Refund webhooks update the timeline: requested → processed or failed, with a retry.
  - The refund row is written before the API call, so a refund can never happen twice.
  - Offline payments keep "Refund made (offline)".
- **GST documents**, generated on demand on the voucher design:

  | Document | When | Number |
  |---|---|---|
  | Receipt | every payment | `RC/2026-27/NNNN` |
  | Tax invoice | when fully paid | `TS/2026-27/NNNN` |
  | Credit note | each refund after an invoice exists | `CN/2026-27/NNNN` |

  - Numbers run per financial year and never skip or repeat.
  - GST is 5 % (SAC 998555) and prices are GST-inclusive. Karnataka customers get CGST 2.5 % + SGST 2.5 %; other states get IGST 5 %.
  - Checkout adds a **State** dropdown and an optional business GSTIN with company name.
  - The business's GSTIN is a clearly labelled fake demo number.
  - Documents download from My trips and the desk. The invoice is attached to the fully-paid email.
- **Accept:** replays and double clicks never refund twice; invoice numbers stay gap-free under concurrency (tested); the invoice total equals the amount paid.
- **Decided at row start (2026-09-27):**
  - **Test mode, checked on our account:**
    - Refunds come back `processed` in the API response itself.
    - The same `X-Refund-Idempotency` key returns the same refund; the same key with a different body gets a 409.
    - The minimum is ₹1. Asking for more than is left is refused, and so is refunding a payment that was already fully refunded.
    - `speed: optimum` is processed as normal, so we always send `normal`.
  - **The refund row's id is the idempotency key.** A retry after a lost answer gets the same refund back.
  - **Webhooks:** `refund.processed` and `refund.failed` are ticked on the prod webhook. The failed path is tested with signed fake events, because test mode never fails a refund.
  - **Approve has a confirm step.** It shows the amount (pre-filled from the tier, still editable) and how it splits across payments. Money leaves only on Confirm.
  - **Late money is refunded automatically.** A late capture with no seats gets a full refund, and so does money landing on a booking that no longer takes it: the second-payment surplus, or a payment on a cancelled booking.
  - **Offline payments:** their share becomes a refund waiting for the owner's "Refund made (offline)".
  - **Documents** show "Tripsmith (demo business) · Bengaluru, Karnataka 560038" and GSTIN `29AABCT1234F1Z5`, printed with "Demo GSTIN, not registered".
  - **Bookings from before this row** have no State, so they are treated as Karnataka: the place of supply falls back to the supplier's.
  - **Two PRs:** P13a refunds (migration 0012), then P13b GST documents (migration 0013).

### R53. Automatic trip emails (P15)
- **Sent by the daily cron:**
  - balance reminders (−7 and −3 days, and on the due date) and the overdue cancellation;
  - details missing (−14 and −5 days);
  - the trip pack (−3 days, PDF attached);
  - a review request 2 days after return;
  - "**Still thinking about <trip>?**" the morning after a hold lapsed with no later booking by that email. It goes once per email per package and links back to the sheet with the party pre-filled.
- **Sent instantly:** waitlist offers, date changes and refunds.
- **Rules:**
  - Each email goes at most once per booking and type; a re-run of the cron sends nothing twice (tested).
  - Every send is logged in the history, and the booking gets an Emails list.
  - Only the review request and the still-thinking email carry an unsubscribe link.
- **Owner, `/admin/settings/emails`:** switch each type on or off, preview it with real data, send a test to yourself.
- No coupon for reviews, and no "starts tomorrow" email.
- **Decided at row start (Viraj, 2026-10-10):**
  - **Storage (migration 0023, expand-first, new tables only):**
    - `email_sends` is the ledger: booking_id (null for still-thinking), email (lower-case), package_id, type, stage (smallint), anchor date, state (`sending`, `sent`, `held`, `failed`, `skipped`), attempts, last error kind, sent_at, created_at. Unique on (booking_id, type, stage, anchor) for booking emails, and on (email, package_id) for still-thinking.
    - `email_switches`: type (primary key), on, updated_at, updated_by. A missing row means on.
    - `email_suppressions`: (email, type) primary key, created_at.
    - The migration copies the P5 `balance.reminder` history claims into the ledger, so nothing is reminded twice on deploy day.
  - **Under the ledger and the switches (default on):** balance reminders, details reminders, trip pack, review request, still-thinking. P5's reminders move off their `booking_events` claim; the history entry keeps its wording.
  - **Always on (no switch):** confirmation, the overdue `balance_unpaid` cancellation and its email (a policy action, still in the 01:00 tidy), date change and move, cancellation and its resolution, refund, waitlist offer and lapse, sign-in.
  - **Triggers (IST) and who gets them:**
    - Balance: 7 and 3 days before the due day, and on it — `partially_paid`.
    - Details missing: 14 and 5 days before departure — `confirmed` or `partially_paid`, details still open (before the lock) and someone still owes a required field.
    - Trip pack: 3 days before departure, the PDF attached — `confirmed` and the pack open. A part-paid booking is skipped (it can only be part-paid at −3 after an extended due day, whose own reminder goes that day); once paid it gets the pack on the next run.
    - Review request: 2 days after return (departure + nights) — `completed`, no review yet.
    - Every type skips a booking with an open cancellation request.
  - **Re-arming:** the ledger's anchor is the departure date (the due date for balance). A date change, an owner move to another date or an extended due day re-arms every stage; a move that keeps the date sends nothing again.
  - **Catch-up:** a missed run (cron down, failure) sends the latest stage that is due on the next run, never two stages of one type in one run.
  - **Still-thinking:**
    - A lapse is a `web`-channel hold cancelled `hold_expired` whose hold ended yesterday (IST). Counter links and waitlist claims are left out — they have their own emails.
    - "No later booking": that email has no booking created after the lapsed hold, on any package, other than another lapsed hold.
    - Once per email per package; skipped when the address unsubscribed or the package has no bookable future departure.
    - The link pre-fills the sheet with plain parameters (no personal data, no signature): `/packages/<slug>?date=YYYY-MM-DD&double=1&triple=0&single=0&children=1#book`. The date is dropped when that departure is gone or full; add-ons are not carried.
  - **Unsubscribe:** only on the review request and still-thinking; per address and per type. A signed link `unsub:{email}:{type}` opens `/unsubscribe?t=…` with a confirm button (POST), and the emails carry `List-Unsubscribe` + `List-Unsubscribe-Post` for one-click.
  - **New instant email:** "Your refund of ₹X is on its way" when Razorpay reports the refund processed. Confirmation, date change and cancellations already log to the history; waitlist offers have no booking and stay logged on the entry.
  - **Cron:** a new Vercel cron `/cron/emails` at 09:00 IST (`30 3 * * *`), 20 s budget and at most 25 emails a run. Each claim is committed before its send; failed rows are retried up to 3 attempts. The 15-minute GitHub tick also calls it between 09:00 and 21:00 IST to drain leftovers and retries (needs the CRON_SECRET repo secret). A cron re-run sends nothing twice (tested).
  - **Owner:** a "Settings" item at the foot of the admin nav (style A) opens `/admin/settings/emails`: per type a switch, its trigger in plain words, the count sent in the last 30 days, Preview (pick a real booking that fits, rendered in a sandboxed iframe, nothing logged) and Send test (to `OWNER_NOTIFY_EMAIL`, subject `[Test]`).
  - **Emails list (booking detail C):** the emails already sent (from the history) plus "Coming up", computed from the same rules, with each type's switch state ("Trip pack · 10 Nov · off").
  - **Two PRs:** P15a engine — 0023, ledger, switches, `/cron/emails`, the five types, the refund email, unsubscribe, the sheet's prefill; P15b owner — settings page with preview and test send, the Emails list.

### R54. Per-booking history log (P16)
- **Each entry records:** every change to a booking, with the time in IST, the actor (owner, customer, webhook, cron, system), a plain-words description, and before/after values where useful.
- **Append-only:** a database trigger refuses any UPDATE or DELETE.
- **Views:**
  - The desk shows one merged timeline (history, payments and emails) with filter chips.
  - My trips shows the customer-safe entries as "Activity".
- The migration backfills entries from v2 data. Only bookings are logged; packages, coupons and deals are not.
- **Accept:** every write path added in v2 and v2.5 appears in the log, and nothing can edit or delete an entry.
- **Settled at row start (2026-09-27):**
  - **Actors** are stored as owner / customer / webhook / cron / system (plus the user's id when known). The desk shows the owner by name ("Viraj D."), then "Customer", "Razorpay", "Daily tidy" and "System".
  - A payment through Checkout or the check-on-close sync is the **customer's** entry, and the webhook's is **Razorpay's**. Mark paid is the owner's. A late capture that finds no seats adds its own **system** entry for the cancellation.
  - **Customers see** their money and their asks: booked, payment received or failed, hold lapsed, confirmed, cancellation asked, approved or rejected (with the owner's note), refund made, completed, review sent, and the emails sent to them. They never see Razorpay ids, offline references, refund-needed flags, owner emails, review moderation or before/after values. Each entry is written with the customer's wording, or none.
  - **Backfill:** migration 0010 rebuilds entries from v2 rows, marked `backfill`. Times read off `updated_at` are marked approximate (≈). The desk shows one divider, "Rebuilt from records — the log started on <date>". v2 kept no email records, so no email entries are invented.
  - **Emails** are logged by subject, never by address, in a short transaction after the send. Every other entry is written in the same transaction as its change, so a replay that changes nothing writes nothing.
  - The trigger refuses UPDATE and DELETE. TRUNCATE and DROP stay possible, since they are schema-owner operations and the test harness truncates.

### R55. Reports (P12)
- **`/admin/reports`** with presets: this month, last month, season, 12 months, custom. All in IST.
- **Sections:**

  | Section | What it shows |
  |---|---|
  | Money | booked / collected / refunded / net, balances due, revenue by month |
  | Packages | revenue and fill per package |
  | Occupancy | fill per departure, with the emptiest upcoming departures flagged |
  | Funnel | views → enquiries → holds → paid, with no new tracking |
  | Cancellations | rate, reasons and refunds |
  | Discounts | ₹ given by deals, coupons and early-bird vs the bookings they brought in |
  | Add-ons | revenue and attach rate |
  | Channels | web vs counter (R56) |
  | Customers | party size, booking lead time, repeat customers |

- Every chart has a table view and a CSV export. Charts use shadcn charts (Recharts) in Tripsmith's colours, including dark mode.
- The seed adds a year of history, marked as seed data.
- **Accept:** totals reconcile with the desk CSV for the same range.

### R56. Counter booking (P18; absorbs R52 phone bookings)
- **Entry points:**
  - Bookings → New booking.
  - **Convert to booking** from an enquiry: pre-filled from the enquiry, which is then marked converted and linked. This delivers the "auto-link enquiry → booking" add-on.
  - New booking on a departure, from the calendar.
- **One page:** steps on the left, the live server quote on the right.
  1. **Trip:** dates allowed up to departure day.
  2. **Party:** capped at the seats left instead of 12.
  3. **Add-ons.**
  4. **Discounts:** deal and early-bird apply automatically; an optional coupon; an optional **manual discount** in ₹ or % with a **required reason**, never below ₹1, shown on the invoice and in the history.
  5. **Customer:** search by phone, email or name, with past trips shown, or create one. The account is linked by email, so the booking appears in their My trips.
  6. **Traveller details:** now or later.
  7. **Settle:**
     - a **Razorpay Payment Link** for the full amount or the deposit. Seats are held for 24 h; the link can be copied, shared on WhatsApp through a `wa.me` link, or emailed; a paid link settles through the same capture function;
     - **paid now** by cash, UPI or bank, with a reference: instant confirmation and a receipt;
     - **deposit now, balance later.**
- **Everything downstream** (vouchers, documents, emails, reminders, the trip pack) works exactly as for web bookings.
- **Channel and staff:** the booking records its channel (web / phone / walk-in / WhatsApp / enquiry) and who created it. The desk can filter by channel.
- An expired link releases the seats, logs it and feeds the waitlist. There is no upward price override.
- **Accept:** a counter booking and a web booking for the same party quote identically, apart from the manual discount; a replayed paid-link webhook confirms once.
- **Decided at row start (Viraj, 2026-09-30):**
  - **Payment Links, probed in test mode:** a link takes an `expire_by` at least 15 minutes ahead; a repeated `reference_id` is refused; a paid link cannot be cancelled; about five creates in a few seconds answer 429 for a moment. The ₹15,000 test cap is checked when the link is **created** (₹15,000.00 accepted, ₹15,000.01 refused), so above it the counter offers the deposit link or paid now; the limit applies to `rzp_test_` keys only. A link gets its Razorpay order only when the payer opens it, and the payment carries the link's notes.
  - **One capture function:** the link's `payments` row keeps `razorpay_link_id`, and the link's notes carry that row's id. A `payment.captured` for an order we don't know yet finds the row through the notes, writes the order id onto it and goes through `capture_razorpay_payment` → `settle_capture` like any other payment, idempotent on the payment id. No new webhook events are subscribed. Two more ways in, through the same function: Razorpay's redirect back (`callback_url`, signature checked) lands the customer on a "Paid" page, and the desk has **Check payment** (reads the link).
  - **Manual discount:** after the coupon (deal → early-bird → coupon → manual), on the trip fare only, never on add-ons; ₹ or %, whole rupees, never taking the fare below ₹1; a reason is required. It is kept in the quote snapshot as `manual {offPaise, percent, reason}` — no quote line, no booking column. Prices include GST, so it lowers the taxable value; the invoice prints "Discount: <reason>" and the history records it. A deposit is 25 % of the total after it.
  - **The 24 h hold:** a link booking is the same `pending` booking with `hold_expires_at` = now + 24 h, capped at 00:00 IST on the departure day (under an hour left → no link, take payment now); the link's `expire_by` is the same instant. Counter holds are left out of the one-hold-per-email rule in both directions. **Cancel link** cancels it at Razorpay first; if Razorpay says it was paid, the payment is synced instead. At expiry the seats come back on their own (the availability view); the daily tidy then cancels the booking with "Payment link expired at <time> — seats released" and returns the departures whose seats it freed, which P6's waitlist will take.
  - **Counter-only rules:** dates up to the departure day (the web's 2-day minimum doesn't apply); the party is capped at the seats left instead of 12. No upward override.
  - **Traveller details later:** the lead traveller takes the customer's name and the rest are "Traveller 2…"; ages may be left empty except for children. The desk booking page gets **Edit travellers** now; the customer's own form comes with P9.
  - **Migration 0017 (expand-first):** `bookings.channel` (text: web / phone / walk_in / whatsapp / enquiry, default `web`, so every existing booking reads as web), `bookings.created_by_user_id`, `bookings.enquiry_id` (Convert marks the enquiry converted and links it), `payments.razorpay_link_id`, and `booking_travellers.age` nullable. The desk filters by channel.
  - **Entry points now:** Bookings → New booking and Convert to booking. The calendar button lands with P11.
  - **Two PRs:** P18a the counter page (wizard + receipt, mockup C), paid now and deposit now, manual discount, customer search, Convert, channel and the desk filter, Edit travellers, and all of 0017; then P18b Payment Links (create, copy / WhatsApp / email, webhook mapping, the redirect back, Check payment, Cancel link, the expired log).

## Platform

### R59. Admin redesign (P20)
- Added 2026-09-27 after the P0 mockups; it doesn't follow the R(38+n) numbering because R58 was taken.
- The sidebar stays as it is today (the Ink rail). The inside of each existing admin page is rebuilt to the mockup Viraj picked:

  | Page | Picked layout |
  |---|---|
  | Dashboard | C · Money desk: cash coming in, going out and at risk, with a 40-day cash chart |
  | Bookings desk | A · attention tiles, status tabs, live filters, row click fills a side panel |
  | Booking detail | C · Lifecycle: status stepper and only the valid next actions |
  | Enquiries | A2 · rows with waiting time against a 2 h target, filter chips, conversation thread with snippets, stages, follow-up dates, Convert to booking |
  | Packages | B · Photo catalogue with health checks |
  | Package editor | B · form beside a live preview of the customer page |
  | Destinations | A · cover cards with the editor beside them |
  | Reviews | A · queue with a reading pane |
  | Coupons | B · Campaign board: what each code brought in |
  | Sign in | B · Postcard: photo with the form card |

- Same data and endpoints as today. Parts that belong to later rows (balances, readiness, channel, Quoted stage) appear when those rows ship.
- Built right after P16, so later rows land on the new pages.
- **Accept:** each page matches its mockup at desktop and 390 px, and the existing admin tests pass.
- **Settled at row start (2026-09-27):**
  - Read-only api additions are allowed where a picked mockup needs numbers that aren't served yet: `GET /admin/money` for the Money desk, and per-coupon results for the Campaign board. Existing endpoints don't change.
  - Enquiries A2's follow-up date and Lost reason come with migration 0011 (`follow_up_on`, `lost_reason`). It is expand-first: Viraj runs it on prod before that PR merges. The Quoted stage waits for its own row.
  - P20 ships as three PRs:
    - **P20a:** money and bookings (Dashboard C, Bookings desk A, Booking detail C).
    - **P20b:** inbox (Enquiries A2, Reviews A, Coupons B).
    - **P20c:** catalogue (Packages B, Package editor B, Destinations A, Sign in B).

### R57. Groundwork (P0)
- **Mockups** of the signature v2.5 screens, using real photos:
  - compare;
  - the sheet with add-ons, deposit and price ladder;
  - My trips with the checklist and trip pack;
  - the departure calendar, counter booking and reports.
- **Test fixes:**
  - the `test_deals.py` module-level `TODAY` flake;
  - concurrency tests for a coupon's last use at hold, and for a cancellation racing a late capture.
- **Real email:**
  - Viraj creates a free Gmail account for Tripsmith (not a personal one), and the api sends through Gmail SMTP with an app password.
  - Demo mode then switches off by itself.
  - Accounts at `@example.com` keep showing the sign-in code on screen, so portfolio visitors can still use the demo traveller.

### R58. v2.5 close (P19)
- A security pass on payment links, the refund API, document access, traveller data and waitlist claims.
- One PageSpeed Insights run each on `/compare` and on a package page with Book now open, with ≥ 85 as the target.
- Write-ups: docs/12, a docs/17 v2.5 section, the README and the portfolio card.

## Out of scope for v2.5
- **Stays in the after-v4 add-on bucket:** split payment for groups; a credit wallet and referrals; review photos; departure-city pricing; the Trip hub.
- **Not planned:**
  - EMI/BNPL (needs lenders);
  - WhatsApp Business messages and live chat (paid, or need staffing);
  - staff roles;
  - channel manager or agent commissions;
  - waivers and gift cards;
  - add-on stock limits;
  - drag-to-move on the calendar;
  - upward price overrides;
  - AI dynamic pricing (v3 is the AI version).

## Budget
≈ 63 h across rows P0–P20 (see [07-plan.md](07-plan.md)); P20, the admin redesign, was added after the P0 mockups. That's more than twice v2 (20.5 h) by design: the rule is "overdo the feature, not the setup", and v1 and v2 should hold up next to real operators before the AI versions begin. v3 starts only after P19 closes.
