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
- Unicode only through the registered DM Sans TTFs (₹ U+20B9, en dash, `·`, `•` are all in the font; **never** `Helvetica`/core fonts — they are Latin-1 and would drop ₹). No glyphs outside DM Sans (no ✓ ★ emoji): stars are "4-star", checks are drawn dots.
- Palette = the web tokens: ink `#14202a`, ink2 `#3b4148`, mute `#5e6b76`, line `#e3e8ec`, bg2 `#f3f6fc`, primary `#1b4fd8`, primary-soft `#e8eeff`, action `#f2a93b`, ok `#1f7a4d`, warn `#b5541e`. Money = `inr()` Indian grouping in whole rupees (paise // 100). Dates = `Fri 18 Dec 2026` (web `formatDate`). Copy: short, concrete, Indian English; business facts from `app/business.py`.
- Blob objects are public (marketing material, 06 §Storage). Pathname `pdf/{slug}/{updated_at_epoch}/Tripsmith-{slug}-itinerary.pdf` (the basename is the download filename; the prefix `pdf/{slug}/` scopes lookups, `pdf/` scopes the GC). **Amends 04 §5's `pdf/{slug}-{epoch}.pdf`** — Task 10 updates the doc.
- Nothing the PDF or Blob does may turn a saved enquiry into a non-201, or a package download into a 5xx: the route falls back to streaming the bytes; the email goes out without the attachment; failures log + Sentry.
- Secrets never logged; the Blob token travels only in the `Authorization` header. No new env vars (`BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `SITE_URL`, `WHATSAPP_NUMBER` exist).

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| Renderer | fpdf2 2.8.x, A4 portrait, mm units, margins 18 mm, auto page break 22 mm. Fonts `DMSans` regular / `B` bold / `SB` semibold (fpdf2 style keys: `""`, `"B"`, and a second family `DMSansSB` for semibold, since fpdf2 styles are only `B`/`I`). Prototype (2026-09-21): 3 pages with a 1400 px cover + 30-row table = 186 KB in 0.6 s including font load. |
| Cover photo | `PackageDetail.cover.url` fetched with httpx (5 s timeout, ≤ 6 MB, `image/*` only) → Pillow `ImageOps.fit` to 1400×800 (the 210×120 mm band's ratio) → JPEG q80 → `pdf.image`. Fetch failure or no cover → a primary-soft band with the wordmark. The renderer itself never does I/O: it takes `cover: bytes \| None`. |
| Page plan | p1: cover band, "ITINERARY" chip, name, destination · duration · departure city, summary, from-price, 4 fact boxes (Duration / Departure city / Next departure / From), highlights. p2+: Day by day (numbered days, meals · stay line), What's in the price (included ● ok-green dots, not included – mute dashes), Where you stay (table), Dates & prices (table + occupancy boxes + "prices vary" note), Good to know (FAQ, only if any), Book this trip (contact block: call, WhatsApp prefilled, enquire URL, package URL, hours, legal name + address). Header from p2 (wordmark left, `Itinerary · {name}` right, rule); footer on every page (rule, contact line, `Page x of {nb}`). |
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

The fonts are already downloaded into `api/assets/fonts/` (untracked): `DMSans-Regular.ttf`, `DMSans-SemiBold.ttf`, `DMSans-Bold.ttf` — 48 KB static instances from Google Fonts (`fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700`, fetched with a non-woff2 User-Agent; no `fvar` table; cmap has U+20B9 ₹, U+2013, U+00B7, U+2022). If missing, re-fetch the same way. Licence: SIL OFL 1.1 — Task 2 adds `assets/fonts/OFL.txt`.

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
- Produces: `inr(rupees: int) -> str`, `long_date(d: dt.date) -> str` (`Fri 18 Dec 2026`), `duration(nights: int, days: int) -> str` (`3 nights / 4 days`, `1 night / 2 days`), `meals_label(breakfast: bool, lunch: bool, dinner: bool) -> str` (`Breakfast · Dinner`, `No meals`), `seats_label(seats_left: int) -> str` (`6 seats`, `1 seat`, `Sold out`).

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


def test_duration_pluralises() -> None:
    assert duration(3, 4) == "3 nights / 4 days"
    assert duration(1, 2) == "1 night / 2 days"


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
    return f"{nights} night{'s' if nights != 1 else ''} / {days} day{'s' if days != 1 else ''}"


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
- Create: `api/assets/fonts/OFL.txt` (the SIL OFL 1.1 text — copy from https://openfontlicense.org/open-font-license-official-text/ with the copyright line `Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)`)
- Modify: `api/pyproject.toml` (`fpdf2>=2.8.8` runtime; `pypdf` dev)
- Test: `api/tests/test_pdf_document.py`

**Interfaces:**
- Produces: `Document(title: str, running_title: str)` — an `FPDF` subclass with `add_page()` chrome, and helpers used by Task 3: `font(size, style="", color=INK)`, `h1(text)`, `h2(text)`, `label(text)`, `para(text, *, size=10.5, color=INK2, w=0, line=5.6)`, `dotted(items, color)`, `ensure(height_mm)`, `gap(mm)`, `box(x, y, w, h, fill=BG2, stroke=LINE, radius=3)`; palette constants `INK, INK2, MUTE, LINE, BG2, PRIMARY, PRIMARY_SOFT, ACTION, OK, WARN, WHITE`; `FONT = "DMSans"`, `FONT_SB = "DMSansSB"`, `MARGIN = 18`, `FONTS_DIR`.

- [ ] **Step 1: Add the dependencies**

Run: `uv add --directory api "fpdf2>=2.8.8" && uv add --directory api --group dev pypdf`
Expected: `uv.lock` and `pyproject.toml` updated (`fpdf2` under `dependencies`, `pypdf` under `[dependency-groups].dev`). `uv run --directory api python -c "import fpdf, pypdf; print(fpdf.__version__)"` prints `2.8.8` or newer.

- [ ] **Step 2: Write the failing tests**

```python
# api/tests/test_pdf_document.py
"""services/pdf/document.py — page chrome, fonts and the glyphs the itinerary needs."""

import io

from pypdf import PdfReader

from app.services.pdf.document import FONTS_DIR, Document


def _text(pdf_bytes: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [page.extract_text() for page in reader.pages]


def test_fonts_are_bundled() -> None:
    for name in ("DMSans-Regular.ttf", "DMSans-SemiBold.ttf", "DMSans-Bold.ttf"):
        assert (FONTS_DIR / name).is_file(), name
    assert (FONTS_DIR / "OFL.txt").is_file()


def test_document_is_a4_with_header_from_page_two_and_a_footer_on_every_page() -> None:
    doc = Document(title="North Goa Beaches — itinerary", running_title="North Goa Beaches")
    doc.add_page()
    doc.h1("North Goa Beaches")
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
    assert "Itinerary · North Goa Beaches" in p2
    assert "Tripsmith Holidays" in p1 and "Tripsmith Holidays" in p2  # footer contact line


def test_ensure_breaks_the_page_when_the_block_would_not_fit() -> None:
    doc = Document(title="t", running_title="t")
    doc.add_page()
    doc.set_y(doc.h - doc.b_margin - 10)
    doc.ensure(30)
    assert doc.page_no() == 2
    assert doc.get_y() == doc.t_margin
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
"""`Document`: the A4 page chrome every Tripsmith PDF shares — DM Sans, the web's palette, a
running header from page 2, a footer with the contact line and page numbers, and small text
helpers. Pure fpdf2; no I/O beyond reading the bundled fonts.

Only the registered TTFs may be used: the core fonts are Latin-1 and would drop ₹ and dashes.
"""

from collections.abc import Iterable
from pathlib import Path

from fpdf import FPDF, XPos, YPos

from app.business import BUSINESS

FONTS_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"
FONT = "DMSans"
FONT_SB = "DMSansSB"  # fpdf2 styles are only B/I, so semibold is its own family
MARGIN = 18.0
FOOTER_HEIGHT = 16.0

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
WARN: RGB = (0xB5, 0x54, 0x1E)
WHITE: RGB = (0xFF, 0xFF, 0xFF)


class Document(FPDF):
    def __init__(self, *, title: str, running_title: str) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self.running_title = running_title
        self.add_font(FONT, "", FONTS_DIR / "DMSans-Regular.ttf")
        self.add_font(FONT, "B", FONTS_DIR / "DMSans-Bold.ttf")
        self.add_font(FONT_SB, "", FONTS_DIR / "DMSans-SemiBold.ttf")
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(True, margin=FOOTER_HEIGHT + 6)
        self.alias_nb_pages()
        self.set_title(title)
        self.set_author(BUSINESS["name"])
        self.set_creator(BUSINESS["name"])
        self.set_lang("en-IN")
        self.font(10.5)

    # --- chrome (fpdf2 calls these itself) -----------------------------------------------------

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_y(8)
        self.font(9, "B", PRIMARY)
        self.cell(0, 6, BUSINESS["name"], new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.font(9, "", MUTE)
        self.cell(0, 6, f"Itinerary · {self.running_title}", align="R")
        self.set_draw_color(*LINE)
        self.line(MARGIN, 14.5, self.w - MARGIN, 14.5)
        self.set_y(MARGIN)

    def footer(self) -> None:
        self.set_y(-FOOTER_HEIGHT)
        self.set_draw_color(*LINE)
        self.line(MARGIN, self.get_y(), self.w - MARGIN, self.get_y())
        self.set_y(self.get_y() + 2.5)
        self.font(8, "", MUTE)
        contact = (
            f"{BUSINESS['legal_name']} · {BUSINESS['phone_display']} · {BUSINESS['email']}"
        )
        self.cell(0, 5, contact, new_x=XPos.LMARGIN, new_y=YPos.TOP)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")

    # --- text helpers ----------------------------------------------------------------------------

    def font(self, size: float, style: str = "", color: RGB = INK) -> None:
        """Select DM Sans at `size` pt: style "" regular, "B" bold, "SB" semibold."""
        family, st = (FONT_SB, "") if style == "SB" else (FONT, style)
        self.set_font(family, st, size)
        self.set_text_color(*color)

    def h1(self, text: str) -> None:
        self.font(26, "B", INK)
        self.multi_cell(0, 11, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def h2(self, text: str) -> None:
        """Section heading with the marigold tick the web's section titles carry."""
        self.ensure(24)
        self.gap(4)
        y = self.get_y()
        self.set_fill_color(*ACTION)
        self.rect(MARGIN, y + 1.5, 6, 2.2, style="F")
        self.set_y(y + 5)
        self.font(17, "B", INK)
        self.cell(0, 9, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.gap(2)

    def label(self, text: str) -> None:
        """Small caps label (the web's `.label-caps`)."""
        self.font(7.5, "B", MUTE)
        self.set_char_spacing(0.4)
        self.cell(0, 4, text.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_char_spacing(0)

    def para(
        self, text: str, *, size: float = 10.5, color: RGB = INK2, w: float = 0, line: float = 5.6
    ) -> None:
        self.font(size, "", color)
        self.multi_cell(w, line, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def dotted(self, items: Iterable[str], color: RGB, *, dash: bool = False) -> None:
        """A list with a coloured dot (or a short dash) in the gutter — no bullet glyphs."""
        for item in items:
            self.ensure(8)
            y = self.get_y()
            self.set_fill_color(*color)
            if dash:
                self.rect(MARGIN + 0.6, y + 2.6, 2.6, 0.9, style="F")
            else:
                self.ellipse(MARGIN + 0.6, y + 1.7, 2.6, 2.6, style="F")
            self.set_xy(MARGIN + 6, y)
            self.font(10.5, "", INK2)
            self.multi_cell(self.epw - 6, 5.6, item, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_y(self.get_y() + 0.8)

    def ensure(self, height: float) -> None:
        """Start a new page if `height` mm would not fit above the footer."""
        if self.will_page_break(height):
            self.add_page()

    def gap(self, mm: float) -> None:
        self.set_y(self.get_y() + mm)

    def box(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        *,
        fill: RGB = BG2,
        stroke: RGB | None = LINE,
        radius: float = 3,
    ) -> None:
        self.set_fill_color(*fill)
        style = "F"
        if stroke is not None:
            self.set_draw_color(*stroke)
            style = "DF"
        self.rect(x, y, w, h, style=style, round_corners=True, corner_radius=radius)
```

Notes for the implementer: the helper is named `font(...)`, not `text(...)`, because `FPDF.text(x, y, txt)` is fpdf2's positioned-text primitive and must stay reachable. `set_char_spacing` exists in fpdf2 ≥ 2.7. fpdf2 2.8 accepts `text=` on `cell`/`multi_cell` (positional works too, as written).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run --directory api pytest tests/test_pdf_document.py -q && uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: 3 passed, clean. If pypdf's `extract_text` returns `Page 1 of 2` with odd spacing, compare on `" ".join(text.split())`.

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
- Produces: `render_itinerary(pkg: PackageDetail, *, cover: bytes | None, site_url: str, whatsapp_number: str) -> bytes`; `PDF_PREFIX = "pdf/"`; `pdf_prefix(slug) -> str`; `pdf_pathname(slug, updated_at: dt.datetime) -> str`; `pdf_filename(slug) -> str`; `COVER_SIZE = (1400, 800)`; `prepare_cover(data: bytes) -> bytes | None` (Pillow fit + JPEG; `None` if Pillow cannot open it).

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


def package(*, days: int = 7, departures: int = 12, faq: bool = True) -> PackageDetail:
    return PackageDetail(
        slug="north-goa-beaches",
        name="North Goa Beaches",
        summary="Four easy days between Calangute and Morjim — beach mornings, a spice farm, "
        "a Portuguese quarter walk and one sunset cruise, with the hotel a minute from the sand.",
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
        images=[ImageOut(url="https://blob.test/cover.jpg", alt="Agonda", width=1400, height=933)],
        cover=ImageOut(url="https://blob.test/cover.jpg", alt="Agonda", width=1400, height=933),
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
content matches the package page."""

import datetime as dt
import io
import time
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

from app.services.pdf.itinerary import (
    COVER_SIZE,
    PDF_PREFIX,
    pdf_filename,
    pdf_pathname,
    pdf_prefix,
    prepare_cover,
    render_itinerary,
)
from tests.pdf_fixture import UPDATED_AT, package

COVER_JPEG = Path(__file__).resolve().parents[1] / "content" / "photos" / "goa" / "agonda-sunset.jpg"
SITE = "https://tripsmith.vercel.app"


def _pages(pdf: bytes) -> list[str]:
    return [" ".join(p.extract_text().split()) for p in PdfReader(io.BytesIO(pdf)).pages]


def render(**kw: object) -> bytes:
    return render_itinerary(
        package(**kw),  # type: ignore[arg-type]
        cover=COVER_JPEG.read_bytes(),
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


def test_prepare_cover_crops_to_the_band_ratio_as_jpeg() -> None:
    out = prepare_cover(COVER_JPEG.read_bytes())
    assert out is not None
    im = Image.open(io.BytesIO(out))
    assert im.format == "JPEG" and im.size == COVER_SIZE
    assert prepare_cover(b"not an image") is None


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


def test_content_matches_the_page() -> None:
    pkg = package()
    text = " ".join(_pages(render()))
    assert pkg.name in text and "Goa" in text
    assert "6 nights / 7 days" in text and "Ex-Mumbai" in text
    assert "From ₹18,499" in text and "per person" in text
    assert pkg.summary[:40] in text
    for h in pkg.highlights:
        assert h in text
    for day in pkg.itinerary:
        assert day.title in text
    assert "Breakfast · Lunch" in text and "No meals" in text
    assert "Stay · Sea Breeze Resort, Calangute" in text
    for item in pkg.inclusions + pkg.exclusions:
        assert item in text
    assert "Sea Breeze Resort" in text and "Morjim Beach House" in text and "4-star" in text
    assert "Fri 6 Nov 2026" in text and "Sold out" in text and "3 seats" in text
    assert "Filling fast" in text and "Guaranteed departure" in text
    assert "Adult · double sharing" in text and "₹18,499 – ₹24,499" in text
    assert "Child 5–11" in text and "₹9,999" in text and "+ ₹6,500" in text
    assert "Is this okay for kids?" in text
    assert "+91 98450 12345" in text and "hello@tripsmith.in" in text
    assert f"{SITE}/packages/north-goa-beaches" in text
    assert f"{SITE}/packages/north-goa-beaches/enquire" in text


def test_without_cover_faq_or_departures() -> None:
    pdf = render_itinerary(
        package(departures=0, faq=False), cover=None, site_url=SITE, whatsapp_number="91"
    )
    text = " ".join(_pages(pdf))
    assert "No dates announced yet" in text and "Good to know" not in text
    assert "On request" in text  # from-price when starting_price_paise is 0
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run --directory api pytest tests/test_pdf_render.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.pdf.itinerary'`

- [ ] **Step 3: Write the renderer**

```python
# api/app/services/pdf/itinerary.py
"""`render_itinerary`: the package page as an A4 PDF (R6). Pure and synchronous — takes a
`PackageDetail` (the same object the page renders) and the cover photo's bytes; every network
step lives in services/pdf/service.py so this can be tested without I/O.

Blob pathnames: `pdf/{slug}/{updated_at epoch}/Tripsmith-{slug}-itinerary.pdf` — the basename
is the download filename, `pdf/{slug}/` scopes a package's versions, `pdf/` scopes the GC.
"""

import datetime as dt
import io
from collections.abc import Sequence

from fpdf import XPos, YPos
from fpdf.enums import TableBordersLayout, TableCellFillMode
from fpdf.fonts import FontFace
from PIL import Image, ImageOps, UnidentifiedImageError

from app.business import BUSINESS, whatsapp_href
from app.schemas.catalog import DepartureOut, PackageDetail
from app.schemas.meta import BADGE_LABELS
from app.services.format import duration, inr, long_date, meals_label, seats_label
from app.services.pdf.document import (
    ACTION,
    BG2,
    INK,
    INK2,
    LINE,
    MARGIN,
    MUTE,
    OK,
    PRIMARY,
    PRIMARY_SOFT,
    WHITE,
    Document,
)

PDF_PREFIX = "pdf/"
COVER_SIZE = (1400, 800)  # 210 × 120 mm band at ~170 dpi
COVER_BAND_MM = 120.0
MAX_DEPARTURE_ROWS = 24


def pdf_prefix(slug: str) -> str:
    return f"{PDF_PREFIX}{slug}/"


def pdf_filename(slug: str) -> str:
    return f"Tripsmith-{slug}-itinerary.pdf"


def pdf_pathname(slug: str, updated_at: dt.datetime) -> str:
    return f"{pdf_prefix(slug)}{int(updated_at.timestamp())}/{pdf_filename(slug)}"


def prepare_cover(data: bytes) -> bytes | None:
    """Centre-crop to the cover band's ratio and re-encode as a JPEG fpdf2 embeds as-is."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            rgb = ImageOps.fit(im.convert("RGB"), COVER_SIZE)
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    out = io.BytesIO()
    rgb.save(out, "JPEG", quality=80, optimize=True)
    return out.getvalue()


def _price_range(values: Sequence[int]) -> str:
    lo, hi = min(values) // 100, max(values) // 100
    return inr(lo) if lo == hi else f"{inr(lo)} – {inr(hi)}"


def _next_departure(departures: Sequence[DepartureOut]) -> DepartureOut | None:
    return next((d for d in departures if d.seats_left > 0), departures[0] if departures else None)


class _Itinerary:
    def __init__(
        self, pkg: PackageDetail, cover: bytes | None, site_url: str, whatsapp_number: str
    ) -> None:
        self.pkg = pkg
        self.cover = prepare_cover(cover) if cover else None
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
        self.cover_band()
        self.title_block()
        self.facts()
        self.highlights()
        self.days()
        self.price_lists()
        self.hotels()
        self.dates_and_prices()
        self.faq()
        self.contact()
        return bytes(d.output())

    # --- page 1 -----------------------------------------------------------------------------

    def cover_band(self) -> None:
        d = self.doc
        if self.cover:
            d.image(io.BytesIO(self.cover), x=0, y=0, w=d.w, h=COVER_BAND_MM)
        else:
            d.set_fill_color(*PRIMARY_SOFT)
            d.rect(0, 0, d.w, COVER_BAND_MM, style="F")
            d.set_xy(MARGIN, COVER_BAND_MM / 2 - 8)
            d.font(30, "B", PRIMARY)
            d.cell(0, 16, BUSINESS["name"])
        # "ITINERARY" chip, marigold, overlapping the band's lower edge.
        chip_w, chip_h = 34, 8
        d.box(MARGIN, COVER_BAND_MM - chip_h / 2, chip_w, chip_h, fill=ACTION, stroke=None, radius=4)
        d.set_xy(MARGIN, COVER_BAND_MM - chip_h / 2)
        d.font(8, "B", INK)
        d.set_char_spacing(0.6)
        d.cell(chip_w, chip_h, "ITINERARY", align="C")
        d.set_char_spacing(0)
        d.set_y(COVER_BAND_MM + 10)

    def title_block(self) -> None:
        d, p = self.doc, self.pkg
        d.h1(p.name)
        d.font(10.5, "SB", MUTE)
        meta = f"{p.destination.name} · {duration(p.nights, p.days)} · {p.departure_city}"
        d.cell(0, 6, meta, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        d.gap(3)
        d.para(p.summary, size=11, color=INK2, line=6)
        d.gap(3)
        d.font(15, "B", INK)
        price = inr(p.starting_price_paise // 100) if p.starting_price_paise else "On request"
        d.cell(0, 8, f"From {price}", new_x=XPos.RIGHT, new_y=YPos.TOP)
        d.font(10, "", MUTE)
        d.cell(0, 8, " per person, double sharing", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        d.gap(4)

    def facts(self) -> None:
        d, p = self.doc, self.pkg
        nxt = _next_departure(p.departures)
        cells = [
            ("Duration", duration(p.nights, p.days)),
            ("Departure city", p.departure_city),
            ("Next departure", long_date(nxt.date) if nxt else "To be announced"),
            (
                "From",
                inr(p.starting_price_paise // 100) if p.starting_price_paise else "On request",
            ),
        ]
        self._boxes(cells)

    def _boxes(self, cells: list[tuple[str, str]], *, cols: int = 4) -> None:
        d = self.doc
        gutter, h = 3.0, 17.0
        w = (d.epw - gutter * (cols - 1)) / cols
        d.ensure(h + 4)
        top = d.get_y()
        for i, (label, value) in enumerate(cells):
            x = MARGIN + i * (w + gutter)
            d.box(x, top, w, h)
            d.set_xy(x + 3.5, top + 3)
            d.font(7.5, "B", MUTE)
            d.set_char_spacing(0.4)
            d.cell(w - 7, 4, label.upper())
            d.set_char_spacing(0)
            d.set_xy(x + 3.5, top + 8)
            d.font(11, "B", INK)
            d.cell(w - 7, 6, value)
        d.set_y(top + h + 6)

    def highlights(self) -> None:
        if not self.pkg.highlights:
            return
        self.doc.label("Highlights")
        self.doc.gap(1.5)
        self.doc.dotted(self.pkg.highlights, ACTION)

    # --- page 2+ ----------------------------------------------------------------------------

    def days(self) -> None:
        d = self.doc
        d.add_page()
        d.h2("Day by day")
        for day in self.pkg.itinerary:
            d.ensure(30)
            y = d.get_y()
            d.box(MARGIN, y, 9, 9, fill=PRIMARY, stroke=None, radius=2.5)
            d.set_xy(MARGIN, y)
            d.font(10, "B", WHITE)
            d.cell(9, 9, str(day.day_no), align="C")
            d.set_xy(MARGIN + 13, y)
            d.font(13, "B", INK)
            d.multi_cell(d.epw - 13, 9, day.title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            d.set_x(MARGIN + 13)
            d.para(day.description, w=d.epw - 13)
            line = meals_label(day.meals.breakfast, day.meals.lunch, day.meals.dinner)
            if day.stay:
                line += f"   ·   Stay · {day.stay}"
            d.set_x(MARGIN + 13)
            d.font(8.5, "B", MUTE)
            d.cell(d.epw - 13, 5, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            d.gap(3)
            d.set_draw_color(*LINE)
            d.line(MARGIN, d.get_y(), d.w - MARGIN, d.get_y())
            d.gap(4)

    def price_lists(self) -> None:
        d, p = self.doc, self.pkg
        d.h2("What's in the price")
        d.label("Included")
        d.gap(1.5)
        d.dotted(p.inclusions, OK)
        d.gap(3)
        d.label("Not included")
        d.gap(1.5)
        d.dotted(p.exclusions, MUTE, dash=True)

    def hotels(self) -> None:
        d, p = self.doc, self.pkg
        if not p.hotels:
            return
        d.h2("Where you stay")
        rows = [
            (h.name, h.city, f"{h.stars}-star", f"{h.nights} night{'s' if h.nights != 1 else ''}")
            for h in p.hotels
        ]
        self._table(("Hotel", "City", "Category", "Nights"), rows, widths=(4, 2.5, 1.6, 1.4))

    def dates_and_prices(self) -> None:
        d, p = self.doc, self.pkg
        d.h2("Dates & prices")
        if not p.departures:
            d.para("No dates announced yet — enquire and we will tell you first.", color=MUTE)
            return
        rows = []
        for dep in p.departures[:MAX_DEPARTURE_ROWS]:
            status = seats_label(dep.seats_left)
            if dep.badge and dep.seats_left > 0:
                status = BADGE_LABELS[dep.badge] + " · " + status
            rows.append((long_date(dep.date), status, inr(dep.price_double_paise // 100)))
        self._table(
            ("Departure", "Seats", "Per adult, double"),
            rows,
            widths=(3, 3, 2),
            align=("LEFT", "LEFT", "RIGHT"),
        )
        if len(p.departures) > MAX_DEPARTURE_ROWS:
            d.para(f"+ {len(p.departures) - MAX_DEPARTURE_ROWS} more dates on the website.", color=MUTE)
        d.gap(4)
        d.label("Price per person")
        d.gap(2)
        deps = p.departures
        self._boxes(
            [
                ("Adult · double sharing", _price_range([x.price_double_paise for x in deps])),
                ("Adult · triple sharing", _price_range([x.price_triple_paise for x in deps])),
                ("Child 5–11 · with parents", _price_range([x.price_child_paise for x in deps])),
                ("Single supplement", "+ " + _price_range([x.single_supplement_paise for x in deps])),
            ]
        )
        d.para(
            "Prices vary by departure date; the table above is per adult on double sharing.",
            size=8.5,
            color=MUTE,
        )

    def faq(self) -> None:
        d, p = self.doc, self.pkg
        if not p.faq:
            return
        d.h2("Good to know")
        for item in p.faq:
            d.ensure(16)
            d.font(11, "B", INK)
            d.multi_cell(0, 6, item.q, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            d.para(item.a)
            d.gap(3)

    def contact(self) -> None:
        d = self.doc
        d.h2("Book this trip")
        h = 46.0
        d.ensure(h + 4)
        top = d.get_y()
        d.box(MARGIN, top, d.epw, h)
        d.set_xy(MARGIN + 6, top + 5)
        d.font(11, "B", INK)
        d.cell(0, 6, BUSINESS["callback_promise"] + ".", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        lines = [
            ("Call", BUSINESS["phone_display"], f"tel:{BUSINESS['phone_e164']}"),
            ("WhatsApp", "Chat with us — tap to open", self.whatsapp_url),
            ("Enquire online", self.enquire_url, self.enquire_url),
            ("This trip", self.package_url, self.package_url),
        ]
        for label, value, link in lines:
            d.set_x(MARGIN + 6)
            d.font(9, "B", MUTE)
            d.cell(30, 6, label)
            d.font(9.5, "SB", PRIMARY)
            d.cell(0, 6, value, link=link, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        d.set_x(MARGIN + 6)
        d.font(8.5, "", MUTE)
        d.cell(0, 5, f"{BUSINESS['hours']}. {BUSINESS['after_hours']}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        d.set_y(top + h + 4)
        d.font(8.5, "", MUTE)
        d.cell(
            0,
            5,
            f"{BUSINESS['legal_name']} · {BUSINESS['address']}, {BUSINESS['city']} · "
            f"{BUSINESS['email']}",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

    # --- shared ------------------------------------------------------------------------------

    def _table(
        self,
        head: tuple[str, ...],
        rows: list[tuple[str, ...]],
        *,
        widths: tuple[float, ...],
        align: tuple[str, ...] | None = None,
    ) -> None:
        d = self.doc
        d.font(9.5, "", INK2)
        with d.table(
            col_widths=widths,
            text_align=align or tuple("LEFT" for _ in head),
            borders_layout=TableBordersLayout.HORIZONTAL_LINES,
            line_height=7,
            padding=(1.2, 2),
            headings_style=FontFace(emphasis="BOLD", color=MUTE, size_pt=8, fill_color=BG2),
            cell_fill_color=BG2,
            cell_fill_mode=TableCellFillMode.EVEN_ROWS,
        ) as table:
            header = table.row()
            for h in head:
                header.cell(h.upper())
            for r in rows:
                row = table.row()
                for cell in r:
                    row.cell(cell)
        d.gap(2)


def render_itinerary(
    pkg: PackageDetail, *, cover: bytes | None, site_url: str, whatsapp_number: str
) -> bytes:
    """A4 itinerary for a live package. `cover` = the raw cover photo (any Pillow format) or None."""
    return _Itinerary(pkg, cover, site_url, whatsapp_number).render()
```

Implementer notes: fpdf2's `table()` draws its own borders with the current draw colour — set `d.set_draw_color(*LINE)` before the `with`. `FontFace(size_pt=…)` and `TableCellFillMode.EVEN_ROWS` exist in 2.8; if a keyword is rejected, check `uv run python -c "import fpdf.fonts, fpdf.enums; help(fpdf.fonts.FontFace)"`. Long words never overflow because `multi_cell` wraps at the cell width.

- [ ] **Step 4: Run the tests, then look at the PDF**

Run: `uv run --directory api pytest tests/test_pdf_render.py tests/test_pdf_document.py -q`
Expected: all PASS. Then write one out and read it: `uv run --directory api python -c "from tests.pdf_fixture import package; from app.services.pdf.itinerary import render_itinerary; from pathlib import Path; Path('../.pdf-preview.pdf').write_bytes(render_itinerary(package(), cover=Path('content/photos/goa/agonda-sunset.jpg').read_bytes(), site_url='https://tripsmith.vercel.app', whatsapp_number='919845012345'))"` and open `.pdf-preview.pdf` (repo root, gitignored? — if `git status` shows it, delete it after looking; do not commit). Check: the cover crops without stretching; chip sits on the band edge; fact boxes align; day badges align with titles; tables zebra; no orphan headings at page bottoms (`ensure` values); footer never overlaps content.

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
- Produces: `PdfService(store: BlobStore | None, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None)` with `cached_url(pkg) -> str | None`, `build(pkg) -> bytes`, `put(pkg, pdf) -> str | None`, `attachment_for(db, slug) -> EmailAttachment | None`, `gc(db) -> GcReport`; `GcReport(deleted: int, kept: int, configured: bool)` (an `ApiModel`, in `app/schemas/pdf.py`); `COVER_TIMEOUT = 5.0`, `COVER_MAX_BYTES = 6_000_000`.

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
        """Fetch the cover (best effort) and render off the event loop."""
        cover = await self._fetch_cover(pkg.cover.url) if pkg.cover else None
        return await asyncio.to_thread(
            render_itinerary,
            pkg,
            cover=cover,
            site_url=self._settings.site_url,
            whatsapp_number=self._settings.whatsapp_number,
        )

    async def _fetch_cover(self, url: str) -> bytes | None:
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=COVER_TIMEOUT) as client:
                res = await client.get(url, follow_redirects=True)
            if res.status_code != 200:
                return None
            if int(res.headers.get("content-length", len(res.content))) > COVER_MAX_BYTES:
                return None
            if not res.headers.get("content-type", "").startswith("image/"):
                return None
            return res.content
        except Exception as exc:  # a missing photo is not worth a failed download
            log.warning("Cover fetch failed for %s: %s", url, exc)
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

`curl -sI http://localhost:3003/api/packages/north-goa-beaches/itinerary.pdf | head -5`
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

1. `curl -sI https://<web prod>/api/packages/north-goa-beaches/itinerary.pdf` → `302` to `*.public.blob.vercel-storage.com/pdf/north-goa-beaches/…` (first hit renders; second hit is instant). Open the Blob URL: fonts embedded (₹ renders — proves `api/assets/fonts` made it into the Python bundle; if it 500s with `FileNotFoundError` on the TTF, the bundle dropped `assets/` — move the fonts under `app/assets/fonts/` and fix `FONTS_DIR` to `parents[2] / "assets" / "fonts"`).
2. Vercel dashboard → tripsmith-api → Settings → Cron Jobs lists `/cron/pdf-gc` weekly. Trigger it once from the dashboard ("Run") or `curl -H "Authorization: Bearer $CRON_SECRET" https://<api prod>/cron/pdf-gc` → `{"deleted":0,"kept":1,"configured":true}`.
3. Submit one real enquiry from the prod package page; the confirmation in the inbox carries the PDF. Record the ref in the memory update.
4. If the web was prerendered against the old api (baked 404s on the new links are impossible here — plain `<a>` hrefs — but check the package page renders the link), `vercel redeploy` the web deployment per the deploy-race memory.

---

## Self-review

- **Spec coverage:** R6 download link on every live package page (Task 9: day-by-day header on all sizes + price box + summary + thanks) ✓; attached to the confirmation email when a package is attached (Task 7) ✓; generated from package data — cover, quick facts, day-by-day, inclusions/exclusions, hotels, upcoming departures with prices, occupancy pricing, contact block (Task 3) ✓; cached per package, invalidated on edit (`updated_at` key, Tasks 3/5/6) ✓; A4 / < 2 MB / < 3 s asserted (Task 3) ✓; content matches the page (Task 3 text-extraction test) ✓; `GET /cron/pdf-gc` + `vercel.json` (Task 8) ✓; 04 §5's Blob-cached route + fpdf2 + DM Sans in `api/assets/fonts` (Tasks 2/6) ✓; 06 "PDF; two emails" (Task 7) ✓; the 07 row's `Document` base for the v2 voucher (Task 2) ✓.
- **Placeholders:** none — every step carries code or the exact command and expected output. Task 7's tests use the existing `ctx(**over)` helper from `tests/test_email_render.py` (verified: it overrides any `EnquiryEmailContext` field).
- **Type consistency:** `render_itinerary(pkg, *, cover, site_url, whatsapp_number)` (T3) is what `PdfService.build` calls (T5) and what `monkeypatch.setattr("app.services.pdf.service.render_itinerary", …)` patches (T5/T7 — the service imports the name, so patching the service module is right). `PdfService(store, settings, *, transport)` matches every test's construction. `pdf_pathname(slug, updated_at)` / `pdf_prefix` / `pdf_filename` / `PDF_PREFIX` names are the same in T3, T5, T6, T8. `BlobStore.list(prefix) -> list[BlobInfo]`, `delete(urls)` match `FakeBlobStore`. `send_enquiry_emails(..., attachment=)` matches T7's call. `GcReport(deleted, kept, configured)` matches T5's return and T8's JSON. `Document.font(size, style, color)` is used with `"SB"` in T3 and defined in T2.
