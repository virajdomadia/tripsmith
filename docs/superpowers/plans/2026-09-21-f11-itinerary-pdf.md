# F11 Itinerary PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every live package has a server-rendered A4 itinerary PDF — downloadable from the package page (`GET /packages/:slug/itinerary.pdf`, cached in Vercel Blob per `updated_at`), attached to the visitor's enquiry confirmation email, and garbage-collected weekly by `GET /cron/pdf-gc`.

**Architecture:** api: `services/pdf/` — `document.py` (a `Document(FPDF)` base: DM Sans, brand palette, header/footer, text helpers; the v2 voucher reuses it), `itinerary.py` (`render_itinerary(PackageDetail, cover=…) -> bytes`, pure and synchronous, plus the Blob pathname scheme), `service.py` (`PdfService` on `app.state.pdf`: fetches the cover, renders in a thread, finds/puts the cached object in Blob, builds the email attachment, runs the GC — every Blob/network failure degrades, never fails a request). `infra/storage.py` `BlobStore` gains `list` and `delete`. New router `routers/site/pdf.py` (302 to the cached Blob URL; streams the bytes when no store is configured or Blob is down) and `routers/cron/pdf_gc.py` (bearer `CRON_SECRET`, scheduled in `api/vercel.json`). `submit_enquiry` builds the attachment after the commit and hands it to `send_enquiry_emails`, which attaches it to the visitor message only. web: one `ItineraryPdfLink` component (plain `<a>` through the `/api` rewrite) on the price box, the "Day by day" section header, the enquiry summary and the thanks page.

**Tech Stack:** FastAPI + pydantic v2 + SQLAlchemy async; **new runtime dep `fpdf2`** (pure Python; Pillow already present), **new dev dep `pypdf`** (text extraction in tests); DM Sans static TTFs (OFL) in `api/assets/fonts`; Vercel Blob REST (list / put / delete) over the httpx client already used; Next.js 16 app router + vitest. `pnpm gen:api` regenerates the contract (one new public GET path).

**Spec:** `docs/07-plan.md` row F11; `docs/03-requirements.md` R6; `docs/04-technical-design.md` §5 PDF (+ §6 Email, §12 env); `docs/05-architecture.md` (tree: `routers/site/pdf.py`, `routers/cron/pdf_gc.py`, `services/pdf/`, `assets/fonts/`); `docs/06-data-and-api.md` route table (`GET /packages/:slug/itinerary.pdf` public, `GET /cron/pdf-gc` CRON_SECRET; "PDF; two emails" in `submitEnquiry`).

## Global Constraints

