# PRD — Tripsmith: Travel site + AI concierge

**Status:** v1 · lifecycle steps 1–7 complete for v1–v4 (2026-09-12) — see [docs/](docs/) · next: step 8 Project Setup, milestone 1.0
**Name:** Tripsmith · *trips planned in a chat*
**URL:** https://tripsmith.virajdomadia.com
**Slot:** #1 · Budget ~60 h (v1–v3) + ~6 h v4 · Build first

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

### 2. Versions: v1 agency website → v2 booking engine → v3 AI concierge → v4 MCP server
Four major versions, each with one new hard thing and one demo. All three are specified through lifecycle step 7 up front (requirements, design, schema, API, plan); v2 and v3 each begin with a short step-3 re-validation before coding. Inside a major, minor releases (1.0, 1.1 …) are deployable milestones defined in step 7. v1 alone is already a complete agency website.

| Version | Ships | Proves | ~Hours |
|---|---|---|---|
| **v1 Agency website** | Catalog, search, package pages, enquiry + WhatsApp, itinerary PDF, single-owner admin, SEO | A complete, live, real agency site | 32 |
| **v2 Booking engine** | Book now → Razorpay → confirmation, my bookings, admin bookings | Payments, webhooks, idempotency | 15 |
| **v3 AI concierge** | Chat with `searchPackages` / `checkAvailability` / `startBooking` tools | Tool-calling agent over a real catalog | 15 |
| **v4 Tripsmith anywhere** | Remote MCP server exposing the same tools, resources and a planning prompt to Claude Desktop / ChatGPT / Cursor | The domain layer is a reusable core; MCP integration | 6 |

### 3. Identity
**Tripsmith is the agency.** The site is Tripsmith Holidays itself — one name everywhere, no "platform + demo agency" layer to explain, and the brand kit already exists.

### 4. Conversion action
v1 converts through **enquiry form + WhatsApp**. v2 adds **Book now**. Both stay on the package page forever — real agencies keep both because half of customers want to talk before paying.

## v1 — Base agency website (no booking, no AI)

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
- **Departures are rows, not "dates: text"** — v2 sells a specific date with seat counts; the AI's `checkAvailability` tool is real.
- **Itinerary days are structured, not a markdown blob** — the AI can reference "Day 2" as a field; JSON-LD `TouristTrip` comes for free.
- **Theme, nights, price are typed and indexed** — the listing's filter bar and the AI's `searchPackages` tool call the *same* server function. Build it once.
- **Enquiry references a package** — the admin inbox already looks like a bookings list; v2 just adds `Booking` beside it.

What the catalog feature includes in v1:
1. The model above, seeded with **genuine content**: real places, real hotels, plausible 2026 prices, full day-by-day itineraries, 3–4 departure dates each. No "Day 2: sightseeing" filler. (Locked: keep it genuine.)
2. `searchPackages({destination, maxBudget, nights, theme})` as one server function
3. Packages listing with a filter bar calling that function
4. Package page rendering everything in the model
5. Admin CRUD for all of it — most v1 hours go here

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

The definitive v1 feature list with acceptance criteria is **[docs/03-requirements.md](docs/03-requirements.md)** (R1–R13). Summary:

### Customer pages
1. **Home** — hero (large destination photo + one-line promise + search box: destination / budget / days), 4–6 featured destinations as image tiles, 6 popular packages as cards, "why us" strip (3–4 trust points), testimonials, footer with contact details.
2. **Destinations** — grid of destinations (Goa, Kerala, Himachal, Rajasthan, Andaman, Ladakh…), each tile → destination page.
3. **Destination page** — cover photo, short intro, best time to visit, all packages for that destination.
4. **Packages** — the main listing. Filters: destination, budget range, duration, theme (beach / hills / honeymoon / family). Card = photo, name, nights/days, starting price, highlights.
5. **Package page** — gallery, day-by-day itinerary, inclusions/exclusions, hotels, price per person, upcoming departure dates, FAQ, and the conversion action.
6. **About** — agency story, team, why trust us.
7. **Contact** — address, phone, WhatsApp, map, enquiry form.

### Conversion (v1)
- "Enquire about this trip" on every package page → one form with a standard / customise-this-trip toggle → saved to admin, emails both sides (itinerary PDF attached), "we'll call you within 2 hours".
- Sticky WhatsApp button site-wide, package pre-filled.
- **Itinerary PDF** download on every package page, generated from package data.
- Share (WhatsApp / copy link) with OG image per package.
- Package page also shows occupancy pricing (double / triple / child / single supplement) and departure badges (filling fast / sold out / guaranteed); listing filters include travel month.

