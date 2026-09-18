# F7+F8 Content → 12 packages + Trust pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the catalog to the mockup's full set — 6 destinations, 12 packages, ~45 departures, 6 testimonials, 42 new CC photos — and ship the five trust pages the footer already links (`/about`, `/contact`, `/terms`, `/privacy`, `/cancellation-policy`) with real copy, so the home shows 6 + 6 real tiles and no public link 404s.

**Architecture:** Content is typed Python under `api/content/` (pydantic models validated at import; `scripts/seed.py` upserts to Postgres + Vercel Blob). New photos come through the licence-gated `scripts/fetch_photo.py` with the exact Commons titles chosen below. `tests/test_content.py` asserts rules (not counts) over the real catalog; db tests keep seeding the frozen `tests/fixture_content`. The web side adds five server-rendered pages on the K tokens: policies are data (`lib/policies.ts`) rendered by one `PolicyPage`; `/about` reuses the home about-band motif (extracted to `FramedPhotos`) and the live `/home` stats; `/contact` has the business details, a keyless Google Maps embed and a form that opens WhatsApp with the message prefilled (the online enquiry form is F9).

**Tech Stack:** FastAPI + pydantic + SQLAlchemy async (api); `uv`, pytest; Next.js 16 app router, Tailwind 4 `@theme` tokens, `next/image`, vitest (web). No new dependencies.

**Spec:** `docs/07-plan.md` rows F7+F8 and ↳ F8; mockups `mockups/screens.html` S8 (About), S9 (Contact), S10–S12 (policies) and its `DEST` / `PKGS` lists (the locked twelve); `docs/03-requirements.md` line 70; content model `api/content/_schema.py`.

## Global Constraints

