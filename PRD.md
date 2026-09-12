# PRD — Tripsmith: Travel site + AI concierge

**Status:** v1 · Stage 1 fully decided 2026-09-12 · lifecycle step 2 (PRD) complete, next: step 3 Requirements & Scope
**Name:** Tripsmith · *trips planned in a chat*
**URL:** https://tripsmith.virajdomadia.com
**Slot:** #1 · Budget ~60 h · Build first

## One-liner
A travel-agency website where a customer can browse holiday packages, pay online, and — the wow — chat with an AI concierge that plans an itinerary and starts the booking for them.

## Who it's for
- **Customer:** an Indian traveller planning a short domestic holiday (Goa, Kerala, Himachal…).
- **Owner/admin:** the agency, managing packages, enquiries and bookings.

## Why this project
- Backs the Venus Vacations "booking engine" claim on the résumé with a live, better version.
- AI agent with tool calling is the highest-signal skill on 2026 job posts.
- Every small travel agency is a potential client for exactly this.

## Locked decisions (2026-09-12) — follow these until the project ends

### 1. What kind of travel site: a package-tour agency
Travel sites come in four species. Tripsmith is the first one, deliberately:

| Species | Examples | Core object | Conversion |
|---|---|---|---|
| **Tour operator / package agency ← Tripsmith** | SOTC, Veena World, every local agency | The *package* (fixed itinerary, price per person) | Enquire / book |
| OTA | MakeMyTrip, Booking.com | Third-party inventory (flights, hotels) | Instant self-serve |
| Experience marketplace | Viator, Klook, Airbnb | Many suppliers' listings | Instant, with payouts |
| Bespoke / concierge | Black Tomato | The conversation | Enquiry → quote |

Why not the others: an OTA can't be built honestly without live inventory APIs; a marketplace's hard part (suppliers, payouts) is already covered by Skillroom (project 5). The package agency is the only species that can be made **completely real** — real itineraries, real prices, real owner dashboard, real checkout — and it's the best host for an AI concierge (tool calling over a closed catalog never hallucinates). Not to be re-opened.

### 2. Build order: base site → booking engine → AI concierge
Each stage is shippable on its own. Stage 1 alone is already a complete agency website.

### 3. Identity
**Tripsmith is the agency.** The site is Tripsmith Holidays itself — one name everywhere, no "platform + demo agency" layer to explain, and the brand kit already exists.

### 4. Conversion action
Stage 1 converts through **enquiry form + WhatsApp**. Stage 2 adds **Book now**. Both stay on the package page forever — real agencies keep both because half of customers want to talk before paying.

## Stage 1 — Base agency website (no booking, no AI)

### The base feature: the package catalog (locked 2026-09-12)
Everything — site, booking engine, AI — is built on one thing: **a package, modelled properly.** The strong base is the package data model plus the search over it, not any single page.

```
Destination      slug, name, cover, intro, best months
Package          name, slug, destination, theme[] (beach/hills/honeymoon/family),
                 nights, days, starting price, cover + gallery, highlights[],
                 inclusions[], exclusions[], FAQ[], status (draft/live)
ItineraryDay     day no., title, description, meals, stay        (per package)
Departure        date, seats total, seats left, price per person (per package)
Enquiry          package, name, phone, travel month, travellers, status, notes
```

Why this shape is load-bearing:
- **Departures are rows, not "dates: text"** — Stage 2 sells a specific date with seat counts; the AI's `checkAvailability` tool is real.
- **Itinerary days are structured, not a markdown blob** — the AI can reference "Day 2" as a field; JSON-LD `TouristTrip` comes for free.
- **Theme, nights, price are typed and indexed** — the listing's filter bar and the AI's `searchPackages` tool call the *same* server function. Build it once.
- **Enquiry references a package** — the admin inbox already looks like a bookings list; Stage 2 just adds `Booking` beside it.

What the catalog feature includes in Stage 1:
1. The model above, seeded with **genuine content**: real places, real hotels, plausible 2026 prices, full day-by-day itineraries, 3–4 departure dates each. No "Day 2: sightseeing" filler. (Locked: keep it genuine.)
2. `searchPackages({destination, maxBudget, nights, theme})` as one server function
3. Packages listing with a filter bar calling that function
4. Package page rendering everything in the model
5. Admin CRUD for all of it — most Stage 1 hours go here

