# PRD — Tripsmith: Travel site + AI concierge

**Status:** draft v0 (basic) · to be detailed together
**Name:** Tripsmith · *trips planned in a chat*
**URL:** https://tripsmith.virajdomadia.com
**Slot:** #1 · Budget ~60 h · Build first

## One-liner
A travel-agency website where a customer can browse holiday packages, pay online, and — the wow — chat with an AI concierge that plans an itinerary and starts the booking for them.

## Who it's for
- **Customer:** an Indian traveller planning a short domestic holiday (Goa, Kerala, Himachal…).
- **Owner/admin:** the agency, managing packages and bookings.

## Why this project
- Backs the Venus Vacations "booking engine" claim on the résumé with a live, better version.
- AI agent with tool calling is the highest-signal skill on 2026 job posts.
- Every small travel agency is a potential client for exactly this.

## Core features (thin vertical slice)
**Customer**
- Package listing + package page (gallery, itinerary, inclusions, price, dates)
- Search/filter by destination, budget, duration
- Booking flow: pick dates & travellers → Razorpay checkout → confirmation email
- AI concierge chat: "3 days in Goa under ₹15k" → asks 1–2 questions → searches packages (tool) → proposes itinerary → "Book this" hands off to the booking flow
- Account: my bookings

**Admin**
- CRUD packages, dates, pricing
- Bookings list with payment status

## The wow moment
Chat plans a real trip from real packages and pre-fills the booking — no forms.

## Out of scope (v1)
Flights/hotels APIs, multi-currency, refunds/cancellations UI, reviews, multi-agency.

## Tech notes (to discuss)
- AI: Vercel AI SDK, streaming, tool calling (`searchPackages`, `checkAvailability`, `startBooking`); guardrails so it only recommends real packages
- Payments: Razorpay Checkout + webhook verification, idempotent booking creation
- Email: Resend
- SEO: package pages statically generated, JSON-LD for TouristTrip/Offer

## Success criteria
- A stranger can go from landing page → chat → paid booking (test mode) in under 3 minutes
- Agent never hallucinates a package that doesn't exist

## Open questions
- Fictional brand name & destination set (how many packages to seed — 12?)
- Does the concierge need to handle Hindi/Hinglish?
- Do we let the chat complete payment, or always hand off to the checkout page?
