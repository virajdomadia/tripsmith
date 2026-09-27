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
- The seed switches it on for 4 of the 12 packages.
- **Accept:** the discount appears and disappears exactly at each threshold in IST.

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

### R54. Per-booking history log (P16)
- **Each entry records:** every change to a booking, with the time in IST, the actor (owner, customer, webhook, cron, system), a plain-words description, and before/after values where useful.
- **Append-only:** a database trigger refuses any UPDATE or DELETE.
- **Views:**
  - The desk shows one merged timeline (history, payments and emails) with filter chips.
  - My trips shows the customer-safe entries as "Activity".
- The migration backfills entries from v2 data. Only bookings are logged; packages, coupons and deals are not.
- **Accept:** every write path added in v2 and v2.5 appears in the log, and nothing can edit or delete an entry.

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

## Platform

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
≈ 56 h across rows P0–P19 (see [07-plan.md](07-plan.md)). That's more than twice v2 (20.5 h) by design: the rule is "overdo the feature, not the setup", and v1 and v2 should hold up next to real operators before the AI versions begin. v3 starts only after P19 closes.
