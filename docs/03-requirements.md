# Tripsmith v1 — Requirements & Scope

**Lifecycle step:** 3 of 17 · **Version:** v1 "Agency website" · **Locked:** 2026-09-12 · **Amended:** 2026-09-24 (R10, R13 — marked inline)
**Source:** [PRD.md](../PRD.md). This document is the definitive v1 feature list. Anything not here is not in v1.

Rule used to decide inclusion: a feature is in v1 only if (a) an agency owner would reject the site without it, (b) the v2/v3 data model needs it now, or (c) it costs under an hour and a reviewer will see it.

## What v1 is

Three things, not one: a **public content site** (destinations, packages, trust pages), a **lead pipeline** (enquiry → DB → emails → PDF → WhatsApp), and an **owner CMS** (catalog, departures, inbox, dashboard). The public site is the visible half; the pipeline and CMS are what make it a business.

## Actors

- **Visitor** — an Indian traveller on a phone, planning a short domestic holiday. No account.
- **Owner** — the single Tripsmith admin. One login.
- **System** — emails, PDF generation, static generation / revalidation.

---

## Customer requirements

### R1. Home

As a visitor I land on a page that tells me what Tripsmith sells and lets me start searching.

- Hero: full-width photo, one-line promise, search box (destination · budget · nights).
- Featured destinations (6 tiles) → destination pages.
- Popular packages (6 cards) → package pages.
- Why-us strip (3–4 points), 4–6 seeded testimonials, footer with address / phone / WhatsApp / policy links.
- **Accept:** search submit lands on `/packages` with matching query params; page fully server-rendered; LCP element is the hero image.

### R2. Destinations

As a visitor I can browse by place.

- `/destinations`: grid of all live destinations (cover, name, package count, starting price).
- `/destinations/[slug]`: cover, intro, best months, all live packages for it.
- **Accept:** a destination with zero live packages is hidden from the grid; each page has unique title/description and JSON-LD `TouristDestination`.

### R3. Packages listing

As a visitor I can find a package that fits my constraints.

- `/packages` with filters: destination (multi), budget (max ₹ per person), nights (range), theme (beach / hills / honeymoon / family, multi), **travel month** (packages with ≥ 1 departure in that month with seats > 0); sort by price asc/desc, duration.
- Card: cover, name, destination, nights/days, "from ₹X per person", 2–3 highlights, departure badge if any.
- Filters live in the URL query string; page is shareable and crawlable; empty state suggests clearing filters.
- **Accept:** filter logic lives in one server function `searchPackages(params)`, reused later by the AI tool; results update without full reload; result count shown.

### R4. Package page

As a visitor I can understand exactly what I get before enquiring.

- `/packages/[slug]`: gallery (4–8 photos) with full-screen lightbox; quick facts (days/nights, starting price, departure city, theme); highlights; day-by-day itinerary (title, description, meals, stay per day); inclusions / exclusions; hotels list; **departures table** (date, price per person, seats left, badge: _Filling fast_ ≤ 4 seats · _Sold out_ 0 seats · _Guaranteed_ flag); **occupancy pricing** table (per adult on double sharing, triple sharing, child 5–11, single supplement); FAQ accordion; 3 related packages (same destination or theme).
- Sticky CTA bar on mobile: price · **Enquire** · **Download PDF** · WhatsApp.
- **Accept:** draft packages return 404 publicly; page statically generated and revalidated on admin edit; JSON-LD `TouristTrip` + `Offer` present; Lighthouse mobile ≥ 90.

### R5. Enquire

As a visitor I can ask Tripsmith to contact me about a trip.

- One form, opened from the package page (package pre-attached) or the Contact page (no package).
- Toggle: **Standard** (name, phone, email, travel month, adults, children, message) / **Customise this trip** (adds preferred dates, budget per person, "what would you change").
- On submit: row saved with `type` (standard / custom / contact) and `status = new`; email to owner; confirmation email to visitor **with the itinerary PDF attached** when a package is attached; on-screen "Thanks — we'll call you within 2 hours (10 am–8 pm IST)".
- **WhatsApp button** site-wide, pre-filled with "Hi, I'm interested in <package name> (<url>)".
- Spam: honeypot field + rate limit (5 per 10 min per IP) + server-side validation.
- **Accept:** submission works without JS (progressive enhancement); duplicate submits within 1 minute are deduplicated; phone validated as Indian mobile.

### R6. Itinerary PDF

As a visitor I can download and forward the itinerary.

- "Download itinerary (PDF)" on every live package page and attached to the enquiry confirmation email.
- Generated server-side from package data: cover, quick facts, day-by-day, inclusions/exclusions, hotels, upcoming departures with prices, occupancy pricing, Tripsmith contact block. Never a hand-uploaded file.
- Cached per package; invalidated on package edit.
- **Accept:** PDF content matches the page for the same package; A4; < 2 MB; generates in < 3 s cold.

### R7. Share