- Work in `.worktrees/f11-itinerary-pdf` on branch `feat/f11-itinerary-pdf` (created from `origin/main` = `4061fff`); one PR, squash-merged; never touch the main checkout; never bare `git stash`; never run `next build` while `next dev` shares `.next/`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (root) green; `pnpm gen:api` output committed (freshness tests both sides). Python: ruff line 100, rules E/F/I/B/UP; pyright basic.
- Tests seed `tests/fixture_content` (2 Goa packages: `north-goa-beaches` "North Goa Beaches" 3 nights / 4 days, cover `agonda-sunset.jpg`; `goa-quiet-escape`) — never edit the fixture. Db tests use the `db` / `db_client` / `db_app` fixtures; unit tests need no database. **Tests never touch the network**: Blob through `httpx.MockTransport` or `FakeBlobStore`; the cover fetch through `PdfService(transport=…)`; routes through a `FakeSender`.
- R6 acceptance, asserted by tests: valid PDF (`%PDF-` header, pypdf opens it), A4, **< 2 MB**, **< 3 s** to render on the test machine, content matches the page (name, summary, every day title, every hotel, inclusions/exclusions, departures with prices, occupancy prices, contact block).
- Unicode only through the registered DM Sans TTFs (₹ U+20B9, en dash, `·`, `•`, `›` are all in the font; **never** `Helvetica`/core fonts — they are Latin-1 and would drop ₹). DM Sans has no ✓ ✕ ★: the site's `Check` / `Cross` icons and the hotel stars are **drawn** (`Document.check/cross/star`), and the `BrandMark` is drawn from its SVG path — never an emoji, never a glyph the font lacks.
- Palette = the web tokens: ink `#14202a`, ink2 `#3b4148`, mute `#5e6b76`, line `#e3e8ec`, bg2 `#f3f6fc`, primary `#1b4fd8`, primary-soft `#e8eeff`, action `#f2a93b`, ok `#1f7a4d` / ok-soft `#e3f0ea`, warn `#b5541e` / warn-soft `#fff1dd`, wa `#25d366`. Radii scaled from the site: card 18 px → 2.6 mm, panel 14 px → 2.0 mm, button 12 px → 1.7 mm, chips fully round. The PDF's components are the web's components (`web/src/components/site/package/*`, `PriceBox`, `BrandMark`) — when in doubt, open the .tsx and copy what it does. Money = `inr()` Indian grouping in whole rupees (paise // 100). Dates = `Fri 18 Dec 2026` (web `formatDate`). Copy: short, concrete, Indian English; business facts from `app/business.py`.
- Blob objects are public (marketing material, 06 §Storage). Pathname `pdf/{slug}/{updated_at_epoch}/Tripsmith-{slug}-itinerary.pdf` (the basename is the download filename; the prefix `pdf/{slug}/` scopes lookups, `pdf/` scopes the GC). **Amends 04 §5's `pdf/{slug}-{epoch}.pdf`** — Task 10 updates the doc.
- Nothing the PDF or Blob does may turn a saved enquiry into a non-201, or a package download into a 5xx: the route falls back to streaming the bytes; the email goes out without the attachment; failures log + Sentry.
- Secrets never logged; the Blob token travels only in the `Authorization` header. No new env vars (`BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `SITE_URL`, `WHATSAPP_NUMBER` exist).

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| Renderer | fpdf2 2.8.x, A4 portrait, mm units, margins 18 mm, auto page break 22 mm. DM Sans in the site's four weights — 400 / 600 (`font-semibold`) / 700 (`font-bold`) / 800 (headings, `font-extrabold`) — each registered as its own fpdf2 family (`DMSans`, `DMSansSB`, `DMSansB`, `DMSansXB`; fpdf2 styles are only B/I). Headings carry the site's `letter-spacing: -0.03em`. Prototyped 2026-09-21 on the real north-goa-beaches content with its five photos: 4 pages, 334 KB, 0.25 s. |
| Photos | `PackageDetail.cover.url` + up to four more `images[1:5]` fetched concurrently with httpx (5 s timeout, ≤ 6 MB, `image/*` only). `prepare_cover` bakes the `PackageHero` treatment with Pillow: centre-crop to 21:9 (1400×600), the bottom gradient `rgb(10 20 30 / 0.7)`, rounded-card corners flattened onto the page white, JPEG q82. `prepare_gallery_image` crops each gallery photo to the strip's cell (700×296). Any fetch failure → that photo is simply absent (no cover → a bg2 panel with ink text). The renderer itself never does I/O: it takes `cover: bytes \| None` and `gallery: Sequence[bytes]`. |
| Page plan | **The package page, section for section, with the same components** (Viraj, 2026-09-21: "same as our UI"). **p1:** the site header's `BrandMark` + wordmark (drawn as vectors, clickable) and the breadcrumb `Home › Goa › North Goa Beaches`; the `PackageHero` — rounded-card 21:9 photo, dark bottom gradient, white 800 title, `3N / 4D   Ex-Mumbai   Beach · Family`; the `QuickFacts` strip (one bordered bg2 panel, five cells split by hairlines: Duration · From · Departs · Stay · Next date, label-caps over 800 values that shrink to fit); the summary; `Highlights` as a two-column list with the green `Check` mark; the `Gallery` strip (one tall cell + up to four small, `rounded-[10px]`, drawn only when the page has room); and the `PriceBox` **pinned above the footer** — From / ₹price 800 / "per person, double sharing", the bordered Next-departure box with seats, the marigold **Enquire about this trip** button, the WhatsApp-green **Chat on WhatsApp** button, `Call +91 …` (all real links), then the callback promise, hours and the legal line. **p2+:** `Itinerary` (primary route line, 800-weight numbered badges, title, ragged-right body, bg2 pill chips `Breakfast · Dinner` / `Stay · …`, hairline between days); `Inclusions` (Included / Not included side by side, `Check` in ok-green, `Cross` in mute); `Hotels` (one bordered card each: name, five drawn marigold stars, `city · n nights`); `DeparturesTable` (bordered `rounded-[14px]` table, bg2 label-caps header, date bold, price, seat bar in primary — warn when ≤ 4 — with `n left`, status pill in the site's tones) + `OccupancyPricing` (2×2 bordered boxes) + the "prices vary" note; `Faq` as hairline rows (question bold, answer open). Header from p2 (mark + wordmark left, `Itinerary · {name}` right, rule); footer on every page (rule, contact line, `Page x of {nb}`). Every heading is kept with the block that follows it (`h2(keep=…)`). |
| Cache key | `pdf_pathname(slug, updated_at)` = `pdf/{slug}/{int(updated_at.timestamp())}/Tripsmith-{slug}-itinerary.pdf`. `updated_at` has `onupdate=func.now()` (models/base.py) so any F18 save invalidates. Lookup = Blob `list(prefix="pdf/{slug}/")` and exact pathname match (the public host of the store is not derivable without a first put, and list is needed for GC anyway). |
| Route responses | Cached → `302` Location = Blob URL, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (`PUBLIC_CACHE_CONTROL`, same staleness as the JSON routes after an edit). Not cached → render → put → `302`. No store (dev/CI) or Blob failed → `200 application/pdf`, `Content-Disposition: inline; filename="Tripsmith-{slug}-itinerary.pdf"`. Draft/unknown slug → `404 not_found` envelope. Blob objects are served inline by Vercel (`?download=1` would force attachment — not used). |
| Blob REST | `GET https://blob.vercel-storage.com/?prefix=…&limit=1000[&cursor=…]` → `{blobs:[{url,downloadUrl,pathname,size,uploadedAt}],cursor,hasMore}`; `POST https://blob.vercel-storage.com/delete` JSON `{"urls":[…]}`; both with `Authorization: Bearer <token>`, `x-api-version: 7`. (What `@vercel/blob` does under the hood; verified on prod in Task 10 — if a call 4xx's, the SDK source at github.com/vercel/storage/tree/main/packages/blob/src is the reference.) The app's `BlobStore` uses a 10 s timeout (the seed keeps 60 s). |
| Email | `send_enquiry_emails(..., attachment=EmailAttachment \| None)` attaches to the **visitor** message only (the owner gets a link). Visitor templates gain one sentence + `pdf_url` = `{SITE_URL}/api/packages/{slug}/itinerary.pdf` (first-party through the web rewrite, works after the cache key rotates). `submit_enquiry` builds the attachment **after** the commit, only when a package is attached, via `PdfService.attachment_for(db, slug)` (fully guarded → `None`); this also warms the Blob cache so the emailed link 302s instantly. Honeypot / dedupe paths never render. |
| Cron | `GET /cron/pdf-gc`, `Authorization: Bearer {CRON_SECRET}` (Vercel sends it automatically when the env var exists), `include_in_schema=False` (not part of the web contract). Lists `pdf/`, deletes every pathname not in `{pdf_pathname(p.slug, p.updated_at) for every package, any status}`, in batches of 100. Returns `{deleted, kept, configured}`. Schedule `0 3 * * 0` (Sunday 03:00 UTC) in `api/vercel.json`. Unconfigured secret → 401. No store → `configured: false`, nothing deleted. |
| Web link | `itineraryPdfHref(slug)` = `/api/packages/{slug}/itinerary.pdf` (web rewrite → api; the 302 is passed through to the browser — verified in Task 9; if `next dev` were to follow the redirect server-side the fallback is `${API_URL}/packages/…` from the server component). `target="_blank" rel="noopener"`. One `ItineraryPdfLink` component, `variant: 'button' \| 'link'`. |
| Test seams | `app.state.pdf: PdfService`; `conftest.app` installs `PdfService(store=None, settings, transport=MockTransport(404))` so no test can reach the network. `FakeBlobStore` (in-memory `put/list/delete`) lives in `tests/test_pdf_service.py` and is imported by the route/enquiry/cron tests, like `FakeSender`. |

---

## Local environment (do once, before Task 1)

Copy the env files from the main checkout (they are gitignored): `cp "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/api/.env.local" api/.env.local` and the same for `web/.env.local`. **`api/.env.local` `DATABASE_URL` is Neon production** — always pass `--database-url` / `DATABASE_URL=` for local work. Ports 3000/8000 may be Viraj's other projects — check `Get-CimInstance Win32_Process` CommandLine before killing anything; this row uses **api 8004, web 3003**.

Throwaway Postgres (from earlier rows) may be in an older session's scratchpad; if it is gone, create one in this session's scratchpad (own background call — `pg_ctl` hangs the bash tool otherwise):

```bash
PG="/c/Program Files/PostgreSQL/18/bin"
"$PG/initdb" -U tripsmith -A trust -E UTF8 -D "$SCRATCHPAD/pg"     # once
"$PG/pg_ctl" -D "$SCRATCHPAD/pg" -o "-p 5499" -l "$SCRATCHPAD/pg/log" start
"$PG/createdb" -p 5499 -U tripsmith tripsmith_test
```

```bash
cd "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/.worktrees/f11-itinerary-pdf"
export TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_test
pnpm install --frozen-lockfile
uv run --directory api pytest -q -p no:cacheprovider   # baseline: 193 passed
pnpm --filter web test                                 # baseline: 89 passed
```

The fonts are already downloaded into `api/assets/fonts/` (untracked): `DMSans-Regular.ttf`, `DMSans-SemiBold.ttf`, `DMSans-Bold.ttf`, `DMSans-ExtraBold.ttf` — 48 KB static instances from Google Fonts (`fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800`, fetched with a non-woff2 User-Agent such as `Mozilla/4.0`; no `fvar` table; cmap has U+20B9 ₹, U+2013, U+00B7, U+2022, U+203A — and no ★ ✓ ✕). If missing, re-fetch the same way. Licence: SIL OFL 1.1 — Task 2 adds `assets/fonts/OFL.txt`.

Commit this plan first:

```bash
git add docs/superpowers/plans/2026-09-21-f11-itinerary-pdf.md
git commit -m "docs(F11): implementation plan for the itinerary PDF"
```

---

### Task 1: Shared text formatting (`services/format.py`)

The PDF prints the same money, dates, durations and meal labels as the web (`web/src/lib/format.ts`); `inr` already exists in the email renderer. Move it to a shared module and add the three others so the PDF and the emails cannot drift.

**Files:**
- Create: `api/app/services/format.py`
- Modify: `api/app/services/email/render.py` (import `inr` from the new module; keep the name re-exported)
- Test: `api/tests/test_format.py`
- Modify: `api/tests/test_email_render.py` (unchanged imports still work — verify only)

**Interfaces:**
- Produces: `inr(rupees: int) -> str`, `long_date(d: dt.date) -> str` (`Fri 18 Dec 2026`), `duration(nights: int, days: int) -> str` (`3N / 4D` — exactly the web's `duration`, which the hero, cards and quick facts print), `meals_label(breakfast: bool, lunch: bool, dinner: bool) -> str` (`Breakfast · Dinner`, `No meals`), `seats_label(seats_left: int) -> str` (`6 seats`, `1 seat`, `Sold out`).

- [ ] **Step 1: Write the failing tests**

```python
# api/tests/test_format.py
"""services/format.py — the numbers and dates the PDF and the emails print (mirror of
web/src/lib/format.ts)."""

import datetime as dt

from app.services.format import duration, inr, long_date, meals_label, seats_label


def test_inr_uses_indian_grouping() -> None:
    assert inr(0) == "₹0"
    assert inr(999) == "₹999"
    assert inr(18499) == "₹18,499"
    assert inr(1234567) == "₹12,34,567"
    assert inr(-2500) == "-₹2,500"


def test_long_date_matches_the_web() -> None:
    assert long_date(dt.date(2026, 12, 18)) == "Fri 18 Dec 2026"
    assert long_date(dt.date(2027, 1, 3)) == "Sun 3 Jan 2027"


def test_duration_matches_the_web() -> None:
    assert duration(3, 4) == "3N / 4D"
    assert duration(1, 2) == "1N / 2D"


def test_meals_label() -> None:
    assert meals_label(True, False, True) == "Breakfast · Dinner"
    assert meals_label(True, True, True) == "Breakfast · Lunch · Dinner"
    assert meals_label(False, False, False) == "No meals"


def test_seats_label() -> None:
    assert seats_label(6) == "6 seats"
    assert seats_label(1) == "1 seat"
    assert seats_label(0) == "Sold out"
    assert seats_label(-2) == "Sold out"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_format.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.format'`

- [ ] **Step 3: Create the module and point the email renderer at it**

```python
# api/app/services/format.py
"""Money, dates and labels as the PDF and the emails print them — a mirror of
web/src/lib/format.ts (change both)."""

import datetime as dt

WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def inr(rupees: int) -> str:
    """Indian grouping: ₹12,34,567."""
    s = str(abs(rupees))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = [head[max(i - 2, 0) : i] for i in range(len(head), 0, -2)][::-1]
        s = ",".join(groups) + "," + tail
    return ("-" if rupees < 0 else "") + "₹" + s


def long_date(d: dt.date) -> str:
    """`Fri 18 Dec 2026` — no zero padding, like the web's `formatDate`."""
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


def duration(nights: int, days: int) -> str:
    return f"{nights}N / {days}D"  # the web's `duration` — short form, everywhere on the site


def meals_label(breakfast: bool, lunch: bool, dinner: bool) -> str:
    names = [n for n, on in (("Breakfast", breakfast), ("Lunch", lunch), ("Dinner", dinner)) if on]
    return " · ".join(names) if names else "No meals"


def seats_label(seats_left: int) -> str:
    if seats_left <= 0:
        return "Sold out"
    return f"{seats_left} seat{'s' if seats_left != 1 else ''}"
```

In `api/app/services/email/render.py`: delete the `inr` function body and its docstring, and add to the imports:

```python
from app.services.format import inr  # noqa: F401 — re-exported; tests import it from here
```

(Keep `inr` referenced where `context_from` uses it — nothing else changes.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_format.py tests/test_email_render.py -q && uv run --directory api ruff check . && uv run --directory api pyright`
Expected: all PASS, ruff clean, pyright 0 errors.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/format.py api/app/services/email/render.py api/tests/test_format.py
git commit -m "feat(F11): shared money/date/label formatting for the PDF and emails"
```

---

### Task 2: `Document` base — fonts, palette, page chrome

**Files:**
- Create: `api/app/services/pdf/__init__.py` (empty docstring module)
- Create: `api/app/services/pdf/document.py`
- Create: `api/assets/fonts/OFL.txt` (the SIL OFL 1.1 text — copy from https://openfontlicense.org/open-font-license-official-text/ with the copyright line `Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)`); the four TTFs (Regular / SemiBold / Bold / ExtraBold, see Local environment) are committed in this task
- Modify: `api/pyproject.toml` (`fpdf2>=2.8.8` runtime; `pypdf` dev)
- Test: `api/tests/test_pdf_document.py`

**Interfaces:**
- Produces: `Document(title: str, running_title: str)` — an `FPDF` subclass with `add_page()` chrome (header from page 2 = drawn `BrandMark` + wordmark + `Itinerary · {running_title}`; footer = contact line + `Page x of {nb}`), and the helpers Task 3 builds the sections from: type `font(size, weight=""|"SB"|"B"|"XB", color=INK)`, `heading(text, size, color=INK, *, h=None)` (800, −0.03 em), `h2(text, *, keep=30)` (section title kept with `keep` mm of what follows), `label(text, *, w=0, new_line=True)` (`.label-caps`), `para(text, *, size=10.5, color=INK2, w=0, line=5.6)`, `lines_of(text, w, size=10.5) -> int`; marks `check(x, y, color=OK, s=3.2)`, `cross(x, y, color=MUTE, s=3.2)`, `star(cx, cy, r, *, filled)`, `pill(x, y, text, *, fill, color, size=7.5) -> width`, `button(x, y, w, text, *, fill, color, link)`, `brand_mark(x, y, size)`, `wordmark(x, y, *, size=7.0, link="") -> width`; surfaces `card(x, y, w, h, *, fill=WHITE, stroke=LINE, r=R_CARD)`, `hairline(y, x1=MARGIN, x2=None)`, `ensure(height_mm)`, `gap(mm)`. Constants: `INK, INK2, MUTE, LINE, BG2, PRIMARY, PRIMARY_SOFT, ACTION, OK, OK_SOFT, WARN, WARN_SOFT, WA, WHITE`, `R_CARD, R_PANEL, R_BTN`, `MARGIN = 18`, `PT`, `WEIGHTS`, `FONTS_DIR`.

- [ ] **Step 1: Add the dependencies**

Run: `uv add --directory api "fpdf2>=2.8.8" && uv add --directory api --group dev pypdf`
Expected: `uv.lock` and `pyproject.toml` updated (`fpdf2` under `dependencies`, `pypdf` under `[dependency-groups].dev`). `uv run --directory api python -c "import fpdf, pypdf; print(fpdf.__version__)"` prints `2.8.8` or newer.

- [ ] **Step 2: Write the failing tests**

```python
# api/tests/test_pdf_document.py
"""services/pdf/document.py — page chrome, the four DM Sans weights, the glyphs the itinerary
needs, and the drawn marks (the font has no ★ ✓ ✕)."""

import io

from pypdf import PdfReader

from app.services.pdf.document import ACTION, BG2, FONTS_DIR, INK, MUTE, OK_SOFT, Document


def _text(pdf_bytes: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [" ".join(page.extract_text().split()) for page in reader.pages]


def test_fonts_are_bundled() -> None:
    for weight in ("Regular", "SemiBold", "Bold", "ExtraBold"):
        assert (FONTS_DIR / f"DMSans-{weight}.ttf").is_file(), weight
    assert (FONTS_DIR / "OFL.txt").is_file()


def test_document_is_a4_with_header_from_page_two_and_a_footer_on_every_page() -> None:
    doc = Document(title="North Goa Beaches — itinerary", running_title="North Goa Beaches")
    doc.add_page()
    doc.heading("North Goa Beaches", 24)
    doc.para("From ₹18,499 per person · 3 nights / 4 days – Ex-Mumbai • beaches")
    doc.add_page()
    doc.h2("Day by day")
    out = bytes(doc.output())

    assert out.startswith(b"%PDF-")
    reader = PdfReader(io.BytesIO(out))
    assert len(reader.pages) == 2
    w, h = reader.pages[0].mediabox.width, reader.pages[0].mediabox.height
    assert (round(w), round(h)) == (595, 842)  # A4 in points
    assert reader.metadata is not None and reader.metadata.title == "North Goa Beaches — itinerary"
    assert reader.metadata.author == "Tripsmith"

    p1, p2 = _text(out)
    assert "₹18,499" in p1 and "–" in p1 and "•" in p1  # registered TTF, not a core font
    assert "Page 1 of 2" in p1 and "Page 2 of 2" in p2
    assert "Itinerary · North Goa Beaches" not in p1  # no running header on the cover page
    assert p2.startswith("Tripsmith Itinerary · North Goa Beaches")  # wordmark + running title
    assert "Tripsmith Holidays" in p1 and "Tripsmith Holidays" in p2  # footer contact line


def test_every_weight_and_mark_renders() -> None:
    doc = Document(title="t", running_title="t")
    doc.add_page()
    for weight in ("", "SB", "B", "XB"):
        doc.font(11, weight, INK)
        doc.cell(0, 6, f"weight {weight or 'regular'}", new_x="LMARGIN", new_y="NEXT")
    doc.label("Included")
    doc.check(20, 60)
    doc.cross(26, 60)
    for k in range(5):
        doc.star(40 + k * 4, 62, 1.6, filled=k < 3)
    w = doc.pill(20, 70, "Filling fast", fill=OK_SOFT, color=MUTE)
    assert w > 10
    doc.button(20, 80, 60, "Enquire about this trip", fill=ACTION, color=INK, link="https://x")
    doc.brand_mark(20, 95, 7)
    used = doc.wordmark(20, 105, size=7, link="https://x")
    assert used > 20
    doc.card(20, 120, 60, 20, fill=BG2)
    out = bytes(doc.output())
    text = _text(out)[0]
    assert "INCLUDED" in text and "Filling fast" in text and "Enquire about this trip" in text
    assert "Tripsmith" in text  # the wordmark is real text, not an image
    page = PdfReader(io.BytesIO(out)).pages[0]
    uris = [a.get_object()["/A"]["/URI"] for a in page.get("/Annots", [])]
    assert uris.count("https://x") == 2  # the button and the wordmark are clickable


def test_ensure_breaks_the_page_when_the_block_would_not_fit() -> None:
    doc = Document(title="t", running_title="t")
    doc.add_page()
    doc.set_y(doc.h - doc.b_margin - 10)
    doc.ensure(30)
    assert doc.page_no() == 2
    assert doc.get_y() == doc.t_margin


def test_h2_keeps_the_heading_with_what_follows() -> None:
    doc = Document(title="t", running_title="t")
    doc.add_page()
    doc.set_y(doc.h - doc.b_margin - 40)
    doc.h2("Questions", keep=60)  # 60 mm must follow: not on this page
    assert doc.page_no() == 2


def test_lines_of_counts_wrapped_lines() -> None:
    doc = Document(title="t", running_title="t")
    doc.add_page()
    assert doc.lines_of("short", 80) == 1
    assert doc.lines_of("a fairly long line of body copy that cannot fit in forty mm", 40) >= 3
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_pdf_document.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.pdf'`

- [ ] **Step 4: Write the module**

```python
# api/app/services/pdf/__init__.py
"""Server-rendered PDFs (04 §5): the itinerary (v1) and, later, the booking voucher (v2)."""
```

```python
# api/app/services/pdf/document.py
"""`Document`: the A4 page chrome every Tripsmith PDF shares — DM Sans in the site's four
weights, the web's palette and radii, a running header from page 2, a footer with the contact
line and page numbers, and the drawing helpers the site's components translate to (label-caps,
check / cross marks, stars, pills, rounded cards). Pure fpdf2; no I/O beyond the bundled fonts.

Only the registered TTFs may be used: the core fonts are Latin-1 and would drop ₹ and dashes.
DM Sans has no ★ ✓ ✕ either — those are drawn, never typed.
"""

import math
from pathlib import Path

from fpdf import FPDF, XPos, YPos
from fpdf.drawing import DeviceRGB

from app.business import BUSINESS

FONTS_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"
# fpdf2 styles are only B/I, so each weight the site uses is its own family.
WEIGHTS = {"": "Regular", "SB": "SemiBold", "B": "Bold", "XB": "ExtraBold"}
MARGIN = 18.0
FOOTER_HEIGHT = 16.0
PT = 0.3528  # mm per pt
# The web's radii (px at ~1220 px content width) scaled to the 174 mm text column.
R_CARD = 2.6  # rounded-card 18px
R_PANEL = 2.0  # rounded-[14px]
R_BTN = 1.7  # rounded-btn 12px

RGB = tuple[int, int, int]
INK: RGB = (0x14, 0x20, 0x2A)
INK2: RGB = (0x3B, 0x41, 0x48)
MUTE: RGB = (0x5E, 0x6B, 0x76)
LINE: RGB = (0xE3, 0xE8, 0xEC)
BG2: RGB = (0xF3, 0xF6, 0xFC)
PRIMARY: RGB = (0x1B, 0x4F, 0xD8)
PRIMARY_SOFT: RGB = (0xE8, 0xEE, 0xFF)
ACTION: RGB = (0xF2, 0xA9, 0x3B)
OK: RGB = (0x1F, 0x7A, 0x4D)
OK_SOFT: RGB = (0xE3, 0xF0, 0xEA)
WARN: RGB = (0xB5, 0x54, 0x1E)
WARN_SOFT: RGB = (0xFF, 0xF1, 0xDD)
WA: RGB = (0x25, 0xD3, 0x66)
WHITE: RGB = (0xFF, 0xFF, 0xFF)


class Document(FPDF):
    def __init__(self, *, title: str, running_title: str) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self.running_title = running_title
        for key, weight in WEIGHTS.items():
            self.add_font(f"DMSans{key}", "", FONTS_DIR / f"DMSans-{weight}.ttf")
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(True, margin=FOOTER_HEIGHT + 6)
        self.alias_nb_pages()
        self.set_title(title)
        self.set_author(BUSINESS["name"])
        self.set_creator(BUSINESS["name"])
        self.set_lang("en-IN")
        self.set_line_width(0.25)
        self.font(10.5)

    # --- chrome (fpdf2 calls these itself) -----------------------------------------------------

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.wordmark(MARGIN, 7.5, size=5.2)
        self.set_xy(MARGIN, 7.5)
        self.font(9, "", MUTE)
        self.cell(0, 5.2, f"Itinerary · {self.running_title}", align="R")
        self.hairline(14.5)
        self.set_y(MARGIN)

    def footer(self) -> None:
        self.set_y(-FOOTER_HEIGHT)
        self.hairline(self.get_y())
        self.set_y(self.get_y() + 2.5)
        self.font(8, "", MUTE)
        contact = f"{BUSINESS['legal_name']} · {BUSINESS['phone_display']} · {BUSINESS['email']}"
        self.cell(0, 5, contact, new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")

    # --- type ------------------------------------------------------------------------------------

    def font(self, size: float, weight: str = "", color: RGB = INK) -> None:
        """DM Sans at `size` pt: weight "" 400, "SB" 600, "B" 700, "XB" 800."""
        self.set_font(f"DMSans{weight}", "", size)
        self.set_text_color(*color)

    def heading(self, text: str, size: float, color: RGB = INK, *, h: float | None = None) -> None:
        """h1–h3 as the site sets them: 800, letter-spacing -0.03em, line-height 1.1."""
        self.font(size, "XB", color)
        self.set_char_spacing(-0.03 * size)
        self.multi_cell(
            0, h or size * PT * 1.1, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )
        self.set_char_spacing(0)

    def h2(self, text: str, *, keep: float = 30) -> None:
        """Section title (`Section`): 800 at ~28px, 16 px below; kept with `keep` mm of what
        follows so a heading never ends a page alone."""
        self.ensure(min(keep, 150) + 18)
        self.gap(6)
        self.heading(text, 19)
        self.gap(3.5)

    def label(self, text: str, *, w: float = 0, new_line: bool = True) -> None:
        """`.label-caps`: 11px 700, tracking 0.12em, uppercase, mute."""
        self.font(7.5, "B", MUTE)
        self.set_char_spacing(0.12 * 7.5)
        self.cell(
            w,
            4,
            text.upper(),
            new_x=XPos.LMARGIN if new_line else XPos.RIGHT,
            new_y=YPos.NEXT if new_line else YPos.TOP,
        )
        self.set_char_spacing(0)

    def para(
        self, text: str, *, size: float = 10.5, color: RGB = INK2, w: float = 0, line: float = 5.6
    ) -> None:
        self.font(size, "", color)
        self.multi_cell(w, line, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def lines_of(self, text: str, w: float, size: float = 10.5) -> int:
        """How many lines `text` wraps to at `w` mm in the body face (for column planning)."""
        self.font(size, "", INK2)
        return len(self.multi_cell(w, 5.6, text, dry_run=True, output="LINES"))

    # --- marks (the site's icons, drawn) -------------------------------------------------------

    def check(self, x: float, y: float, color: RGB = OK, s: float = 3.2) -> None:
        """`Check` icon: `M20 6 9 17l-5-5` on a 24-grid, stroked."""
        self.set_draw_color(*color)
        self.set_line_width(0.55)
        u = s / 24
        self.line(x + 4 * u, y + 12 * u, x + 9 * u, y + 17 * u)
        self.line(x + 9 * u, y + 17 * u, x + 20 * u, y + 6 * u)
        self.set_line_width(0.25)

    def cross(self, x: float, y: float, color: RGB = MUTE, s: float = 3.2) -> None:
        """`Cross` icon: two diagonals."""
        self.set_draw_color(*color)
        self.set_line_width(0.55)
        u = s / 24
        self.line(x + 6 * u, y + 6 * u, x + 18 * u, y + 18 * u)
        self.line(x + 18 * u, y + 6 * u, x + 6 * u, y + 18 * u)
        self.set_line_width(0.25)

    def star(self, cx: float, cy: float, r: float, *, filled: bool) -> None:
        """Marigold ★ (filled) / ☆ (outline) as the hotel cards show them."""
        pts = []
        for i in range(10):
            radius = r if i % 2 == 0 else r * 0.45
            angle = -math.pi / 2 + i * math.pi / 5
            pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
        self.set_fill_color(*ACTION)
        self.set_draw_color(*ACTION)
        self.set_line_width(0.3)
        self.polygon(pts, style="F" if filled else "D")
        self.set_line_width(0.25)

    def pill(
        self, x: float, y: float, text: str, *, fill: RGB, color: RGB, size: float = 7.5
    ) -> float:
        """`rounded-chip` tag; returns its width."""
        self.font(size, "B", color)
        w = self.get_string_width(text) + 5
        self.set_fill_color(*fill)
        self.rect(x, y, w, 5.2, style="F", round_corners=True, corner_radius=2.6)
        self.set_xy(x, y)
        self.cell(w, 5.2, text, align="C")
        return w

    def button(
        self, x: float, y: float, w: float, text: str, *, fill: RGB, color: RGB, link: str
    ) -> None:
        """`rounded-btn` primary action: 12 px radius, bold, centred, clickable."""
        self.set_fill_color(*fill)
        self.rect(x, y, w, 9.5, style="F", round_corners=True, corner_radius=R_BTN)
        self.set_xy(x, y)
        self.font(10, "B", color)
        self.cell(w, 9.5, text, align="C", link=link)

    def brand_mark(self, x: float, y: float, size: float) -> None:
        """The site's `BrandMark`: primary rounded square, white dashed route, marigold end."""
        u = size / 64
        self.card(x, y, size, size, fill=PRIMARY, stroke=None, r=size / 4)
        with self.new_path(x + 14 * u, y + 44 * u) as path:
            path.style.stroke_color = DeviceRGB(1, 1, 1)
            path.style.stroke_width = 4 * u
            path.style.stroke_cap_style = "round"
            path.style.stroke_dash_pattern = [6 * u, 6 * u]
            path.style.fill_color = None
            path.curve_to(x + 22 * u, y + 44 * u, x + 22 * u, y + 26 * u, x + 32 * u, y + 26 * u)
            path.curve_to(x + 42 * u, y + 26 * u, x + 42 * u, y + 40 * u, x + 50 * u, y + 22 * u)
        self.set_fill_color(*ACTION)
        self.circle(x + 50 * u, y + 22 * u, 6 * u, style="F")
        self.set_fill_color(*WHITE)
        self.circle(x + 14 * u, y + 44 * u, 4 * u, style="F")

    def wordmark(self, x: float, y: float, *, size: float = 7.0, link: str = "") -> float:
        """Mark + "Tripsmith" as the header sets it (800, tight); returns the width used."""
        self.brand_mark(x, y, size)
        self.set_xy(x + size + 2.2, y)
        pt = size * 1.9
        self.font(pt, "XB", INK)
        self.set_char_spacing(-0.025 * pt)
        w = self.get_string_width(BUSINESS["name"]) + 1
        self.cell(w, size, BUSINESS["name"], link=link)
        self.set_char_spacing(0)
        return size + 2.2 + w

    # --- surfaces --------------------------------------------------------------------------------

    def card(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        *,
        fill: RGB = WHITE,
        stroke: RGB | None = LINE,
        r: float = R_CARD,
    ) -> None:
        self.set_fill_color(*fill)
        style = "F"
        if stroke is not None:
            self.set_draw_color(*stroke)
            style = "DF"
        self.rect(x, y, w, h, style=style, round_corners=True, corner_radius=r)

    def hairline(self, y: float, x1: float = MARGIN, x2: float | None = None) -> None:
        self.set_draw_color(*LINE)
        self.set_line_width(0.25)
        self.line(x1, y, x2 if x2 is not None else self.w - MARGIN, y)

    def ensure(self, height: float) -> None:
        """Start a new page if `height` mm would not fit above the footer."""
        if self.will_page_break(height):
            self.add_page()

    def gap(self, mm: float) -> None:
        self.set_y(self.get_y() + mm)
```

Notes for the implementer: the helper is named `font(...)`, not `text(...)`, because `FPDF.text(x, y, txt)` is fpdf2's positioned-text primitive and must stay reachable. `set_char_spacing` exists in fpdf2 ≥ 2.7; `multi_cell(dry_run=True, output="LINES")` returns the wrapped lines without drawing; `rect(round_corners=("TOP_LEFT", "TOP_RIGHT"))` rounds only those corners; the drawing API (`new_path`) wants `fpdf.drawing.DeviceRGB(0–1 floats)`, not the 0–255 tuples the rest of the module uses. `set_y()` resets x to the left margin — use `set_xy` when the x matters (the itinerary text column).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_pdf_document.py -q && uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: 6 passed, clean (verified against the prototype 2026-09-21). pyright: `fpdf.drawing.DeviceRGB` and `new_path` are typed; if `path.style.stroke_cap_style = "round"` is flagged, the enum is `fpdf.enums.StrokeCapStyle.ROUND`.

- [ ] **Step 6: Commit**

```bash
git add api/pyproject.toml api/uv.lock api/assets/fonts api/app/services/pdf api/tests/test_pdf_document.py
git commit -m "feat(F11): fpdf2 Document base — DM Sans, palette, header/footer"
```

---

### Task 3: `render_itinerary` — the PDF itself

**Files:**
- Create: `api/app/services/pdf/itinerary.py`
- Test: `api/tests/test_pdf_render.py`
- Create: `api/tests/pdf_fixture.py` (a hand-built `PackageDetail` — reused by Task 5/6 tests)

**Interfaces:**
- Consumes: `Document` and helpers (Task 2); `inr`, `long_date`, `duration`, `meals_label`, `seats_label` (Task 1); `PackageDetail`, `DepartureOut`, `HotelOut` (`app.schemas.catalog`); `BADGE_LABELS` (`app.schemas.meta`); `BUSINESS`, `whatsapp_href` (`app.business`).
- Produces: `render_itinerary(pkg: PackageDetail, *, cover: bytes | None, gallery: Sequence[bytes] = (), site_url: str, whatsapp_number: str) -> bytes`; `PDF_PREFIX = "pdf/"`; `pdf_prefix(slug) -> str`; `pdf_pathname(slug, updated_at: dt.datetime) -> str`; `pdf_filename(slug) -> str`; `HERO_SIZE = (1400, 600)`, `GALLERY_CELL = (700, 296)`, `GALLERY_MAX = 4`; `prepare_cover(data: bytes) -> bytes | None` (21:9 crop + gradient + rounded corners, JPEG; `None` if Pillow cannot open it); `prepare_gallery_image(data: bytes) -> bytes | None`.

- [ ] **Step 1: Write the fixture and the failing tests**

```python
# api/tests/pdf_fixture.py
"""A hand-built `PackageDetail` for the PDF tests — long enough to force page breaks."""

import datetime as dt

from app.schemas.catalog import (
    DepartureOut,
    DestinationRef,
    FaqItem,
    HotelOut,
    ImageOut,
    ItineraryDayOut,
    Meals,
    PackageDetail,
)
from app.schemas.meta import Badge

UPDATED_AT = dt.datetime(2026, 9, 20, 10, 30, tzinfo=dt.UTC)
LONG = (
    "Morning at leisure on the sand, then a slow drive up the coast past paddy fields and "
    "whitewashed churches. Lunch is a thali at a family-run place we have eaten at for years. "
    "Evening at the fort for the sunset, back to the hotel for dinner on the terrace. "
)


def departure(i: int, seats_left: int, *, guaranteed: bool = False) -> DepartureOut:
    return DepartureOut(
        id=f"dep{i}",
        date=dt.date(2026, 11, 6) + dt.timedelta(days=7 * i),
        seats_total=16,
        seats_left=seats_left,
        guaranteed=guaranteed,
        price_double_paise=1_849_900 + i * 50_000,
        price_triple_paise=1_699_900 + i * 50_000,
        price_child_paise=999_900,
        single_supplement_paise=650_000,
        badge=(
            Badge.SOLD_OUT
            if seats_left <= 0
            else Badge.FILLING_FAST
            if seats_left <= 4
            else Badge.GUARANTEED
            if guaranteed
            else None
        ),
    )


def package(
    *,
    days: int = 7,
    departures: int = 12,
    faq: bool = True,
    summary: str | None = None,
    images: int = 1,
) -> PackageDetail:
    photos = [
        ImageOut(url=f"https://blob.test/photo-{k}.jpg", alt=f"Photo {k}", width=1400, height=933)
        for k in range(images)
    ]
    return PackageDetail(
        slug="north-goa-beaches",
        name="North Goa Beaches",
        summary=summary
        or "Easy days between Calangute and Morjim — beach mornings, a spice farm, a heritage "
        "walk and one sunset cruise, with the hotel a minute from the sand.",
        destination=DestinationRef(slug="goa", name="Goa"),
        themes=["beach", "family"],
        nights=days - 1,
        days=days,
        departure_city="Ex-Mumbai",
        starting_price_paise=1_849_900 if departures else 0,  # 0 = "On request", as the api does
        highlights=[
            "Hotel a minute's walk from Calangute beach",
            "Spice plantation lunch at Sahakari",
            "Sunset cruise on the Mandovi",
            "Fontainhas heritage walk with a local guide",
        ],
        inclusions=[
            "3 nights in a 4-star hotel, breakfast included",
            "Airport transfers in an air-conditioned vehicle",
            "Spice plantation visit with lunch",
            "Sunset cruise tickets",
            "All tolls, parking and driver allowance",
        ],
        exclusions=["Flights", "Lunches and dinners not mentioned", "Anything personal"],
        hotels=[
            HotelOut(name="Sea Breeze Resort", city="Calangute", stars=4, nights=2),
            HotelOut(name="Morjim Beach House", city="Morjim", stars=3, nights=days - 3),
        ],
        faq=[FaqItem(q="Is this okay for kids?", a="Yes — every day has a free afternoon.")]
        if faq
        else [],
        itinerary=[
            ItineraryDayOut(
                day_no=i,
                title=f"Day {i} title — arrive and settle in" if i == 1 else f"Day {i} title",
                description=LONG * 3,
                meals=Meals(breakfast=i > 1, lunch=i % 2 == 0, dinner=i == 1),
                stay=None if i == days else "Sea Breeze Resort, Calangute",
            )
            for i in range(1, days + 1)
        ],
        images=photos,
        cover=photos[0],
        departures=[
            departure(i, seats_left=(0 if i == 1 else 3 if i == 2 else 9), guaranteed=i == 0)
            for i in range(departures)
        ],
        related=[],
        updated_at=UPDATED_AT,
    )
```

```python
# api/tests/test_pdf_render.py
"""services/pdf/itinerary.py — R6: a valid A4 PDF under 2 MB, rendered in under 3 s, whose
content matches the package page section for section."""

import datetime as dt
import io
import time
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

from app.services.pdf.itinerary import (
    GALLERY_CELL,
    HERO_SIZE,
    PDF_PREFIX,
    pdf_filename,
    pdf_pathname,
    pdf_prefix,
    prepare_cover,
    prepare_gallery_image,
    render_itinerary,
)
from tests.pdf_fixture import UPDATED_AT, package

PHOTOS = Path(__file__).resolve().parents[1] / "content" / "photos" / "goa"
COVER_JPEG = PHOTOS / "agonda-sunset.jpg"
GALLERY_JPEGS = [PHOTOS / n for n in ("aguada-fort.jpg", "anjuna-curlies.jpg")]
SITE = "https://tripsmith.vercel.app"


def _pages(pdf: bytes) -> list[str]:
    return [" ".join(p.extract_text().split()) for p in PdfReader(io.BytesIO(pdf)).pages]


def _links(pdf: bytes, page: int = 0) -> list[str]:
    p = PdfReader(io.BytesIO(pdf)).pages[page]
    return [a.get_object()["/A"]["/URI"] for a in p.get("/Annots", []) if "/A" in a.get_object()]


def render(*, gallery: bool = True, **kw: object) -> bytes:
    return render_itinerary(
        package(**kw),  # type: ignore[arg-type]
        cover=COVER_JPEG.read_bytes(),
        gallery=[p.read_bytes() for p in GALLERY_JPEGS] if gallery else (),
        site_url=SITE,
        whatsapp_number="919845012345",
    )


def test_pathname_scheme() -> None:
    assert PDF_PREFIX == "pdf/"
    assert pdf_prefix("north-goa-beaches") == "pdf/north-goa-beaches/"
    assert pdf_filename("north-goa-beaches") == "Tripsmith-north-goa-beaches-itinerary.pdf"
    epoch = int(UPDATED_AT.timestamp())
    assert (
        pdf_pathname("north-goa-beaches", UPDATED_AT)
        == f"pdf/north-goa-beaches/{epoch}/Tripsmith-north-goa-beaches-itinerary.pdf"
    )
    # Same instant in another zone keys the same object.
    ist = UPDATED_AT.astimezone(dt.timezone(dt.timedelta(hours=5, minutes=30)))
    assert pdf_pathname("north-goa-beaches", ist) == pdf_pathname("north-goa-beaches", UPDATED_AT)


def test_prepare_cover_bakes_the_hero_treatment_as_jpeg() -> None:
    out = prepare_cover(COVER_JPEG.read_bytes())
    assert out is not None
    im = Image.open(io.BytesIO(out))
    assert im.format == "JPEG" and im.size == HERO_SIZE
    # Rounded corners are flattened onto the page white; the bottom band is darkened.
    assert all(c >= 245 for c in im.getpixel((0, 0)))  # JPEG-white
    top = sum(im.getpixel((HERO_SIZE[0] // 2, 40)))
    bottom = sum(im.getpixel((HERO_SIZE[0] // 2, HERO_SIZE[1] - 10)))
    assert bottom < top
    assert prepare_cover(b"not an image") is None


def test_prepare_gallery_image_crops_to_the_cell() -> None:
    out = prepare_gallery_image(GALLERY_JPEGS[0].read_bytes())
    assert out is not None and Image.open(io.BytesIO(out)).size == GALLERY_CELL
    assert prepare_gallery_image(b"nope") is None


def test_renders_a_valid_a4_pdf_within_budget() -> None:
    t0 = time.perf_counter()
    pdf = render()
    elapsed = time.perf_counter() - t0
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) < 2_000_000, len(pdf)
    assert elapsed < 3.0, elapsed
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 3
    box = reader.pages[0].mediabox
    assert (round(box.width), round(box.height)) == (595, 842)
    assert reader.metadata is not None
    assert reader.metadata.title == "North Goa Beaches — itinerary · Tripsmith"


def test_cover_page_mirrors_the_package_page() -> None:
    pkg = package()
    pdf = render()
    p1 = _pages(pdf)[0]
    # Wordmark + breadcrumb, hero title + meta, the quick-facts strip.
    assert p1.startswith("Tripsmith Home › Goa › North Goa Beaches")
    assert "6N / 7D" in p1 and "Ex-Mumbai" in p1 and "Beach · Family" in p1
    assert "DURATION" in p1 and "DEPARTS Mumbai" in p1 and "STAY 4-star Calangute" in p1
    assert "NEXT DATE 6 Nov" in p1
    assert pkg.summary in p1
    for h in pkg.highlights:
        assert h in p1
    # The price box: from-price, next departure with seats, the promise.
    assert "From ₹18,499 per person, double sharing" in p1
    assert "NEXT DEPARTURE Fri 6 Nov 2026 9 seats" in p1
    assert "A person calls you back within two hours" in p1
    assert "tripsmith.vercel.app/packages/north-goa-beaches" in p1
    # Its actions are real links.
    links = _links(pdf)
    assert f"{SITE}/packages/north-goa-beaches/enquire" in links
    assert any(u.startswith("https://wa.me/919845012345?text=") for u in links)
    assert "tel:+919845012345" in links
    # Photos: the hero plus the gallery strip (two cells here).
    assert len(PdfReader(io.BytesIO(pdf)).pages[0].images) == 3


def test_inner_pages_match_the_page_sections() -> None:
    pkg = package()
    text = " ".join(_pages(render())[1:])
    assert "Day by day" in text
    for day in pkg.itinerary:
        assert day.title in text
    assert "Dinner Stay · Sea Breeze Resort, Calangute" in text  # day 1: chips in order
    assert "Breakfast · Lunch Stay · Sea Breeze Resort, Calangute" in text  # day 2
    assert "INCLUDED" in text and "NOT INCLUDED" in text
    for item in pkg.inclusions + pkg.exclusions:
        assert item in text
    assert "Where you stay" in text
    assert "Sea Breeze Resort Calangute · 2 nights" in text
    assert "Morjim Beach House Morjim · 4 nights" in text
    assert "DEPARTURE PER PERSON SEATS STATUS" in text
    assert "Fri 6 Nov 2026 ₹18,499 9 left Guaranteed departure" in text
    assert "Fri 13 Nov 2026 ₹18,999 — Sold out" in text
    assert "Fri 20 Nov 2026 ₹19,499 3 left Filling fast" in text
    assert "Price per person" in text
    assert "Adult · double sharing ₹18,499 – ₹23,999" in text
    assert "Child 5–11 · with parents ₹9,999" in text and "Single supplement + ₹6,500" in text
    assert "Questions Is this okay for kids?" in text


def test_without_cover_gallery_faq_or_departures() -> None:
    pdf = render_itinerary(
        package(departures=0, faq=False), cover=None, site_url=SITE, whatsapp_number="91"
    )
    pages = _pages(pdf)
    text = " ".join(pages)
    assert "No fixed departures are open right now" in text
    assert "Questions" not in text
    assert "FROM On request" in pages[0] and "NEXT DATE On request" in pages[0]
    assert len(PdfReader(io.BytesIO(pdf)).pages[0].images) == 0


def test_gallery_is_dropped_when_the_cover_page_is_full() -> None:
    long_summary = package().summary + " " + "More about the trip. " * 12
    pdf = render(summary=long_summary)
    assert len(PdfReader(io.BytesIO(pdf)).pages[0].images) == 1  # hero only, box still pinned
    assert "From ₹18,499 per person" in _pages(pdf)[0]
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_pdf_render.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.pdf.itinerary'`

- [ ] **Step 3: Write the renderer**

```python
# api/app/services/pdf/itinerary.py
"""`render_itinerary`: the package page as an A4 PDF (R6), section for section — hero, quick
facts, highlights, the price box, day by day, what's in the price, where you stay, dates &
prices, questions — drawn with the same tokens, radii and marks as the web components in
web/src/components/site/package/. Pure and synchronous: takes a `PackageDetail` (the object
the page renders) and the cover photo's bytes; every network step lives in service.py.

Blob pathnames: `pdf/{slug}/{updated_at epoch}/Tripsmith-{slug}-itinerary.pdf` — the basename
is the download filename, `pdf/{slug}/` scopes a package's versions, `pdf/` scopes the GC.
"""

import datetime as dt
import io
from collections.abc import Sequence

from fpdf import XPos, YPos
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

from app.business import BUSINESS, whatsapp_href
from app.schemas.catalog import DepartureOut, PackageDetail
from app.schemas.meta import BADGE_LABELS, Badge
from app.services.format import duration, inr, long_date, meals_label
from app.services.pdf.document import (
    ACTION,
    BG2,
    INK,
    INK2,
    LINE,
    MARGIN,
    MUTE,
    OK,
    OK_SOFT,
    PRIMARY,
    R_BTN,
    R_CARD,
    R_PANEL,
    WA,
    WARN,
    WARN_SOFT,
    WHITE,
    Document,
)

PDF_PREFIX = "pdf/"
HERO_SIZE = (1400, 600)  # the hero's 21:9 crop; 174 mm wide on the page
HERO_RADIUS_PX = 21  # rounded-card 18 px at the site's 1220 px content width, scaled
GALLERY_MAX = 4  # the web's grid: one tall cell + four small (cover excluded)
GALLERY_CELL = (700, 296)  # every cell is 2.36:1 (86 × 37 mm tall, 42 × 17.5 mm small)
MAX_DEPARTURE_ROWS = 24
TEXT_X = MARGIN + 13  # itinerary text column (the web's 46 px indent)
BADGE = 7.5  # day number badge (the web's 34 px)
PILL_TONE = {
    Badge.FILLING_FAST: (WARN_SOFT, WARN),
    Badge.SOLD_OUT: (LINE, MUTE),
    Badge.GUARANTEED: (OK_SOFT, OK),
}


def pdf_prefix(slug: str) -> str:
    return f"{PDF_PREFIX}{slug}/"


def pdf_filename(slug: str) -> str:
    return f"Tripsmith-{slug}-itinerary.pdf"


def pdf_pathname(slug: str, updated_at: dt.datetime) -> str:
    return f"{pdf_prefix(slug)}{int(updated_at.timestamp())}/{pdf_filename(slug)}"


def prepare_cover(data: bytes) -> bytes | None:
    """The `PackageHero` treatment, baked: centre-crop to 21:9, the bottom gradient
    (`from-[rgb(10_20_30/0.7)]`), rounded-card corners flattened onto the page white, JPEG."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            photo = ImageOps.fit(im.convert("RGB"), HERO_SIZE)
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    w, h = HERO_SIZE
    shade = Image.new("RGBA", (w, h), (10, 20, 30, 0))
    px = shade.load()
    start = int(h * 0.45)
    for y in range(start, h):
        alpha = int(178 * (y - start) / (h - start))  # 0 → 0.7
        for x in range(w):
            px[x, y] = (10, 20, 30, alpha)
    photo = Image.alpha_composite(photo.convert("RGBA"), shade)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), HERO_RADIUS_PX, fill=255)
    flat = Image.new("RGB", (w, h), WHITE)
    flat.paste(photo.convert("RGB"), mask=mask)
    out = io.BytesIO()
    flat.save(out, "JPEG", quality=82, optimize=True)
    return out.getvalue()


def prepare_gallery_image(data: bytes) -> bytes | None:
    """One `Gallery` cell: centre-crop to the cell ratio, small JPEG."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            cell = ImageOps.fit(im.convert("RGB"), GALLERY_CELL)
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    out = io.BytesIO()
    cell.save(out, "JPEG", quality=78, optimize=True)
    return out.getvalue()


def _price_range(values: Sequence[int]) -> str:
    lo, hi = min(values) // 100, max(values) // 100
    return inr(lo) if lo == hi else f"{inr(lo)} – {inr(hi)}"


def _next_departure(departures: Sequence[DepartureOut]) -> DepartureOut | None:
    return next((d for d in departures if d.seats_left > 0), departures[0] if departures else None)


def _fit(d: Document, value: str, width: float, size: float, weight: str) -> float:
    """Shrink a one-line value until it fits `width`; returns the size that fits (≥ 7 pt)."""
    d.font(size, weight, INK)
    while size > 7 and d.get_string_width(value) > width:
        size -= 0.5
        d.font(size, weight, INK)
    return size


PRICE_BOX_H = 58.5


def price_box_slot_top(d: Document) -> float:
    """Where the cover page's price box is pinned (just above the footer)."""
    return d.h - d.b_margin - PRICE_BOX_H - 1


def _rounded(jpeg: bytes, w_mm: float) -> bytes:
    """Round a gallery cell's corners (`rounded-[10px]`) against the page white."""
    with Image.open(io.BytesIO(jpeg)) as im:
        rgb = im.convert("RGB")
        r = int(rgb.width * 1.45 / w_mm)  # 10 px of 1220 → 1.45 mm
        mask = Image.new("L", rgb.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, rgb.width - 1, rgb.height - 1), r, fill=255)
        flat = Image.new("RGB", rgb.size, WHITE)
        flat.paste(rgb, mask=mask)
    out = io.BytesIO()
    flat.save(out, "JPEG", quality=78)
    return out.getvalue()


class _Itinerary:
    def __init__(
        self,
        pkg: PackageDetail,
        cover: bytes | None,
        gallery: Sequence[bytes],
        site_url: str,
        whatsapp_number: str,
    ) -> None:
        self.pkg = pkg
        self.cover = prepare_cover(cover) if cover else None
        self.gallery = [g for g in (prepare_gallery_image(b) for b in gallery[:GALLERY_MAX]) if g]
        self.site = site_url.rstrip("/")
        self.package_url = f"{self.site}/packages/{pkg.slug}"
        self.enquire_url = f"{self.package_url}/enquire"
        self.whatsapp_url = whatsapp_href(
            whatsapp_number, f"Hi Tripsmith, I'm interested in {pkg.name} ({self.package_url})"
        )
        self.doc = Document(
            title=f"{pkg.name} — itinerary · {BUSINESS['name']}", running_title=pkg.name
        )

    def render(self) -> bytes:
        d = self.doc
        d.add_page()
        self.top_bar()
        self.hero()
        self.quick_facts()
        self.overview()
        self.gallery_strip()
        self.price_box()  # on the cover page: the enquiry path travels with a forwarded PDF
        self.days()
        self.inclusions()
        self.hotels()
        self.dates_and_prices()
        self.faq()
        return bytes(d.output())

    # --- page 1 -----------------------------------------------------------------------------

    def top_bar(self) -> None:
        """Wordmark + the page's breadcrumb (`Home › Goa › North Goa Beaches`)."""
        d, p = self.doc, self.pkg
        d.wordmark(MARGIN, 11.5, size=7, link=self.site)
        d.set_xy(MARGIN, 11.5)
        d.font(8.5, "", MUTE)
        d.cell(0, 7, f"Home  ›  {p.destination.name}  ›  {p.name}", align="R")
        d.set_y(22.5)

    def hero(self) -> None:
        d, p = self.doc, self.pkg
        w = d.epw
        h = w * HERO_SIZE[1] / HERO_SIZE[0]
        top = d.get_y()
        if self.cover:
            d.image(io.BytesIO(self.cover), x=MARGIN, y=top, w=w, h=h)
        else:
            d.card(MARGIN, top, w, h, fill=BG2, stroke=None)
        # Title block sits on the photo's dark gradient, white, like the web's overlay.
        color = WHITE if self.cover else INK
        pad = 6.5
        meta = f"{duration(p.nights, p.days)}    {p.departure_city}    " + " · ".join(
            t.capitalize() for t in p.themes
        )
        d.set_xy(MARGIN + pad, top + h - pad - 6)
        d.font(9, "SB", color)
        d.cell(w - 2 * pad, 6, meta)
        size = 24.0
        d.font(size, "XB", color)
        d.set_char_spacing(-0.03 * size)
        while size > 16 and d.get_string_width(p.name) > w - 2 * pad:
            size -= 1
            d.font(size, "XB", color)
            d.set_char_spacing(-0.03 * size)
        d.set_xy(MARGIN + pad, top + h - pad - 6 - size * 0.42)
        d.cell(w - 2 * pad, 6, p.name)
        d.set_char_spacing(0)
        d.set_y(top + h + 4)

    def quick_facts(self) -> None:
        """`QuickFacts`: one bordered bg2 strip, five cells divided by hairlines."""
        d, p = self.doc, self.pkg
        stay = p.hotels[0] if p.hotels else None
        nxt = p.departures[0] if p.departures else None
        facts = [
            ("Duration", duration(p.nights, p.days)),
            (
                "From",
                inr(p.starting_price_paise // 100) if p.starting_price_paise else "On request",
            ),
            ("Departs", p.departure_city.removeprefix("Ex-")),
            ("Stay", f"{stay.stars}-star {stay.city}" if stay else "—"),
            ("Next date", f"{nxt.date.day} {nxt.date:%b}" if nxt else "On request"),
        ]
        h, top, cw = 16.0, d.get_y(), d.epw / len(facts)
        d.card(MARGIN, top, d.epw, h, fill=BG2, r=R_PANEL)
        for i, (label, value) in enumerate(facts):
            x = MARGIN + i * cw
            if i:
                d.set_draw_color(*LINE)
                d.line(x, top, x, top + h)
            d.set_xy(x + 4, top + 3.2)
            d.label(label, w=cw - 8)
            d.set_xy(x + 4, top + 8)
            _fit(d, value, cw - 8, 11.5, "XB")
            d.cell(cw - 8, 6, value)
        d.set_y(top + h + 5.5)

    def overview(self) -> None:
        d, p = self.doc, self.pkg
        d.para(p.summary, size=10.5, color=INK2, line=5.8)
        if not p.highlights:
            return
        d.gap(2)
        d.heading("Highlights", 15)
        d.gap(2.5)
        col = (d.epw - 6) / 2
        y = d.get_y()
        for r in range(0, len(p.highlights), 2):
            pair = p.highlights[r : r + 2]
            row_h = max(d.lines_of(t, col - 5.5, 10) for t in pair) * 5.2
            for k, text in enumerate(pair):
                x = MARGIN + k * (col + 6)
                d.check(x, y + 1.0)
                d.set_xy(x + 5.5, y)
                d.font(10, "", INK)
                d.multi_cell(col - 5.5, 5.2, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            y += row_h + 1.8
        d.set_y(y + 1)

    def gallery_strip(self) -> None:
        """`Gallery`: one tall cell + up to four small, only when the cover page has the room."""
        d = self.doc
        if not self.gallery:
            return
        gap, small_h = 2.0, 17.5
        h = 2 * small_h + gap
        if d.get_y() + 3 + h > price_box_slot_top(d) - 4:
            return
        top = d.get_y() + 3
        tall_w = (d.epw - 2 * gap) / 2
        small_w = (d.epw - 2 * gap) / 4
        cells = [(MARGIN, top, tall_w, h)]
        for k in range(4):
            x = MARGIN + tall_w + gap + (k % 2) * (small_w + gap)
            cells.append((x, top + (k // 2) * (small_h + gap), small_w, small_h))
        for img, (x, y, w, ch) in zip(self.gallery, cells, strict=False):
            d.image(io.BytesIO(_rounded(img, w)), x=x, y=y, w=w, h=ch)
        d.set_y(top + h + 2)

    def price_box(self) -> None:
        """`PriceBox` + the WhatsApp/phone lines: pinned above the footer of the cover page."""
        d, p = self.doc, self.pkg
        h = PRICE_BOX_H
        slot = price_box_slot_top(d)
        if d.get_y() + 4 <= slot:
            top = slot
        else:
            d.ensure(h + 4)
            top = d.get_y()
        pad = 5.5
        d.card(MARGIN, top, d.epw, h, r=R_CARD)
        left_w = 62.0
        x = MARGIN + pad
        # Left: from-price and the next departure box.
        d.set_xy(x, top + pad)
        d.font(8.5, "SB", MUTE)
        d.cell(left_w, 4.5, "From", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        price = inr(p.starting_price_paise // 100) if p.starting_price_paise else "On request"
        d.set_xy(x, top + pad + 4.5)
        d.font(21, "XB", INK)
        d.set_char_spacing(-0.5)
        d.cell(left_w, 9.5, price)
        d.set_char_spacing(0)
        d.set_xy(x, top + pad + 14)
        d.font(8.5, "", MUTE)
        d.cell(left_w, 4.5, "per person, double sharing")
        nxt = _next_departure(p.departures)
        if nxt:
            by = top + pad + 21
            d.set_draw_color(*LINE)
            d.set_line_width(0.4)
            d.rect(x, by, left_w, 12.5, style="D", round_corners=True, corner_radius=R_BTN)
            d.set_line_width(0.25)
            d.set_xy(x + 3, by + 2)
            d.label("Next departure", w=left_w - 6)
            d.set_xy(x + 3, by + 6.2)
            d.font(9.5, "B", INK)
            d.cell(left_w - 6, 5, long_date(nxt.date), new_x=XPos.RIGHT, new_y=YPos.TOP)
            d.set_xy(x + 3, by + 6.2)
            seats = f"{nxt.seats_left} seats" if nxt.seats_left > 0 else "Sold out"
            d.cell(left_w - 6, 5, seats, align="R")
        # Right: the actions.
        bx = x + left_w + 8
        bw = d.epw - 2 * pad - left_w - 8
        d.button(
            bx,
            top + pad,
            bw,
            "Enquire about this trip",
            fill=ACTION,
            color=INK,
            link=self.enquire_url,
        )
        d.button(
            bx,
            top + pad + 12.5,
            bw,
            "Chat on WhatsApp",
            fill=WA,
            color=WHITE,
            link=self.whatsapp_url,
        )
        d.set_xy(bx, top + pad + 25)
        d.font(9, "B", PRIMARY)
        d.cell(
            bw,
            6,
            f"Call {BUSINESS['phone_display']}",
            align="C",
            link=f"tel:{BUSINESS['phone_e164']}",
        )
        # Foot: the promise, as the price box prints it.
        fy = top + pad + 35
        d.hairline(fy, x, d.w - MARGIN - pad)
        d.set_xy(x, fy + 2.5)
        d.font(8.5, "", MUTE)
        d.multi_cell(
            d.epw - 2 * pad,
            4.6,
            f"{BUSINESS['callback_promise']}, {BUSINESS['hours']}. Nothing to pay online. "
            f"{BUSINESS['after_hours']}",
            align="L",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        d.set_x(x)
        d.font(8, "", MUTE)
        shown = self.package_url.removeprefix("https://").removeprefix("http://")
        d.cell(
            0,
            4.6,
            f"{BUSINESS['legal_name']} · {BUSINESS['address']}, {BUSINESS['city']} · {shown}",
            link=self.package_url,
        )
        d.set_y(top + h + 4)

    # --- page 2+ ----------------------------------------------------------------------------

    def days(self) -> None:
        """`Itinerary`: the route line, numbered badges, title, description, meal/stay chips."""
        d, p = self.doc, self.pkg
        d.ensure(60)
        d.h2("Day by day")
        line_x = MARGIN + BADGE / 2
        text_w = d.epw - (TEXT_X - MARGIN)
        last = len(p.itinerary) - 1
        for i, day in enumerate(p.itinerary):
            d.ensure(34)
            d.hairline(d.get_y())
            top = d.get_y() + 4.5
            page = d.page_no()
            # Badge: primary square, radius 10 px, white number.
            d.card(MARGIN, top, BADGE, BADGE, fill=PRIMARY, stroke=None, r=1.6)
            d.set_xy(MARGIN, top + 0.3)
            d.font(9.5, "XB", WHITE)
            d.cell(BADGE, BADGE, str(day.day_no), align="C")
            d.set_xy(TEXT_X, top - 0.5)
            d.heading(day.title, 12.5, h=6.2)
            d.set_xy(TEXT_X, d.get_y() + 0.5)
            d.para(day.description, w=min(text_w, 128))
            d.gap(1.5)
            chips = [meals_label(day.meals.breakfast, day.meals.lunch, day.meals.dinner)]
            if day.stay:
                chips.append(f"Stay · {day.stay}")
            cx, cy = TEXT_X, d.get_y()
            for chip in chips:
                cx += d.pill(cx, cy, chip, fill=BG2, color=MUTE) + 2
            d.set_y(cy + 5.2 + 4.5)
            # Route line from this badge down to the next day (or to the page foot mid-day).
            if i < last:
                d.set_draw_color(*PRIMARY)
                d.set_line_width(0.5)
                if d.page_no() == page:
                    d.line(line_x, top + BADGE, line_x, d.get_y())
                else:
                    d.line(line_x, MARGIN, line_x, d.get_y())
                d.set_line_width(0.25)
        d.hairline(d.get_y())
        d.gap(2)

    def inclusions(self) -> None:
        """`Inclusions`: Included / Not included side by side, check and cross marks."""
        d, p = self.doc, self.pkg
        col = (d.epw - 8) / 2
        cols = [("Included", p.inclusions, True), ("Not included", p.exclusions, False)]
        heights = [
            6 + sum(d.lines_of(t, col - 6, 10) * 5.2 + 2.2 for t in items) for _, items, _ in cols
        ]
        block = max(heights)
        d.h2("What's in the price", keep=block + 4)
        if block <= d.h - d.t_margin - d.b_margin - 20:
            d.ensure(block + 4)
            top = d.get_y()
            for k, (label, items, included) in enumerate(cols):
                self._mark_list(MARGIN + k * (col + 8), top, col, label, items, included)
            d.set_y(top + block + 2)
        else:  # very long lists: stack, let the page flow
            for label, items, included in cols:
                d.ensure(20)
                y = self._mark_list(MARGIN, d.get_y(), d.epw, label, items, included)
                d.set_y(y + 4)

    def _mark_list(
        self, x: float, top: float, w: float, label: str, items: list[str], included: bool
    ) -> float:
        d = self.doc
        d.set_xy(x, top)
        d.label(label)
        y = top + 6
        for text in items:
            (d.check if included else d.cross)(x, y + 1.0)
            d.set_xy(x + 6, y)
            d.font(10, "", INK)
            d.multi_cell(w - 6, 5.2, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            y = d.get_y() + 2.2
        return y

    def hotels(self) -> None:
        """`Hotels`: one bordered card per property — name, marigold stars, city · nights."""
        d, p = self.doc, self.pkg
        if not p.hotels:
            return
        h = 14.0
        d.h2("Where you stay", keep=h + 6)
        for hotel in p.hotels:
            d.ensure(h + 3)
            top = d.get_y()
            d.card(MARGIN, top, d.epw, h, r=R_PANEL)
            d.set_xy(MARGIN + 4.5, top + 3)
            d.font(11.5, "B", INK)
            d.cell(
                d.get_string_width(hotel.name) + 4, 6, hotel.name, new_x=XPos.RIGHT, new_y=YPos.TOP
            )
            sx = d.get_x() + 1
            for k in range(5):
                d.star(sx + k * 3.6, top + 6, 1.55, filled=k < hotel.stars)
            d.set_xy(MARGIN + 4.5, top + 8.6)
            d.font(8.5, "", MUTE)
            nights = f"{hotel.nights} night{'s' if hotel.nights != 1 else ''}"
            d.cell(0, 4, f"{hotel.city} · {nights}")
            d.set_y(top + h + 3)

    def dates_and_prices(self) -> None:
        """`DeparturesTable` (bordered, header row, seat bar, status pill) + `OccupancyPricing`."""
        d, p = self.doc, self.pkg
        d.h2("Dates & prices", keep=40)
        if not p.departures:
            d.card(MARGIN, d.get_y(), d.epw, 14, fill=BG2, r=R_PANEL)
            d.set_xy(MARGIN + 5, d.get_y() + 4)
            d.font(10, "", MUTE)
            d.cell(0, 6, "No fixed departures are open right now — dates on request.")
            d.gap(18)
            return
        widths = (52.0, 36.0, 46.0, 40.0)
        xs = [MARGIN + sum(widths[:k]) for k in range(4)]
        row_h, head_h = 10.0, 9.0

        def header(y: float) -> float:
            d.set_fill_color(*BG2)
            d.rect(
                MARGIN,
                y,
                d.epw,
                head_h,
                style="F",
                round_corners=("TOP_LEFT", "TOP_RIGHT"),
                corner_radius=R_PANEL,
            )
            for x, text in zip(xs, ("Departure", "Per person", "Seats", "Status"), strict=True):
                d.set_xy(x + 3.5, y + 2.6)
                d.label(text, w=30, new_line=False)
            return y + head_h

        rows = p.departures[:MAX_DEPARTURE_ROWS]
        d.ensure(head_h + row_h * min(len(rows), 3) + 6)
        seg_top = d.get_y()
        y = header(seg_top)
        for k, dep in enumerate(rows):
            if d.will_page_break(row_h + 2):
                self._table_frame(seg_top, y)
                d.add_page()
                seg_top = d.get_y()
                y = header(seg_top)
            if k:
                d.hairline(y)
            d.set_xy(xs[0] + 3.5, y + 2.5)
            d.font(9.5, "B", INK)
            d.cell(widths[0] - 4, 5, long_date(dep.date))
            d.set_xy(xs[1] + 3.5, y + 2.5)
            d.font(9.5, "", INK)
            d.cell(widths[1] - 4, 5, inr(dep.price_double_paise // 100))
            # Seat bar: line track, primary fill (warn when ≤ 4 left), then "N left".
            fill = max(0.0, min(1.0, dep.seats_left / dep.seats_total if dep.seats_total else 0))
            bar_x, bar_y, bar_w = xs[2] + 3.5, y + 4.3, 13.0
            d.set_fill_color(*LINE)
            d.rect(bar_x, bar_y, bar_w, 1.4, style="F", round_corners=True, corner_radius=0.7)
            if fill > 0:
                low = 0 < dep.seats_left <= 4
                d.set_fill_color(*(WARN if low else PRIMARY))
                d.rect(
                    bar_x,
                    bar_y,
                    max(bar_w * fill, 1.4),
                    1.4,
                    style="F",
                    round_corners=True,
                    corner_radius=0.7,
                )
            d.set_xy(bar_x + bar_w + 2.5, y + 2.5)
            d.font(9.5, "", INK)
            d.cell(
                widths[2] - bar_w - 6, 5, f"{dep.seats_left} left" if dep.seats_left > 0 else "—"
            )
            if dep.badge:
                soft, tone = PILL_TONE[dep.badge]
                d.pill(
                    xs[3] + 3.5, y + 2.4, BADGE_LABELS[dep.badge], fill=soft, color=tone, size=7.5
                )
            y += row_h
        self._table_frame(seg_top, y)
        d.set_y(y + 3)
        if len(p.departures) > MAX_DEPARTURE_ROWS:
            d.para(
                f"+ {len(p.departures) - MAX_DEPARTURE_ROWS} more dates on the website.",
                size=8.5,
                color=MUTE,
            )
        # Price per person (the occupancy grid), 2 × 2.
        d.ensure(46)
        d.gap(5)
        d.heading("Price per person", 13)
        d.gap(3)
        deps = p.departures
        cells = [
            ("Adult · double sharing", _price_range([x.price_double_paise for x in deps])),
            ("Adult · triple sharing", _price_range([x.price_triple_paise for x in deps])),
            ("Child 5–11 · with parents", _price_range([x.price_child_paise for x in deps])),
            ("Single supplement", "+ " + _price_range([x.single_supplement_paise for x in deps])),
        ]
        gutter, bh = 3.0, 15.0
        bw = (d.epw - gutter) / 2
        top = d.get_y()
        for i, (label, value) in enumerate(cells):
            x = MARGIN + (i % 2) * (bw + gutter)
            by = top + (i // 2) * (bh + gutter)
            d.card(x, by, bw, bh, r=R_BTN)
            d.set_xy(x + 3.5, by + 2.8)
            d.font(7.5, "SB", MUTE)
            d.cell(bw - 7, 4, label)
            d.set_xy(x + 3.5, by + 7.2)
            d.font(12.5, "XB", INK)
            d.cell(bw - 7, 6, value)
        d.set_y(top + 2 * bh + gutter + 3)
        d.para(
            "Prices vary by departure date; the table above is per adult on double sharing.",
            size=8.5,
            color=MUTE,
        )

    def _table_frame(self, top: float, bottom: float) -> None:
        d = self.doc
        d.set_draw_color(*LINE)
        d.rect(
            MARGIN, top, d.epw, bottom - top, style="D", round_corners=True, corner_radius=R_PANEL
        )

    def faq(self) -> None:
        """`Faq`: hairline rows, the question bold, the answer open (no accordion on paper)."""
        d, p = self.doc, self.pkg
        if not p.faq:
            return
        d.h2("Questions", keep=22)
        for item in p.faq:
            d.ensure(20)
            d.hairline(d.get_y())
            d.gap(3.5)
            d.font(10.5, "B", INK)
            d.multi_cell(0, 5.6, item.q, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            d.gap(1)
            d.para(item.a, w=min(d.epw, 130))
            d.gap(3.5)
        d.hairline(d.get_y())


def render_itinerary(
    pkg: PackageDetail,
    *,
    cover: bytes | None,
    gallery: Sequence[bytes] = (),
    site_url: str,
    whatsapp_number: str,
) -> bytes:
    """A4 itinerary for a live package. `cover` = the raw cover photo (any Pillow format) or
    None; `gallery` = up to four more photos in gallery order (drawn only if the cover page has
    room for the strip)."""
    return _Itinerary(pkg, cover, gallery, site_url, whatsapp_number).render()
```

Implementer notes: fpdf2's `table()` draws its own borders with the current draw colour — set `d.set_draw_color(*LINE)` before the `with`. `FontFace(size_pt=…)` and `TableCellFillMode.EVEN_ROWS` exist in 2.8; if a keyword is rejected, check `uv run python -c "import fpdf.fonts, fpdf.enums; help(fpdf.fonts.FontFace)"`. Long words never overflow because `multi_cell` wraps at the cell width.

- [ ] **Step 4: Run the tests, then look at the PDF**

Run: `uv run --directory api pytest tests/test_pdf_render.py tests/test_pdf_document.py -q`
Expected: 9 passed (verified against the prototype 2026-09-21). Then write one out and read it: `uv run --directory api python -c "from tests.pdf_fixture import package; from tests.test_pdf_render import render; from pathlib import Path; Path('../.pdf-preview.pdf').write_bytes(render())"` and open `.pdf-preview.pdf` (repo root; if `git status` shows it, delete it after looking; do not commit). Compare against `http://localhost:3003/packages/north-goa-beaches` (or the prod page): hero, quick facts, highlights, gallery, price box, route-line itinerary with chips, two-column inclusions, hotel cards with stars, bordered departures table with seat bars and pills, occupancy grid, FAQ rows — same order, same tones. The design preview Viraj approved is at https://claude.ai/artifact/PP3nAzp18HhXMez49Gere3.

- [ ] **Step 5: Lint, type-check, commit**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: clean.

```bash
git add api/app/services/pdf/itinerary.py api/tests/test_pdf_render.py api/tests/pdf_fixture.py
git commit -m "feat(F11): render_itinerary — A4 itinerary PDF from PackageDetail"
```

---

### Task 4: `BlobStore.list` / `delete` and the app-level store

**Files:**
- Modify: `api/app/infra/storage.py`
- Modify: `api/app/main.py` (`app.state.store`)
- Test: `api/tests/test_storage.py`

**Interfaces:**
- Produces: `BlobInfo(url: str, pathname: str, size: int)` (frozen dataclass); `BlobStore(settings, *, transport=None, timeout=60.0)`; `BlobStore.list(prefix: str) -> list[BlobInfo]` (follows `cursor` while `hasMore`); `BlobStore.delete(urls: Sequence[str]) -> None` (no-op on empty; batches of 100); `build_store(settings) -> BlobStore | None` (`None` without a token, 10 s timeout); `app.state.store`.

- [ ] **Step 1: Write the failing tests** (append to `api/tests/test_storage.py`)

```python
from app.infra.storage import BlobInfo, build_store


async def test_list_follows_the_cursor_and_returns_pathnames() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.params.get("cursor") == "c1":
            return httpx.Response(
                200,
                json={
                    "blobs": [{"url": "https://x/pdf/b/2/f.pdf", "pathname": "pdf/b/2/f.pdf", "size": 2}],
                    "hasMore": False,
                },
            )
        return httpx.Response(
            200,
            json={
                "blobs": [{"url": "https://x/pdf/a/1/f.pdf", "pathname": "pdf/a/1/f.pdf", "size": 1}],
                "cursor": "c1",
                "hasMore": True,
            },
        )

    store = BlobStore(_settings(), transport=httpx.MockTransport(handler))
    blobs = await store.list("pdf/")

    assert blobs == [
        BlobInfo(url="https://x/pdf/a/1/f.pdf", pathname="pdf/a/1/f.pdf", size=1),
        BlobInfo(url="https://x/pdf/b/2/f.pdf", pathname="pdf/b/2/f.pdf", size=2),
    ]
    first = calls[0]
    assert first.method == "GET" and str(first.url).startswith("https://blob.vercel-storage.com/?")
    assert first.url.params["prefix"] == "pdf/" and first.url.params["limit"] == "1000"
    assert first.headers["authorization"] == "Bearer tok"
    assert first.headers["x-api-version"] == "7"
    assert calls[1].url.params["cursor"] == "c1"


async def test_delete_posts_urls_in_batches_and_skips_empty() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={})

    store = BlobStore(_settings(), transport=httpx.MockTransport(handler))
    await store.delete([])
    assert calls == []
    await store.delete([f"https://x/{i}" for i in range(150)])
    assert [c.method for c in calls] == ["POST", "POST"]
    assert str(calls[0].url) == "https://blob.vercel-storage.com/delete"
    assert calls[0].headers["content-type"] == "application/json"
    import json

    assert len(json.loads(calls[0].content)["urls"]) == 100
    assert len(json.loads(calls[1].content)["urls"]) == 50


async def test_list_raises_on_a_non_2xx() -> None:
    store = BlobStore(
        _settings(), transport=httpx.MockTransport(lambda r: httpx.Response(500, text="x"))
    )
    with pytest.raises(httpx.HTTPStatusError):
        await store.list("pdf/")


def test_build_store_is_none_without_a_token() -> None:
    assert build_store(_settings(None)) is None
    assert isinstance(build_store(_settings()), BlobStore)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_storage.py -q`
Expected: FAIL — `ImportError: cannot import name 'BlobInfo'`

- [ ] **Step 3: Extend the store**

Replace `api/app/infra/storage.py`'s `BlobStore` with:

```python
"""Vercel Blob over its REST API — there is no official Python SDK (04 §4).

`BlobStore.put` uploads one public object and returns its URL; `list` / `delete` serve the PDF
cache (services/pdf). `LocalStore` is the seed's `--local` mode: objects are mirrored to
`api/.seed-photos/` and served by the dev api. `build_store` is what the app mounts on
`app.state.store` — None without a token, and every caller degrades gracefully.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings

BLOB_API = "https://blob.vercel-storage.com"
TIMEOUT_SECONDS = 60.0  # the seed's uploads
APP_TIMEOUT_SECONDS = 10.0  # inside a request
LIST_PAGE = 1000
DELETE_BATCH = 100


class StorageNotConfigured(RuntimeError):
    pass


class Store(Protocol):
    async def put(self, pathname: str, data: bytes, content_type: str) -> str: ...


@dataclass(frozen=True)
class BlobInfo:
    url: str
    pathname: str
    size: int


class BlobStore:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = TIMEOUT_SECONDS,
    ):
        if settings.blob_read_write_token is None:
            raise StorageNotConfigured("BLOB_READ_WRITE_TOKEN is not set")
        self._token = settings.blob_read_write_token.get_secret_value()
        self._transport = transport
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "x-api-version": "7"}

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self._transport, timeout=self._timeout)

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        headers = {
            **self._headers(),
            "x-content-type": content_type,
            "x-add-random-suffix": "0",  # stable, predictable pathnames
            "x-allow-overwrite": "1",  # re-seeding overwrites in place
        }
        async with self._client() as client:
            res = await client.put(f"{BLOB_API}/{pathname}", content=data, headers=headers)
        res.raise_for_status()
        return str(res.json()["url"])

    async def list(self, prefix: str) -> list[BlobInfo]:
        """Every object under `prefix`, following the cursor."""
        out: list[BlobInfo] = []
        cursor: str | None = None
        async with self._client() as client:
            while True:
                params = {"prefix": prefix, "limit": str(LIST_PAGE)}
                if cursor:
                    params["cursor"] = cursor
                res = await client.get(f"{BLOB_API}/", params=params, headers=self._headers())
                res.raise_for_status()
                body = res.json()
                out.extend(
                    BlobInfo(url=str(b["url"]), pathname=str(b["pathname"]), size=int(b.get("size", 0)))
                    for b in body.get("blobs", [])
                )
                cursor = body.get("cursor") if body.get("hasMore") else None
                if not cursor:
                    return out

    async def delete(self, urls: Sequence[str]) -> None:
        if not urls:
            return
        async with self._client() as client:
            for i in range(0, len(urls), DELETE_BATCH):
                res = await client.post(
                    f"{BLOB_API}/delete",
                    json={"urls": list(urls[i : i + DELETE_BATCH])},
                    headers=self._headers(),
                )
                res.raise_for_status()


def build_store(settings: Settings) -> BlobStore | None:
    if settings.blob_read_write_token is None:
        return None
    return BlobStore(settings, timeout=APP_TIMEOUT_SECONDS)
```

Keep `LOCAL_STORE_DIR` and `LocalStore` exactly as they are below. In `api/app/main.py` add `from app.infra.storage import LOCAL_STORE_DIR, build_store` (replacing the existing `LOCAL_STORE_DIR` import) and, after `app.state.email_sender = …`:

```python
    app.state.store = build_store(settings)  # Vercel Blob or None; read by services/pdf
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_storage.py tests/test_seed.py -q && uv run --directory api ruff check . && uv run --directory api pyright`
Expected: PASS (the seed still uses `put` only), clean.

- [ ] **Step 5: Commit**

```bash
git add api/app/infra/storage.py api/app/main.py api/tests/test_storage.py
git commit -m "feat(F11): BlobStore.list/delete + app.state.store"
```

---

### Task 5: `PdfService` — cover fetch, cache lookup, put, attachment, GC

**Files:**
- Create: `api/app/services/pdf/service.py`
- Modify: `api/app/main.py` (`app.state.pdf`)
- Modify: `api/tests/conftest.py` (network-free `PdfService` in the `app` fixture)
- Test: `api/tests/test_pdf_service.py` (also defines `FakeBlobStore`)

**Interfaces:**
- Consumes: `BlobStore`, `BlobInfo` (Task 4); `render_itinerary`, `prepare_cover`, `pdf_pathname`, `pdf_prefix`, `pdf_filename`, `PDF_PREFIX` (Task 3); `get_package` (`app.services.catalog.reads`); `EmailAttachment` (`app.infra.email`); `Package` model.
- Produces: `PdfService(store: BlobStore | None, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None)` with `cached_url(pkg) -> str | None`, `build(pkg) -> bytes` (fetches the cover + up to `GALLERY_MAX` gallery photos concurrently, one client, each best-effort), `put(pkg, pdf) -> str | None`, `attachment_for(db, slug) -> EmailAttachment | None`, `gc(db) -> GcReport`; `GcReport(deleted: int, kept: int, configured: bool)` (an `ApiModel`, in `app/schemas/pdf.py`); `COVER_TIMEOUT = 5.0`, `COVER_MAX_BYTES = 6_000_000`.

- [ ] **Step 1: Write the schema, then the failing tests**

```python
# api/app/schemas/pdf.py
"""Response of `GET /cron/pdf-gc`."""

from pydantic import Field

from app.schemas import ApiModel


class GcReport(ApiModel):
    deleted: int
    kept: int
    configured: bool = Field(description="False when no Blob store is configured (nothing to do)")
```

```python
# api/tests/test_pdf_service.py
"""services/pdf/service.py — the network side of the PDF: cover fetch, Blob cache, attachment,
GC. Every failure degrades; nothing here may raise into a request."""

import datetime as dt
from pathlib import Path

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.storage import BlobInfo
from app.models import Package
from app.services.pdf.itinerary import pdf_pathname
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.pdf_fixture import UPDATED_AT, package
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

COVER_JPEG = Path(__file__).resolve().parents[1] / "content" / "photos" / "goa" / "agonda-sunset.jpg"
KEY = pdf_pathname("north-goa-beaches", UPDATED_AT)
# `package(images=n)` (tests/pdf_fixture.py) gives n distinct image URLs, the cover first.


class FakeBlobStore:
    """In-memory Blob: the same put/list/delete surface as `BlobStore`."""

    def __init__(self, *, fail: bool = False) -> None:
        self.objects: dict[str, bytes] = {}
        self.puts: list[tuple[str, str]] = []
        self.fail = fail

    def _url(self, pathname: str) -> str:
        return f"https://blob.test/{pathname}"

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        if self.fail:
            raise httpx.ConnectError("blob down")
        self.objects[pathname] = data
        self.puts.append((pathname, content_type))
        return self._url(pathname)

    async def list(self, prefix: str) -> list[BlobInfo]:
        if self.fail:
            raise httpx.ConnectError("blob down")
        return [
            BlobInfo(url=self._url(p), pathname=p, size=len(d))
            for p, d in self.objects.items()
            if p.startswith(prefix)
        ]

    async def delete(self, urls: list[str]) -> None:
        if self.fail:
            raise httpx.ConnectError("blob down")
        for url in urls:
            self.objects.pop(url.removeprefix("https://blob.test/"), None)


def cover_transport(status: int = 200, body: bytes | None = None) -> httpx.MockTransport:
    data = COVER_JPEG.read_bytes() if body is None else body
    return httpx.MockTransport(
        lambda r: httpx.Response(status, content=data, headers={"content-type": "image/jpeg"})
    )


def service(store: FakeBlobStore | None, transport: httpx.MockTransport | None = None) -> PdfService:
    return PdfService(store, make_settings(site_url="https://t.test"), transport=transport or cover_transport())  # type: ignore[arg-type]


async def test_cached_url_matches_the_exact_pathname() -> None:
    store = FakeBlobStore()
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"old"
    svc = service(store)
    assert await svc.cached_url(package()) is None
    store.objects[KEY] = b"%PDF"
    assert await svc.cached_url(package()) == f"https://blob.test/{KEY}"


async def test_cached_url_is_none_without_a_store_or_when_blob_fails() -> None:
    assert await service(None).cached_url(package()) is None
    assert await service(FakeBlobStore(fail=True)).cached_url(package()) is None


async def test_build_embeds_the_cover_and_survives_a_missing_one() -> None:
    with_cover = await service(None).build(package())
    without = await service(None, cover_transport(404)).build(package())
    assert with_cover.startswith(b"%PDF-") and without.startswith(b"%PDF-")
    assert len(with_cover) > len(without) + 20_000  # the JPEG is in there


async def test_build_fetches_the_cover_and_up_to_four_gallery_photos_once_each() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            200, content=COVER_JPEG.read_bytes(), headers={"content-type": "image/jpeg"}
        )

    pkg = package(images=7)  # cover + 6 more; only the first 4 gallery photos are fetched
    pdf = await service(None, httpx.MockTransport(handler)).build(pkg)
    assert pdf.startswith(b"%PDF-")
    assert seen == [pkg.cover.url] + [i.url for i in pkg.images[1:5]]  # type: ignore[union-attr]


async def test_build_ignores_a_cover_that_is_not_an_image_or_too_big() -> None:
    junk = await service(None, cover_transport(200, b"<html>")).build(package())
    assert junk.startswith(b"%PDF-")
    huge = httpx.MockTransport(
        lambda r: httpx.Response(200, content=b"x", headers={"content-length": "99999999"})
    )
    assert (await service(None, huge).build(package())).startswith(b"%PDF-")


async def test_put_stores_under_the_key_and_degrades() -> None:
    store = FakeBlobStore()
    url = await service(store).put(package(), b"%PDF-x")
    assert url == f"https://blob.test/{KEY}"
    assert store.puts == [(KEY, "application/pdf")]
    assert await service(None).put(package(), b"%PDF-x") is None
    assert await service(FakeBlobStore(fail=True)).put(package(), b"%PDF-x") is None


@pytest.mark.db
async def test_attachment_for_renders_warms_the_cache_and_names_the_file(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = FakeBlobStore()
    att = await service(store).attachment_for(db, "north-goa-beaches")
    assert att is not None
    assert att.filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert att.content.startswith(b"%PDF-")
    assert len(store.objects) == 1 and next(iter(store.objects)).startswith("pdf/north-goa-beaches/")
    assert await service(store).attachment_for(db, "no-such-trip") is None


@pytest.mark.db
async def test_attachment_for_never_raises(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())

    def boom(*a: object, **k: object) -> bytes:
        raise RuntimeError("fpdf exploded")

    monkeypatch.setattr("app.services.pdf.service.render_itinerary", boom)
    assert await service(FakeBlobStore()).attachment_for(db, "north-goa-beaches") is None


@pytest.mark.db
async def test_gc_deletes_every_pathname_that_is_not_current(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    rows = (await db.execute(Package.__table__.select())).all()
    current = {pdf_pathname(r.slug, r.updated_at) for r in rows}
    store = FakeBlobStore()
    for key in current:
        store.objects[key] = b"keep"
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"stale"
    store.objects["pdf/deleted-trip/5/Tripsmith-deleted-trip-itinerary.pdf"] = b"stale"
    store.objects["packages/goa/photo.jpg"] = b"not a pdf, not touched"

    report = await service(store).gc(db)

    assert (report.deleted, report.kept, report.configured) == (2, 2, True)
    assert set(store.objects) == current | {"packages/goa/photo.jpg"}
    # An edit rotates the key: the old object becomes stale on the next run.
    await db.execute(update(Package).where(Package.slug == "north-goa-beaches").values(featured=True))
    await db.commit()
    report = await service(store).gc(db)
    assert report.deleted == 1 and report.kept == 1


@pytest.mark.db
async def test_gc_without_a_store_reports_unconfigured(db: AsyncSession) -> None:
    report = await service(None).gc(db)
    assert (report.deleted, report.kept, report.configured) == (0, 0, False)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export TEST_DATABASE_URL=…; uv run --directory api pytest tests/test_pdf_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.pdf.service'`

- [ ] **Step 3: Write the service and wire it**

```python
# api/app/services/pdf/service.py
"""`PdfService`: everything around `render_itinerary` that touches the network — the cover
photo, the Blob cache (find / put), the email attachment and the weekly GC. Lives on
`app.state.pdf`. Every method degrades (logs + Sentry) instead of raising: a package download
falls back to streaming, an enquiry goes out without the attachment.
"""

import asyncio
import logging

import httpx
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infra.email import EmailAttachment
from app.infra.storage import BlobStore
from app.models import Package
from app.schemas.catalog import PackageDetail
from app.schemas.pdf import GcReport
from app.services.catalog.reads import get_package
from app.services.pdf.itinerary import (
    GALLERY_MAX,
    PDF_PREFIX,
    pdf_filename,
    pdf_pathname,
    pdf_prefix,
    render_itinerary,
)

log = logging.getLogger(__name__)

COVER_TIMEOUT = 5.0
COVER_MAX_BYTES = 6_000_000
PDF_CONTENT_TYPE = "application/pdf"


class PdfService:
    def __init__(
        self,
        store: BlobStore | None,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._store = store
        self._settings = settings
        self._transport = transport  # tests: never the network

    # --- cache ---------------------------------------------------------------------------------

    async def cached_url(self, pkg: PackageDetail) -> str | None:
        if self._store is None:
            return None
        key = pdf_pathname(pkg.slug, pkg.updated_at)
        try:
            blobs = await self._store.list(pdf_prefix(pkg.slug))
        except Exception as exc:
            self._degrade("Blob list failed for %s", pkg.slug, exc)
            return None
        return next((b.url for b in blobs if b.pathname == key), None)

    async def put(self, pkg: PackageDetail, pdf: bytes) -> str | None:
        if self._store is None:
            return None
        try:
            return await self._store.put(pdf_pathname(pkg.slug, pkg.updated_at), pdf, PDF_CONTENT_TYPE)
        except Exception as exc:
            self._degrade("Blob put failed for %s", pkg.slug, exc)
            return None

    # --- render --------------------------------------------------------------------------------

    async def build(self, pkg: PackageDetail) -> bytes:
        """Fetch the cover and the gallery photos (best effort, concurrently) and render off
        the event loop."""
        urls = [pkg.cover.url] if pkg.cover else []
        gallery_urls = [i.url for i in pkg.images if not pkg.cover or i.url != pkg.cover.url]
        urls += gallery_urls[:GALLERY_MAX]
        photos: list[bytes | None] = []
        if urls:
            async with httpx.AsyncClient(transport=self._transport, timeout=COVER_TIMEOUT) as client:
                photos = list(await asyncio.gather(*(self._fetch_image(client, u) for u in urls)))
        cover = photos[0] if pkg.cover and photos else None
        gallery = [p for p in photos[1 if pkg.cover else 0 :] if p]
        return await asyncio.to_thread(
            render_itinerary,
            pkg,
            cover=cover,
            gallery=gallery,
            site_url=self._settings.site_url,
            whatsapp_number=self._settings.whatsapp_number,
        )

    async def _fetch_image(self, client: httpx.AsyncClient, url: str) -> bytes | None:
        try:
            res = await client.get(url, follow_redirects=True)
            if res.status_code != 200:
                return None
            if int(res.headers.get("content-length", len(res.content))) > COVER_MAX_BYTES:
                return None
            if not res.headers.get("content-type", "").startswith("image/"):
                return None
            return res.content
        except Exception as exc:  # a missing photo is not worth a failed download
            log.warning("Photo fetch failed for %s: %s", url, exc)
            return None

    # --- email ---------------------------------------------------------------------------------

    async def attachment_for(self, db: AsyncSession, slug: str) -> EmailAttachment | None:
        """The visitor's attachment for a live package; also warms the Blob cache. Never raises."""
        try:
            pkg = await get_package(db, slug)
            if pkg is None:
                return None
            pdf = await self.build(pkg)
            await self.put(pkg, pdf)
            return EmailAttachment(filename=pdf_filename(slug), content=pdf)
        except Exception as exc:
            self._degrade("Itinerary PDF failed for %s", slug, exc)
            return None

    # --- gc ------------------------------------------------------------------------------------

    async def gc(self, db: AsyncSession) -> GcReport:
        """Delete every `pdf/` object whose pathname is not a package's current key."""
        if self._store is None:
            return GcReport(deleted=0, kept=0, configured=False)
        rows = (await db.execute(select(Package.slug, Package.updated_at))).all()
        current = {pdf_pathname(slug, updated_at) for slug, updated_at in rows}
        blobs = await self._store.list(PDF_PREFIX)
        stale = [b.url for b in blobs if b.pathname not in current]
        await self._store.delete(stale)
        return GcReport(deleted=len(stale), kept=len(blobs) - len(stale), configured=True)

    def _degrade(self, msg: str, slug: str, exc: Exception) -> None:
        log.error(msg + ": %s", slug, exc)
        sentry_sdk.capture_exception(exc)
```

`gc` deliberately raises on Blob errors — the cron route (Task 8) turns that into a 500 so the failure is visible in Vercel's cron log.

In `api/app/main.py`: `from app.services.pdf.service import PdfService`, and after `app.state.store = …`:

```python
    app.state.pdf = PdfService(app.state.store, settings)  # swapped by tests; read by routers
```

In `api/tests/conftest.py`, change the `app` fixture so no test can reach the network for a cover:

```python
@pytest.fixture
def app() -> FastAPI:
    # Pure defaults (tests/settings.py): no env, no .env.local — Sentry and the DB stay off.
    settings = make_settings()
    app = create_app(settings=settings)
    # No store, and a cover fetch that always 404s: PDFs render, nothing leaves the process.
    app.state.pdf = PdfService(
        None, settings, transport=httpx.MockTransport(lambda r: httpx.Response(404))
    )
    return app
```

with `import httpx` and `from app.services.pdf.service import PdfService` added to the imports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_pdf_service.py -q && uv run --directory api pytest -q -p no:cacheprovider && uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: new tests pass; the whole suite still green; clean.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/pdf/service.py api/app/schemas/pdf.py api/app/main.py api/tests/conftest.py api/tests/test_pdf_service.py
git commit -m "feat(F11): PdfService — cover fetch, Blob cache, attachment, GC"
```

---

### Task 6: `GET /packages/{slug}/itinerary.pdf`

**Files:**
- Create: `api/app/routers/site/pdf.py`
- Modify: `api/app/main.py` (include the router)
- Modify: `api/openapi.json`, `web/src/lib/api-types.ts` (regenerated)
- Test: `api/tests/test_pdf_route.py`

**Interfaces:**
- Consumes: `PdfService` (Task 5) from `request.app.state.pdf`; `get_package`; `PUBLIC_CACHE_CONTROL`; `pdf_filename`.
- Produces: the route, `operation_id="getItineraryPdf"`.

- [ ] **Step 1: Write the failing tests**

```python
# api/tests/test_pdf_route.py
"""GET /packages/{slug}/itinerary.pdf (06 C, 04 §5): 302 to the Blob copy, streamed when there
is no store, 404 for drafts."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package
from app.models.enums import PackageStatus
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_pdf_service import FakeBlobStore, cover_transport

PATH = "/packages/north-goa-beaches/itinerary.pdf"


def with_store(db_app: FastAPI, store: FakeBlobStore | None) -> FakeBlobStore | None:
    db_app.state.pdf = PdfService(store, make_settings(), transport=cover_transport())  # type: ignore[arg-type]
    return store


@pytest.mark.db
async def test_first_download_renders_stores_and_redirects(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = with_store(db_app, FakeBlobStore())
    assert store is not None

    res = await db_client.get(PATH)

    assert res.status_code == 302, res.text
    assert res.headers["cache-control"] == "public, s-maxage=60, stale-while-revalidate=300"
    location = res.headers["location"]
    assert location.startswith("https://blob.test/pdf/north-goa-beaches/")
    assert location.endswith("/Tripsmith-north-goa-beaches-itinerary.pdf")
    assert len(store.puts) == 1 and store.puts[0][1] == "application/pdf"
    assert next(iter(store.objects.values())).startswith(b"%PDF-")

    again = await db_client.get(PATH)
    assert again.status_code == 302 and again.headers["location"] == location
    assert len(store.puts) == 1  # served from the cache, not re-rendered


@pytest.mark.db
async def test_without_a_store_the_pdf_is_streamed_inline(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, None)
    res = await db_client.get(PATH)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert (
        res.headers["content-disposition"]
        == 'inline; filename="Tripsmith-north-goa-beaches-itinerary.pdf"'
    )
    assert res.headers["cache-control"] == "public, s-maxage=60, stale-while-revalidate=300"
    assert res.content.startswith(b"%PDF-")


@pytest.mark.db
async def test_blob_outage_still_serves_the_pdf(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore(fail=True))
    res = await db_client.get(PATH)
    assert res.status_code == 200 and res.content.startswith(b"%PDF-")


@pytest.mark.db
async def test_draft_and_unknown_are_404(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore())
    await db.execute(
        update(Package).where(Package.slug == "goa-quiet-escape").values(status=PackageStatus.DRAFT)
    )
    await db.commit()
    for slug in ("goa-quiet-escape", "atlantis"):
        res = await db_client.get(f"/packages/{slug}/itinerary.pdf")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "not_found"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_pdf_route.py -q`
Expected: FAIL — 404s on every request (route missing), first test fails on `status_code == 302`.

- [ ] **Step 3: Write the router and include it**

```python
# api/app/routers/site/pdf.py
"""GET /packages/{slug}/itinerary.pdf (04 §5): 302 to the Blob-cached PDF keyed by
`updated_at`, rendered on the first request; streamed inline when no store is configured
(dev, CI) or Blob is down — a download never 5xx's because of the cache."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.routers.site.meta import PUBLIC_CACHE_CONTROL
from app.services.catalog.reads import get_package
from app.services.pdf.itinerary import pdf_filename
from app.services.pdf.service import PdfService

router = APIRouter(tags=["public"])


@router.get(
    "/packages/{slug}/itinerary.pdf",
    operation_id="getItineraryPdf",
    response_class=Response,
    responses={
        302: {"description": "Redirect to the cached PDF"},
        200: {"content": {"application/pdf": {}}, "description": "The PDF (no Blob store)"},
        404: {"description": "Draft or unknown package"},
    },
)
async def get_itinerary_pdf(
    slug: str, request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Response:
    pkg = await get_package(db, slug)
    if pkg is None:
        raise ApiError("not_found", "Package not found")
    service: PdfService = request.app.state.pdf
    headers = {"Cache-Control": PUBLIC_CACHE_CONTROL}

    url = await service.cached_url(pkg)
    if url is None:
        pdf = await service.build(pkg)
        url = await service.put(pkg, pdf)
        if url is None:
            return Response(
                pdf,
                media_type="application/pdf",
                headers={
                    **headers,
                    "Content-Disposition": f'inline; filename="{pdf_filename(slug)}"',
                },
            )
    return RedirectResponse(url, status_code=302, headers=headers)
```

In `api/app/main.py`: `from app.routers.site import catalog, enquiries, health, meta, pdf` and `app.include_router(pdf.router)` after the catalog router.

- [ ] **Step 4: Run the tests, regenerate the contract**

Run: `uv run --directory api pytest tests/test_pdf_route.py -q && pnpm gen:api && uv run --directory api pytest tests/test_openapi.py -q && pnpm --filter web test && git status --short`
Expected: route tests pass; `api/openapi.json` and `web/src/lib/api-types.ts` change (new `getItineraryPdf` path); freshness tests pass on both sides; web contract test green.

- [ ] **Step 5: Lint, type-check, commit**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright && pnpm --filter web typecheck`
Expected: clean.

```bash
git add api/app/routers/site/pdf.py api/app/main.py api/openapi.json web/src/lib/api-types.ts api/tests/test_pdf_route.py
git commit -m "feat(F11): GET /packages/{slug}/itinerary.pdf — Blob-cached, streamed fallback"
```

---

### Task 7: Attach the PDF to the visitor's confirmation email

**Files:**
- Modify: `api/app/services/email/send.py` (`attachment` parameter)
- Modify: `api/app/services/email/render.py` (`pdf_url` in `_common`)
- Modify: `api/app/services/email/templates/enquiry_visitor.html`, `enquiry_visitor.txt`, `enquiry_owner.html`, `enquiry_owner.txt`
- Modify: `api/app/services/enquiries.py` (`pdf: PdfService | None`), `api/app/routers/site/enquiries.py` (pass `state.pdf`)
- Test: `api/tests/test_email_send.py`, `api/tests/test_email_render.py`, `api/tests/test_enquiries.py`

**Interfaces:**
- Consumes: `PdfService.attachment_for(db, slug)` (Task 5); `EmailAttachment`, `EmailMessage.attachments`.
- Produces: `send_enquiry_emails(sender, settings, ctx, *, attachment: EmailAttachment | None = None) -> EmailOutcome`; `submit_enquiry(..., pdf: PdfService | None = None)`; template var `pdf_url: str | None`.

- [ ] **Step 1: Write the failing tests**

Append to `api/tests/test_email_send.py` (it already imports `make_settings`, `FakeSender`, `send_enquiry_emails` and `ctx` from `tests.test_email_render` — `ctx(**over)` builds an `EnquiryEmailContext` for `priya@example.com` about `north-goa-beaches`; add `from app.infra.email import EmailAttachment`):

```python
async def test_attachment_goes_to_the_visitor_only() -> None:
    sender = FakeSender()
    att = EmailAttachment(filename="Tripsmith-north-goa-beaches-itinerary.pdf", content=b"%PDF-")
    settings = make_settings(
        email_from="Tripsmith <hello@tripsmith.in>", owner_notify_email="owner@example.com"
    )
    out = await send_enquiry_emails(sender, settings, ctx(), attachment=att)
    assert out.status == EmailStatus.SENT
    by_to = {m.to: m for m in sender.sent}
    assert by_to["priya@example.com"].attachments == (att,)
    assert by_to["owner@example.com"].attachments == ()


async def test_no_attachment_when_none_given() -> None:
    sender = FakeSender()
    settings = make_settings(email_from="Tripsmith <hello@tripsmith.in>")
    await send_enquiry_emails(sender, settings, ctx())
    assert sender.sent[0].attachments == ()
```

Append to `api/tests/test_email_render.py` (its `ctx(**over)` helper overrides any `EnquiryEmailContext` field):

```python
def test_visitor_email_links_the_pdf_when_a_package_is_attached() -> None:
    settings = make_settings(site_url="https://tripsmith.vercel.app")
    msg = render_visitor(ctx(), settings=settings)
    url = "https://tripsmith.vercel.app/api/packages/north-goa-beaches/itinerary.pdf"
    assert url in msg.html and url in msg.text
    assert "attached as a PDF" in msg.text
    owner = render_owner(
        ctx(),
        settings=make_settings(site_url="https://tripsmith.vercel.app", owner_notify_email="o@x.io"),
    )
    assert url in owner.text


def test_contact_enquiry_email_has_no_pdf_line() -> None:
    contact = ctx(
        type="contact",
        package_slug=None,
        package_name=None,
        package_nights=None,
        package_days=None,
    )
    msg = render_visitor(contact, settings=make_settings())
    assert "itinerary.pdf" not in msg.html and "PDF" not in msg.text
```

Append to `api/tests/test_enquiries.py` (add `from app.services.pdf.service import PdfService` and `from tests.test_pdf_service import FakeBlobStore, cover_transport`):

```python
def with_pdf(db_app: FastAPI, store: FakeBlobStore | None) -> FakeBlobStore | None:
    db_app.state.pdf = PdfService(store, db_app.state.settings, transport=cover_transport())  # type: ignore[arg-type]
    return store


@pytest.mark.db
async def test_submit_attaches_the_itinerary_pdf_to_the_visitor_email(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    store = with_pdf(db_app, FakeBlobStore())
    assert store is not None
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    visitor = next(m for m in sender.sent if m.to == "priya@example.com")
    owner = next(m for m in sender.sent if m.to == "owner@example.com")
    assert len(visitor.attachments) == 1
    assert visitor.attachments[0].filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert visitor.attachments[0].content.startswith(b"%PDF-")
    assert owner.attachments == ()
    assert "/api/packages/north-goa-beaches/itinerary.pdf" in visitor.html
    assert len(store.objects) == 1  # the cache is warm for the emailed link


@pytest.mark.db
async def test_contact_enquiry_sends_no_attachment(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    store = with_pdf(db_app, FakeBlobStore())
    assert store is not None
    res = await db_client.post(
        "/enquiries", json={**BODY, "type": "contact", "packageSlug": None, "travelMonth": None}
    )
    assert res.status_code == 201
    assert all(m.attachments == () for m in sender.sent)
    assert store.objects == {}


@pytest.mark.db
async def test_pdf_failure_keeps_the_201_and_the_emails(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    with_pdf(db_app, FakeBlobStore())

    def boom(*a: object, **k: object) -> bytes:
        raise RuntimeError("fpdf exploded")

    monkeypatch.setattr("app.services.pdf.service.render_itinerary", boom)
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201 and res.json()["emailed"] is True
    assert len(sender.sent) == 2 and all(m.attachments == () for m in sender.sent)
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.email_status == EmailStatus.SENT
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_email_send.py tests/test_email_render.py tests/test_enquiries.py -q`
Expected: FAIL — `TypeError: send_enquiry_emails() got an unexpected keyword argument 'attachment'`, missing `pdf_url`, no attachments on the route.

- [ ] **Step 3: Implement**

`api/app/services/email/send.py` — signature and the visitor branch:

```python
async def send_enquiry_emails(
    sender: EmailSender,
    settings: Settings,
    ctx: EnquiryEmailContext,
    *,
    attachment: EmailAttachment | None = None,
) -> EmailOutcome:
    try:
        owner = render_owner(ctx, settings=settings) if settings.owner_notify_email else None
        visitor: EmailMessage | None = render_visitor(ctx, settings=settings)
        if attachment is not None and visitor is not None:
            visitor = replace(visitor, attachments=(attachment,))  # the owner gets a link instead
        visitor_is_real = True
        …
```

(add `EmailAttachment` to the `app.infra.email` import; the rest of the function is unchanged — the test-mode `replace` keeps `attachments`).

`api/app/services/email/render.py` — in `_common`, after `package_url`:

```python
        "pdf_url": f"{site}/api/packages/{ctx.package_slug}/itinerary.pdf" if ctx.package_slug else None,
```

Templates. `enquiry_visitor.html`, right after the "We have your enquiry about …" paragraph inside the `{% if e.package_name %}` branch:

```html
{% if pdf_url %}
<p style="margin:0 0 16px;">Your day-by-day itinerary is attached as a PDF — forward it to whoever is travelling with you. You can also <a href="{{ pdf_url }}" style="color:#1b4fd8;font-weight:700;">download it again</a> any time.</p>
{% endif %}
```

`enquiry_visitor.txt`, after the `{{ package_url }}` line inside the same branch:

```
{% if pdf_url %}
Your day-by-day itinerary is attached as a PDF. Download it again any time: {{ pdf_url }}
{% endif %}
```

`enquiry_owner.html` and `.txt`: where the package link is printed, add a second line `Itinerary PDF: {{ pdf_url }}` (html: `<a href="{{ pdf_url }}">Itinerary PDF</a>`) inside `{% if pdf_url %}…{% endif %}`.

`api/app/services/enquiries.py`:

```python
from app.services.pdf.service import PdfService
…
async def submit_enquiry(
    db: AsyncSession,
    payload: EnquiryCreate,
    *,
    ip: str,
    user_agent: str | None,
    now: dt.datetime | None = None,
    sender: EmailSender | None = None,
    settings: Settings | None = None,
    pdf: PdfService | None = None,
) -> EnquiryCreated:
```

and replace the email block after the `for … else` with:

```python
    outcome = EmailOutcome(EmailStatus.SKIPPED, False)
    if sender is not None and settings is not None:
        # After the commit: the lead is safe whatever the renderer or Blob do (R6 attaches only
        # when a package is on the enquiry; `attachment_for` never raises).
        attachment = await pdf.attachment_for(db, facts.slug) if pdf and facts else None
        outcome = await send_enquiry_emails(sender, settings, ctx, attachment=attachment)
        …
```

Update the module docstring's "The PDF attaches in F11" to "the visitor copy carries the itinerary PDF (services/pdf)". In `api/app/routers/site/enquiries.py` pass `pdf=state.pdf` to `submit_enquiry`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run --directory api pytest -q -p no:cacheprovider && uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: whole suite green (existing email tests unchanged: `attachments == ()` by default), clean.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/email api/app/services/enquiries.py api/app/routers/site/enquiries.py api/tests/test_email_send.py api/tests/test_email_render.py api/tests/test_enquiries.py
git commit -m "feat(F11): attach the itinerary PDF to the visitor confirmation email"
```

---

### Task 8: `GET /cron/pdf-gc` + schedule

**Files:**
- Create: `api/app/routers/cron/__init__.py` (`require_cron` dependency)
- Create: `api/app/routers/cron/pdf_gc.py`
- Modify: `api/app/main.py` (include), `api/vercel.json` (crons)
- Test: `api/tests/test_cron_pdf_gc.py`

**Interfaces:**
- Consumes: `PdfService.gc(db) -> GcReport` (Task 5); `settings.cron_secret`.
- Produces: `require_cron(request) -> None` (401 `unauthorized` unless `Authorization: Bearer <CRON_SECRET>`, constant-time compare; 401 also when the secret is unset); `GET /cron/pdf-gc` → `GcReport`, `include_in_schema=False`, `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing tests**

```python
# api/tests/test_cron_pdf_gc.py
"""GET /cron/pdf-gc — bearer CRON_SECRET (06 §Auth), deletes stale itinerary PDFs."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_pdf_service import FakeBlobStore

AUTH = {"Authorization": "Bearer s3cret"}


def configured(db_app: FastAPI, store: FakeBlobStore | None) -> FakeBlobStore | None:
    settings = make_settings(cron_secret="s3cret")
    db_app.state.settings = settings
    db_app.state.pdf = PdfService(store, settings)  # type: ignore[arg-type]
    return store


@pytest.mark.db
async def test_gc_deletes_stale_objects_and_reports(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = configured(db_app, FakeBlobStore())
    assert store is not None
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"stale"

    res = await db_client.get("/cron/pdf-gc", headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    assert res.json() == {"deleted": 1, "kept": 0, "configured": True}
    assert store.objects == {}


@pytest.mark.db
async def test_gc_rejects_a_missing_or_wrong_bearer(db_app: FastAPI, db_client: AsyncClient) -> None:
    configured(db_app, FakeBlobStore())
    for headers in ({}, {"Authorization": "Bearer nope"}, {"Authorization": "Basic s3cret"}):
        res = await db_client.get("/cron/pdf-gc", headers=headers)
        assert res.status_code == 401, headers
        assert res.json()["error"]["code"] == "unauthorized"


@pytest.mark.db
async def test_gc_is_401_when_no_secret_is_configured(db_app: FastAPI, db_client: AsyncClient) -> None:
    db_app.state.settings = make_settings()
    res = await db_client.get("/cron/pdf-gc", headers=AUTH)
    assert res.status_code == 401


@pytest.mark.db
async def test_gc_without_a_store_is_a_no_op(db_app: FastAPI, db_client: AsyncClient) -> None:
    configured(db_app, None)
    res = await db_client.get("/cron/pdf-gc", headers=AUTH)
    assert res.status_code == 200
    assert res.json() == {"deleted": 0, "kept": 0, "configured": False}


@pytest.mark.db
async def test_blob_failure_is_a_500_so_the_cron_log_shows_it(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    configured(db_app, FakeBlobStore(fail=True))
    res = await db_client.get("/cron/pdf-gc", headers=AUTH)
    assert res.status_code == 500
    assert res.json()["error"]["code"] == "internal"


def test_cron_route_is_not_in_the_public_contract(app: FastAPI) -> None:
    assert "/cron/pdf-gc" not in app.openapi()["paths"]


def test_vercel_json_schedules_the_gc_weekly() -> None:
    import json
    from pathlib import Path

    cfg = json.loads((Path(__file__).resolve().parents[1] / "vercel.json").read_text())
    assert {"path": "/cron/pdf-gc", "schedule": "0 3 * * 0"} in cfg["crons"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_cron_pdf_gc.py -q`
Expected: FAIL — 404s (no route), `KeyError: 'crons'`.

- [ ] **Step 3: Implement**

```python
# api/app/routers/cron/__init__.py
"""Cron endpoints (05 §crons): Vercel calls them on the schedule in api/vercel.json with
`Authorization: Bearer $CRON_SECRET` — set automatically when the env var exists on the
project. Never in the public OpenAPI contract."""

import secrets

from fastapi import Request

from app.errors import ApiError


async def require_cron(request: Request) -> None:
    settings = request.app.state.settings
    expected = settings.cron_secret.get_secret_value() if settings.cron_secret else None
    given = request.headers.get("authorization", "")
    scheme, _, token = given.partition(" ")
    if not expected or scheme.lower() != "bearer" or not secrets.compare_digest(token, expected):
        raise ApiError("unauthorized", "Cron secret missing or wrong")
```

```python
# api/app/routers/cron/pdf_gc.py
"""GET /cron/pdf-gc — weekly: delete itinerary PDFs whose `updated_at` key is no longer
current (04 §5). Blob errors surface as a 500 so Vercel's cron log shows the failure."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.pdf import GcReport
from app.services.pdf.service import PdfService

router = APIRouter(
    tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False
)


@router.get("/cron/pdf-gc", operation_id="pdfGc")
async def pdf_gc(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> GcReport:
    response.headers["Cache-Control"] = "no-store"
    service: PdfService = request.app.state.pdf
    return await service.gc(db)
```

`api/app/main.py`: `from app.routers.cron import pdf_gc` and `app.include_router(pdf_gc.router)` after the site routers. `api/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "app/main.py": {
      "maxDuration": 30
    }
  },
  "regions": ["bom1"],
  "crons": [{ "path": "/cron/pdf-gc", "schedule": "0 3 * * 0" }]
}
```

The unhandled-exception handler in `app/errors.py` already renders `{"error": {"code": "internal", …}}` for a raised `httpx.ConnectError` (conftest's `raise_app_exceptions=False`); if the 500 test sees a different code, check `install_error_handlers` and adjust the assertion to what the envelope really says — do not swallow the error in the route.

- [ ] **Step 4: Run the tests, regenerate the contract (must be a no-op)**

Run: `uv run --directory api pytest tests/test_cron_pdf_gc.py -q && pnpm gen:api && git diff --stat -- api/openapi.json web/src/lib/api-types.ts`
Expected: PASS; empty diff (the cron route is out of schema).

- [ ] **Step 5: Confirm `CRON_SECRET` exists on the api project**

Run: `vercel env ls tripsmith-api production` (from `api/`, or `--cwd api`).
Expected: `CRON_SECRET` listed for Production. If missing, add it from `api/.env.local`: `printf '%s' "$VALUE" | vercel env add CRON_SECRET production --force` (per the CLI gotchas — values via stdin, `--force` to overwrite). Note the result in the PR body.

- [ ] **Step 6: Lint, type-check, commit**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`

```bash
git add api/app/routers/cron api/app/main.py api/vercel.json api/tests/test_cron_pdf_gc.py
git commit -m "feat(F11): GET /cron/pdf-gc — weekly Blob GC of stale itinerary PDFs"
```

---

### Task 9: Web — "Download itinerary (PDF)" links

**Files:**
- Create: `web/src/lib/pdf.ts`
- Create: `web/src/components/site/ItineraryPdfLink.tsx`
- Modify: `web/src/components/site/package/PriceBox.tsx`, `web/src/components/site/package/Section.tsx`, `web/src/app/(site)/packages/[slug]/page.tsx`, `web/src/components/site/enquiry/PackageSummary.tsx`, `web/src/app/(site)/enquiry/thanks/page.tsx`, `web/src/components/site/home/WhyUs.tsx`
- Test: `web/tests/pdf.test.ts`

**Interfaces:**
- Produces: `itineraryPdfHref(slug: string): string` = `/api/packages/${encodeURIComponent(slug)}/itinerary.pdf`; `<ItineraryPdfLink slug variant="button" | "link" className? />`.

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/pdf.test.ts
import { describe, expect, it } from 'vitest';
import { itineraryPdfHref } from '@/lib/pdf';

describe('itineraryPdfHref', () => {
  it('points at the api through the /api rewrite', () => {
    expect(itineraryPdfHref('north-goa-beaches')).toBe(
      '/api/packages/north-goa-beaches/itinerary.pdf',
    );
  });
  it('encodes the slug', () => {
    expect(itineraryPdfHref('a b/c')).toBe('/api/packages/a%20b%2Fc/itinerary.pdf');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- pdf`
Expected: FAIL — cannot resolve `@/lib/pdf`.

- [ ] **Step 3: Implement the helper, the component and the four placements**

```ts
// web/src/lib/pdf.ts
/**
 * The api's itinerary route, reached through the web's `/api` rewrite so the link is first-party
 * and stable (the api 302s to the current Blob copy). Mirrored by `pdf_url` in the emails.
 */
export const itineraryPdfHref = (slug: string) =>
  `/api/packages/${encodeURIComponent(slug)}/itinerary.pdf`;
```

```tsx
// web/src/components/site/ItineraryPdfLink.tsx
import { File } from '@/components/site/home/icons';
import { itineraryPdfHref } from '@/lib/pdf';

const STYLES = {
  button:
    'inline-flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-line px-5 py-2.5 font-bold text-ink no-underline transition-colors hover:border-ink',
  link: 'inline-flex items-center gap-1.5 text-sm font-bold text-primary no-underline hover:underline',
} as const;

/** R6: a plain `<a>` to the api (F11) — opens the PDF in a new tab; the browser saves it from there. */
export function ItineraryPdfLink({
  slug,
  variant = 'link',
  className = '',
  label = 'Download itinerary (PDF)',
}: {
  slug: string;
  variant?: keyof typeof STYLES;
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={itineraryPdfHref(slug)}
      target="_blank"
      rel="noopener"
      className={`${STYLES[variant]} ${className}`.trim()}
    >
      <File className={variant === 'button' ? 'size-4.5 text-primary' : 'size-4'} />
      {label}
    </a>
  );
}
```

`PriceBox.tsx`: import `ItineraryPdfLink` from `'../ItineraryPdfLink'`; directly after the Enquire `<Link>` add `<ItineraryPdfLink slug={pkg.slug} variant="button" />`; update the doc comment to "Enquire (F9), PDF (F11). WhatsApp joins in F12."

`Section.tsx`: add an optional `action?: ReactNode` prop; when `title` is set render

```tsx
<div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
  <h2 id={`${id}-title`} className="text-[clamp(24px,2.8vw,30px)]">{title}</h2>
  {action}
</div>
```

(the `h2` loses its own `mb-4`). Package page: `<Section id="itinerary" title="Day by day" action={<ItineraryPdfLink slug={pkg.slug} />}>` — this is the link phones see (the price box is `lg:` only until F12's CTA bar).

`PackageSummary.tsx`: after the `<dl>`, `<ItineraryPdfLink slug={pkg.slug} className="mt-1" />`; update its doc comment ("The PDF button joins in F11" → "PDF link (F11)").

Thanks page: in the button row, before "Back to {pkgName}":

```tsx
{pkgSlug && pkgName && (
  <ItineraryPdfLink slug={pkgSlug} variant="button" label="Itinerary (PDF)" />
)}
```

and the emailed sentence becomes `We’ve also emailed this to you{pkgName ? ', with the itinerary attached as a PDF' : ''} — check spam if it isn’t there in a minute.`

`WhyUs.tsx`: the third point's text → `'Day-by-day plans written out in full, as a PDF you can send to the family group and decide together.'`; fix the stale comment to `// The mockup's four points; the PDF shipped in F11.`

- [ ] **Step 4: Verify in the browser that the rewrite passes the 302 through**

Start the local stack (background calls; dev DB from earlier rows or create `tripsmith_dev` as in the F10 plan): `DATABASE_URL=$DEV_URL uv run --directory api uvicorn app.main:app --port 8004` and from `web/`: `API_URL=http://localhost:8004 pnpm exec next dev -p 3003`. Then:

`curl -s -o /dev/null -D - http://localhost:3003/api/packages/north-goa-beaches/itinerary.pdf | head -5`
Expected (dev has `BLOB_READ_WRITE_TOKEN` in `api/.env.local`, so Blob is live): `HTTP/1.1 302` with `location: https://….public.blob.vercel-storage.com/pdf/north-goa-beaches/…/Tripsmith-north-goa-beaches-itinerary.pdf`. Open that URL: the PDF renders inline with the seed cover. If instead the web returns `200 application/pdf` (Next followed the redirect), that is also acceptable behaviour — note it in the PR. If it returns an HTML error page, switch `ItineraryPdfLink` to `${process.env.API_URL ?? 'http://localhost:8000'}/packages/…` (server component; keep the `/api` form for emails) and record the reason in the PR.

Open `http://localhost:3003/packages/north-goa-beaches` at 360 px and desktop: the "Day by day" header shows the link on both; the price box shows the button on desktop; `/packages/north-goa-beaches/enquire` shows the link under the summary. Stop the servers.

- [ ] **Step 5: Lint, typecheck, test, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm format:check`
Expected: clean, 91 tests (89 + 2).

```bash
git add web/src/lib/pdf.ts web/src/components/site/ItineraryPdfLink.tsx web/src/components/site/package/PriceBox.tsx web/src/components/site/package/Section.tsx "web/src/app/(site)/packages/[slug]/page.tsx" web/src/components/site/enquiry/PackageSummary.tsx "web/src/app/(site)/enquiry/thanks/page.tsx" web/src/components/site/home/WhyUs.tsx web/tests/pdf.test.ts
git commit -m "feat(F11): itinerary PDF links — price box, day-by-day, enquiry summary, thanks"
```

---

### Task 10: Docs, local end-to-end, PR, prod verification

**Files:**
- Modify: `docs/04-technical-design.md` §5 (pathname scheme, streamed fallback, list-based lookup), `docs/07-plan.md` (F11 row → ✅ + PR link), `docs/05-architecture.md` only if the tree drifted (it already lists `pdf.py`, `cron/pdf_gc.py`, `services/pdf/`, `assets/fonts/`).

- [ ] **Step 1: Docs**

04 §5 first bullet becomes: "api `GET /packages/:slug/itinerary.pdf`: look up the live package + `updated_at`; pathname `pdf/{slug}/{updated_at_epoch}/Tripsmith-{slug}-itinerary.pdf` (the basename is the download filename). Blob `list(prefix=pdf/{slug}/)` finds the current object → 302; else `render_itinerary` (fpdf2) → put → 302. No store (dev/CI) or Blob down → the bytes are streamed inline. Old versions are garbage-collected weekly (`GET /cron/pdf-gc`, api `vercel.json`, bearer `CRON_SECRET`)." Add to the second bullet: "`services/pdf/service.py` (`PdfService` on `app.state.pdf`) owns the cover fetch, the cache and the attachment; the renderer is pure." 07-plan: F11 status ✅, add `(PR #29)` — use the real number after Step 4.

- [ ] **Step 2: Full verification**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build
```

Expected: all green (api ≈ 193 + ~30 new; web 91). Paste the summary lines into the PR body. Delete `.pdf-preview.pdf` if it exists.

- [ ] **Step 3: Local end-to-end with the real Resend key (test mode) and real Blob**

With the servers from Task 9 Step 4 running (api 8004 with the dev DB, web 3003):

```bash
curl -s -X POST localhost:8004/enquiries -H 'Content-Type: application/json' -d '{"type":"standard","packageSlug":"north-goa-beaches","name":"Test Visitor","phone":"9845022110","email":"someone.else@example.com","travelMonth":"2026-11","adults":2,"children":0,"website":""}'
```

Expected: `201 {"ref":"TS-…", …,"emailed":false}` in well under 5 s; in virajdomadia32@gmail.com (personal account — see memory `no-zapigo-gmail`): "[Test → someone.else@example.com] Your Tripsmith enquiry …" **with `Tripsmith-north-goa-beaches-itinerary.pdf` attached** and the "attached as a PDF" sentence + link; the owner email carries the "Itinerary PDF" link. Then `curl -s -H "Authorization: Bearer $CRON_SECRET" localhost:8004/cron/pdf-gc` → `{"deleted":0,"kept":N,"configured":true}` (N ≥ 1). Stop the servers.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/f11-itinerary-pdf
gh pr create --title "feat(F11): itinerary PDF — route, email attachment, weekly GC" --body "$(cat <<'EOF'
## F11 Itinerary PDF (docs/07-plan.md row F11, R6)

- `services/pdf/`: `Document` base (fpdf2, DM Sans, brand palette, header/footer), `render_itinerary` (cover, facts, highlights, day by day, inclusions, hotels, dates & prices, occupancy, FAQ, contact block), `PdfService` (cover fetch, Blob cache keyed by `updated_at`, attachment, GC)
- `GET /packages/{slug}/itinerary.pdf`: 302 to the Blob copy (rendered on first request), streamed inline without a store / when Blob is down, 404 for drafts
- Visitor confirmation email carries the PDF; owner email links it
- `GET /cron/pdf-gc` (bearer `CRON_SECRET`), scheduled weekly in `api/vercel.json`
- web: `ItineraryPdfLink` on the price box, "Day by day" header, enquiry summary, thanks page
- Docs: 04 §5 pathname scheme + fallback

## Verification
<paste pnpm lint / typecheck / test summaries>
Local e2e: enquiry TS-… → visitor email with the attachment; `/api/packages/north-goa-beaches/itinerary.pdf` → 302 → Blob PDF; `/cron/pdf-gc` → {…}
`vercel env ls tripsmith-api production`: CRON_SECRET present

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Put the PR number into the 07-plan row, commit `docs(F11): mark the row done`, push.

- [ ] **Step 5: After the squash-merge — prod verification (previews are SSO-gated)**

Wait for both deploys (`vercel ls tripsmith-api`, `vercel ls tripsmith-web`; prod deploys have queued for ~20 min before). Then:

1. `curl -s -o /dev/null -D - https://<web prod>/api/packages/north-goa-beaches/itinerary.pdf` → `302` to `*.public.blob.vercel-storage.com/pdf/north-goa-beaches/…` (first hit renders; second hit is instant). Open the Blob URL: fonts embedded (₹ renders — proves `api/assets/fonts` made it into the Python bundle; if it 500s with `FileNotFoundError` on the TTF, the bundle dropped `assets/` — move the fonts under `app/assets/fonts/` and fix `FONTS_DIR` to `parents[2] / "assets" / "fonts"`).
2. Vercel dashboard → tripsmith-api → Settings → Cron Jobs lists `/cron/pdf-gc` weekly. Trigger it once from the dashboard ("Run") or `curl -H "Authorization: Bearer $CRON_SECRET" https://<api prod>/cron/pdf-gc` → `{"deleted":0,"kept":1,"configured":true}`.
3. Submit one real enquiry from the prod package page; the confirmation in the inbox carries the PDF. Record the ref in the memory update.
4. If the web was prerendered against the old api (baked 404s on the new links are impossible here — plain `<a>` hrefs — but check the package page renders the link), `vercel redeploy` the web deployment per the deploy-race memory.

---

## Self-review

- **Spec coverage:** R6 download link on every live package page (Task 9: day-by-day header on all sizes + price box + summary + thanks) ✓; attached to the confirmation email when a package is attached (Task 7) ✓; generated from package data — cover, quick facts, day-by-day, inclusions/exclusions, hotels, upcoming departures with prices, occupancy pricing, contact block (Task 3) ✓; cached per package, invalidated on edit (`updated_at` key, Tasks 3/5/6) ✓; A4 / < 2 MB / < 3 s asserted (Task 3) ✓; content matches the page (Task 3 text-extraction test) ✓; `GET /cron/pdf-gc` + `vercel.json` (Task 8) ✓; 04 §5's Blob-cached route + fpdf2 + DM Sans in `api/assets/fonts` (Tasks 2/6) ✓; 06 "PDF; two emails" (Task 7) ✓; the 07 row's `Document` base for the v2 voucher (Task 2) ✓.
- **Placeholders:** none — every step carries code or the exact command and expected output. Task 7's tests use the existing `ctx(**over)` helper from `tests/test_email_render.py` (verified: it overrides any `EnquiryEmailContext` field).
- **Type consistency:** `render_itinerary(pkg, *, cover, gallery=(), site_url, whatsapp_number)` (T3) is what `PdfService.build` calls (T5) and what `monkeypatch.setattr("app.services.pdf.service.render_itinerary", …)` patches (T5/T7 — the service imports the name, so patching the service module is right). `PdfService(store, settings, *, transport)` matches every test's construction. `pdf_pathname(slug, updated_at)` / `pdf_prefix` / `pdf_filename` / `PDF_PREFIX` names are the same in T3, T5, T6, T8. `BlobStore.list(prefix) -> list[BlobInfo]`, `delete(urls)` match `FakeBlobStore`. `send_enquiry_emails(..., attachment=)` matches T7's call. `GcReport(deleted, kept, configured)` matches T5's return and T8's JSON. `Document.font(size, weight, color)` is used with `"SB"`/`"XB"` in T3 and defined in T2; every `Document` helper T3 calls (`heading`, `h2(keep=)`, `label(w=, new_line=)`, `lines_of`, `check`, `cross`, `star`, `pill`, `button`, `brand_mark`, `wordmark`, `card`, `hairline`) is defined in T2 with the same signature — the two modules were run together as a prototype (14 tests green) before being pasted here.
