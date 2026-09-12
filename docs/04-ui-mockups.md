# Tripsmith — UI Mockups

**Lifecycle step:** 4 of 17 (UX companion to the technical design) · **Started:** 2026-09-12
**Pairs with:** [03-user-flows.md](03-user-flows.md) — one mockup per screen in its index.
**Files:** `mockups/direction-variants.html` (published: https://claude.ai/code/artifact/cdde70b5-e355-4a3a-b982-a2494b22970b) → then `mockups/screens.html` with every screen in the chosen direction.

## Visual direction (Viraj's brief, 2026-09-12)

> **Style:** Premium travel editorial + modern booking SaaS. This should be the most visually impressive marketing/product hybrid of the six.
>
> **Visual language:** large destination photography · editorial typography · cream/off-white backgrounds · deep dark text · one strong accent · large cards, but not overly rounded · maps and itinerary timelines · floating AI concierge.
>
> **Homepage (wireframe):** nav `TRIPSMITH — Explore · Trips · My Trips` → headline **"Travel, intelligently."** → "Tell us where you want to go. We'll build the journey." → one input *"Where do you want to go?"* → destination chips (Goa · Kashmir · Rajasthan · Kerala) → large destination image → **Popular journeys** (3 cards) → **Your AI travel concierge**.
>
> The key is making it feel like a real travel company, not an AI demo.

### Decisions taken from the brief
| Brief | Implementation |
|---|---|
| Cream / off-white ground, deep dark text | `#F7F4EE` ground, `#FFFFFF` surfaces, `#14181C` ink |
| One strong accent | Cobalt `#1A4BD6` — used for the primary CTA, links, timeline dots and the route line; nothing else is blue. Semantic colours (filling-fast amber, guaranteed green) stay separate |
| Editorial typography | **Newsreader** (brand wordmark face) for headlines and prices at large sizes; **Instrument Sans** for UI, body and labels; uppercase tracked labels |
| Large cards, not overly rounded | 10px radius, 1px `#E4DFD5` border, photo 260px tall, price on a rule at the foot |
| Maps and itinerary timelines | Package page: vertical timeline (dot per day on a rule) beside a sticky route map drawn from `itinerary_days.location` — add-on E (storyboard) upgrades this to scroll-driven |
| Floating AI concierge | Sticky pill bottom-right "Ask the concierge" on every page (v3 wires it; before that it opens the enquiry form) |
| "Where do you want to go?" single input | v1: submits to `/packages?…` as a search; v3: the same input becomes the concierge's first message |
| Destination chips | Locked set is Goa, Kerala, Himachal, Rajasthan, Andaman, Ladakh — chips show the first four + "All six". **Kashmir is not in the locked set**; swap Himachal → Kashmir only if Viraj confirms |
| "My Trips" nav item | v2 (accounts). Shown dimmed until v2; v1 nav is Explore · Trips · Enquire |
| Concierge section on home | Rendered as a real conversation with real package cards (not a chat-bubble illustration) so it reads as a travel company's tool, not an AI demo |

### Variant page status
`mockups/direction-variants.html` holds four full-size directions for Home (S1) and Package (S5), desktop and 390px phone:
- **A Editorial** · **B Search-first** · **C Brochure** — the three exploratory directions
- **D Editorial + SaaS** — the brief above, implemented line for line. **Recommended.**

**Chosen direction:** pending Viraj's letter.

## Screen index status
| Screens | Status |
|---|---|
| S1 Home, S5 Package | four variants built; awaiting pick |
| S2–S4, S6–S13 (rest of v1 public) | next, in the chosen direction |
| A1–A7 (v1 admin) | next |
| S14–S22, A8–A12 (v2) · S23–S26, A13–A14 (v3) · S27 (v4) | after v1 screens |

## Mockup conventions
- Photos are colour-field placeholders labelled by place until the seed photos exist (1.0.5).
- Real seed content only — the six destinations, the twelve packages, the North Goa itinerary, real departure dates and prices.
- Every screen is built at desktop and 390px; the phone view is the primary one for customer screens.
- The mockups are HTML, so the chosen tokens (colours, type scale, radii, spacing) transfer directly into `web/` as Tailwind theme values in milestone 1.0.
