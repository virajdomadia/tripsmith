# Tripsmith — User Flows (v1–v4)

**Lifecycle step:** 3 of 17 (UX companion to the requirements) · **Written:** 2026-09-12
**Inputs:** [03-requirements.md](03-requirements.md), [-v2](03-requirements-v2.md), [-v3](03-requirements-v3.md), [-v4](03-requirements-v4.md)
**Pairs with:** [04-ui-mockups.md](04-ui-mockups.md) (one mockup per screen named here)

Every flow names its screens; every screen appears in the mockup index. Entry points are in **bold**; the "happy path" is the left-most path; dead ends always offer a next step.

---

## Visitor flows (v1)

### F1. Discover → package (the main path)
```mermaid
flowchart LR
  A([**Google / share link / direct**]) --> H[S1 Home]
  A --> D2[S3 Destination page]
  A --> P[S5 Package page]
  H -->|search box| L[S4 Packages listing]
  H -->|destination tile| D2
  H -->|package card| P
  D1[S2 Destinations] --> D2
  D2 --> P
  L -->|filters in URL| L
  L -->|card| P
  L -->|no results| L0[S4b Empty state → clear filters / enquire]
  P -->|related| P
```

### F2. Enquire (conversion)
```mermaid
flowchart TD
  P[S5 Package page] -->|Enquire| E[S6 Enquiry form · standard]
  P -->|Customise this trip| EC[S6 Enquiry form · customise]
  C[S9 Contact page] --> EG[S6 Enquiry form · contact]
  E & EC & EG -->|submit| V{valid?}
  V -->|no| E
  V -->|yes| T[S7 Thanks · ref · WhatsApp · PDF link]
  T -.->|email| M1[Customer confirmation + PDF]
  T -.->|email| M2[Owner notification]
  P -->|WhatsApp button| W([wa.me with package pre-filled])
  P -->|Download PDF| PDF([Itinerary PDF])
  P -->|Share| SH([WhatsApp / copy / native share])
```

### F3. Search box on Home
```
S1 Home search (destination · budget · nights) → submit → S4 /packages?destination=&maxBudget=&nights= → results
```

### F4. Info & trust
```
Footer / nav → S8 About · S9 Contact · S10 Terms · S11 Privacy · S12 Cancellation policy · 404 (S13)
```

## Owner flows (v1)

### F5. Login & dashboard
```mermaid
flowchart LR
  A([**/admin**]) --> G{session?}
  G -->|no| LI[A1 Login]
  LI -->|ok| DB[A2 Dashboard]
  G -->|yes| DB
  DB --> PK[A3 Packages list]
  DB --> EN[A6 Enquiries inbox]
  DB --> DS[A5 Destinations]
```

### F6. Create / edit a package
```mermaid
flowchart TD
  PK[A3 Packages list] -->|New| PF[A4 Package form · draft]
  PK -->|Edit| PF
  PK -->|Duplicate| PF
  PF -->|save draft| PF
  PF -->|Publish| R{publish rules: ≥1 image, ≥1 departure, full itinerary}
  R -->|fail| PF
  R -->|ok| LIVE[status = live → revalidate public pages + PDF]
  PF -->|Preview| P[S5 Package page · draft preview]
```

### F7. Work an enquiry
```
A6 Inbox (filter new) → A7 Enquiry detail → call / WhatsApp / mailto → status: contacted → note → status: converted | closed → CSV export
```

---

## Customer flows (v2)

### F8. Book now
```mermaid
flowchart TD
  P[S5 Package page] -->|Book now| B1[S14 Choose departure]
  B1 --> B2[S15 Travellers & occupancy]
  B2 --> B3[S16 Price breakdown + contact]
  B3 -->|Pay| RZ([Razorpay Checkout])
  RZ -->|success| OK[S17 Booking confirmed · ref · voucher · WhatsApp]
  RZ -->|failed / closed| B3
  B1 -->|sold out mid-flow| B1
  OK -.->|email| V1[Voucher PDF]
  OK -->|OTP| AC[S18 Account · My bookings]
```

### F9. Account
```
Email OTP (S19) → S18 My bookings → S20 Booking detail (voucher, request cancellation S21) → S22 Review (only when completed)
```

### F10. Owner: bookings desk
```
A2 Dashboard → A8 Bookings list → A9 Booking detail (payment timeline, mark paid offline, resolve cancellation) → A10 Departure manifest
A7 Enquiry detail → reply (A11 thread)
A4 Package form → deals fields · A12 Reviews moderation
```

---

## Concierge flows (v3)

### F11. Chat → cards → book or handoff
```mermaid
flowchart TD
  ANY[Any public page] -->|launcher| CH[S23 Concierge panel]
  CH -->|example prompt or typed| Q{needs clarification?}
  Q -->|yes, ≤2 questions| CH
  Q -->|no| SRCH[[searchPackages]]
  SRCH -->|cards| CH
  CH -->|Check dates| AV[[checkAvailability]] --> CH
  CH -->|Book| SB[[startBooking]] --> B3[S16 Checkout pre-filled]
  CH -->|View| P[S5 Package page]
  SRCH -->|nothing matches| ALT[closest alternatives · Notify me S24 · Talk to a person]
  CH -->|Talk to a person| HF[S25 Handoff form in panel] --> T[S7 Thanks]
  CH -->|quota hit| QX[S26 Over-limit state → enquiry / WhatsApp]
```

### F12. Owner: conversation log
```
A2 Dashboard (tiles) → A13 Conversations list → A14 Conversation detail (transcript + tool calls)
A4 Package form → "Draft with AI" (add-on A) → form pre-filled as draft
```

---

## MCP client flows (v4)

### F13. Install and plan from an assistant
```mermaid
flowchart LR
  DEV[S27 /developers page] -->|copy config| CL([Claude Desktop / Cursor / ChatGPT])
  CL -->|plan-a-trip prompt or free text| T1[[searchPackages]] --> CL
  CL --> T2[[checkAvailability]] --> CL
  CL --> T3[[startBooking]] --> B3[S16 Checkout pre-filled in browser]
  CL --> T4[[createEnquiry]] --> M2[Owner notification]
  CL -->|read resource| RES[(tripsmith://packages/slug)]
```

---

## Screen index (drives the mockups)
| ID | Screen | Version |
|---|---|---|
| S1 | Home | v1 |
| S2 | Destinations grid | v1 |
| S3 | Destination page | v1 |
| S4 / S4b | Packages listing / empty state | v1 |
| S5 | Package page (incl. sticky mobile CTA bar) | v1 |
| S6 | Enquiry form (standard / customise / contact) | v1 |
| S7 | Thanks | v1 |
| S8–S12 | About · Contact · Terms · Privacy · Cancellation policy | v1 |
| S13 | 404 | v1 |
| A1–A7 | Login · Dashboard · Packages list · Package form · Destinations · Enquiries inbox · Enquiry detail | v1 |
| S14–S17 | Choose departure · Travellers · Breakdown + contact · Confirmed | v2 |
| S18–S22 | My bookings · OTP login · Booking detail · Cancellation request · Review | v2 |
| A8–A12 | Bookings list · Booking detail · Manifest · Enquiry reply thread · Reviews moderation | v2 |
| S23–S26 | Concierge panel · Notify me · Handoff form · Over-limit | v3 |
| A13–A14 | Conversations list · Conversation detail | v3 |
| S27 | /developers | v4 |