### Admin
- **Single owner login** (locked 2026-09-12): one admin account, demo credentials shown on the landing page. No staff roles in v1 — RBAC is Skillroom's headline, and a small agency is one person with a laptop.
- Manage destinations and packages (photos, itinerary, prices, departure dates), draft/live, duplicate package
- Enquiries inbox: list, status (new / contacted / converted / closed), notes, CSV export
- Dashboard: enquiries this week, top packages, upcoming departures

### Look & feel
Warm, editorial, photo-led — large imagery, serif headings (Newsreader, per the brand kit), generous whitespace, one accent colour. Airbnb's calm, not MakeMyTrip's density. Mobile-first: most enquiries come from phones.

## v2 — Booking engine (~15 h)
The site starts taking money. Feature list locked 2026-09-12; acceptance criteria in [docs/03-requirements-v2.md](docs/03-requirements-v2.md).

| Feature | What it is |
|---|---|
| **Book now** | On the package page beside Enquire: pick a departure → travellers by occupancy (adults double/triple, children, single) → live price breakdown → Razorpay Checkout → paid |
| **Seat holds** | Seats reserved for 10 min while paying; released on timeout / failure |
| **Payment verification** | Razorpay webhook + signature check; idempotent booking creation (no double booking on retry) |
| **Booking confirmation** | Email with a **voucher PDF** (reuses the v1 PDF generator) + WhatsApp link |
| **Customer accounts** | Email/OTP login; "My bookings" with status and voucher download |
| **Admin bookings** | List with payment status, filter by departure, manual "mark paid" for offline payments, CSV export |
| **Deals** | Discounted price + offer tag on a package; deals strip on home |
| **Reply from inbox** | Owner emails a customer from the enquiry detail, PDF attached, logged on the record |
| **Cancellation requests** | Customer requests cancellation → status; refunds handled offline (no refund API in v2) |
| **Reviews** | Customers with a completed booking can leave a rating + photo; shown on the package page |

## v3 — AI concierge (~15 h)
The wow. Feature list locked 2026-09-12; acceptance criteria in [docs/03-requirements-v3.md](docs/03-requirements-v3.md).

| Feature | What it is |
|---|---|
| **Concierge chat** | Floating assistant on every page; "3 days in Goa under ₹15k for 2" → asks 1–2 questions → answers only from real packages |
| **Tools** | `searchPackages` (the v1 server function), `checkAvailability` (v2 departures + seats), `startBooking` (opens v2 checkout pre-filled) |
| **Streaming + package cards in chat** | Results render as real package cards, not text |
| **Guardrails** | Never invents a package or price; refuses off-catalog requests politely; evals in CI |
| **Handoff to human** | "Talk to an agent" → creates an enquiry with the chat transcript attached |
| **Hindi / Hinglish** | Supported by prompt — replies in the customer's language; UI stays English |
| **"Notify me" for new departures** | Email capture the concierge can offer when nothing fits |
| **Admin: conversation log** | Owner sees chats, which packages were suggested, and drop-offs |

## v4 — "Tripsmith anywhere": MCP server (~6 h) — added 2026-09-12, the capstone
The agency lives inside the customer's own assistant. Feature list locked; acceptance criteria in [docs/03-requirements-v4.md](docs/03-requirements-v4.md).

| Feature | What it is |
|---|---|
| **Remote MCP server** | `POST /api/mcp` (Streamable HTTP) — add it to Claude Desktop, ChatGPT, Cursor or any MCP client |
| **Tools** | the v3 tools re-exposed unchanged: `searchPackages`, `checkAvailability`, `startBooking` (checkout URL, never pays), `createEnquiry` |
| **Resources** | `tripsmith://packages/{slug}`, `tripsmith://destinations/{slug}` as markdown — read a package without a tool call |
| **Prompt** | `plan-a-trip` guided planning prompt |
| **Guardrails & logging** | catalog-only rules, per-client rate limits, `mcp_requests` log, dashboard tile "trips planned via MCP" |
| **Developer page + proof** | `/developers` with one-line install config; README GIF of Claude Desktop planning a Goa trip |
| **Stretch: authenticated tools** | MCP OAuth via Better Auth → `myBookings`, `getVoucher` (~3 h) |

Why last: it needs v3's tools and v2's checkout to exist, and it's the sentence that ends the case study — "add our travel agency to your AI".

## Nice-to-have (only if hours remain)