As a visitor I can send a package to family.

- Package page: WhatsApp share, copy link, native share on mobile.
- Every package and destination has a generated OG image (cover + name + price).
- **Accept:** pasting a package URL into WhatsApp shows the OG card.

### R8. Trust & info pages

- `/about` (story, team, why us), `/contact` (address, phone, WhatsApp, hours, map embed, contact form → R5), `/terms`, `/privacy`, `/cancellation-policy`.
- **Accept:** all linked from the footer; policies are real, readable text, not lorem ipsum.

---

## Owner requirements

### R9. Login

- Single owner account, email + password, session cookie, `/admin/*` protected. Demo credentials displayed on the public landing page (portfolio demo).
- **Accept:** unauthenticated `/admin` → login; rate-limited login; logout works.

### R10. Catalog management

- Destinations: create / edit / delete (delete blocked if it has packages), cover upload, intro, best months.
- Packages: create / edit / delete, **draft ↔ live**, all fields from R4 including gallery upload (multi-image, reorder), itinerary day editor (add / remove / reorder days), inclusions / exclusions / highlights / FAQ lists, occupancy pricing, theme tags.
- Departures per package: add / edit / delete (date, price per person, seats total, guaranteed flag). _Amended 2026-09-24:_ the owner edits **seats total** only, lowering it as seats sell offline; seats left is derived, and from v2 it subtracts online bookings.
- **Duplicate package** → new draft copy with "(copy)" suffix.
- Image upload to blob storage with size/type validation and auto-resize.
- **Accept:** saving a live package revalidates its public page, listing, destination page and PDF cache within seconds; validation errors inline; no data loss on validation failure.

### R11. Enquiries inbox

- List: newest first; filters by status (new / contacted / converted / closed), type, package, date range; search by name/phone.
- Detail: all submitted fields, package link, status change, internal notes (append-only, timestamped), `mailto:` and WhatsApp links to the customer.
- **CSV export** of the current filtered list.
- New-enquiry count badge in admin nav.
- **Accept:** status change is one click; export opens correctly in Excel; 50 per page pagination.

### R12. Dashboard

- `/admin`: new enquiries this week vs last week, enquiries by status, top 5 packages by enquiries (30 days), top 5 by page views (30 days), upcoming departures in the next 30 days with seats left.
- **Accept:** loads under 1 s with seeded data; numbers reconcile with the inbox.

---

## Platform requirements

### R13. Quality, SEO, ops

- SEO: unique metadata per page, canonical URLs, sitemap.xml, robots.txt, JSON-LD (`Organization`, `TouristDestination`, `TouristTrip`, `Offer`, `FAQPage`), OG images.
- Performance: static generation + on-demand revalidation for destination / package pages; `next/image` everywhere; Lighthouse mobile ≥ 90 perf, 100 a11y, 100 SEO, 100 best practices on home, listing, package page.
- Accessibility: keyboard navigable, visible focus, alt text on all images, colour contrast AA.
- Responsive: mobile-first, tested at 360, 768, 1280 px.
- Security: input validation on every server action, CSRF-safe forms, rate limiting on forms and login, secrets in env only.
- Monitoring: Sentry (client + server), Vercel analytics, uptime check on `/`. _Amended 2026-09-24:_ the uptime check is deferred; Vercel Web Analytics is mounted but waits on the dashboard toggle.
- Seed script: 6 destinations, 12 genuine packages (real places, hotels, plausible 2026 prices, full itineraries), ~40 departures, 6 testimonials, owner account.
- Tests: unit tests for `searchPackages`, pricing/badge logic, enquiry validation; e2e for the visitor journey (home → listing → package → enquiry → confirmation) and the owner journey (login → edit package → see it live). _Amended 2026-09-24:_ the e2e journeys were dropped in the 2026-09-15 lean re-cut; both journeys are covered by api route tests plus web route and component tests, and the owner journey was walked on production (F18).
- _Amended 2026-09-24:_ the Lighthouse perf ≥ 90 bar (R4, Performance above) is a manual spot-check, not a CI gate — owner decision 2026-09-23 (docs/12 H2).

---

## Explicitly out of scope for v1

Online payment · bookings · customer accounts · AI concierge · deals / offer tags · request-a-callback (duplicate of R5) · wishlist / recently viewed · itinerary route map (v1.4 only if under budget, else v2) · reply-to-enquiry from inbox (mailto link instead) · blog / travel guides · customer-submitted reviews · departure-city pricing · Hindi · "notify me" · compare packages · newsletter · multi-currency · loyalty · flights / hotels APIs.

## Budget

≈ 32 h across milestones 1.0–1.4 (defined in step 7, `docs/07-plan.md`).

## Traceability to later versions

- R3 `searchPackages` → v3 AI tool `searchPackages`.
- R4 departures + occupancy pricing → v2 checkout pricing.
- R6 PDF generator → v2 booking voucher.
- R11 enquiries → v2 bookings list sits beside it.
