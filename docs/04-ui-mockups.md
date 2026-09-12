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

**Chosen direction:** D, rebuilt as a showcase — `mockups/showcase.html` (published: https://claude.ai/code/artifact/42912aa9-92f9-4ce8-b653-5126ba72654e). The four layout variants were rejected on 2026-09-12 as too basic to show frontend skill; the showcase is the reference from here on.

### The showcase (what makes it Tripsmith's)
- **Signature motion — the route draws itself.** The brand mark's dashed path (dot → marigold sun) is the page's one authored motion: it draws across the hero on load, it draws the itinerary map with scroll on the package page (GSAP ScrollTrigger, scrubbed, stops light up day by day), and it is the hover underline on links.
- **Procedural scenes.** Every "photo" is painted on Canvas per destination (sky gradient, sun with halo, layered ridges with atmospheric haze, water with light streaks, vignette, film grain) — placeholders that look art-directed until the real photos arrive. Slow Ken Burns on the hero.
- **Hero:** word-by-word clip reveal of *Travel, intelligently.*; the question input types real prompts; chips carry live scene swatches.
- **Popular journeys:** pinned horizontal scroll on desktop (vertical scroll drives the rail), native snap-scroll on mobile.
- **Concierge:** the conversation types itself when it enters view — user message, typing dots, streamed reply, two package cards pop in. Real content.
- **Craft floor:** themed selection / caret / scrollbar / focus rings, tabular numerals in every price column, `prefers-reduced-motion` renders everything at rest, sticky enquiry box, mobile CTA bar, hover states on every control.
- **Stack for the real build:** the same motion transfers to `web/` with `gsap` + `@gsap/react` (`useGSAP`), scenes as a `<Scene kind>` client component, tokens into the Tailwind theme.

### Directions II — modern & cool (2026-09-12, v1 scope only)
`mockups/directions-2.html` (published: https://claude.ai/code/artifact/ad8dff40-83e3-42ff-b395-a054f7b1037b) — four home-page directions, each with its own motion, after the showcase was judged good but not the final look:
- **E Night** — dark cinematic; destination scenes crossfade with the headline; glass search; journeys list with cursor-following photo
- **F Bento** — light app-like grid; tiles spring in; live from-price count-up; 12-month best-time chart; route draws in the map tile
- **G Immersive** — pinned full-screen destination index driven by scroll; tall photo journey cards; italic marquee
- **H Kinetic** — white, giant serif type; destination lines with photo trailing the cursor; compact cards

**Rule (Viraj, 2026-09-12): mockups show v1 only** — no concierge, no accounts / "My Trips", no AI copy. The search is structured (where / when / budget); the human promise (2-hour callback, WhatsApp, itinerary PDF) takes the place the concierge would have. The showcase was updated to the same rule. v3 screens get the concierge when v3 is designed.

### Directions III — real photography, travel vibes (2026-09-12)
`mockups/directions-3.html` (published: https://claude.ai/code/artifact/2f00395c-5211-4972-b549-99e281c73207). Viraj's verdict on everything before this: *"none are giving a travel website vibes."* Root cause: the artifact sandbox blocks external images, so every earlier mockup used painted gradients instead of photographs. Fixed by sourcing CC-licensed photos from Wikimedia Commons (credits in `mockups/img/CREDITS.md`) and building around the patterns travellers already trust:
- **I Sunlit** — white / sea-teal / coral, DM Sans; full-bleed beach hero, search widget (destination · month · travellers · budget), theme chips with icons, photo destination cards with "starting ₹", package cards with stars + inclusion icons (hotel, breakfast, transfers, sightseeing), trust strip, reviews, "talk to a travel expert" band with callback form, WhatsApp button
- **J Postcard** — cream / marigold / brand teal, Fraunces; framed hero photo with postmark stamp, polaroid destination cards, postcard package cards with "Filling fast" stamps, notepaper reviews

## Screen index status
| Screens | Status |
|---|---|
| S1 Home, S5 Package | **done — showcase** (`mockups/showcase.html`) |
| S2–S4, S6–S13 (rest of v1 public) | next, in the chosen direction |
| A1–A7 (v1 admin) | next |
| S14–S22, A8–A12 (v2) · S23–S26, A13–A14 (v3) · S27 (v4) | after v1 screens |

## Mockup conventions
- Photos are colour-field placeholders labelled by place until the seed photos exist (1.0.5).
- Real seed content only — the six destinations, the twelve packages, the North Goa itinerary, real departure dates and prices.
- Every screen is built at desktop and 390px; the phone view is the primary one for customer screens.
- The mockups are HTML, so the chosen tokens (colours, type scale, radii, spacing) transfer directly into `web/` as Tailwind theme values in milestone 1.0.