### Unique features — what would make Tripsmith stand out (added 2026-09-12)
| Feature | What it is | Placement |
|---|---|---|
| **Owner-side AI: draft a package** | Admin types "5N Kerala honeymoon, ₹35k" → AI drafts the whole package (days, hotels, inclusions, FAQ) into the editor for review. AI as operator tooling, not just a chatbot | v3 stretch (~4 h) |
| **Best-time strip** | On each destination page, a 12-month bar showing rain / heat / crowd / price level, tied to the travel-month filter ("October — ideal") | v1 nice-to-have (~2 h) |
| **Trip hub after booking** | Private page per booking: countdown, departure details, documents checklist, AI-generated packing list for that destination and month, weather at departure | v2/v3 stretch (~6 h) |
| **Split payment for groups** | One booking, N travellers, each gets their own pay link; confirms when all pay or the leader covers the rest; reminders, hold expiry | v2 stretch (~8 h) — most serious engineering |
| **Itinerary storyboard** | Scroll-driven map on the package page: the route draws itself day by day, photos and stops animate in | v1/v2 stretch (~6 h, GSAP + static map) |

Rejected: concierge inside WhatsApp (WhatsApp Business API costs money — 2026-09-12); group planning / RSVP features (overlap with Zapigo); mood-based visual search (Offcut's hard part).

### Standard nice-to-haves
| Feature | Notes |
|---|---|
| Itinerary route map | Static map of the day-by-day stops; superseded by the storyboard above if that gets built |
| Departure-city pricing | Ex-Mumbai / ex-Delhi / ex-Bengaluru prices per departure; doubles the pricing model |
| Blog / travel guides | "Best time to visit Goa", "What to pack for Ladakh" — SEO play, content-heavy |
| Compare packages | Pick 2–3, side-by-side table |
| Wishlist / recently viewed | `localStorage`, no account needed |
| Request a callback | Phone + preferred time; duplicate of Enquire, so only if a real reason appears |

## Never (decided)
Flights / hotels APIs · multi-currency · loyalty points · newsletter · visa / forex / insurance add-ons · multiple admins with roles (that's Skillroom's job) · a separate group/corporate flow (it's enquiry type = group).

## The wow moment
Chat plans a real trip from real packages and pre-fills the booking — no forms.

## Tech notes (to discuss)
- AI: Vercel AI SDK, streaming, tool calling (`searchPackages`, `checkAvailability`, `startBooking`); guardrails so it only recommends real packages. **Provider is swappable via one env var** — Gemini Flash (free tier) by default, Claude opt-in for the case study
- Payments: Razorpay Checkout + webhook verification, idempotent booking creation
- Email: Resend
- SEO: destination and package pages statically generated, JSON-LD for TouristTrip/Offer

## Costs (locked 2026-09-12) — the whole product runs on ₹0 beyond the domain
| Need | Paid trap | Free route we take |
|---|---|---|
| AI (v3 concierge, evals, owner-side drafting, packing list) | Anthropic / OpenAI pay-per-token | **Gemini Flash free tier** (~1,500 req/day, tool calling included) behind the Vercel AI SDK provider abstraction; `AI_PROVIDER` env var swaps to Claude. Evals on a small fixed set; public chat rate-limited per IP. Free-tier data may be used by Google for training — acceptable because the catalog is fictional |
| WhatsApp button / share | WhatsApp Business API (rejected) | Plain `wa.me` click-to-chat links |
| MCP server (v4) | — | Streamable HTTP on a Vercel route handler; `@modelcontextprotocol/sdk` is free |
| Payments (v2) | 2% per live transaction | Razorpay **test mode forever** |
| Customer login (v2) | SMS OTP (~₹0.20/SMS) | **Email OTP / magic link** via Resend |
| Maps (contact page, storyboard, route map) | Google Maps Platform billing account | Contact: Google Maps embed iframe (no key). Storyboard/route: **MapLibre + OpenFreeMap tiles** |
| Weather (trip hub) | Paid weather APIs | Open-Meteo (free, no key) |
| Images, email, OG, PDF, rate limiting, DB, hosting, errors, uptime | — | Vercel Blob / Cloudinary free tier, Resend free, `@vercel/og`, `@react-pdf/renderer`, Upstash free, Neon free, Vercel Hobby, Sentry dev, UptimeRobot |

Fixed: `virajdomadia.com` domain (~₹1,000/yr); subdomain free.

## Success criteria
- A stranger can go from landing page → chat → paid booking (test mode) in under 3 minutes
- Agent never hallucinates a package that doesn't exist

## Open questions — all resolved (2026-09-12, see docs/04-technical-design-v2-v3.md)
- Hindi/Hinglish: **yes, by prompt** — the concierge replies in the customer's language; UI and package content stay English.
- Payment in chat: **never** — `startBooking` hands off to the v2 checkout page.