Home, Destinations, About, Contact are presentation over the same data.

### Seed catalog (locked 2026-09-12): 6 destinations, 12 packages

| Destination | Package A | Package B |
|---|---|---|
| Goa | 4D/3N North Goa beaches | 4D/3N South Goa quiet escape |
| Kerala | 5D/4N Munnar + Alleppey houseboat | 6D/5N Kochi–Thekkady–Kovalam |
| Himachal | 5D/4N Shimla–Manali | 6D/5N Manali–Kasol–Tosh |
| Rajasthan | 6D/5N Jaipur–Jodhpur–Udaipur | 5D/4N Jaisalmer desert |
| Andaman | 6D/5N Port Blair–Havelock–Neil | 5D/4N Port Blair + Havelock honeymoon |
| Ladakh | 7D/6N Leh–Nubra–Pangong | 6D/5N Leh + Turtuk |

Themes spread across beach / hills / honeymoon / family so every filter returns results. Each package: full day-by-day itinerary, real hotels, plausible 2026 per-person prices, 3–4 departure dates.

### Customer pages
1. **Home** — hero (large destination photo + one-line promise + search box: destination / budget / days), 4–6 featured destinations as image tiles, 6 popular packages as cards, "why us" strip (3–4 trust points), testimonials, footer with contact details.
2. **Destinations** — grid of destinations (Goa, Kerala, Himachal, Rajasthan, Andaman, Ladakh…), each tile → destination page.
3. **Destination page** — cover photo, short intro, best time to visit, all packages for that destination.
4. **Packages** — the main listing. Filters: destination, budget range, duration, theme (beach / hills / honeymoon / family). Card = photo, name, nights/days, starting price, highlights.
5. **Package page** — gallery, day-by-day itinerary, inclusions/exclusions, hotels, price per person, upcoming departure dates, FAQ, and the conversion action.
6. **About** — agency story, team, why trust us.
7. **Contact** — address, phone, WhatsApp, map, enquiry form.

### Conversion (Stage 1)
- "Enquire about this trip" on every package page → short form (name, phone, travel month, travellers) → emails the agency, saved to admin, shows a "we'll call you within 2 hours" confirmation.
- Sticky WhatsApp button site-wide.

### Admin
- **Single owner login** (locked 2026-09-12): one admin account, demo credentials shown on the landing page. No staff roles in Stage 1 — RBAC is Skillroom's headline, and a small agency is one person with a laptop.
- Manage destinations and packages (photos, itinerary, prices, departure dates)
- Enquiries inbox: list, status (new / contacted / converted), notes

### Look & feel
Warm, editorial, photo-led — large imagery, serif headings (Newsreader, per the brand kit), generous whitespace, one accent colour. Airbnb's calm, not MakeMyTrip's density. Mobile-first: most enquiries come from phones.

## Stage 2 — Booking engine
- Package page gains **Book now**: pick departure date & travellers → Razorpay checkout → confirmation email.
- Account: my bookings.
- Admin: bookings list with payment status.
- Details to be designed when Stage 1 is done.

## Stage 3 — AI concierge
- Chat: "3 days in Goa under ₹15k" → asks 1–2 questions → searches packages (tool) → proposes itinerary → "Book this" hands off to the booking flow.
- Details to be designed when Stage 2 is done.

## The wow moment
Chat plans a real trip from real packages and pre-fills the booking — no forms.

## Out of scope (v1)
Flights/hotels APIs, multi-currency, refunds/cancellations UI, reviews, multi-agency.

## Tech notes (to discuss)
- AI: Vercel AI SDK, streaming, tool calling (`searchPackages`, `checkAvailability`, `startBooking`); guardrails so it only recommends real packages
- Payments: Razorpay Checkout + webhook verification, idempotent booking creation
- Email: Resend
- SEO: destination and package pages statically generated, JSON-LD for TouristTrip/Offer

## Success criteria
- A stranger can go from landing page → chat → paid booking (test mode) in under 3 minutes
- Agent never hallucinates a package that doesn't exist

## Open questions
- Does the concierge need to handle Hindi/Hinglish?
- Do we let the chat complete payment, or always hand off to the checkout page?