- Work in `.worktrees/f7-f8-content` on branch `feat/f7-f8-content`; one PR; never touch the main checkout; never run `next build` while `next dev` shares `.next/`.
- Every colour/radius/shadow comes from `web/src/app/globals.css` tokens — no new hex values in components.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (root) must pass. No contract change is expected (`pnpm gen:api` must produce no diff).
- Tests seed `tests/fixture_content` — **never edit the fixture** to match live content.
- Every photo: Wikimedia Commons, CC BY / CC BY-SA / CC0 / PD, ≥ 1600 px, fetched only through `scripts/fetch_photo.py` (which appends the `CREDITS.md` row). `test_no_photo_is_unused` means every fetched file must be referenced by a package or a destination cover.
- Content rules (`tests/test_content.py`): 3–4 departures per package, all ≥ 2026-11-01, in date order; from-prices = the locked list; every theme covered; every destination has a live package.
- Copy: short, concrete, Indian English, ₹ prices via `inr()`; no lorem ipsum, no "coming soon", no F-row numbers in user-facing text. Business facts come from `web/src/lib/business.ts` only.
- Photos on web pages are copies of already-credited content photos under `web/public/`; the footer's credit line covers them.
- Real hotels and real places; prices are per person in whole rupees (`_inr` fields), realistic for 2026–27.

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| Which six packages | The mockup's remaining rows: **Jaipur · Jodhpur · Udaipur** (5N, heritage · family, from ₹26,499), **Jaisalmer Desert Nights** (4N, heritage · adventure, from ₹19,499), **Port Blair · Havelock · Neil** (5N, beach · adventure, from ₹32,999), **Havelock Honeymoon** (4N, beach · honeymoon, from ₹34,999), **Leh · Nubra · Pangong** (6N, adventure · hills, from ₹29,999), **Leh & Turtuk** (5N, adventure · hills, from ₹27,499). |
| Slugs | `jaipur-jodhpur-udaipur`, `jaisalmer-desert-nights`, `port-blair-havelock-neil`, `havelock-honeymoon`, `leh-nubra-pangong`, `leh-turtuk`. Module names use underscores. |
| Destinations | `rajasthan` (position 4, best Oct–Mar), `andaman` (5, Nov–Apr), `ladakh` (6, Jun–Sep). |
| Departure cities | Rajasthan: `Ex-Jaipur` (ends Udaipur) and `Ex-Jodhpur`; Andaman: `Ex-Port Blair`; Ladakh: `Ex-Leh`. Flights are excluded and say so in exclusions. |
| Departures | 45 total after this row (22 existing + 23 new). Ladakh only Jun–Sep 2027; Rajasthan Nov 2026–Mar 2027; Andaman Dec 2026–Mar 2027. Peak (Christmas / New Year) departures cost more; cheapest double-sharing price = the locked from-price. |
| Content floor | Stays `2026-11-01` — the live catalog still has November 2026 departures (Goa, Kerala, Himachal); raising it would mean rewriting shipped content for no reason. |
| Featured | `jaipur-jodhpur-udaipur`, `port-blair-havelock-neil`, `leh-nubra-pangong` featured (home already caps cards at 6, featured first). |
| Testimonials | 3 → 6: Kerala honeymoon, Himachal office group, Rajasthan family. All six render on the home grid (two rows of three) — no api change. |
| Photos | 42 new files (14 Rajasthan, 13 Andaman, 15 Ladakh), exact Commons titles in Task 2 — all checked on 2026-09-18 via the Commons API for licence and width. Shared photos between two packages of a destination are fine (the rule is unused-free, not unique). |
| Policies | Data in `web/src/lib/policies.ts` (`POLICIES` keyed by slug; `CANCELLATION_SCHEDULE` reused by the package price box), one renderer `components/site/policies/PolicyPage.tsx` with the S10–S12 switcher, three thin routes. "Last updated 18 September 2026". |
| About | S8: framed-photo motif (extracted from `AboutBand` into `components/site/FramedPhotos.tsx`), story, four facts (trips + destinations live from `GET /home` stats; "2 h" and "2019" static), the four-person team (initials avatars, no photos), the existing `WhyUs`. `force-dynamic` like home. |
| Contact | S9: info list (phone, WhatsApp, email, address, hours), keyless Google Maps embed (`maps.google.com/maps?q=…&output=embed`, lazy iframe), and a "Send a message" form that opens WhatsApp with the message prefilled (`lib/contact.ts::contactMessage`) — a working ₹0 stand-in until the enquiry form (F9) replaces it. |
| Hours copy | `BUSINESS.hours` stays "10 am – 8 pm, every day" (home already says so); contact adds "after hours, WhatsApp — we reply next morning". |
| Header | Nav becomes Destinations · Trips · About · Contact (Home is the logo), plus the phone number on `md+`. |
| Package page | `PriceBox` fine print gains the free-date-change line and a link to `/cancellation-policy` (the schedule "quoted on every package page", S12). |
| JSON-LD / sitemap | None added on these pages (home's `TravelAgency` already carries address/phone); a sitemap is a hardening row. |
| Map & third parties | Google Maps embed loads only on `/contact` (lazy). No analytics change, no cookies. |

---

## Local environment (do once, before Task 1)

The worktree already has `api/.env.local` and `web/.env.local` copied from the main checkout. **`api/.env.local` `DATABASE_URL` points at Neon production** — never run seed/dev against it by accident; always pass `--database-url` / `DATABASE_URL=` explicitly for local work.

Free ports from earlier sessions (PowerShell), then check what else holds 8000/8001 (other Claude sessions run the main checkout's api there — do not kill those):

```powershell
Get-NetTCPConnection -LocalPort 3000,8002 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8000,8001 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
```

Then (bash):

```bash
cd "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/.worktrees/f7-f8-content"
export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
PG="/c/Program Files/PostgreSQL/18/bin"
export PGDATA="$SCRATCHPAD/pg"   # $SCRATCHPAD = this session's scratchpad directory from the system prompt
"$PG/initdb" -U tripsmith -A trust -E UTF8 -D "$PGDATA" >/dev/null
```

`pg_ctl -w start` hangs the bash tool — start it with `run_in_background: true` as its own call:

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_ctl" -D "$PGDATA" -o "-p 5499" -l "$PGDATA/log" start
```

Then:

```bash
"$PG/createdb" -p 5499 -U tripsmith tripsmith_test
"$PG/createdb" -p 5499 -U tripsmith tripsmith_dev
export TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_test
export DEV_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_dev
cd api && ALEMBIC_URL=$DEV_URL uv run alembic upgrade head && uv run python scripts/seed.py --local --database-url $DEV_URL && cd ..
pnpm install --frozen-lockfile
uv run --directory api pytest -q     # baseline: 118 passed
pnpm --filter web test               # baseline: 56 passed
```

Dev servers (each a background call): api `DATABASE_URL=$DEV_URL uv run --directory api uvicorn app.main:app --reload --port 8000` (if 8000 is held by another session, use `--port 8002` and start web with `API_URL=http://localhost:8002 pnpm --filter web dev`; local seed photos are then served from whatever runs on 8000 — copy `api/.seed-photos/*` into that checkout's gitignored `api/.seed-photos/` after Task 2, since `next/image` only allows `localhost:8000`). Kill by port afterwards — never `taskkill //IM node.exe`.

Commit this plan as the branch's first commit before Task 1:

```bash
git add docs/superpowers/plans/2026-09-18-f7-f8-content-and-trust-pages.md
git commit -m "docs(F7+F8): implementation plan for content → 12 packages and trust pages"
```

---

## File structure

**api**
- Modify `tests/test_content.py` — locked from-prices for the six new packages; floors 12 / 6 / 6.
- Create `content/photos/{rajasthan,andaman,ladakh}/*.jpg` (42 files) + rows in `content/photos/CREDITS.md` — via `scripts/fetch_photo.py`.
- Create `content/destinations/{rajasthan,andaman,ladakh}.py`.
- Create `content/packages/{jaipur_jodhpur_udaipur,jaisalmer_desert_nights,port_blair_havelock_neil,havelock_honeymoon,leh_nubra_pangong,leh_turtuk}.py`.
- Modify `content/testimonials.py` — three more.

**web**
- Modify `src/lib/business.ts` — address line 2, map URLs, founded year, after-hours line.
- Create `src/lib/policies.ts` — the three policy documents as data + `CANCELLATION_SCHEDULE`.
- Create `src/lib/contact.ts` — `contactMessage()` for the WhatsApp form.
- Create `src/components/site/FramedPhotos.tsx` — the framed-photo + postmark motif (moved out of `AboutBand`).
- Modify `src/components/site/home/AboutBand.tsx` — use `FramedPhotos`.
- Create `src/components/site/PageHead.tsx` — breadcrumb + h1 + lede used by all five pages.
- Create `src/components/site/policies/PolicyPage.tsx`.
- Create `src/app/(site)/{terms,privacy,cancellation-policy}/page.tsx`.
- Create `src/components/site/about/{Facts,Team}.tsx`, `src/app/(site)/about/page.tsx`, `public/about/{beach,lake}.jpg`.
- Create `src/components/site/contact/{ContactInfo,ContactForm,MapEmbed}.tsx`, `src/app/(site)/contact/page.tsx`.
- Modify `src/components/site/SiteHeader.tsx` (About, Contact, phone), `src/components/site/package/PriceBox.tsx` (cancellation line).
- Create `tests/policies.test.ts`, `tests/contact.test.ts`; modify `tests/business.test.ts`.

**docs**
- Modify `docs/07-plan.md` — mark F7+F8 and ↳ F8 done (in the final task, with the PR number).

---

### Task 1: Lock the six new from-prices and the new floors in the content rules test

**Files:**
- Modify: `api/tests/test_content.py`

**Interfaces:**
- Consumes: `load_content()` (real catalog), `CONTENT_FLOOR`.
- Produces: the failing assertions Tasks 3–6 make pass.

- [ ] **Step 1: Extend the rules test**

In `api/tests/test_content.py` replace the two functions `test_every_destination_has_a_live_package_and_every_theme_is_covered` and `test_from_prices_match_the_locked_list` with:

```python
def test_every_destination_has_a_live_package_and_every_theme_is_covered() -> None:
    content = load_content()
    live = [p for p in content.packages if p.status == PackageStatus.LIVE]
    assert {p.destination for p in live} == {d.slug for d in content.destinations}
    assert {t for p in live for t in p.themes} == set(Theme)
    # F7's floor (07-plan: 6 destinations, 12 packages, 6 testimonials), not a ceiling.
    assert len(live) >= 12 and len(content.destinations) >= 6
    assert len(content.testimonials) >= 6


def test_from_prices_match_the_locked_list() -> None:
    """The mockup's from-prices are what home and listing were designed around (07-plan F4, F7)."""
    cheapest = {
        p.slug: min(d.price_double_inr for d in p.departures) for p in load_content().packages
    }
    assert cheapest["munnar-alleppey-houseboat"] == 21_999
    assert cheapest["kochi-thekkady-kovalam"] == 27_999
    assert cheapest["shimla-manali-classic"] == 18_499
    assert cheapest["manali-kasol-tosh"] == 19_999
    assert cheapest["jaipur-jodhpur-udaipur"] == 26_499
    assert cheapest["jaisalmer-desert-nights"] == 19_499
    assert cheapest["port-blair-havelock-neil"] == 32_999
    assert cheapest["havelock-honeymoon"] == 34_999
    assert cheapest["leh-nubra-pangong"] == 29_999
    assert cheapest["leh-turtuk"] == 27_499


def test_destination_positions_are_unique_and_ordered() -> None:
    positions = [d.position for d in sorted(load_content().destinations, key=lambda d: d.position)]
    assert positions == sorted(set(positions)), "every destination needs its own position"


def test_every_testimonial_names_a_different_trip() -> None:
    linked = [t.package for t in load_content().testimonials if t.package]
    assert len(linked) == len(set(linked)), "spread testimonials across trips"
```

- [ ] **Step 2: Run it to see the new assertions fail**

Run (from `api/`): `uv run pytest tests/test_content.py -q`
Expected: `test_every_destination_has_a_live_package…` FAILS on `len(live) >= 12`; `test_from_prices_match_the_locked_list` FAILS with `KeyError: 'jaipur-jodhpur-udaipur'`; the two new tests PASS (3 destinations have positions 1–3; 2 linked testimonials differ).

- [ ] **Step 3: Commit**

```bash
git add api/tests/test_content.py
git commit -m "test(F7): lock the six new from-prices and the 12/6/6 content floors"
```

---

### Task 2: Fetch the 42 photos

**Files:**
- Create: `api/content/photos/rajasthan/*.jpg` (14), `api/content/photos/andaman/*.jpg` (13), `api/content/photos/ladakh/*.jpg` (15)
- Modify: `api/content/photos/CREDITS.md` (42 rows appended by the script)

**Interfaces:**
- Consumes: `uv run python scripts/fetch_photo.py "File:<Commons title>" <destination>/<name>.jpg` (refuses non-CC/PD or < 1600 px; appends the credit row).
- Produces: the exact file names Tasks 3–5 reference. Do not rename.

- [ ] **Step 1: Fetch (run from `api/`, one command per line; each prints `<file>  <licence>  by <author> (<w> -> 1400)`)**

Rajasthan:

```bash
uv run python scripts/fetch_photo.py "File:20191219 Fort Amber, Amer, Jaipur 0955 9481.jpg" rajasthan/amber-fort-lake.jpg
uv run python scripts/fetch_photo.py "File:Amber Fort-Jaipur-India0014.JPG" rajasthan/amber-sheesh-mahal.jpg
uv run python scripts/fetch_photo.py "File:East facade Hawa Mahal Jaipur from ground level (July 2022) - img 01.jpg" rajasthan/hawa-mahal.jpg
uv run python scripts/fetch_photo.py "File:Chandra Mahal, City Palace, Jaipur, 20191218 0951 9043.jpg" rajasthan/jaipur-city-palace.jpg
uv run python scripts/fetch_photo.py "File:Mehrangarh Fort.jpg" rajasthan/mehrangarh-fort.jpg
uv run python scripts/fetch_photo.py "File:Jodhpur, Blue city 07 HDR (2271777347).jpg" rajasthan/jodhpur-blue-city.jpg
uv run python scripts/fetch_photo.py "File:Lake Palace, Lake Pichola, Udaipur.jpg" rajasthan/udaipur-lake-palace.jpg
uv run python scripts/fetch_photo.py "File:Lake Pichola at sunset, Udaipur, Rajasthan, India.jpg" rajasthan/pichola-sunset.jpg
uv run python scripts/fetch_photo.py "File:Corner Battlements Jaisalmer Fort Dec14 DSC 6282.jpg" rajasthan/jaisalmer-fort.jpg
uv run python scripts/fetch_photo.py "File:Jaisalmer fort at night (cropped).jpg" rajasthan/jaisalmer-fort-night.jpg
uv run python scripts/fetch_photo.py "File:Jaisalmer Sam Sand Dunes.jpg" rajasthan/sam-dunes-camel.jpg
uv run python scripts/fetch_photo.py "File:Safari of love.jpg" rajasthan/camel-safari-sunset.jpg
uv run python scripts/fetch_photo.py "File:Patwon ki Haveli.jpg" rajasthan/patwon-ki-haveli.jpg
uv run python scripts/fetch_photo.py "File:Gadsisar Lake in Jaisalmer 01.jpg" rajasthan/gadisar-lake.jpg
```

Andaman:

```bash
uv run python scripts/fetch_photo.py "File:Radhanagar Beach Havelock vrvbaan042k24 (10).jpg" andaman/radhanagar-beach.jpg
uv run python scripts/fetch_photo.py "File:Havelock Island, Radhanagar Beach, tropical bliss, Andaman Islands.jpg" andaman/radhanagar-trees.jpg
uv run python scripts/fetch_photo.py "File:Elephants beach walk.jpg" andaman/elephants-on-the-beach.jpg
uv run python scripts/fetch_photo.py "File:Havelock Island by Vikramjit Kakati.jpg" andaman/havelock-shore.jpg
uv run python scripts/fetch_photo.py "File:Magnificent Elephant Beach, Havelock Island, India.jpg" andaman/elephant-beach.jpg
uv run python scripts/fetch_photo.py "File:Snorkeling at Elephant beach, Havelock Island,Andaman.jpg" andaman/snorkelling-coral.jpg
uv run python scripts/fetch_photo.py "File:Beachboat.JPG" andaman/beach-boat.jpg
uv run python scripts/fetch_photo.py "File:Front View of Cellular Jail, Port Blair.JPG" andaman/cellular-jail.jpg
uv run python scripts/fetch_photo.py "File:Natural Coral Bridge in Andaman.jpg" andaman/neil-natural-bridge.jpg
uv run python scripts/fetch_photo.py "File:Ross Island jetty, Port Blair in Andaman Island.jpg" andaman/ross-island-jetty.jpg
uv run python scripts/fetch_photo.py "File:Kalapathar Beach.jpg" andaman/kalapathar-beach.jpg
uv run python scripts/fetch_photo.py "File:Kalapathar beach Havelock Island, Andaman, India.JPG" andaman/kalapathar-beach-2.jpg
uv run python scripts/fetch_photo.py "File:Andaman Islands at sunset.jpg" andaman/andaman-sunset.jpg
```

Ladakh:

```bash
uv run python scripts/fetch_photo.py "File:Pangong Tso 2.jpg" ladakh/pangong-tso.jpg
uv run python scripts/fetch_photo.py "File:Late afternoon at the Pangong Tso (10035239163).jpg" ladakh/pangong-afternoon.jpg
uv run python scripts/fetch_photo.py "File:Khardung La (pass), Ladakh, North India.jpg" ladakh/khardung-la.jpg
uv run python scripts/fetch_photo.py "File:Khardung La, Ladakh Range, North India.jpg" ladakh/khardung-la-road.jpg
uv run python scripts/fetch_photo.py "File:Bactrian camels at Hunder sand dunes Ladakh.jpg" ladakh/hunder-camels.jpg
uv run python scripts/fetch_photo.py "File:Diskit Gompa Nubra valley India.jpg" ladakh/diskit-gompa.jpg
uv run python scripts/fetch_photo.py "File:Diskit Monastery & Maitreya Buddha Statue 07.jpg" ladakh/diskit-maitreya.jpg
uv run python scripts/fetch_photo.py "File:Thiksey Monastery, Ladakh 01.jpg" ladakh/thiksey-monastery.jpg
uv run python scripts/fetch_photo.py "File:Shanti Stupa at Leh.jpg" ladakh/shanti-stupa.jpg
uv run python scripts/fetch_photo.py "File:Leh Palace, Ladakh, India.jpg" ladakh/leh-palace.jpg
uv run python scripts/fetch_photo.py "File:Turtuk.land.jpg" ladakh/turtuk-valley.jpg
uv run python scripts/fetch_photo.py "File:Life in the fields around Turtuk - Nubra Valley (10020028584).jpg" ladakh/turtuk-fields.jpg
uv run python scripts/fetch_photo.py "File:River Shyok, Turtuk Village, Ladakh.JPG" ladakh/shyok-turtuk.jpg
uv run python scripts/fetch_photo.py "File:13-10-08 217 CONFLUENCE OF INDUS RIVER N.jpg" ladakh/sangam.jpg
uv run python scripts/fetch_photo.py "File:Sangam.ladakh.jpg" ladakh/sangam-2.jpg
```

If a title is refused (`not found on Commons` — Commons files do get renamed), search for a replacement of the same subject with the Commons API (`action=query&list=search&srnamespace=6&srsearch=<subject> filetype:bitmap`), check licence + width the same way, and use the new title with the **same destination file name**, so the content modules stay unchanged. Note any substitution in the PR description.

- [ ] **Step 2: Sanity-check the files**

Run (from `api/`): `uv run python -c "from pathlib import Path; from PIL import Image; [print(p.relative_to('content/photos').as_posix(), Image.open(p).size) for p in sorted(Path('content/photos').glob('*/*.jpg')) if p.parent.name in {'rajasthan','andaman','ladakh'}]"`
Expected: 42 lines, every width ≤ 1400 and ≥ 900; `tail -42 content/photos/CREDITS.md` are the new rows. Open two or three sheets (`Read` the jpg) to make sure nothing is a map or a portrait crop.

Run: `uv run pytest tests/test_content.py -q -k "credited or unused"`
Expected: `test_every_photo_is_credited_and_every_credit_exists` PASSES; `test_no_photo_is_unused` FAILS listing the 42 new files (they are not referenced yet); `test_photo_dirs_are_destination_slugs` FAILS (no rajasthan/andaman/ladakh destinations yet). Both go green in Tasks 3–5.

- [ ] **Step 3: Commit**

```bash
git add api/content/photos
git commit -m "content(F7): 42 licence-checked Commons photos for Rajasthan, Andaman and Ladakh"
```

---

### Task 3: Rajasthan — destination + two packages

**Files:**
- Create: `api/content/destinations/rajasthan.py`
- Create: `api/content/packages/jaipur_jodhpur_udaipur.py`
- Create: `api/content/packages/jaisalmer_desert_nights.py`

**Interfaces:**
- Consumes: `define_destination`, `define_package` from `content._schema`; the photo files from Task 2.
- Produces: destination slug `rajasthan`; package slugs `jaipur-jodhpur-udaipur` (featured), `jaisalmer-desert-nights`.

- [ ] **Step 1: Destination**

`api/content/destinations/rajasthan.py`:

```python
from content._schema import define_destination

DESTINATION = define_destination(
    slug="rajasthan",
    name="Rajasthan",
    tagline="Forts, lakes and the Thar",
    intro=(
        "Rajasthan is the trip people picture when they picture India: Amber's ramparts above "
        "a lake, Jodhpur's blue lanes under Mehrangarh, Udaipur's palaces standing in the "
        "water. Then, four hours west of anywhere, the sand starts and Jaisalmer's fort glows "
        "like a sandcastle somebody forgot to knock down.\n\n"
        "The cities are far apart — five to six hours by road between each — so our trips "
        "either do the golden triangle of forts (Jaipur, Jodhpur, Udaipur) or go deep into "
        "the desert from Jodhpur, never both in one go. We stay in havelis, not chain "
        "hotels: courtyards, painted ceilings and a rooftop for dinner.\n\n"
        "**Best time:** October to March — cool mornings, warm afternoons, cold desert "
        "nights. April to June is 40 °C and above; the monsoon (July–September) is short "
        "and green but humid."
    ),
    cover={
        "file": "rajasthan/amber-fort-lake.jpg",
        "alt": "Amber fort reflected in Maota lake, Jaipur",
    },
    region="North-west India",
    best_months=[10, 11, 12, 1, 2, 3],
    position=4,
)
```

- [ ] **Step 2: Jaipur · Jodhpur · Udaipur**

`api/content/packages/jaipur_jodhpur_udaipur.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="jaipur-jodhpur-udaipur",
    destination="rajasthan",
    name="Jaipur · Jodhpur · Udaipur",
    summary=(
        "Three royal cities in six days — Amber by jeep, Mehrangarh at dusk, a boat on "
        "Pichola — sleeping in havelis with courtyards, not chain hotels. Starts Jaipur, "
        "ends Udaipur."
    ),
    themes=["heritage", "family"],
    nights=5,
    departure_city="Ex-Jaipur",
    highlights=[
        "Amber fort by jeep and the mirror-work Sheesh Mahal before the crowds",
        "Mehrangarh at golden hour, then the blue city from its ramparts",
        "Ranakpur's 1,444-pillar Jain temple on the road to Udaipur",
        "Sunset boat on Lake Pichola past the Lake Palace",
        "Heritage havelis in all three cities, every one we have slept in",
    ],
    inclusions=[
        "2 nights at Umaid Bhawan heritage hotel, Jaipur; 1 night at Ratan Vilas, Jodhpur; "
        "2 nights at Jagat Niwas Palace, Udaipur — breakfast and dinner daily",
        "Private air-conditioned car with driver from Jaipur station or airport to Udaipur "
        "airport, all road tolls and parking",
        "Jeep ride up to Amber fort; shared boat on Lake Pichola",
        "Monument entry: Amber, City Palace Jaipur, Jantar Mantar, Mehrangarh, Ranakpur, "
        "City Palace Udaipur",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Trains or flights to Jaipur and from Udaipur — we can book them at cost",
        "Lunches",
        "Guides inside monuments (about ₹500–800 per site, arranged on the spot if you want one)",
        "Camera fees where charged",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Umaid Bhawan Heritage Hotel", "city": "Jaipur", "stars": 3, "nights": 2},
        {"name": "Ratan Vilas", "city": "Jodhpur", "stars": 3, "nights": 1},
        {"name": "Jagat Niwas Palace", "city": "Udaipur", "stars": 3, "nights": 2},
    ],
    faq=[
        {
            "q": "How long are the drives?",
            "a": "Jaipur to Jodhpur is about six hours with a stop at Pushkar; Jodhpur to "
            "Udaipur about five with an hour at Ranakpur. Both are good roads and the car "
            "is yours, so we stop when you want.",
        },
        {
            "q": "Is this all right for older parents?",
            "a": "Yes — it is the trip most of our families do with three generations. The "
            "jeep does the Amber climb, Mehrangarh has a lift, and there is one drive a "
            "day at most. Tell us about knees and we will plan the walks around them.",
        },
        {
            "q": "Can we start in Delhi instead?",
            "a": "Yes. Delhi to Jaipur is a four-hour train (or five by road, about ₹4,000 "
            "extra for the car). Tell us at booking and we will time the pick-up.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Jaipur, Hawa Mahal at dusk",
            "description": (
                "Pick-up from Jaipur station or airport any time before 3 pm. Check in to "
                "the haveli, then the pink-city walk: Hawa Mahal from the street as the "
                "light goes orange, the Johari bazaar's silver lanes, and dinner on the "
                "haveli's rooftop."
            ),
            "meals": "D",
            "stay": "Umaid Bhawan, Jaipur",
            "location_name": "Jaipur",
        },
        {
            "title": "Amber by jeep, City Palace, Jantar Mantar",
            "description": (
                "Out to Amber at 8 am to beat the coaches: a jeep up the ramp, the Sheesh "
                "Mahal's mirror ceiling, the view over Maota lake. Back past Jal Mahal for "
                "the City Palace and the giant stone instruments of Jantar Mantar. Late "
                "afternoon free for the bazaars; dinner at the haveli."
            ),
            "meals": "BD",
            "stay": "Umaid Bhawan, Jaipur",
            "location_name": "Amber",
        },
        {
            "title": "Via Pushkar to Jodhpur, Mehrangarh at golden hour",
            "description": (
                "Leave at 8 am; an hour at Pushkar's ghats and Brahma temple, lunch on the "
                "way, Jodhpur by 3 pm. Straight up to Mehrangarh for the last two hours of "
                "light — the palace rooms, the ramparts, the blue city below — and Jaswant "
                "Thada on the way down. Dinner at Ratan Vilas."
            ),
            "meals": "BD",
            "stay": "Ratan Vilas, Jodhpur",
            "location_name": "Jodhpur",
        },
        {
            "title": "Blue-city walk, Ranakpur, on to Udaipur",
            "description": (
                "A morning walk through the blue lanes below the fort and the clock-tower "
                "spice market. Leave by 11; an hour inside the marble Jain temple at "
                "Ranakpur, then the Aravalli road to Udaipur by 5 pm. Check in at Jagat "
                "Niwas, whose terrace looks straight across Pichola."
            ),
            "meals": "BD",
            "stay": "Jagat Niwas Palace, Udaipur",
            "location_name": "Ranakpur",
        },
        {
            "title": "City Palace and a sunset boat on Pichola",
            "description": (
                "City Palace's courtyards and peacock mosaics in the morning, Jagdish "
                "temple next door, Saheliyon ki Bari after lunch. At 5 pm the boat: past "
                "the Lake Palace to Jag Mandir as the palaces turn gold. Dinner at the "
                "haveli's lake-side restaurant."
            ),
            "meals": "BD",
            "stay": "Jagat Niwas Palace, Udaipur",
            "location_name": "Udaipur",
        },
        {
            "title": "Free morning, depart Udaipur",
            "description": (
                "Bagore ki Haveli or the old-city shops before checkout. Drop at Udaipur "
                "airport or station any time up to 6 pm."
            ),
            "meals": "B",
            "location_name": "Udaipur",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 28),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 27_999,
            "price_triple_inr": 25_999,
            "price_child_inr": 15_999,
            "single_supplement_inr": 9_500,
        },
        {
            "date": dt.date(2026, 12, 26),
            "seats_total": 16,
            "price_double_inr": 29_999,
            "price_triple_inr": 27_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 10_500,
        },
        {
            "date": dt.date(2027, 1, 23),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 26_499,
            "price_triple_inr": 24_499,
            "price_child_inr": 14_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 2, 20),
            "seats_total": 16,
            "price_double_inr": 26_499,
            "price_triple_inr": 24_499,
            "price_child_inr": 14_999,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "rajasthan/amber-fort-lake.jpg", "alt": "Amber fort above Maota lake"},
        {"file": "rajasthan/mehrangarh-fort.jpg", "alt": "Mehrangarh fort on its cliff, Jodhpur"},
        {"file": "rajasthan/udaipur-lake-palace.jpg", "alt": "The Lake Palace on Pichola, Udaipur"},
        {"file": "rajasthan/hawa-mahal.jpg", "alt": "The east facade of Hawa Mahal, Jaipur"},
        {"file": "rajasthan/amber-sheesh-mahal.jpg", "alt": "Mirror work in Amber's Sheesh Mahal"},
        {"file": "rajasthan/jodhpur-blue-city.jpg", "alt": "Jodhpur's blue houses from the fort"},
        {"file": "rajasthan/pichola-sunset.jpg", "alt": "Lake Pichola at sunset"},
        {"file": "rajasthan/jaipur-city-palace.jpg", "alt": "Chandra Mahal, City Palace, Jaipur"},
    ],
    status="live",
    featured=True,
)
```

- [ ] **Step 3: Jaisalmer Desert Nights**

`api/content/packages/jaisalmer_desert_nights.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="jaisalmer-desert-nights",
    destination="rajasthan",
    name="Jaisalmer Desert Nights",
    summary=(
        "The golden fort, the carved havelis and a night in a Swiss tent at the Sam dunes — "
        "camel ride at sunset, folk music by the fire. Five days from Jodhpur station."
    ),
    themes=["heritage", "adventure"],
    nights=4,
    departure_city="Ex-Jodhpur",
    highlights=[
        "A night in a Swiss tent at the Sam dunes with dinner by the fire",
        "Camel ride to the dune crest for sunset; back for sunrise",
        "Jaisalmer fort — a living fort with 3,000 people still inside",
        "Patwon ki Haveli's five carved sandstone mansions",
        "Kuldhara, the village abandoned overnight in the 1800s",
    ],
    inclusions=[
        "3 nights at Hotel Pleasant Haveli, Jaisalmer, and 1 night in a Swiss tent at Prince "
        "Desert Camp, Sam — breakfast and dinner daily",
        "Private air-conditioned car with driver from Jodhpur station and back, including "
        "the Osian stop",
        "Camel ride at Sam, folk music and dance at the camp",
        "Entry to the fort palace, Patwon ki Haveli, Kuldhara and Bada Bagh",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Trains or flights to Jodhpur — Mumbai, Delhi and Bengaluru have overnight trains; "
        "we can book them at cost",
        "Lunches",
        "Jeep dune-bashing at Sam (about ₹1,500 per jeep, paid at the camp)",
        "Camera fees inside the fort palace",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Pleasant Haveli", "city": "Jaisalmer", "stars": 3, "nights": 3},
        {"name": "Prince Desert Camp", "city": "Sam", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "What is the desert camp like?",
            "a": "Swiss tents with a proper bed, an attached bathroom with running water, "
            "and electricity till midnight. Dinner is a buffet by the fire with folk "
            "musicians. It gets cold — 5 °C in December and January — so bring a jacket; "
            "the camp has blankets.",
        },
        {
            "q": "Why not stay inside the fort?",
            "a": "Jaisalmer fort is sinking under the weight of its plumbing, and the "
            "conservation bodies ask visitors not to sleep inside it. Our haveli is five "
            "minutes' walk from the gate with the fort filling its rooftop view.",
        },
        {
            "q": "Is the camel ride long?",
            "a": "About 40 minutes each way to the crest of the dunes at a walk. Anyone "
            "who would rather not ride can go by jeep for the same sunset.",
        },
    ],
    itinerary=[
        {
            "title": "Jodhpur to Jaisalmer via Osian, Gadisar at sunset",
            "description": (
                "Pick-up at Jodhpur station at 8 am (the overnight trains from Mumbai and "
                "Delhi arrive around 7). An hour at Osian's 8th-century temples, lunch on "
                "the way, Jaisalmer by 2 pm. Check in, then Gadisar lake's chhatris at "
                "sunset and dinner on the haveli's rooftop with the fort lit up."
            ),
            "meals": "D",
            "stay": "Hotel Pleasant Haveli, Jaisalmer",
            "location_name": "Jaisalmer",
        },
        {
            "title": "Inside the fort, the havelis, sunset at Vyas chhatri",
            "description": (
                "A morning inside the fort: the Raj Mahal, the Jain temples' carved "
                "ceilings, the lanes where people still live. After lunch the merchants' "
                "havelis — Patwon ki Haveli's five mansions, Nathmal ki Haveli's two "
                "unmatched halves. Sunset from the Vyas chhatri cenotaphs looking back at "
                "the fort; dinner at the haveli."
            ),
            "meals": "BD",
            "stay": "Hotel Pleasant Haveli, Jaisalmer",
            "location_name": "Jaisalmer fort",
        },
        {
            "title": "Kuldhara, Bada Bagh, camels to the Sam dunes",
            "description": (
                "Kuldhara's abandoned village and the royal cenotaphs of Bada Bagh in the "
                "morning, then 45 km west to Sam. Camels at 4 pm to the top of the dunes "
                "for sunset; back at the camp, folk music, a fire and dinner under more "
                "stars than you have seen in a while. Night in a Swiss tent."
            ),
            "meals": "BD",
            "stay": "Prince Desert Camp, Sam",
            "location_name": "Sam dunes",
        },
        {
            "title": "Dune sunrise, free afternoon in Jaisalmer",
            "description": (
                "Sunrise from the dunes, breakfast at the camp, back to Jaisalmer by "
                "11. The afternoon is yours — the Desert Culture Centre, the puppet show, "
                "or a nap. Dinner at a rooftop restaurant facing the fort."
            ),
            "meals": "BD",
            "stay": "Hotel Pleasant Haveli, Jaisalmer",
            "location_name": "Jaisalmer",
        },
        {
            "title": "Back to Jodhpur",
            "description": (
                "Leave at 9 am, Jodhpur station or airport by 2 pm — in time for the "
                "afternoon flights and evening trains. Ask us to add a Jodhpur night if you "
                "want Mehrangarh too."
            ),
            "meals": "B",
            "location_name": "Jodhpur",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 12),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_499,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 1, 9),
            "seats_total": 12,
            "price_double_inr": 19_499,
            "price_triple_inr": 17_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 6_500,
        },
        {
            "date": dt.date(2027, 2, 6),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 19_499,
            "price_triple_inr": 17_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 6_500,
        },
        {
            "date": dt.date(2027, 3, 6),
            "seats_total": 12,
            "price_double_inr": 19_999,
            "price_triple_inr": 18_499,
            "price_child_inr": 11_499,
            "single_supplement_inr": 6_500,
        },
    ],
    photos=[
        {"file": "rajasthan/sam-dunes-camel.jpg", "alt": "A camel on the Sam sand dunes"},
        {"file": "rajasthan/jaisalmer-fort.jpg", "alt": "The battlements of Jaisalmer fort"},
        {"file": "rajasthan/camel-safari-sunset.jpg", "alt": "Camel safari at sunset in the Thar"},
        {"file": "rajasthan/patwon-ki-haveli.jpg", "alt": "The carved facade of Patwon ki Haveli"},
        {"file": "rajasthan/gadisar-lake.jpg", "alt": "Chhatris on Gadisar lake, Jaisalmer"},
        {"file": "rajasthan/jaisalmer-fort-night.jpg", "alt": "Jaisalmer fort lit up at night"},
    ],
    status="live",
    featured=False,
)
```

- [ ] **Step 4: Validate**

Run (from `api/`): `uv run python -c "from content import load_content; c = load_content(); print([d.slug for d in c.destinations], len(c.packages))"`
Expected: `['goa', 'himachal', 'kerala', 'rajasthan'] 8` (modules import in name order; a pydantic error here means a rule is broken — fix the content, not the schema).

Run: `uv run pytest tests/test_content.py -q`
Expected: `test_from_prices_match_the_locked_list` still fails (Andaman/Ladakh keys), `test_no_photo_is_unused` still fails for the andaman/ladakh files only; everything else passes — in particular no rajasthan file is listed as unused (all 14 are referenced).

- [ ] **Step 5: Commit**

```bash
git add api/content/destinations/rajasthan.py api/content/packages/jaipur_jodhpur_udaipur.py api/content/packages/jaisalmer_desert_nights.py
git commit -m "content(F7): Rajasthan — Jaipur · Jodhpur · Udaipur and Jaisalmer Desert Nights"
```

---

### Task 4: Andaman — destination + two packages

**Files:**
- Create: `api/content/destinations/andaman.py`
- Create: `api/content/packages/port_blair_havelock_neil.py`
- Create: `api/content/packages/havelock_honeymoon.py`

**Interfaces:**
- Produces: destination `andaman`; packages `port-blair-havelock-neil` (featured), `havelock-honeymoon`.

- [ ] **Step 1: Destination**

`api/content/destinations/andaman.py`:

```python
from content._schema import define_destination

DESTINATION = define_destination(
    slug="andaman",
    name="Andaman",
    tagline="Radhanagar sands and reefs",
    intro=(
        "Two hours' flight east of Chennai, the Andamans are the beaches India's mainland "
        "does not have: white sand, water you can see your feet in, and reefs a short boat "
        "ride out. Havelock (Swaraj Dweep) has Radhanagar, the beach on every poster; Neil "
        "(Shaheed Dweep) is smaller and slower; Port Blair has the Cellular Jail and the "
        "airport.\n\n"
        "It is an island trip, so everything moves by ferry — 90 minutes Port Blair to "
        "Havelock, an hour on to Neil — and by boat to the reefs. We book the fast "
        "catamarans, not the government ferry, and we build in a spare hour everywhere "
        "because the sea sets the timetable.\n\n"
        "**Best time:** November to April — calm seas, clear water, snorkelling and diving "
        "at their best. May is hot; June to September is monsoon, when ferries get "
        "cancelled and the reefs are murky."
    ),
    cover={
        "file": "andaman/radhanagar-beach.jpg",
        "alt": "Radhanagar beach on Havelock island",
    },
    region="Bay of Bengal",
    best_months=[11, 12, 1, 2, 3, 4],
    position=5,
)
```

- [ ] **Step 2: Port Blair · Havelock · Neil**

`api/content/packages/port_blair_havelock_neil.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="port-blair-havelock-neil",
    destination="andaman",
    name="Port Blair · Havelock · Neil",
    summary=(
        "The three-island classic: Cellular Jail, three nights on Havelock with Radhanagar "
        "and a snorkel at Elephant beach, then Neil's natural bridge. Fast ferries, "
        "beachfront stays."
    ),
    themes=["beach", "adventure"],
    nights=5,
    departure_city="Ex-Port Blair",
    highlights=[
        "Radhanagar beach at sunset — three nights a walk away from it",
        "Guided snorkelling over the reef at Elephant beach",
        "The Cellular Jail and its light-and-sound show",
        "Neil island's natural rock bridge at low tide",
        "Fast catamaran ferries throughout, booked and confirmed by us",
    ],
    inclusions=[
        "1 night at Sea Shell, Port Blair; 3 nights at Symphony Palms Beach Resort, "
        "Havelock; 1 night at Summer Sands Beach Resort, Neil — breakfast and dinner daily",
        "Fast catamaran ferries Port Blair → Havelock → Neil → Port Blair",
        "Private transfers on every island, airport to airport",
        "Cellular Jail entry and the light-and-sound show; Elephant beach boat with "
        "snorkelling gear and a guide; glass-bottom boat at Bharatpur beach",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Port Blair — direct from Chennai, Kolkata, Bengaluru, Delhi and "
        "Hyderabad; we can book them at cost",
        "Lunches",
        "Scuba intro dive (about ₹3,500), sea walk (about ₹3,000), jet ski at Elephant beach",
        "Scooter hire on Havelock (about ₹500 a day)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Sea Shell", "city": "Port Blair", "stars": 4, "nights": 1},
        {"name": "Symphony Palms Beach Resort", "city": "Havelock", "stars": 4, "nights": 3},
        {"name": "Summer Sands Beach Resort", "city": "Neil", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "Do I need to know how to swim?",
            "a": "No. Snorkelling at Elephant beach is in waist-to-chest-deep water with a "
            "life jacket and a guide holding a float. The intro scuba dive is with an "
            "instructor and needs no swimming either.",
        },
        {
            "q": "What if a ferry is cancelled?",
            "a": "It happens a few times a season when the sea is rough. We rebook you on "
            "the next sailing and rearrange the hotels; the spare hours in our plan are "
            "there for this. Flights home are on the last day's evening for the same "
            "reason — book departures after 4 pm.",
        },
        {
            "q": "Which flights should we take?",
            "a": "Arrive Port Blair before 1 pm on day 1 and leave after 4 pm on day 6. "
            "Chennai and Kolkata have the shortest flights (about two hours).",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Port Blair, Cellular Jail",
            "description": (
                "Airport pick-up. After lunch the Cellular Jail — the wings, the gallows, "
                "the museum — and at dusk its light-and-sound show, which is better than "
                "it sounds. Dinner at the hotel by the harbour."
            ),
            "meals": "D",
            "stay": "Sea Shell, Port Blair",
            "location_name": "Port Blair",
        },
        {
            "title": "Ferry to Havelock, Radhanagar at sunset",
            "description": (
                "The 8 am catamaran, 90 minutes to Havelock. Check in at the resort, "
                "lunch, and by 4 pm Radhanagar beach — two kilometres of white sand with "
                "the forest right behind it — for the sunset everybody came for."
            ),
            "meals": "BD",
            "stay": "Symphony Palms Beach Resort, Havelock",
            "location_name": "Havelock",
        },
        {
            "title": "Elephant beach snorkelling",
            "description": (
                "A 20-minute boat to Elephant beach, then an hour over the reef with a "
                "guide: staghorn coral, parrotfish, the occasional turtle. Jet ski and "
                "sea walk are available on the spot. Back by 2; the afternoon is free for "
                "the resort's beach."
            ),
            "meals": "BD",
            "stay": "Symphony Palms Beach Resort, Havelock",
            "location_name": "Elephant beach",
        },
        {
            "title": "Free day on Havelock",
            "description": (
                "Our favourite day: hire a scooter and do the island's one road — "
                "Kalapathar beach at dawn, the village market, lunch at a beach café. Or "
                "do the intro scuba dive at Nemo reef (we book it the evening before)."
            ),
            "meals": "BD",
            "stay": "Symphony Palms Beach Resort, Havelock",
            "location_name": "Kalapathar",
        },
        {
            "title": "Ferry to Neil, the natural bridge",
            "description": (
                "An hour's ferry to Neil. The natural rock bridge at Laxmanpur is a "
                "low-tide walk over the reef flat (we time it); Bharatpur beach's "
                "glass-bottom boat after. Sunset at Laxmanpur beach one, dinner at the "
                "resort."
            ),
            "meals": "BD",
            "stay": "Summer Sands Beach Resort, Neil",
            "location_name": "Neil island",
        },
        {
            "title": "Neil to Port Blair, fly home",
            "description": (
                "A slow breakfast, the 10 am ferry to Port Blair (two hours), lunch in "
                "town and the airport for flights after 4 pm."
            ),
            "meals": "B",
            "location_name": "Port Blair",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 5),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 34_999,
            "price_triple_inr": 32_999,
            "price_child_inr": 19_999,
            "single_supplement_inr": 12_000,
        },
        {
            "date": dt.date(2027, 1, 16),
            "seats_total": 16,
            "price_double_inr": 32_999,
            "price_triple_inr": 30_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 2, 13),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 32_999,
            "price_triple_inr": 30_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 3, 20),
            "seats_total": 16,
            "price_double_inr": 33_999,
            "price_triple_inr": 31_999,
            "price_child_inr": 19_499,
            "single_supplement_inr": 11_500,
        },
    ],
    photos=[
        {"file": "andaman/radhanagar-beach.jpg", "alt": "Radhanagar beach, Havelock"},
        {"file": "andaman/snorkelling-coral.jpg", "alt": "Snorkelling over coral at Elephant beach"},
        {"file": "andaman/neil-natural-bridge.jpg", "alt": "The natural rock bridge on Neil island"},
        {"file": "andaman/cellular-jail.jpg", "alt": "The Cellular Jail, Port Blair"},
        {"file": "andaman/elephant-beach.jpg", "alt": "Elephant beach, Havelock"},
        {"file": "andaman/kalapathar-beach.jpg", "alt": "Kalapathar beach at dawn"},
        {"file": "andaman/ross-island-jetty.jpg", "alt": "The jetty at Ross island"},
        {"file": "andaman/beach-boat.jpg", "alt": "A boat in the shallows off Havelock"},
    ],
    status="live",
    featured=True,
)
```

- [ ] **Step 3: Havelock Honeymoon**

`api/content/packages/havelock_honeymoon.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="havelock-honeymoon",
    destination="andaman",
    name="Havelock Honeymoon",
    summary=(
        "Four nights in a forest cottage behind Radhanagar beach: a private snorkelling boat, "
        "an intro dive for two, a candlelit dinner on the sand. No group, no schedule."
    ),
    themes=["beach", "honeymoon"],
    nights=4,
    departure_city="Ex-Port Blair",
    highlights=[
        "Barefoot at Havelock — cottages in the forest, Radhanagar a two-minute walk",
        "A private boat to Elephant beach with your own snorkelling guide",
        "Intro scuba dive for two at Nemo reef, instructor beside you",
        "Candlelit dinner on the beach on your last night",
    ],
    inclusions=[
        "4 nights in a Nicobari cottage at Barefoot at Havelock — breakfast and dinner daily",
        "Fast catamaran Port Blair → Havelock → Port Blair in premium seats, private "
        "transfers at both ends",
        "Private snorkelling boat to Elephant beach with guide and gear",
        "One intro scuba dive each at Nemo reef; candlelit beach dinner",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Port Blair — we can book them at cost",
        "Lunches and drinks",
        "Spa treatments at the resort (couples' massage about ₹6,000)",
        "Scooter hire (about ₹500 a day)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Barefoot at Havelock", "city": "Havelock", "stars": 4, "nights": 4},
    ],
    faq=[
        {
            "q": "Is it just the two of us?",
            "a": "Yes. This is not a group departure — the dates are when we can guarantee "
            "the cottage and the private boat; the trip itself is only you two and a "
            "driver on the island.",
        },
        {
            "q": "Can we add Neil island?",
            "a": "Yes, a night at Neil adds about ₹7,000 per person including the ferries. "
            "We would put it after Havelock so the flight home is unhurried.",
        },
        {
            "q": "Do we need to arrive by a particular time?",
            "a": "Land in Port Blair before 12 noon on day 1 to make the afternoon "
            "catamaran; leave after 4 pm on day 5. Book flights only after we confirm the "
            "cottage.",
        },
    ],
    itinerary=[
        {
            "title": "Port Blair to Havelock, sunset on Radhanagar",
            "description": (
                "Met at the airport and driven to the jetty for the 2 pm catamaran. On "
                "Havelock, the resort's jeep through the forest to your cottage. "
                "Radhanagar is at the end of the path — go for the sunset. Dinner at the "
                "resort."
            ),
            "meals": "D",
            "stay": "Barefoot at Havelock",
            "location_name": "Havelock",
        },
        {
            "title": "Private boat to Elephant beach",
            "description": (
                "A late breakfast, then your own boat to Elephant beach — an hour over the "
                "reef with a guide, and the beach to yourselves before the day boats. Back "
                "for lunch; the afternoon at the resort or on the beach."
            ),
            "meals": "BD",
            "stay": "Barefoot at Havelock",
            "location_name": "Elephant beach",
        },
        {
            "title": "Intro dive at Nemo reef",
            "description": (
                "The dive school picks you up at 8: a briefing, a shallow practice, then "
                "a 40-minute dive to twelve metres with an instructor beside each of you. "
                "Photos are included. The rest of the day is free."
            ),
            "meals": "BD",
            "stay": "Barefoot at Havelock",
            "location_name": "Nemo reef",
        },
        {
            "title": "Kalapathar at dawn, dinner on the sand",
            "description": (
                "A scooter to Kalapathar beach for sunrise if you are up, the village "
                "market for coconuts, a long lunch. At 7 pm a table on the beach with "
                "candles and a set dinner — the resort's, not ours, and it is very good."
            ),
            "meals": "BD",
            "stay": "Barefoot at Havelock",
            "location_name": "Kalapathar",
        },
        {
            "title": "Ferry back, fly home",
            "description": (
                "The 10:30 catamaran to Port Blair, lunch in town, and the airport for "
                "flights after 4 pm."
            ),
            "meals": "B",
            "location_name": "Port Blair",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 19),
            "seats_total": 6,
            "guaranteed": True,
            "price_double_inr": 37_999,
            "price_triple_inr": 35_999,
            "price_child_inr": 22_999,
            "single_supplement_inr": 15_000,
        },
        {
            "date": dt.date(2027, 2, 10),
            "seats_total": 6,
            "price_double_inr": 34_999,
            "price_triple_inr": 32_999,
            "price_child_inr": 20_999,
            "single_supplement_inr": 14_000,
        },
        {
            "date": dt.date(2027, 3, 13),
            "seats_total": 6,
            "guaranteed": True,
            "price_double_inr": 34_999,
            "price_triple_inr": 32_999,
            "price_child_inr": 20_999,
            "single_supplement_inr": 14_000,
        },
    ],
    photos=[
        {"file": "andaman/radhanagar-trees.jpg", "alt": "Radhanagar beach under the forest edge"},
        {"file": "andaman/andaman-sunset.jpg", "alt": "Sunset over the sea, Andaman islands"},
        {"file": "andaman/kalapathar-beach-2.jpg", "alt": "Kalapathar beach, Havelock"},
        {"file": "andaman/havelock-shore.jpg", "alt": "Clear water on the Havelock shore"},
        {"file": "andaman/elephants-on-the-beach.jpg", "alt": "Elephants walking on a Havelock beach"},
        {"file": "andaman/snorkelling-coral.jpg", "alt": "Snorkelling over coral at Elephant beach"},
    ],
    status="live",
    featured=False,
)
```

- [ ] **Step 4: Validate**

Run (from `api/`): `uv run pytest tests/test_content.py -q`
Expected: only Ladakh-related failures remain (`KeyError: 'leh-nubra-pangong'`, ladakh files unused, `len(live) >= 12` false with 10, testimonials < 6).

- [ ] **Step 5: Commit**

```bash
git add api/content/destinations/andaman.py api/content/packages/port_blair_havelock_neil.py api/content/packages/havelock_honeymoon.py
git commit -m "content(F7): Andaman — Port Blair · Havelock · Neil and Havelock Honeymoon"
```

---

### Task 5: Ladakh — destination + two packages

**Files:**
- Create: `api/content/destinations/ladakh.py`
- Create: `api/content/packages/leh_nubra_pangong.py`
- Create: `api/content/packages/leh_turtuk.py`

**Interfaces:**
- Produces: destination `ladakh`; packages `leh-nubra-pangong` (featured), `leh-turtuk`.

- [ ] **Step 1: Destination**

`api/content/destinations/ladakh.py`:

```python
from content._schema import define_destination

DESTINATION = define_destination(
    slug="ladakh",
    name="Ladakh",
    tagline="Passes, lakes and monasteries",
    intro=(
        "Ladakh is a high desert on the far side of the Himalaya: 3,500 metres at Leh, "
        "5,359 at Khardung La, a sky so blue it looks edited. Monasteries sit on rocks above "
        "the Indus, double-humped camels walk the dunes at Hunder, and Pangong changes "
        "colour four times before lunch.\n\n"
        "Altitude runs the show. Every trip of ours starts with a full rest day in Leh, "
        "climbs the passes only on day three, and sleeps low on the way back. Our drivers "
        "are Ladakhi, the cars carry oxygen, and we would rather cancel a day than push "
        "anyone who is unwell.\n\n"
        "**Best time:** June to September only — the passes are open, the roads clear, "
        "the days warm and the nights cold. We do not run Ladakh in the other eight "
        "months."
    ),
    cover={
        "file": "ladakh/pangong-tso.jpg",
        "alt": "Pangong Tso and its bare mountains",
    },
    region="Trans-Himalaya",
    best_months=[6, 7, 8, 9],
    position=6,
)
```

- [ ] **Step 2: Leh · Nubra · Pangong**

`api/content/packages/leh_nubra_pangong.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="leh-nubra-pangong",
    destination="ladakh",
    name="Leh · Nubra · Pangong",
    summary=(
        "The full Ladakh loop in seven days: a rest day in Leh, over Khardung La to Nubra's "
        "dunes, the Shyok road to Pangong, back over Chang La. Oxygen in every car."
    ),
    themes=["adventure", "hills"],
    nights=6,
    departure_city="Ex-Leh",
    highlights=[
        "Khardung La, 5,359 m — one of the highest roads you can drive",
        "Bactrian camels on the Hunder dunes at sunset",
        "A night on the shore of Pangong Tso at Spangmik",
        "The Shyok river road between Nubra and Pangong — no going back through Leh",
        "Thiksey, Diskit and Shanti stupa, with a Ladakhi driver who knows the lamas",
    ],
    inclusions=[
        "4 nights at Hotel Omasila, Leh; 1 night at Hunder Sarai, Nubra; 1 night at Pangong "
        "Sarai camp, Spangmik — breakfast and dinner daily, lunch on arrival day",
        "Private Innova or similar with a Ladakhi driver for the whole trip, oxygen cylinder "
        "in the car",
        "Inner-line permits for Nubra, Pangong and the Shyok road",
        "Monastery entries: Thiksey, Diskit, Hemis; Hall of Fame",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Leh — Delhi has several morning flights; we can book them at cost",
        "Lunches after day 1",
        "Camel ride at Hunder (about ₹400 for 15 minutes), rafting on the Zanskar "
        "(about ₹1,500)",
        "Personal medicines — talk to your doctor about Diamox before you come",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Omasila", "city": "Leh", "stars": 3, "nights": 4},
        {"name": "Hunder Sarai", "city": "Nubra", "stars": 3, "nights": 1},
        {"name": "Pangong Sarai", "city": "Spangmik", "stars": 2, "nights": 1},
    ],
    faq=[
        {
            "q": "Will I get altitude sickness?",
            "a": "Most people feel the altitude on day one — a headache, poor sleep, "
            "breathlessness on stairs. That is why day one is a rest day and day two stays "
            "around Leh. Drink water, skip alcohol, and tell your driver the moment you feel "
            "worse; the car has oxygen and Leh has a good hospital. Ask your doctor about "
            "Diamox before you travel.",
        },
        {
            "q": "How cold does it get?",
            "a": "Leh is 20–25 °C by day in summer and 5–10 °C at night. Pangong's camp "
            "is close to freezing at night even in July — the tents have thick quilts, "
            "and you will want a down jacket, a woollen cap and gloves.",
        },
        {
            "q": "Is the Pangong camp comfortable?",
            "a": "Fixed tents with proper beds and an attached bathroom with running "
            "water. Electricity is from a generator, evenings only. It is basic, and the "
            "lake outside the flap makes up for it.",
        },
    ],
    itinerary=[
        {
            "title": "Fly into Leh, rest",
            "description": (
                "Leh's flights land at dawn; you are at the hotel by 9 am and the rest of "
                "the day is deliberately empty. Sleep, drink water, sit in the garden. If "
                "you feel fine by evening, a slow walk to the market and Leh's main "
                "street; if not, that is what the rest day is for."
            ),
            "meals": "LD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Leh",
        },
        {
            "title": "Leh's stupa and palace, Sangam, Magnetic hill",
            "description": (
                "An easy loop below 3,600 m: Shanti stupa at 8 am, Leh palace above the "
                "old town, then west along the Indus — the Hall of Fame, Gurudwara Pathar "
                "Sahib, Magnetic hill and the Sangam where the green Indus meets the "
                "brown Zanskar (rafting is here if you want it). Back by 4."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Sangam",
        },
        {
            "title": "Over Khardung La to Nubra, camels at Hunder",
            "description": (
                "Two hours' climb to Khardung La, 5,359 m — twenty minutes at the top for "
                "the photo, no more — and down into the Nubra valley. Diskit monastery "
                "and its 32-metre Maitreya after lunch, then the Hunder dunes at 5 pm: "
                "Bactrian camels, the Shyok river, and mountains on every side."
            ),
            "meals": "BD",
            "stay": "Hunder Sarai, Nubra",
            "location_name": "Hunder",
        },
        {
            "title": "The Shyok road to Pangong",
            "description": (
                "Five to six hours along the Shyok — the river road that means you do not "
                "go back through Leh — with the first blue of Pangong appearing after "
                "Tangtse. Camp on the lake's shore at Spangmik; the evening light on the "
                "far mountains is the trip's best hour."
            ),
            "meals": "BD",
            "stay": "Pangong Sarai, Spangmik",
            "location_name": "Pangong Tso",
        },
        {
            "title": "Lake sunrise, Chang La, Thiksey",
            "description": (
                "Sunrise on the lake, then the road back over Chang La (5,360 m) with a "
                "stop for tea at the pass. Thiksey monastery on the way into Leh — the "
                "twelve-storey gompa and the two-storey Maitreya. Leh by 4 pm."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Thiksey",
        },
        {
            "title": "Hemis and a free afternoon",
            "description": (
                "Hemis, Ladakh's richest monastery, in the morning, and Stok palace "
                "museum on the way back. The afternoon is yours — the market for "
                "pashmina and apricots, a café on Changspa road, or nothing at all."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Hemis",
        },
        {
            "title": "Fly home",
            "description": (
                "An early transfer for the morning flights out of Leh — nothing departs "
                "after midday."
            ),
            "meals": "B",
            "location_name": "Leh",
        },
    ],
    departures=[
        {
            "date": dt.date(2027, 6, 12),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 31_999,
            "price_triple_inr": 29_999,
            "price_child_inr": 19_999,
            "single_supplement_inr": 9_500,
        },
        {
            "date": dt.date(2027, 7, 3),
            "seats_total": 12,
            "price_double_inr": 29_999,
            "price_triple_inr": 27_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 8, 14),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 29_999,
            "price_triple_inr": 27_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 9, 11),
            "seats_total": 12,
            "price_double_inr": 30_999,
            "price_triple_inr": 28_999,
            "price_child_inr": 19_499,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "ladakh/pangong-tso.jpg", "alt": "Pangong Tso"},
        {"file": "ladakh/khardung-la.jpg", "alt": "Prayer flags at Khardung La"},
        {"file": "ladakh/hunder-camels.jpg", "alt": "Bactrian camels on the Hunder dunes"},
        {"file": "ladakh/diskit-maitreya.jpg", "alt": "The Maitreya Buddha at Diskit"},
        {"file": "ladakh/pangong-afternoon.jpg", "alt": "Late afternoon on Pangong Tso"},
        {"file": "ladakh/thiksey-monastery.jpg", "alt": "Thiksey monastery"},
        {"file": "ladakh/shanti-stupa.jpg", "alt": "Shanti stupa, Leh"},
        {"file": "ladakh/sangam.jpg", "alt": "The Indus meeting the Zanskar at Sangam"},
    ],
    status="live",
    featured=True,
)
```

- [ ] **Step 3: Leh & Turtuk**

`api/content/packages/leh_turtuk.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="leh-turtuk",
    destination="ladakh",
    name="Leh & Turtuk",
    summary=(
        "Past Nubra to the last village before the line of control: Turtuk's Balti stone "
        "houses, apricot orchards and buckwheat fields. A homestay night, Hunder's camels, "
        "Thiksey at dawn."
    ),
    themes=["adventure", "hills"],
    nights=5,
    departure_city="Ex-Leh",
    highlights=[
        "Turtuk — a Balti village that was Pakistan until 1971, open to visitors since 2010",
        "A night in a family-run guesthouse among the apricot trees",
        "Khardung La both ways, Hunder's dunes and camels at sunset",
        "Thiksey's 6 am prayers, horns and all, before your flight",
    ],
    inclusions=[
        "3 nights at Hotel Omasila, Leh; 1 night at Turtuk Holiday Resort; 1 night at "
        "Hunder Sarai, Nubra — breakfast and dinner daily, lunch on arrival day",
        "Private Innova or similar with a Ladakhi driver, oxygen cylinder in the car",
        "Inner-line permits for Nubra and Turtuk",
        "Monastery entries: Thiksey, Diskit; Hall of Fame",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Leh — we can book them at cost",
        "Lunches after day 1",
        "Camel ride at Hunder (about ₹400), rafting at Sangam (about ₹1,500)",
        "Personal medicines — talk to your doctor about Diamox before you come",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Omasila", "city": "Leh", "stars": 3, "nights": 3},
        {"name": "Turtuk Holiday Resort", "city": "Turtuk", "stars": 2, "nights": 1},
        {"name": "Hunder Sarai", "city": "Nubra", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "What is the Turtuk stay like?",
            "a": "A family-run guesthouse with simple rooms, attached bathrooms and hot "
            "water in buckets — the village has electricity most evenings. Dinner is "
            "Balti food cooked by the family: buckwheat pancakes, apricot chutney, kisir. "
            "It is the night people talk about afterwards.",
        },
        {
            "q": "Is Turtuk safe? It is near the border.",
            "a": "Yes. It is a normal village with an army post, a school and a lot of "
            "children who want to practise English. Foreign nationals need a slightly "
            "different permit, which we arrange.",
        },
        {
            "q": "How long is the drive to Turtuk?",
            "a": "About seven hours from Leh including Khardung La and a lunch stop at "
            "Diskit — the last 80 km follow the Shyok through a gorge. We break it with "
            "the Hunder night on the way back so you only do the long day once.",
        },
    ],
    itinerary=[
        {
            "title": "Fly into Leh, rest",
            "description": (
                "At the hotel by 9 am; the day is empty on purpose. Water, sleep, the "
                "garden. A slow evening walk to the market if you feel well."
            ),
            "meals": "LD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Leh",
        },
        {
            "title": "Shanti stupa, Leh palace, Sangam",
            "description": (
                "An easy loop: Shanti stupa early, Leh palace and the old town, then west "
                "along the Indus to Magnetic hill and the Sangam confluence. Rafting is "
                "on offer here for anyone feeling strong. Back by 4."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Sangam",
        },
        {
            "title": "Khardung La, Diskit, the Shyok gorge to Turtuk",
            "description": (
                "Leave at 7. Khardung La by 9 (5,359 m, twenty minutes at the top), "
                "Diskit's Maitreya and lunch at noon, then 80 km down the Shyok gorge to "
                "Turtuk by 4 pm. A walk through the village's stone lanes and the "
                "orchards before the family's dinner."
            ),
            "meals": "BD",
            "stay": "Turtuk Holiday Resort, Turtuk",
            "location_name": "Turtuk",
        },
        {
            "title": "Turtuk morning, camels at Hunder",
            "description": (
                "Turtuk's three hamlets on foot: the 16th-century mosque, the Yabgo "
                "royal house museum, the buckwheat fields and the viewpoint over the "
                "Shyok. Leave after lunch for Hunder (two hours), camels on the dunes at "
                "sunset."
            ),
            "meals": "BD",
            "stay": "Hunder Sarai, Nubra",
            "location_name": "Hunder",
        },
        {
            "title": "Back over Khardung La",
            "description": (
                "A late start, the Nubra valley in the morning light, Khardung La again "
                "and Leh by 2 pm. The afternoon for the market or a café; dinner at the "
                "hotel."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Khardung La",
        },
        {
            "title": "Thiksey prayers, fly home",
            "description": (
                "Up at 5 for Thiksey's morning prayers — the long horns from the roof, "
                "the young monks with the butter tea — then straight to the airport for "
                "the morning flight."
            ),
            "meals": "B",
            "location_name": "Thiksey",
        },
    ],
    departures=[
        {
            "date": dt.date(2027, 6, 26),
            "seats_total": 10,
            "guaranteed": True,
            "price_double_inr": 29_499,
            "price_triple_inr": 27_499,
            "price_child_inr": 18_499,
            "single_supplement_inr": 8_500,
        },
        {
            "date": dt.date(2027, 7, 24),
            "seats_total": 10,
            "price_double_inr": 27_499,
            "price_triple_inr": 25_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 8_000,
        },
        {
            "date": dt.date(2027, 8, 28),
            "seats_total": 10,
            "guaranteed": True,
            "price_double_inr": 27_499,
            "price_triple_inr": 25_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 8_000,
        },
        {
            "date": dt.date(2027, 9, 18),
            "seats_total": 10,
            "price_double_inr": 28_499,
            "price_triple_inr": 26_499,
            "price_child_inr": 17_499,
            "single_supplement_inr": 8_000,
        },
    ],
    photos=[
        {"file": "ladakh/turtuk-valley.jpg", "alt": "Turtuk village and its green terraces"},
        {"file": "ladakh/turtuk-fields.jpg", "alt": "Buckwheat fields around Turtuk"},
        {"file": "ladakh/shyok-turtuk.jpg", "alt": "The Shyok river at Turtuk"},
        {"file": "ladakh/khardung-la-road.jpg", "alt": "The road over Khardung La"},
        {"file": "ladakh/hunder-camels.jpg", "alt": "Bactrian camels on the Hunder dunes"},
        {"file": "ladakh/diskit-gompa.jpg", "alt": "Diskit monastery above the Nubra valley"},
        {"file": "ladakh/leh-palace.jpg", "alt": "Leh palace above the old town"},
        {"file": "ladakh/sangam-2.jpg", "alt": "The Zanskar–Indus confluence"},
    ],
    status="live",
    featured=False,
)
```

- [ ] **Step 4: Validate**

Run (from `api/`): `uv run pytest tests/test_content.py -q`
Expected: only `len(content.testimonials) >= 6` fails now (Task 6). `test_no_photo_is_unused` and `test_photo_dirs_are_destination_slugs` PASS.

Run: `uv run ruff format content && uv run ruff check content`
Expected: format rewraps any dict line over 100 columns (commit the result); check is clean.

- [ ] **Step 5: Commit**

```bash
git add api/content/destinations/ladakh.py api/content/packages/leh_nubra_pangong.py api/content/packages/leh_turtuk.py api/content/photos
git commit -m "content(F7): Ladakh — Leh · Nubra · Pangong and Leh & Turtuk"
```

---

### Task 6: Six testimonials, full api green, local seed and a look

**Files:**
- Modify: `api/content/testimonials.py`

- [ ] **Step 1: Append three testimonials**

In `api/content/testimonials.py`, after the Sneha Iyer entry (position 3) and before the closing `]`:

```python
    TestimonialContent(
        name="Kavya and Arjun Reddy",
        city="Hyderabad",
        text=(
            "The houseboat night was the best of our honeymoon — the crew cooked karimeen "
            "on deck and then left us alone. Munnar was cold enough for the jackets we "
            "nearly didn't pack. Every hotel was the one in the photos."
        ),
        rating=5,
        package="munnar-alleppey-houseboat",
        position=4,
    ),
    TestimonialContent(
        name="Devansh Gupta",
        city="Delhi",
        text=(
            "Eight of us from office. Riverside cottages in Kasol, and the Kheerganga day "
            "was organised down to the packed lunch and the hot-spring towels. Nobody had "
            "to plan a thing, which for our group is a miracle."
        ),
        rating=5,
        package="manali-kasol-tosh",
        position=5,
    ),
    TestimonialContent(
        name="Meera and Kiran Shah",
        city="Ahmedabad",
        text=(
            "Havelis instead of chain hotels made all the difference for my parents. The "
            "Jaipur–Jodhpur drive is long — the Pushkar stop helped — but Mehrangarh at "
            "sunset was worth every hour of it."
        ),
        rating=4,
        package="jaipur-jodhpur-udaipur",
        position=6,
    ),
```

- [ ] **Step 2: Whole api suite**

Run (from `api/`): `uv run pytest -q`
Expected: **120 passed** (118 + the two new tests in `test_content.py`; the seeded-fixture tests are untouched). If a fixture test fails, you touched `tests/fixture_content` — revert it.

Run: `uv run ruff check . && uv run ruff format --check . && uv run pyright`
Expected: clean.

- [ ] **Step 3: Seed locally and look**

```bash
uv run python scripts/seed.py --local --database-url $DEV_URL
```
Expected: counts `destinations 6 · packages 12 · departures 45` (image rows: 34 existing + 42 new files, with `snorkelling-coral.jpg` and `hunder-camels.jpg` each used by two packages).

With the dev api and web running (Local environment section), open `http://localhost:3000/`, `/destinations`, `/packages`, `/packages/leh-nubra-pangong`, `/destinations/ladakh`. Expected: home shows 6 tiles and 6 cards (the three featured new ones plus the three existing featured), the listing has 12 results and `ladakh` in the destination facet, a package page renders the 7-day itinerary and `Ex-Leh`, and `/destinations/ladakh` says `Best Jun – Sep`. Take one screenshot of the home for the PR: `cd web && pnpm exec playwright screenshot --viewport-size=1280,900 --full-page http://localhost:3000/ "$SCRATCHPAD/home.png"`.

- [ ] **Step 4: Commit**

```bash
git add api/content/testimonials.py
git commit -m "content(F7): six testimonials"
```

---

### Task 7: Web data — business details, the policy documents, the contact message

**Files:**
- Modify: `web/src/lib/business.ts`
- Create: `web/src/lib/policies.ts`
- Create: `web/src/lib/contact.ts`
- Modify: `web/tests/business.test.ts`
- Create: `web/tests/policies.test.ts`, `web/tests/contact.test.ts`

**Interfaces:**
- Produces:
  - `BUSINESS` gains `addressLine2: string`, `mapsHref: string`, `mapEmbedSrc: string`, `afterHours: string`, `founded: 2019`.
  - `type PolicySlug = 'terms' | 'privacy' | 'cancellation-policy'`; `type PolicyBlock = { h: string; p?: string[]; list?: string[] }`; `type PolicyDoc = { slug: PolicySlug; title: string; short: string; summary: string; updated: string; blocks: PolicyBlock[] }`; `POLICY_SLUGS: readonly PolicySlug[]`; `POLICIES: Record<PolicySlug, PolicyDoc>`; `CANCELLATION_SCHEDULE: readonly { window: string; refund: string }[]`; `formatUpdated(iso: string): string` → `18 September 2026`.
  - `contactMessage(f: { name: string; mobile: string; email: string; message: string }): string`.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/business.test.ts` inside the `describe`:

```ts
  it('has the contact-page facts', () => {
    expect(BUSINESS.addressLine2).toMatch(/floor/i);
    expect(BUSINESS.mapEmbedSrc).toMatch(/^https:\/\/maps\.google\.com\/maps\?q=.*&output=embed$/);
    expect(BUSINESS.mapsHref).toMatch(/^https:\/\/maps\.google\.com\//);
    expect(BUSINESS.founded).toBe(2019);
    expect(BUSINESS.afterHours.length).toBeGreaterThan(10);
  });
```

`web/tests/policies.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_SCHEDULE,
  formatUpdated,
  POLICIES,
  POLICY_SLUGS,
} from '../src/lib/policies';

const PLACEHOLDERS = /lorem|ipsum|tbd|todo|coming soon|\[|\]/i;

describe('policy documents', () => {
  it('cover the three footer links', () => {
    expect(POLICY_SLUGS).toEqual(['terms', 'privacy', 'cancellation-policy']);
    for (const slug of POLICY_SLUGS) expect(POLICIES[slug].slug).toBe(slug);
  });

  it('are real copy with a heading and body in every block', () => {
    for (const slug of POLICY_SLUGS) {
      const doc = POLICIES[slug];
      expect(doc.blocks.length).toBeGreaterThanOrEqual(4);
      for (const b of doc.blocks) {
        expect(b.h.length).toBeGreaterThan(3);
        const body = [...(b.p ?? []), ...(b.list ?? [])].join(' ');
        expect(body.length).toBeGreaterThan(40);
        expect(body).not.toMatch(PLACEHOLDERS);
      }
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('quotes one cancellation schedule everywhere', () => {
    expect(CANCELLATION_SCHEDULE.map((r) => r.window)).toEqual([
      '30 days or more before departure',
      '15 to 29 days before departure',
      '14 days or fewer before departure',
    ]);
    const cancel = POLICIES['cancellation-policy'].blocks[0];
    expect(cancel.list).toEqual(
      CANCELLATION_SCHEDULE.map((r) => `${r.window}: ${r.refund}`),
    );
  });

  it('formats the updated date for people', () => {
    expect(formatUpdated('2026-09-18')).toBe('18 September 2026');
  });
});
```

`web/tests/contact.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contactMessage } from '../src/lib/contact';

describe('contactMessage', () => {
  it('writes a WhatsApp-ready message from the form fields', () => {
    expect(
      contactMessage({
        name: 'Asha',
        mobile: '9876543210',
        email: 'asha@example.com',
        message: 'Goa for 4 in December, around 60k.',
      }),
    ).toBe(
      'Hi Tripsmith, this is Asha.\nGoa for 4 in December, around 60k.\nMobile: 9876543210 · Email: asha@example.com',
    );
  });

  it('leaves out blank fields and trims the rest', () => {
    expect(contactMessage({ name: ' Asha ', mobile: '', email: '', message: ' Hello ' })).toBe(
      'Hi Tripsmith, this is Asha.\nHello',
    );
    expect(contactMessage({ name: '', mobile: '', email: '', message: '' })).toBe('Hi Tripsmith.');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `web/`): `pnpm test -- business policies contact`
Expected: `business.test.ts` fails on `addressLine2` undefined; the other two fail to import (`Cannot find module`).

- [ ] **Step 3: Extend `business.ts`**

Replace the `BUSINESS` object in `web/src/lib/business.ts` with:

```ts
export const BUSINESS = {
  name: 'Tripsmith',
  legalName: 'Tripsmith Holidays',
  address: '14 Church Street',
  addressLine2: '2nd floor · walk-ins welcome',
  city: 'Bengaluru 560001',
  phoneDisplay: '+91 98450 12345',
  phoneHref: 'tel:+919845012345',
  email: 'hello@tripsmith.in',
  hours: '10 am – 8 pm, every day',
  afterHours: 'After hours, WhatsApp us — we reply first thing next morning.',
  callbackPromise: 'A person calls you back within two hours',
  founded: 2019,
  /** Keyless classic embed — no API key, no cookies until the visitor interacts with the map. */
  mapEmbedSrc:
    'https://maps.google.com/maps?q=Church%20Street%2C%20Bengaluru%20560001&z=16&output=embed',
  mapsHref: 'https://maps.google.com/?q=Church+Street,+Bengaluru+560001',
} as const;
```

- [ ] **Step 4: Write `policies.ts`**

`web/src/lib/policies.ts`:

```ts
/**
 * The three policy pages as data (S10–S12), rendered by `PolicyPage`. Plain language on
 * purpose: these are read by travellers, not lawyers. The cancellation schedule is exported
 * separately because the package price box quotes it.
 */
import { BUSINESS } from './business';

export type PolicySlug = 'terms' | 'privacy' | 'cancellation-policy';

export type PolicyBlock = { h: string; p?: string[]; list?: string[] };

export type PolicyDoc = {
  slug: PolicySlug;
  /** Page h1 and <title>. */
  title: string;
  /** Switcher label. */
  short: string;
  /** Meta description and the lede under the h1. */
  summary: string;
  /** ISO date of the last change. */
  updated: string;
  blocks: PolicyBlock[];
};

export const POLICY_SLUGS = ['terms', 'privacy', 'cancellation-policy'] as const satisfies
  readonly PolicySlug[];

const UPDATED = '2026-09-18';

export const CANCELLATION_SCHEDULE = [
  {
    window: '30 days or more before departure',
    refund: 'full refund, minus any non-refundable flight or train tickets we bought for you',
  },
  {
    window: '15 to 29 days before departure',
    refund: '50% of the package price is retained',
  },
  { window: '14 days or fewer before departure', refund: 'no refund' },
] as const;

const terms: PolicyDoc = {
  slug: 'terms',
  title: 'Terms of service',
  short: 'Terms',
  summary: 'What you are buying when you book a Tripsmith trip, and what each of us promises.',
  updated: UPDATED,
  blocks: [
    {
      h: 'Who we are',
      p: [
        `${BUSINESS.legalName}, ${BUSINESS.address}, ${BUSINESS.city}, is a tour operator registered in Karnataka. When you book with us you are booking with the four of us, not a marketplace — the person who answers the phone is the person who planned the trip.`,
      ],
    },
    {
      h: 'What a package includes',
      p: [
        'Exactly what the package page lists under "Included". Anything under "Not included" is paid by you locally, and we say what it usually costs so there are no surprises.',
        'Hotels are the ones named on the page. If a hotel cannot honour a booking we move you to one of the same standard or better and tell you before you travel.',
      ],
    },
    {
      h: 'Prices',
      p: [
        'Per person, in Indian rupees, for the sharing shown (double, triple, child, or a single supplement). Prices on the site are for the departure date shown next to them and hold for 7 days from a written quote.',
        'GST at 5% applies to the package price and is shown on your quote and invoice.',
      ],
    },
    {
      h: 'Booking and payment',
      p: [
        'A booking is confirmed when we receive the advance — 30% of the package price — and send you a confirmation with a booking reference. Until then seats are not held, and dates that fill up on the site do fill up.',
        'The balance is due 21 days before departure. For bookings made inside 21 days, the full amount is due at booking.',
      ],
    },
    {
      h: 'Changes and cancellations',
      p: [
        'One free date change up to 30 days before departure, subject to seats on the new date. Name changes are free at any time. Cancellations follow our cancellation & refunds policy, linked from every package page.',
      ],
    },
    {
      h: 'Your responsibilities',
      list: [
        'Carry a government photo ID for every traveller — hotels and ferries ask for it.',
        'Tell us about medical conditions, dietary needs and anyone under 12 or over 70 at booking, so the trip is planned around them.',
        'Be at the pick-up point on time; the coach or car cannot wait for late arrivals, and joining later is at your own cost.',
        'Look after your belongings; we are not responsible for loss or theft during the trip.',
      ],
    },
    {
      h: 'Our responsibilities and their limits',
      p: [
        'We choose our partners carefully, but we do not run the hotels, coaches, ferries or airlines ourselves. We are not liable for delays or changes caused by weather, road closures, strikes, ferry cancellations or events outside our control — but when they happen we rebook, reroute and stay on the phone until it is sorted out.',
        'Our liability for any claim is limited to the amount you paid us for the trip.',
      ],
    },
    {
      h: 'Disputes',
      p: [
        `Talk to us first — ${BUSINESS.email} or ${BUSINESS.phoneDisplay} — and we will try to fix it within seven days. Anything that cannot be resolved is subject to the courts of Bengaluru.`,
      ],
    },
  ],
};

const privacy: PolicyDoc = {
  slug: 'privacy',
  title: 'Privacy policy',
  short: 'Privacy',
  summary: 'What we collect when you enquire or book, why, who sees it, and how to delete it.',
  updated: UPDATED,
  blocks: [
    {
      h: 'What we collect',
      p: [
        'When you enquire we store your name, phone number, email, the trip you asked about, your travel month, party size and anything you write to us, so that we can call you back and send you an itinerary.',
        'When you book we also store the names, ages and ID numbers of everyone travelling, because hotels, ferries and permits need them.',
      ],
    },
    {
      h: 'What we do with it',
      p: [
        'We use it to respond to your enquiry and, if you book, to run your trip. We do not sell it, we do not add you to a newsletter, and we do not run advertising that follows you around the internet.',
      ],
    },
    {
      h: 'Who sees it',
      p: [
        'The four of us at Tripsmith, and the hotels, transport partners and permit offices that need travellers’ names for your booking. Our email and hosting providers process it on our behalf under their own privacy terms.',
      ],
    },
    {
      h: 'Cookies and analytics',
      p: [
        'The site sets no advertising cookies. We use privacy-respecting page analytics that count visits without identifying you, and an error-reporting service that records the page and browser when something breaks. The map on our contact page is embedded from Google Maps and may set its own cookies when you interact with it.',
      ],
    },
    {
      h: 'How long we keep it',
      p: [
        'Enquiries that did not lead to a booking are deleted after 12 months. Booking records are kept for 8 years because tax law requires it.',
      ],
    },
    {
      h: 'Your choices',
      p: [
        `Email ${BUSINESS.email} to see, correct or delete what we hold about you. We answer within 7 days. WhatsApp conversations are on WhatsApp’s terms; delete them from your side any time.`,
      ],
    },
  ],
};

const cancellation: PolicyDoc = {
  slug: 'cancellation-policy',
  title: 'Cancellation & refunds',
  short: 'Cancellation & refunds',
  summary:
    'One schedule for every trip on this site, counted from the departure date. No fine print.',
  updated: UPDATED,
  blocks: [
    {
      h: 'If you cancel',
      p: ['Every package on this site follows the same schedule, counted from the departure date:'],
      list: CANCELLATION_SCHEDULE.map((r) => `${r.window}: ${r.refund}`),
    },
    {
      h: 'If we cancel',
      p: [
        'If a departure does not reach minimum numbers, or cannot run safely because of weather, road closures or ferry cancellations, we tell you at least 10 days before departure and offer a full refund or a free move to another date. Departures marked "guaranteed" run regardless of numbers.',
      ],
    },
    {
      h: 'Changes',
      p: [
        'One free date change up to 30 days before departure, subject to seats on the new date. Name changes are free at any time. Changes inside 30 days are treated as a cancellation and a new booking.',
      ],
    },
    {
      h: 'Leaving a trip early',
      p: [
        'If you leave a trip after it has started, unused hotel nights and services are not refundable — they were paid for before you arrived.',
      ],
    },
    {
      h: 'How refunds are paid',
      p: [
        'To the original payment method within 7 working days of our confirming the cancellation in writing. Bank charges, if any, are deducted.',
      ],
    },
  ],
};

export const POLICIES: Record<PolicySlug, PolicyDoc> = {
  terms,
  privacy,
  'cancellation-policy': cancellation,
};

/** `2026-09-18` → `18 September 2026` (en-IN puts the day first). */
export function formatUpdated(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Step 5: Write `contact.ts`**

`web/src/lib/contact.ts`:

```ts
export type ContactFields = { name: string; mobile: string; email: string; message: string };

/**
 * The contact form's stand-in until the enquiry flow lands: the fields become one WhatsApp
 * message, so a visitor's message still reaches a person today. Blank fields are left out.
 */
export function contactMessage(f: ContactFields): string {
  const name = f.name.trim();
  const lines = [name ? `Hi Tripsmith, this is ${name}.` : 'Hi Tripsmith.'];
  if (f.message.trim()) lines.push(f.message.trim());
  const reach = [
    f.mobile.trim() && `Mobile: ${f.mobile.trim()}`,
    f.email.trim() && `Email: ${f.email.trim()}`,
  ].filter(Boolean);
  if (reach.length) lines.push(reach.join(' · '));
  return lines.join('\n');
}
```

- [ ] **Step 6: Run the tests**

Run (from `web/`): `pnpm test`
Expected: **63 passed** (56 + 1 business + 4 policies + 2 contact).

Run: `pnpm --filter web lint && pnpm --filter web typecheck` (from the root: `pnpm lint && pnpm typecheck`)
Expected: clean. If `satisfies readonly PolicySlug[]` upsets the TS version, use `as const` alone and `type PolicySlug = (typeof POLICY_SLUGS)[number]` instead — keep one source of truth.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/business.ts web/src/lib/policies.ts web/src/lib/contact.ts web/tests/business.test.ts web/tests/policies.test.ts web/tests/contact.test.ts
git commit -m "feat(F8): business details, policy documents and the contact message helper"
```

---

### Task 8: The three policy pages

**Files:**
- Create: `web/src/components/site/PageHead.tsx`
- Create: `web/src/components/site/policies/PolicyPage.tsx`
- Create: `web/src/app/(site)/terms/page.tsx`, `web/src/app/(site)/privacy/page.tsx`, `web/src/app/(site)/cancellation-policy/page.tsx`

**Interfaces:**
- Consumes: `POLICIES`, `POLICY_SLUGS`, `formatUpdated` (Task 7); `Container`.
- Produces: `PageHead({ crumb, title, lede? })`, `PolicyPage({ slug })`, `policyMetadata(slug): Metadata` — About and Contact reuse `PageHead`.

- [ ] **Step 1: `PageHead`**

`web/src/components/site/PageHead.tsx`:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = { crumb: string; title: ReactNode; lede?: ReactNode };

/** Breadcrumb + h1 + one-line lede — the `pagehead` block every mockup page starts with. */
export function PageHead({ crumb, title, lede }: Props) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          {crumb}
        </span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="max-w-[24ch] text-[clamp(30px,3.6vw,44px)]">{title}</h1>
        {lede && <p className="mt-1.5 max-w-[60ch] text-base text-mute">{lede}</p>}
      </header>
    </>
  );
}
```

- [ ] **Step 2: `PolicyPage`**

`web/src/components/site/policies/PolicyPage.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUpdated, POLICIES, POLICY_SLUGS, type PolicySlug } from '@/lib/policies';
import { Container } from '../Container';
import { PageHead } from '../PageHead';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export function policyMetadata(slug: PolicySlug): Metadata {
  const doc = POLICIES[slug];
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `${SITE_URL}/${slug}` },
  };
}

/** S10–S12: one layout, a switcher between the three, plain-language blocks. Static. */
export function PolicyPage({ slug }: { slug: PolicySlug }) {
  const doc = POLICIES[slug];
  return (
    <Container className="pb-20">
      <PageHead
        crumb="Policies"
        title={doc.title}
        lede={`${doc.summary} Last updated ${formatUpdated(doc.updated)}.`}
      />
      <nav aria-label="Policies" className="mt-3 flex flex-wrap gap-2">
        {POLICY_SLUGS.map((s) => (
          <Link
            key={s}
            href={`/${s}`}
            aria-current={s === slug ? 'page' : undefined}
            className={`rounded-chip border px-3.5 py-1.5 text-sm font-semibold no-underline transition-colors ${
              s === slug
                ? 'border-primary bg-primary text-white'
                : 'border-line text-ink2 hover:border-ink hover:text-ink'
            }`}
          >
            {POLICIES[s].short}
          </Link>
        ))}
      </nav>
      <article className="mt-8 grid max-w-[68ch] gap-7 leading-relaxed text-ink2">
        {doc.blocks.map((b) => (
          <section key={b.h}>
            <h2 className="mb-2 text-[clamp(20px,2.2vw,24px)] text-ink">{b.h}</h2>
            {b.p?.map((para) => (
              <p key={para} className="mb-3">
                {para}
              </p>
            ))}
            {b.list && (
              <ul className="grid list-disc gap-1.5 pl-5 marker:text-action-ink">
                {b.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p className="border-t border-line pt-5 text-sm text-mute">
          Questions about any of this? <Link href="/contact">Contact us</Link> — a person answers.
        </p>
      </article>
    </Container>
  );
}
```

- [ ] **Step 3: The three routes**

`web/src/app/(site)/terms/page.tsx`:

```tsx
import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('terms');

export default function TermsPage() {
  return <PolicyPage slug="terms" />;
}
```

`web/src/app/(site)/privacy/page.tsx`:

```tsx
import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('privacy');

export default function PrivacyPage() {
  return <PolicyPage slug="privacy" />;
}
```

`web/src/app/(site)/cancellation-policy/page.tsx`:

```tsx
import { PolicyPage, policyMetadata } from '@/components/site/policies/PolicyPage';

export const metadata = policyMetadata('cancellation-policy');

export default function CancellationPolicyPage() {
  return <PolicyPage slug="cancellation-policy" />;
}
```

- [ ] **Step 4: Look**

With `pnpm --filter web dev` running, open `/terms`, `/privacy`, `/cancellation-policy`. Expected: breadcrumb `Home › Policies`, the switcher with the current one filled in primary, the blocks, bullet markers in the marigold `action-ink`, "Last updated 18 September 2026" in the lede; the tab title `Terms of service · Tripsmith`. Check at 375 px wide: no horizontal scroll, chips wrap.

Run (from the root): `pnpm lint && pnpm typecheck`
Expected: clean (the `PolicySlug` type import is `import type`-safe because it is inline `type`).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/site/PageHead.tsx web/src/components/site/policies "web/src/app/(site)/terms" "web/src/app/(site)/privacy" "web/src/app/(site)/cancellation-policy"
git commit -m "feat(F8): terms, privacy and cancellation & refunds pages"
```

---

### Task 9: `/about`

**Files:**
- Create: `web/src/components/site/FramedPhotos.tsx`
- Modify: `web/src/components/site/home/AboutBand.tsx`
- Create: `web/src/components/site/about/Facts.tsx`, `web/src/components/site/about/Team.tsx`
- Create: `web/src/app/(site)/about/page.tsx`
- Create: `web/public/about/beach.jpg`, `web/public/about/lake.jpg` (copies)

**Interfaces:**
- Consumes: `GET /home` → `HomeData.stats` (`destinations`, `packages`); `WhyUs`; `PageHead`; `SectionHead`.
- Produces: `FramedPhotos({ main: { src, alt }, inset: { src, alt }, stamp: { top, big, bottom } })`, `Facts({ items: [string, string][] })`, `Team()`.

- [ ] **Step 1: Copy the two photos**

```bash
cp api/content/photos/andaman/radhanagar-beach.jpg web/public/about/beach.jpg
cp api/content/photos/ladakh/pangong-tso.jpg web/public/about/lake.jpg
```

(`mkdir -p web/public/about` first.) Both are credited in `CREDITS.md`; the footer's credit line covers them.

- [ ] **Step 2: Extract `FramedPhotos` from `AboutBand`**

`web/src/components/site/FramedPhotos.tsx`:

```tsx
import Image from 'next/image';

type Pic = { src: string; alt: string };
type Stamp = { top: string; big: string; bottom: string };

/** The K motif: a tilted framed photo, a smaller inset, a dashed postmark (S1 about band, S8). */
export function FramedPhotos({ main, inset, stamp }: { main: Pic; inset: Pic; stamp: Stamp }) {
  return (
    <div className="relative mx-6 my-8 md:mx-0">
      <div className="relative aspect-[4/3] -rotate-[1.5deg] overflow-hidden rounded-[4px] border-[10px] border-bg shadow-[0_30px_60px_-30px_rgb(20_32_42/0.5)]">
        <Image
          src={main.src}
          alt={main.alt}
          fill
          sizes="(min-width: 768px) 45vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="absolute -right-6 -bottom-8 aspect-square w-[42%] rotate-[4deg] overflow-hidden rounded-[4px] border-8 border-bg shadow-[0_20px_40px_-20px_rgb(20_32_42/0.5)]">
        <Image
          src={inset.src}
          alt={inset.alt}
          fill
          sizes="(min-width: 768px) 20vw, 42vw"
          className="object-cover"
        />
      </div>
      <div
        aria-hidden
        className="absolute -top-5 -left-5 grid size-27 -rotate-[10deg] place-items-center rounded-full border-2 border-dashed border-action-ink bg-bg/90 text-center text-[9px] leading-[1.2] font-bold tracking-[0.14em] text-action-ink uppercase"
      >
        <span>
          {stamp.top}
          <b className="block text-[22px] tracking-tight normal-case">{stamp.big}</b>
          {stamp.bottom}
        </span>
      </div>
    </div>
  );
}
```

In `web/src/components/site/home/AboutBand.tsx`, delete the `import Image from 'next/image';` line and replace the whole first child of the `<section>` (the `<div className="relative mx-6 my-8 md:mx-0">…</div>` block, up to and including its closing tag before `<div>` + `<h2`) with:

```tsx
      <FramedPhotos
        main={{ src: '/home/about-1.jpg', alt: 'Tea gardens under cloud at Munnar' }}
        inset={{ src: '/home/about-2.jpg', alt: 'The Ridge at Shimla' }}
        stamp={{ top: 'Tripsmith', big: '2026', bottom: 'Bengaluru · India' }}
      />
```

and add `import { FramedPhotos } from '../FramedPhotos';` to its imports. The home must render identically.

- [ ] **Step 3: `Facts` and `Team`**

`web/src/components/site/about/Facts.tsx`:

```tsx
/** The four-number strip from S8 (two live from the api, two static). */
export function Facts({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <dl className="mt-5.5 flex flex-wrap gap-6">
      {items.map(([num, label]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-sm font-semibold text-mute">{label}</dt>
          <dd className="num text-[26px] font-extrabold tracking-tight">{num}</dd>
        </div>
      ))}
    </dl>
  );
}
```

Then in `AboutBand.tsx` replace its inline `<dl className="mt-5.5 flex flex-wrap gap-6">…</dl>` with `<Facts items={facts} />` (import from `'../about/Facts'`) and change `const facts = [` to `const facts = [ … ] as const;` — same markup, one component.

`web/src/components/site/about/Team.tsx`:

```tsx
const TEAM = [
  ['Rohan Kulkarni', 'Founder · Goa & Kerala'],
  ['Anita Menon', 'Operations · Himachal & Ladakh'],
  ['Vikram Desai', 'Rajasthan & Andaman'],
  ['Sneha Nair', 'Bookings & your callback'],
] as const;

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('');

/** S8 team row: initials in a primary-soft circle, name, what they run. */
export function Team() {
  return (
    <ul className="grid grid-cols-2 gap-4 text-center lg:grid-cols-4">
      {TEAM.map(([name, role]) => (
        <li key={name}>
          <span
            aria-hidden
            className="mx-auto mb-2.5 grid size-24 place-items-center rounded-full bg-primary-soft text-[26px] font-extrabold text-primary"
          >
            {initials(name)}
          </span>
          <b className="block">{name}</b>
          <small className="text-sm text-mute">{role}</small>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: The page**

`web/src/app/(site)/about/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Facts } from '@/components/site/about/Facts';
import { Team } from '@/components/site/about/Team';
import { Container } from '@/components/site/Container';
import { FramedPhotos } from '@/components/site/FramedPhotos';
import { SectionHead } from '@/components/site/home/SectionHead';
import { WhyUs } from '@/components/site/home/WhyUs';
import { PageHead } from '@/components/site/PageHead';
import { api } from '@/lib/api';
import { BUSINESS } from '@/lib/business';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Like `/`: rendered per request (CI builds with no api); the stats fetch is cached 1 h. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Tripsmith is four people in Bengaluru who plan short Indian holidays the way we would for our own families — hotels we have slept in, departures we run, a phone that gets answered.',
  alternates: { canonical: `${SITE_URL}/about` },
};

export default async function AboutPage() {
  const { stats } = await api('/home', { tags: ['home'], revalidate: 3600 });
  const facts = [
    [String(stats.packages), 'trips we run'],
    [String(stats.destinations), 'destinations we know'],
    ['2 h', 'callback promise'],
    [String(BUSINESS.founded), 'first departure'],
  ] as const;

  return (
    <Container className="pb-20">
      <PageHead
        crumb="About"
        title={`Four people, ${stats.destinations} destinations, ${stats.packages} trips we would book for our own families.`}
      />
      <section className="mt-6 grid items-center gap-11 md:grid-cols-[1fr_1.1fr]">
        <FramedPhotos
          main={{ src: '/about/beach.jpg', alt: 'Radhanagar beach, Havelock' }}
          inset={{ src: '/about/lake.jpg', alt: 'Pangong Tso, Ladakh' }}
          stamp={{ top: 'Tripsmith', big: String(BUSINESS.founded), bottom: 'first departure' }}
        />
        <div className="grid max-w-[58ch] gap-4 leading-relaxed text-ink2">
          <p className="text-lg">
            Tripsmith started in {BUSINESS.founded} with one Goa departure for twelve
            friends-of-friends. We still run trips the same way: small groups, hotels we have
            slept in, a coach or a driver we trust, and a phone that gets answered by the person
            who planned your trip.
          </p>
          <p>
            We don&rsquo;t sell flights, we don&rsquo;t do Europe, and we won&rsquo;t list a date
            we can&rsquo;t run. {stats.destinations} destinations is all we can know properly —
            every hotel on this site is one of us has stayed in, and every departure has real
            seats behind it.
          </p>
          <p>
            Prices are per person and say what they include. If something goes wrong on the road
            — a cancelled ferry, a closed pass — you get us on WhatsApp, not a call centre.
          </p>
          <Facts items={facts} />
        </div>
      </section>
      <section className="mt-18">
        <SectionHead title="The team" sub="Four of us. You will talk to at least two." />
        <Team />
      </section>
      <section className="mt-18">
        <SectionHead
          title="How we work"
          sub="The four things every trip on this site is built on."
        />
        <WhyUs />
      </section>
      <p className="mt-12 text-mute">
        Want to talk it through? <Link href="/contact">Contact us</Link> — {BUSINESS.hours}.
      </p>
    </Container>
  );
}
```

- [ ] **Step 5: Look and verify nothing on the home changed**

Open `/about` and `/`. Expected: `/about` shows the framed beach photo with the Pangong inset and a "Tripsmith · 2019 · first departure" postmark, the story, four facts with `12` and `6`, the team row (2 columns on phones, 4 on desktop), the why-us cards, a contact line. The home about band is pixel-identical to before (same markup, moved). `pnpm test` still 63; `pnpm lint && pnpm typecheck` clean.

- [ ] **Step 6: Commit**

```bash
git add web/public/about web/src/components/site/FramedPhotos.tsx web/src/components/site/about web/src/components/site/home/AboutBand.tsx "web/src/app/(site)/about"
git commit -m "feat(F8): /about — story, live facts, team; FramedPhotos shared with the home band"
```

---

### Task 10: `/contact`

**Files:**
- Create: `web/src/components/site/contact/ContactInfo.tsx`, `web/src/components/site/contact/MapEmbed.tsx`, `web/src/components/site/contact/ContactForm.tsx`
- Create: `web/src/app/(site)/contact/page.tsx`

**Interfaces:**
- Consumes: `BUSINESS`, `whatsappHref`, `contactMessage`, `PageHead`, home `icons` (`Phone`, `WhatsApp`; check `components/site/home/icons.tsx` for `Mail`, `Pin`, `Clock` — add any that are missing as 24 px stroke icons in the same style).
- Produces: the page.

- [ ] **Step 1: Icons**

Open `web/src/components/site/home/icons.tsx`. If `Mail`, `Pin` and `Clock` are not exported, append (same `IconProps`/style as the existing ones — copy `Phone`'s signature):

```tsx
export function Mail(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function Clock(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
```

(`Pin` already exists — the testimonials use it.)

- [ ] **Step 2: `ContactInfo`**

`web/src/components/site/contact/ContactInfo.tsx`:

```tsx
import type { ReactNode } from 'react';
import { BUSINESS, whatsappHref } from '@/lib/business';
import { Clock, Mail, Phone, Pin, WhatsApp } from '../home/icons';

type Row = { icon: (p: { className?: string }) => ReactNode; main: ReactNode; sub?: ReactNode };

/** S9 info list: phone, WhatsApp, email, address, hours — every fact from `BUSINESS`. */
export function ContactInfo() {
  const rows: Row[] = [
    {
      icon: Phone,
      main: (
        <a href={BUSINESS.phoneHref} className="num font-bold no-underline hover:underline">
          {BUSINESS.phoneDisplay}
        </a>
      ),
      sub: 'Rohan, Anita or Sneha — no call centre',
    },
    {
      icon: WhatsApp,
      main: (
        <a
          href={whatsappHref('Hi Tripsmith, I want to plan a trip')}
          className="font-bold no-underline hover:underline"
        >
          WhatsApp
        </a>
      ),
      sub: 'Send us a trip link and your dates',
    },
    {
      icon: Mail,
      main: (
        <a href={`mailto:${BUSINESS.email}`} className="font-bold no-underline hover:underline">
          {BUSINESS.email}
        </a>
      ),
    },
    {
      icon: Pin,
      main: (
        <a
          href={BUSINESS.mapsHref}
          target="_blank"
          rel="noreferrer"
          className="font-bold no-underline hover:underline"
        >
          {BUSINESS.address}, {BUSINESS.city}
        </a>
      ),
      sub: BUSINESS.addressLine2,
    },
    { icon: Clock, main: <b>{BUSINESS.hours}</b>, sub: BUSINESS.afterHours },
  ];
  return (
    <ul className="grid gap-4">
      {rows.map(({ icon: Icon, main, sub }, i) => (
        <li key={i} className="flex items-start gap-3.5">
          <Icon className="mt-0.5 size-6 shrink-0 text-action-ink" />
          <div className="leading-snug">
            {main}
            {sub && <span className="block text-sm text-mute">{sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `MapEmbed`**

`web/src/components/site/contact/MapEmbed.tsx`:

```tsx
import { BUSINESS } from '@/lib/business';

/** Keyless Google Maps embed (S9), lazy so it costs nothing until scrolled to. */
export function MapEmbed() {
  return (
    <div className="mt-6 overflow-hidden rounded-card border border-line bg-bg2">
      <iframe
        title={`Map: ${BUSINESS.address}, ${BUSINESS.city}`}
        src={BUSINESS.mapEmbedSrc}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-[300px] w-full"
      />
    </div>
  );
}
```

- [ ] **Step 4: `ContactForm` (client)**

`web/src/components/site/contact/ContactForm.tsx`:

```tsx
'use client';

import type { FormEvent } from 'react';
import { whatsappHref } from '@/lib/business';
import { contactMessage } from '@/lib/contact';
import { WhatsApp } from '../home/icons';

const field =
  'w-full rounded-btn border-[1.5px] border-line bg-bg px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-mute/70 focus:border-primary';

/**
 * "Send a message" (S9). Until the enquiry flow exists this composes the fields into one
 * WhatsApp message and opens it — a real path to a person today, replaced by the api-backed
 * form later. Without JS the button still opens a blank WhatsApp chat.
 */
export function ContactForm() {
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = contactMessage({
      name: String(data.get('name') ?? ''),
      mobile: String(data.get('mobile') ?? ''),
      email: String(data.get('email') ?? ''),
      message: String(data.get('message') ?? ''),
    });
    window.location.assign(whatsappHref(text));
  }

  return (
    <form
      onSubmit={onSubmit}
      action={whatsappHref('Hi Tripsmith, I want to plan a trip')}
      method="get"
      className="grid gap-4 rounded-card border border-line p-6"
    >
      <h2 className="text-xl">Send a message</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          Your name
          <input name="name" className={field} placeholder="Name" autoComplete="name" required />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Mobile
          <input
            name="mobile"
            className={`num ${field}`}
            placeholder="10-digit mobile"
            inputMode="tel"
            autoComplete="tel"
            pattern="[0-9+ ]{10,15}"
          />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          className={field}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        What are you looking for?
        <textarea
          name="message"
          rows={5}
          className={field}
          placeholder="Where, when, how many of you, rough budget…"
          required
        />
      </label>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-btn bg-wa px-5 py-3 font-bold text-white shadow-[0_8px_20px_-10px_rgb(37_211_102/0.7)] transition-[filter] hover:brightness-105"
      >
        <WhatsApp className="size-5" />
        Send on WhatsApp
      </button>
      <p className="text-[13px] text-mute">
        Opens WhatsApp with your message filled in — nothing is stored on this site. We reply
        within two hours in office hours.
      </p>
    </form>
  );
}
```

- [ ] **Step 5: The page**

`web/src/app/(site)/contact/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { ContactForm } from '@/components/site/contact/ContactForm';
import { ContactInfo } from '@/components/site/contact/ContactInfo';
import { MapEmbed } from '@/components/site/contact/MapEmbed';
import { PageHead } from '@/components/site/PageHead';
import { BUSINESS } from '@/lib/business';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Call ${BUSINESS.phoneDisplay}, WhatsApp, or send a message — a person replies within two hours, ${BUSINESS.hours}. ${BUSINESS.address}, ${BUSINESS.city}.`,
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default function ContactPage() {
  return (
    <Container className="pb-20">
      <PageHead
        crumb="Contact"
        title="Talk to a person."
        lede={`Call, WhatsApp, or send a message — we reply within two hours, ${BUSINESS.hours}.`}
      />
      <div className="mt-5 grid items-start gap-8 md:grid-cols-2">
        <div>
          <ContactInfo />
          <MapEmbed />
        </div>
        <ContactForm />
      </div>
    </Container>
  );
}
```

- [ ] **Step 6: Look**

Open `/contact`. Expected: two columns on desktop (info + map left, form right), stacked on phones; the map loads; filling the form and pressing "Send on WhatsApp" navigates to `https://wa.me/919845012345?text=Hi%20Tripsmith%2C%20this%20is%20…` (check the URL in the address bar or devtools — WhatsApp itself may not be installed). The required attributes block an empty submit. `pnpm lint && pnpm typecheck` clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/site/contact web/src/components/site/home/icons.tsx "web/src/app/(site)/contact"
git commit -m "feat(F8): /contact — details, map, a form that opens WhatsApp"
```

---

### Task 11: Header links, the price-box cancellation line, docs, verification, production seed, PR, merge, tracker

**Files:**
- Modify: `web/src/components/site/SiteHeader.tsx`
- Modify: `web/src/components/site/package/PriceBox.tsx`
- Modify: `docs/07-plan.md:52-53`

- [ ] **Step 1: Header**

In `web/src/components/site/SiteHeader.tsx` replace the `<nav>…</nav>` block with:

```tsx
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold text-mute">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
              {label}
            </Link>
          ))}
          <a
            href={BUSINESS.phoneHref}
            className="num ml-2 hidden items-center gap-1.5 rounded-chip border border-line px-3 py-1.5 text-ink no-underline hover:border-ink md:inline-flex"
          >
            <Phone className="size-4 text-action-ink" />
            {BUSINESS.phoneDisplay}
          </a>
        </nav>
```

with, above the component:

```tsx
import { BUSINESS } from '@/lib/business';
import { Phone } from './home/icons';

const NAV = [
  ['/destinations', 'Destinations'],
  ['/packages', 'Trips'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
] as const;
```

and update the docstring to `/** Public header: the four site sections and the phone number (S1). Home is the logo. */`. On a 375 px phone the four links must still fit on one row (they do at 14 px; if not, drop the `px-3` to `px-2.5` below `sm`).

- [ ] **Step 2: Price box**

In `web/src/components/site/package/PriceBox.tsx` replace the final `<p …>Enquiries open soon…</p>` with:

```tsx
      <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-mute">
        Enquiries open soon — a person calls you back within 2 hours, 10 am – 8 pm IST. Nothing to
        pay online.
      </p>
      <p className="text-[13px] leading-relaxed text-mute">
        {CANCELLATION_SCHEDULE[0].window}: {CANCELLATION_SCHEDULE[0].refund}. One free date change.{' '}
        <Link href="/cancellation-policy">Cancellation &amp; refunds</Link>
      </p>
```

adding `import Link from 'next/link';` and `import { CANCELLATION_SCHEDULE } from '@/lib/policies';`. The refund string starts lowercase ("full refund, minus…") — capitalise in place: `{cap(CANCELLATION_SCHEDULE[0].refund)}` with `const cap = (s: string) => s[0].toUpperCase() + s.slice(1);` at the top of the file. Result reads: *30 days or more before departure: Full refund, minus any non-refundable flight or train tickets we bought for you. One free date change. Cancellation & refunds*.

- [ ] **Step 3: Mark the plan rows**

In `docs/07-plan.md` line 52 change `**Content → 12 packages**` to `**Content → 12 packages** ✅ PR #26` and line 53 `**Trust pages**` to `**Trust pages** ✅ PR #26` — use the real PR number once `gh pr create` prints it (amend this commit if it differs).

```bash
git add web/src/components/site/SiteHeader.tsx web/src/components/site/package/PriceBox.tsx docs/07-plan.md
git commit -m "feat(F8): header links to About/Contact, cancellation line on the price box; mark F7+F8"
```

- [ ] **Step 4: Everything green from the root**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm gen:api && git diff --exit-code api/openapi.json web/src/lib/api-types.ts`
Expected: lint/typecheck clean; pytest **120 passed**; vitest **63 passed**; no contract diff.

Stop `next dev` first, then: `pnpm --filter web build`
Expected: builds; `/about`, `/contact`, `/terms`, `/privacy`, `/cancellation-policy` appear in the route list (`ƒ` for about — dynamic — and `○` static for the other four); package pages for all 12 slugs prerender when the local api is up.

Click through once more on the dev server: header has About and Contact; every footer link resolves (no 404 on the site any more); a package page's price box shows the cancellation line with a working link.

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/f7-f8-content
gh pr create --title "feat(F7+F8): twelve packages across six destinations; About, Contact and policy pages" --body "$(cat <<'BODY'
## Summary
- **Content (F7):** Rajasthan, Andaman and Ladakh destinations; six new packages — Jaipur · Jodhpur · Udaipur, Jaisalmer Desert Nights, Port Blair · Havelock · Neil, Havelock Honeymoon, Leh · Nubra · Pangong, Leh & Turtuk — full day-by-day itineraries, real hotels, 23 departures (Nov 2026 – Sep 2027), three more testimonials (six total), 42 Wikimedia Commons CC photos through `scripts/fetch_photo.py` (credits in `CREDITS.md`). Catalog: 6 destinations · 12 packages · 45 departures. `tests/test_content.py` locks the six new from-prices and the 12/6/6 floors.
- **Trust pages (F8):** `/about` (story, live facts, team, how we work — the framed-photo motif moved into `FramedPhotos`, shared with the home band), `/contact` (details, keyless Google Maps embed, a form that opens WhatsApp with the message prefilled until the enquiry form lands), `/terms`, `/privacy`, `/cancellation-policy` (data in `lib/policies.ts`, one `PolicyPage`). Header gains About/Contact + phone; the package price box quotes the cancellation schedule.
- Every footer link now resolves. No api contract change.

## Test plan
- [ ] `pnpm lint && pnpm typecheck && pnpm test` — pytest 120, vitest 63
- [ ] `pnpm gen:api` → no diff
- [ ] Local seed: 6 · 12 · 45; home shows 6 tiles + 6 cards; `/packages` lists 12
- [ ] Production seeded before merge; prod `/about`, `/contact`, `/terms`, `/privacy`, `/cancellation-policy`, `/destinations/ladakh`, `/packages/leh-nubra-pangong` verified after deploy

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 6: Review, then seed production, then merge**

From this worktree's cwd run `/code-review <pr> high`; fix anything real, push. Then seed production (the Blob token and Neon production URL are in `api/.env.local`):

```bash
cd api && uv run python scripts/seed.py && cd ..
```

Expected: `destinations 6 · packages 12 · departures 45`, ~76 Blob uploads (`packages/<slug>/<file>`); re-running is idempotent. Verify on the live api: `curl -s https://tripsmith-api.vercel.app/destinations | jq '.items | length'` → 6, and `/packages/leh-turtuk` → 200.

Merge: `gh pr merge <pr> --squash --delete-branch` (the "main is already used by worktree" message is harmless). Wait for both Vercel deploys, then verify production: `/`, `/about`, `/contact`, `/cancellation-policy`, `/destinations/andaman`, `/packages/havelock-honeymoon`. Static package pages for the six new slugs are prerendered at build time from the already-seeded api, so no redeploy should be needed; if any 404s, `vercel redeploy` the web deployment ([[vercel-web-api-deploy-race]]).

- [ ] **Step 7: Tracker + memory**

Update the Tripsmith tracker rows `F7` and `F8` to `done` with the PR number (artifact db `rows/F7`, `rows/F8`), and update the `tripsmith-status` memory: F7+F8 done, main sha, next = **F9 Enquiry form** (milestone 1.2 Enquire). Kill the dev servers by port and remove the throwaway cluster when done.

---

## Summary

- **F7:** 3 destinations, 6 packages, 3 testimonials, 42 photos, rules test extended. Catalog: 6 · 12 · 45 · 6.
- **F8:** `/about`, `/contact`, `/terms`, `/privacy`, `/cancellation-policy` with real copy; header + price box links; `FramedPhotos` and `PageHead` shared.
- **Tests:** pytest 118 → 120, vitest 56 → 63. No contract change.

## Test plan

| Task | Automated | Manual |
|---|---|---|
| 1 | `test_content.py` — six new from-prices, floors 12/6/6, unique positions, one testimonial per trip | — |
| 2 | credits ↔ files | contact-sheet check of the fetched photos |
| 3–5 | content imports (pydantic), rules test | package pages render locally |
| 6 | full pytest 120 | local seed 6 · 12 · 45; home 6 + 6 |
| 7 | business/policies/contact vitest | — |
| 8 | lint/typecheck | three pages, switcher, phone width |
| 9 | home band unchanged (visual) | `/about` |
| 10 | — | `/contact` form → wa.me URL |
| 11 | root lint/typecheck/test/gen:api; `next build` | prod verification after merge |
