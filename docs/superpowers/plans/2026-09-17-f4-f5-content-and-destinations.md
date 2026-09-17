# F4+F5 — Content → 6 packages + Destinations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production carries six genuine packages across three destinations (Goa · Kerala · Himachal), every one live-eligible and photographed under a clean licence, and a visitor can browse them by place: `/destinations` (grid: cover, name, trip count, best months, from-price) and `/destinations/<slug>` (cover, intro, best months, the live trips), each with unique metadata and JSON-LD `TouristDestination`.

**Architecture:** Content stays typed Python under `api/content/` (validated pydantic at import, seeded by `scripts/seed.py`, photos to Vercel Blob). The read endpoints for destinations already exist from F1 (`list_destinations`, `get_destination`); this row adds `bestMonths` to the list card and builds the two web pages on the existing `api()` client, `PackageCard`, `Photo` and K tokens. Before the catalog grows, the pytest suite is pointed at a **frozen copy** of today's two-package Goa content (`tests/fixture_content/`) so no assertion moves now or in F7; a new `test_content.py` checks the *real* catalog against rules (live-eligible, every theme covered, dates in the future, every photo credited) rather than counts.

**Tech Stack:** FastAPI 0.141 + SQLAlchemy 2.0 async + pydantic v2 + pytest (`db` marker) · httpx + Pillow (already dependencies) for the photo fetch script · Next.js 15 App Router + React 19 + Tailwind 4 tokens + vitest. No new dependencies on either side.

**Spec:** `docs/07-plan.md` rows **F4+F5** and **↳ F5** (milestone 1.1); `docs/03-requirements.md` §R2 (destinations + acceptance) and §R13 (content rules); `docs/06-data-and-api.md` §C1 `listDestinations` / `getDestination`; `mockups/screens.html` **S2** (grid) + **S3** (destination page) — open them in a browser while building Tasks 6–7; `mockups/screens.html` `DEST` / `PKGS` arrays (the locked names, nights, from-prices, hotels and highlights of the twelve trips — this row builds four of them); `docs/04-ui-mockups.md` (K tokens).

## Global Constraints

- One branch, one PR: `feat/f4-f5-content` (worktree `.worktrees/f4-f5-content`, created from `origin/main` = `2f52be9`). Never touch the main checkout; never bare `git stash` (shared stash stack — `git stash push -u -m "<tag>"` + `git stash apply <sha>` if ever needed). Fix review findings on the same branch. Squash-merge at the end.
- Python `>=3.12,<3.13`, ruff line length 100, rules E/F/I/B/UP, pyright basic — `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright` stays green. `uv` is not on the bash PATH: prefix commands with `export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"`.
- JSON on the wire is camelCase (`ApiModel` alias generator); Python is snake_case. Every public GET sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (`PUBLIC_CACHE_CONTROL`). Money on the wire is integer paise; content files write whole rupees (`*_inr`).
- Contract files `api/openapi.json` and `web/src/lib/api-types.ts` are generated (`pnpm gen:api`), committed and freshness-tested — regenerate after Task 4, never hand-edit.
- Content rules (R13 + 07-plan F4): real places, real named hotels, plausible 2026–27 per-person prices **without flights**, full day-by-day (2–3 sentences per day naming real sights), 3–4 departures per package, all departure dates **≥ 2026-11-01** (the content floor `test_content.py` enforces; F7 raises it), 4–8 photos per package, every one of the six themes matched by ≥ 1 live package, every destination with ≥ 1 live package. Copy voice = the two Goa files: plain, specific, second person, no marketing adjectives, prices in `21_999` style.
- Photos: **only** Wikimedia Commons CC BY / CC BY-SA / CC0 / public domain, ≥ 1600 px wide at source, saved as 1400 px JPEG under `api/content/photos/<destination>/`, credited in `api/content/photos/CREDITS.md` (File · Title · Licence · Author · Source) — the fetch script does all of this and refuses anything else. `content/photos` is `.vercelignore`d (the seed uploads them to Blob); the Goa photos are not touched.
- The two Goa packages and `goa.py` are **not edited** in this row (their departures start 2026-11-20, still future; the frozen test fixture is a byte-for-byte copy of them).
- Web: no new UI libraries. Every colour/radius/shadow comes from `globals.css` tokens via Tailwind utilities — no hex values in components. Tabular numerals (`num`) on every price and count. `prefers-reduced-motion` renders everything at rest. **No enquiry CTAs anywhere yet** — S3's "Enquire about Goa" / WhatsApp / Call box waits for F9; the aside links to the filtered listing instead.
- Tests only where a bug would embarrass in a demo: content rules and credit coverage (pytest, no db), the `bestMonths` field (pytest db), `monthRange` wrap-around, prose splitting, JSON-LD shape (vitest). No tests for layout.
- Copy: the grid page is "Destinations"; counts read "2 trips" / "1 trip"; the tile pill reads `2 trips · best Nov – Feb`; the hero sub-line reads `Backwaters, tea hills and a slow coast · Best Sep – Mar · 2 trips from ₹21,999`.

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| Which four packages | The mockup's locked list, Kerala + Himachal rows: **Munnar & Alleppey Houseboat** (4N, hills · honeymoon, from ₹21,999), **Kochi · Thekkady · Kovalam** (5N, family · heritage, from ₹27,999), **Shimla–Manali Classic** (4N, hills · family, from ₹18,499), **Manali · Kasol · Tosh** (5N, hills · adventure, from ₹19,999). With Goa's beach · family and beach · honeymoon, all six themes have ≥ 1 package. |
| Slugs | Mockup style, no destination prefix (Goa's are `north-goa-beaches`, `goa-quiet-escape`): `munnar-alleppey-houseboat`, `kochi-thekkady-kovalam`, `shimla-manali-classic`, `manali-kasol-tosh`. Module names use underscores. |
| Departure city | Free text per package: Kerala trips `Ex-Bengaluru`, Himachal trips `Ex-Delhi` (coach from Delhi). Goa stays `Ex-Mumbai`. |
| Departures | 3–4 per package, Nov 2026 → Jun 2027, one or two `guaranteed`, prices peak at Christmas / New Year. The cheapest upcoming double-sharing price of each package equals the mockup's from-price. |
| Tests vs. content | Tests seed `tests/fixture_content/` — a frozen copy of today's `content/` (1 destination, 2 packages, 3 testimonials) — via `load_content("tests.fixture_content")`. Existing assertions stay untouched; the search fixture's inserted `kerala` destination no longer collides. Known: the fixture's dates expire on 2026-11-20 like the F1/F3 tests always did — a hardening row's problem, not this one's. |
| Real-content test | `tests/test_content.py` (no db): the real catalog imports, every destination has ≥ 1 live package, every theme is covered, every package has 3–4 departures all ≥ 2026-11-01, the four from-prices match the locked list, every photo file is credited and every credited file exists, no photo file is unused. |
| `DestinationCard.bestMonths` | Added (list of 1–12) so the S2 pill can say `best Nov – Feb` without a second fetch. One-line change in `reads.py`; contract regenerated. |
| Best months rendering | `monthRange([11,12,1,2])` → `Nov – Feb`; runs wrap the year; several runs join with ` · ` (`Mar – Jun · Dec`); all twelve → `All year`. The S3 seasonal table (Ideal / Hot / Monsoon…) needs `climate` data that is add-on B — instead a 12-chip strip with the best months lit, fed by `bestMonths`. |
| Intro markdown | The intros use paragraphs + `**bold**` only. `lib/prose.ts` `proseBlocks()` renders exactly that — no markdown dependency for two constructs. |
| S3 "Good to know" list | Not in the model; skipped. |
| S3 aside | From-price ("Trips from ₹21,999 · per person, double sharing") + **Compare 2 trips →** `/packages?destination=<slug>`. Enquiry/WhatsApp/Call arrive with F9. |
| S2 "Not sure which one? Ask us" band | Skipped — its CTA is an enquiry (F9). |
| Caching | Both pages are static with hourly ISR like the package page (`revalidate: 3600` on the fetch) and tagged `destinations` / `destination:<slug>` for F18's on-demand purge. `generateStaticParams` from `GET /destinations`; unknown / zero-live slug → 404 (the api already returns 404 for both). |
| Metadata | Grid: title `Destinations`, description lists the names. Detail: title `Kerala holiday packages — 2 trips from ₹21,999`, description = tagline + best months + trip names. Canonical on both; OG image = cover. |
| JSON-LD | `TouristDestination` with `name`, `description` (tagline), `url`, `image`, `containedInPlace: Country India`, `touristType` = union of the trips' themes. |
| Header / breadcrumbs | `SiteHeader` gains **Destinations** (before Trips). `PackageHero`'s breadcrumb destination becomes a link to `/destinations/<slug>`. Footer waits for F6. |
| Motion signature | Tiles and trip cards rise in with a 60 ms stagger (`animate-rise`, already in `globals.css`); the best-month chips light up in sequence. Off under reduced motion. |
| Production seeding | `scripts/seed.py` against the Neon production URL in `api/.env.local` (Blob token there too) **after review, before merge**, so the web prerender at deploy sees six packages. Idempotent: Goa rows are upserted unchanged. |

---

## Local environment (do once, before Task 1)

The worktree has no `.env.local` files and the pytest `db` tests need a Postgres. Recreate a throwaway cluster from the installed PG 18 in this session's scratchpad.

Dev servers from earlier sessions may still hold ports 3000/8000. Free them first (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Then (bash):

```bash
cd "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/.worktrees/f4-f5-content"
cp ../../api/.env.local api/.env.local && cp ../../web/.env.local web/.env.local
export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
PG="/c/Program Files/PostgreSQL/18/bin"
export PGDATA="$SCRATCHPAD/pg"   # $SCRATCHPAD = the session scratchpad directory from the system prompt
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
uv run --directory api pytest -q     # baseline: 106 passed
pnpm --filter web test               # baseline: 47 passed
```

Run the dev api against the local DB (background call): `DATABASE_URL=$DEV_URL uv run --directory api uvicorn app.main:app --reload --port 8000`, and web: `pnpm --filter web dev`. Kill by port afterwards — never `taskkill //IM node.exe`.

Commit this plan as the branch's first commit before Task 1:

```bash
git add docs/superpowers/plans/2026-09-17-f4-f5-content-and-destinations.md
git commit -m "docs(F4+F5): implementation plan for content and destinations"
```

---

## File structure

**api/**
- Modify `content/__init__.py` — `load_content(package: str = "content")`.
- Create `tests/fixture_content/` — `__init__.py`, `destinations/{__init__,goa}.py`, `packages/{__init__,goa_quiet_escape,north_goa_beaches}.py`, `testimonials.py` (verbatim copies).
- Modify `tests/settings.py` — `fixture_content()`; modify `tests/test_catalog.py`, `tests/test_catalog_reads.py`, `tests/test_search.py`, `tests/test_seed.py` — call it instead of `load_content()`.
- Create `scripts/fetch_photo.py` — licence-checked Commons download + credit row.
- Create `content/photos/kerala/*.jpg`, `content/photos/himachal/*.jpg`; modify `content/photos/CREDITS.md`.
- Create `content/destinations/{kerala,himachal}.py`, `content/packages/{munnar_alleppey_houseboat,kochi_thekkady_kovalam,shimla_manali_classic,manali_kasol_tosh}.py`.
- Create `tests/test_content.py` — the real-catalog rules.
- Modify `app/schemas/catalog.py` (`DestinationCard.best_months`), `app/services/catalog/reads.py` (`list_destinations`), `tests/test_catalog_reads.py` (+1 assertion).
- Regenerate `openapi.json` → `web/src/lib/api-types.ts`.

**web/**
- Modify `src/lib/format.ts` — `monthRange`, export `MONTHS`.
- Create `src/lib/prose.ts` — `proseBlocks`; create `src/components/site/Prose.tsx`.
- Create `src/lib/seo/destination-jsonld.ts`.
- Create `src/components/site/destinations/DestinationTile.tsx`, `DestinationHero.tsx`, `BestMonths.tsx`.
- Create `src/app/(site)/destinations/page.tsx`, `src/app/(site)/destinations/[slug]/page.tsx`.
- Modify `src/components/site/SiteHeader.tsx` (Destinations link), `src/components/site/package/PackageHero.tsx` (breadcrumb link).
- Create `tests/destinations.test.ts`.

**docs/**
- Modify `docs/07-plan.md` — mark `F3 ✅ PR #23` (deferred here by the F3 plan). F4+F5's own mark goes in F6's PR.

---

### Task 1: Freeze the test catalog — `tests/fixture_content/` + `load_content(package)`

**Files:**
- Modify: `api/content/__init__.py`
- Create: `api/tests/fixture_content/__init__.py`, `api/tests/fixture_content/destinations/__init__.py`, `api/tests/fixture_content/destinations/goa.py`, `api/tests/fixture_content/packages/__init__.py`, `api/tests/fixture_content/packages/goa_quiet_escape.py`, `api/tests/fixture_content/packages/north_goa_beaches.py`, `api/tests/fixture_content/testimonials.py`
- Modify: `api/tests/settings.py`, `api/tests/test_catalog.py`, `api/tests/test_catalog_reads.py`, `api/tests/test_search.py`, `api/tests/test_seed.py`

**Interfaces:**
- Consumes: `load_content()` (returns `Content(destinations, packages, testimonials)`), `PHOTOS_DIR` in `content._schema` (the fixture's photos still resolve to `content/photos/goa/…`).
- Produces: `load_content(package: str = "content") -> Content`; `tests.settings.fixture_content() -> Content` (1 destination, 2 packages, 3 testimonials — the catalog every db test seeds from now on).

- [ ] **Step 1: Copy today's content into the fixture, verbatim**

```bash
cd api
mkdir -p tests/fixture_content/destinations tests/fixture_content/packages
cp content/destinations/goa.py tests/fixture_content/destinations/goa.py
cp content/packages/goa_quiet_escape.py content/packages/north_goa_beaches.py tests/fixture_content/packages/
cp content/testimonials.py tests/fixture_content/testimonials.py
: > tests/fixture_content/destinations/__init__.py
: > tests/fixture_content/packages/__init__.py
cat > tests/fixture_content/__init__.py <<'PY'
"""A frozen copy of the catalog as it was at 2f52be9 (1 destination, 2 packages, 3 testimonials).

Every db test seeds from here through `tests.settings.fixture_content()`, so the assertions in
test_catalog*, test_search and test_seed do not move when the real catalog under api/content/
grows (F4: 6 packages, F7: 12). Photos resolve to content/photos/ like the real files. Do not
edit these to match the live content — edit them only when a test needs different data.
"""
PY
```

- [ ] **Step 2: Write the failing test for `load_content(package)`**

Add to the end of `api/tests/test_seed.py`:

```python
def test_load_content_takes_a_package_name() -> None:
    frozen = load_content("tests.fixture_content")
    assert [d.slug for d in frozen.destinations] == ["goa"]
    assert sorted(p.slug for p in frozen.packages) == ["goa-quiet-escape", "north-goa-beaches"]
    assert len(frozen.testimonials) == 3
```

- [ ] **Step 3: Run it to verify it fails**

Run: `uv run --directory api pytest tests/test_seed.py::test_load_content_takes_a_package_name -q`
Expected: FAIL with `TypeError: load_content() takes 0 positional arguments but 1 was given`

- [ ] **Step 4: Make `load_content` take a package name**

Replace the body of `api/content/__init__.py` from `ROOT = …` down with:

```python
def _modules(root: Path, sub: str) -> list[str]:
    return sorted(m.name for m in pkgutil.iter_modules([str(root / sub)]) if not m.ispkg)


def load_content(package: str = "content") -> Content:
    """`package` is the dotted name of a tree with this layout. Tests pass their frozen copy
    (`tests.fixture_content`) so their assertions do not move when the real catalog grows."""
    root = Path(next(iter(importlib.import_module(package).__path__)))
    content = Content()
    for name in _modules(root, "destinations"):
        content.destinations.append(
            importlib.import_module(f"{package}.destinations.{name}").DESTINATION
        )
    for name in _modules(root, "packages"):
        content.packages.append(importlib.import_module(f"{package}.packages.{name}").PACKAGE)
    content.testimonials = list(importlib.import_module(f"{package}.testimonials").TESTIMONIALS)

    slugs = {d.slug for d in content.destinations}
    for p in content.packages:
        if p.destination not in slugs:
            raise ValueError(f"{p.slug}: unknown destination {p.destination!r}")
    package_slugs = {p.slug for p in content.packages}
    if len(package_slugs) != len(content.packages):
        raise ValueError("duplicate package slugs")
    for t in content.testimonials:
        if t.package and t.package not in package_slugs:
            raise ValueError(f"testimonial by {t.name}: unknown package {t.package!r}")
    return content
```

(`ROOT` is gone; the `Content` dataclass and the imports above it stay.)

- [ ] **Step 5: Run it to verify it passes**

Run: `uv run --directory api pytest tests/test_seed.py::test_load_content_takes_a_package_name -q`
Expected: PASS

- [ ] **Step 6: Point every db test at the fixture**

Add to `api/tests/settings.py`:

```python
from content import Content, load_content


def fixture_content() -> Content:
    """The frozen 2-package Goa catalog under tests/fixture_content/ — what db tests seed."""
    return load_content("tests.fixture_content")
```

Then in `tests/test_catalog.py`, `tests/test_catalog_reads.py`, `tests/test_search.py`, `tests/test_seed.py`: replace every `load_content()` call with `fixture_content()` **except** the new `load_content("tests.fixture_content")` test, and swap the import:

```bash
cd api
sed -i 's/\bload_content()/fixture_content()/g' tests/test_catalog.py tests/test_catalog_reads.py tests/test_search.py tests/test_seed.py
sed -i 's/^from content import load_content$/from tests.settings import fixture_content/' tests/test_catalog.py tests/test_catalog_reads.py tests/test_search.py
# test_seed.py still needs load_content for the new test:
sed -i 's/^from content import load_content$/from content import load_content\nfrom tests.settings import fixture_content/' tests/test_seed.py
uv run ruff check --fix . && uv run ruff format .
```

`ruff --fix` merges the duplicated `from tests.settings import …` lines (isort). Check `git diff --stat tests/` shows only those four files plus the new ones.

- [ ] **Step 7: Whole suite still green, count unchanged +1**

Run: `uv run --directory api pytest -q`
Expected: **107 passed** (106 + the new test; nothing else changed behaviour — the fixture is the same data).

Run: `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add api/content/__init__.py api/tests
git commit -m "test(api): seed db tests from a frozen content fixture; load_content(package)"
```

---

### Task 2: Photo fetch script + the Kerala and Himachal photos

**Files:**
- Create: `api/scripts/fetch_photo.py`
- Create: `api/content/photos/kerala/*.jpg`, `api/content/photos/himachal/*.jpg`
- Modify: `api/content/photos/CREDITS.md` (rows appended by the script)

**Interfaces:**
- Produces: `uv run python scripts/fetch_photo.py "File:<Commons title>" <destination>/<name>.jpg` — downloads the 1400 px rendition, refuses non-CC/PD or < 1600 px sources, appends the credit row. The photo files Task 3's content references (exact names below).

- [ ] **Step 1: Write the script**

`api/scripts/fetch_photo.py`:

```python
"""Download one Wikimedia Commons photo into api/content/photos/ with its licence checked and its
credit appended to CREDITS.md (F4). Commons requires a descriptive User-Agent.

    uv run python scripts/fetch_photo.py "File:Solang 5.jpg" himachal/solang-valley.jpg

Refuses anything that is not CC BY / CC BY-SA / CC0 / public domain, or narrower than 1600 px.
Saves the 1400 px rendition Commons serves (the site never needs more), re-encoded by Pillow.
"""

import argparse
import html
import io
import re
import sys
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

PHOTOS_DIR = Path(__file__).resolve().parents[1] / "content" / "photos"
CREDITS = PHOTOS_DIR / "CREDITS.md"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "tripsmith-seed/1.0 (portfolio project; virajdomadia32@gmail.com)"
ALLOWED = re.compile(r"^(cc-by(-sa)?-\d\.\d|cc0|pd)", re.I)
MIN_WIDTH = 1600
RENDITION = 1400
_TAGS = re.compile(r"<[^>]+>")


def lookup(title: str) -> dict[str, Any]:
    res = httpx.get(
        API,
        params={
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size",
            "iiurlwidth": str(RENDITION),
            "format": "json",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
        follow_redirects=True,
    )
    res.raise_for_status()
    page = next(iter(res.json()["query"]["pages"].values()))
    info = (page.get("imageinfo") or [None])[0]
    if info is None:
        raise SystemExit(f"not found on Commons: {title}")
    return info


def check(info: dict[str, Any], title: str) -> tuple[str, str]:
    """Returns (licence short name, artist) or exits: the licence gate is the point of this script."""
    meta = info["extmetadata"]
    licence_id = meta.get("License", {}).get("value", "")
    licence = meta.get("LicenseShortName", {}).get("value", licence_id)
    if not ALLOWED.match(licence_id):
        raise SystemExit(f"licence not allowed for {title}: {licence} ({licence_id!r})")
    if info["width"] < MIN_WIDTH:
        raise SystemExit(f"too small: {title} is {info['width']} px wide (need >= {MIN_WIDTH})")
    artist = html.unescape(_TAGS.sub("", meta.get("Artist", {}).get("value", ""))).strip()
    return licence, artist or "see source"


def save(info: dict[str, Any], dest: Path) -> None:
    data = httpx.get(
        info["thumburl"], headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True
    ).content
    with Image.open(io.BytesIO(data)) as im:
        rgb = im.convert("RGB")
        rgb.thumbnail((RENDITION, RENDITION * 2))
        dest.parent.mkdir(parents=True, exist_ok=True)
        rgb.save(dest, "JPEG", quality=82, optimize=True, progressive=True)


def credit(dest_rel: str, title: str, licence: str, artist: str, source: str) -> None:
    row = (
        f"| `{dest_rel}` | {title.removeprefix('File:')} | {licence} | {artist} "
        f"| [source]({source}) |\n"
    )
    with CREDITS.open("a", encoding="utf-8") as f:
        f.write(row)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("title", help='Commons title, e.g. "File:Solang 5.jpg"')
    parser.add_argument("dest", help="path under content/photos, e.g. himachal/solang-valley.jpg")
    args = parser.parse_args(argv)
    title = args.title if args.title.startswith("File:") else f"File:{args.title}"
    dest = PHOTOS_DIR / args.dest
    if dest.exists():
        raise SystemExit(f"{args.dest} already exists — pick another name or delete it first")
    info = lookup(title)
    licence, artist = check(info, title)
    save(info, dest)
    credit(args.dest, title, licence, artist, info["descriptionurl"])
    print(f"{args.dest}  {licence}  by {artist}  ({info['width']}x{info['height']} -> {RENDITION})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Prove the licence gate with a known file**

Run (from `api/`): `uv run python scripts/fetch_photo.py "File:Solang 5.jpg" himachal/solang-valley.jpg`
Expected: prints `himachal/solang-valley.jpg  CC BY-SA 4.0  by … (… -> 1400)`; the file exists; `tail -1 content/photos/CREDITS.md` is its row. A missing title must be refused: `uv run python scripts/fetch_photo.py "File:Nonexistent photo 123456.jpg" himachal/x.jpg` → exits with `not found on Commons`, no file, no row.

- [ ] **Step 3: Fetch the Kerala set**

Eight titles are already licence-verified (they are the mockup's photos, `mockups/img/CREDITS.md`); the rest are found with the Commons search API — pick a **photograph** (not a map/logo), landscape orientation, ≥ 1600 px, CC BY / CC BY-SA / CC0. Search: `curl -s -A "tripsmith-seed/1.0" "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=20&format=json&srsearch=<terms>"` then fetch via the script — it refuses bad ones, so try the next title.

| Save as | Commons title (verified) or search terms | Subject |
|---|---|---|
| `kerala/munnar-tea-gardens.jpg` | `File:Lush green Tea Gardens in Munnar, Kerala 187.jpg` | tea slopes |
| `kerala/munnar-tea-aerial.jpg` | `File:Munnar Tea Gardens,Bird eye view.jpg` | tea estate from above |
| `kerala/alleppey-backwaters-1.jpg` | `File:Alleppey Backwaters (15865676369).jpg` | backwater canal |
| `kerala/alleppey-backwaters-2.jpg` | `File:Alleppey Backwaters (15865677189).jpg` | backwaters, palms |
| `kerala/alleppey-houseboat.jpg` | search `houseboat Alleppey Kerala` | a kettuvallam under way |
| `kerala/fort-kochi-fishing-nets.jpg` | search `Chinese fishing nets Fort Kochi` | the nets at sunset |
| `kerala/periyar-lake.jpg` | search `Periyar Lake Thekkady` | the lake with dead trees / boat |
| `kerala/thekkady-spice-plantation.jpg` | search `cardamom plantation Thekkady` or `spice garden Kerala` | plantation walk |
| `kerala/kovalam-lighthouse-beach.jpg` | search `Kovalam Lighthouse Beach` | the lighthouse over the bay |
| `kerala/mattancherry-palace.jpg` | search `Mattancherry Palace Kochi` or `Paradesi Synagogue Kochi` | heritage Kochi |

```bash
cd api
uv run python scripts/fetch_photo.py "File:Lush green Tea Gardens in Munnar, Kerala 187.jpg" kerala/munnar-tea-gardens.jpg
uv run python scripts/fetch_photo.py "File:Munnar Tea Gardens,Bird eye view.jpg" kerala/munnar-tea-aerial.jpg
uv run python scripts/fetch_photo.py "File:Alleppey Backwaters (15865676369).jpg" kerala/alleppey-backwaters-1.jpg
uv run python scripts/fetch_photo.py "File:Alleppey Backwaters (15865677189).jpg" kerala/alleppey-backwaters-2.jpg
# then one search + fetch per remaining row
```

- [ ] **Step 4: Fetch the Himachal set**

| Save as | Commons title (verified) or search terms | Subject |
|---|---|---|
| `himachal/solang-valley.jpg` | `File:Solang 5.jpg` (done in Step 2) | Solang valley |
| `himachal/solang-snow-bridge.jpg` | `File:Snow bridge in Solang Valley.jpg` | snow at Solang |
| `himachal/manali-mountains.jpg` | `File:Manali, mountain of Himachal Pradesh.jpg` (CC BY-SA 3.0) | peaks over Manali |
| `himachal/shimla-ridge.jpg` | search `The Ridge Shimla Christ Church` | the Ridge / Mall Road |
| `himachal/kufri.jpg` | search `Kufri Himachal Pradesh` | Kufri hills |
| `himachal/hadimba-temple.jpg` | search `Hadimba Devi Temple Manali` | the temple in the deodars |
| `himachal/old-manali.jpg` | search `Old Manali` or `Manu Temple Manali` | Old Manali lane / river |
| `himachal/kasol-parvati-river.jpg` | search `Kasol Parvati River` | the river at Kasol |
| `himachal/tosh-village.jpg` | search `Tosh village Himachal` | Tosh on its ridge |
| `himachal/manikaran.jpg` | search `Manikaran Sahib gurudwara` | Manikaran on the river |
| `himachal/kheerganga.jpg` | search `Kheerganga` | the meadow / trail |

- [ ] **Step 5: Verify the set**

```bash
ls api/content/photos/kerala api/content/photos/himachal | grep -c jpg              # 21
grep -c "^| \`" api/content/photos/CREDITS.md                                       # 35 (14 Goa + 21)
uv run --directory api python -c "from PIL import Image; import pathlib; print([(p.name, Image.open(p).size) for p in pathlib.Path('content/photos').glob('*/*.jpg') if Image.open(p).width < 1200])"
```
Expected: 21, 35, and `[]` (every photo is ≥ 1200 px wide after the 1400 px rendition; a portrait original may come out narrower — replace any that print). Open a handful in the image viewer: no maps, no logos, no watermarks, no people as the subject.

- [ ] **Step 6: Lint + commit**

Run: `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: clean (`scripts/` is inside the ruff/pyright scope).

```bash
git add api/scripts/fetch_photo.py api/content/photos
git commit -m "content(F4): Commons photo fetch script; 21 CC photos for Kerala and Himachal with credits"
```

---

### Task 3: Content — Kerala + Himachal destinations, four packages, the real-catalog rules test

**Files:**
- Create: `api/content/destinations/kerala.py`, `api/content/destinations/himachal.py`
- Create: `api/content/packages/munnar_alleppey_houseboat.py`, `api/content/packages/kochi_thekkady_kovalam.py`, `api/content/packages/shimla_manali_classic.py`, `api/content/packages/manali_kasol_tosh.py`
- Create: `api/tests/test_content.py`

**Interfaces:**
- Consumes: `define_destination`, `define_package` (`content._schema`), the photo files from Task 2.
- Produces: `load_content()` → 3 destinations, 6 packages, 3 testimonials; `tests/test_content.py` (6 tests, no db).

- [ ] **Step 1: Write the failing rules test**

`api/tests/test_content.py`:

```python
"""F4 content rules: the real catalog under api/content/ is live-eligible, covers every theme,
dates ahead of the content floor, and every photo is credited. Counts are not asserted — the
catalog grows in F7; the rules do not."""

import datetime as dt
import re

from app.models.enums import PackageStatus, Theme
from content import load_content
from content._schema import PHOTOS_DIR

# Departures before this never reach production: raise it when the content moves forward (F7).
CONTENT_FLOOR = dt.date(2026, 11, 1)
CREDITS = PHOTOS_DIR / "CREDITS.md"


def _on_disk() -> set[str]:
    return {p.relative_to(PHOTOS_DIR).as_posix() for p in PHOTOS_DIR.glob("*/*.jpg")}


def _credited() -> set[str]:
    return set(re.findall(r"^\| `([^`]+)` \|", CREDITS.read_text(encoding="utf-8"), re.M))


def test_every_destination_has_a_live_package_and_every_theme_is_covered() -> None:
    content = load_content()
    live = [p for p in content.packages if p.status == PackageStatus.LIVE]
    assert {p.destination for p in live} == {d.slug for d in content.destinations}
    assert {t for p in live for t in p.themes} == set(Theme)
    assert len(live) >= 6 and len(content.destinations) >= 3  # F4's floor, not a ceiling


def test_every_package_has_three_or_four_future_departures() -> None:
    for p in load_content().packages:
        assert 3 <= len(p.departures) <= 4, p.slug
        assert min(d.date for d in p.departures) >= CONTENT_FLOOR, p.slug
        dates = [d.date for d in p.departures]
        assert dates == sorted(dates), f"{p.slug}: list departures in date order"


def test_from_prices_match_the_locked_list() -> None:
    """The mockup's from-prices are what home and listing were designed around (07-plan F4)."""
    cheapest = {
        p.slug: min(d.price_double_inr for d in p.departures) for p in load_content().packages
    }
    assert cheapest["munnar-alleppey-houseboat"] == 21_999
    assert cheapest["kochi-thekkady-kovalam"] == 27_999
    assert cheapest["shimla-manali-classic"] == 18_499
    assert cheapest["manali-kasol-tosh"] == 19_999


def test_every_photo_is_credited_and_every_credit_exists() -> None:
    on_disk, credited = _on_disk(), _credited()
    assert on_disk - credited == set(), "photos without a CREDITS.md row"
    assert credited - on_disk == set(), "CREDITS.md rows without a file"


def test_no_photo_is_unused() -> None:
    content = load_content()
    used = {ph.file for p in content.packages for ph in p.photos}
    used |= {d.cover.file for d in content.destinations}
    assert _on_disk() - used == set(), "delete these photos and their credit rows"


def test_photo_dirs_are_destination_slugs() -> None:
    slugs = {d.slug for d in load_content().destinations}
    assert {p.name for p in PHOTOS_DIR.iterdir() if p.is_dir()} <= slugs
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run --directory api pytest tests/test_content.py -q`
Expected: FAIL — `test_every_destination…` on the theme set (only beach/family/honeymoon), `test_from_prices…` with `KeyError`, `test_no_photo_is_unused` listing the 21 new files.

- [ ] **Step 3: The two destinations**

`api/content/destinations/kerala.py`:

```python
from content._schema import define_destination

DESTINATION = define_destination(
    slug="kerala",
    name="Kerala",
    tagline="Backwaters, tea hills and a slow coast",
    intro=(
        "Kerala is three trips stacked on top of each other. Up in the Western Ghats, Munnar's "
        "tea estates roll away in every direction and the mornings are cold enough for a "
        "jacket. Down on the plain, Alleppey's backwaters are a maze of canals and paddies "
        "best seen from the deck of a houseboat. And along the coast, Fort Kochi's Chinese "
        "fishing nets, Kovalam's lighthouse bay and Varkala's cliff are as different from "
        "each other as they are from the hills.\n\n"
        "Distances are short but the roads are slow — budget four to five hours between "
        "regions, which is why our trips pick two or three places and stay put.\n\n"
        "**Best time:** September to March — the monsoon has cleared, the hills are green and "
        "the coast is dry. April and May are humid; June to August is monsoon (ayurveda "
        "season, half the price, the backwaters at their fullest)."
    ),
    cover={
        "file": "kerala/alleppey-backwaters-2.jpg",
        "alt": "Palms along a backwater canal near Alleppey",
    },
    region="South India",
    best_months=[9, 10, 11, 12, 1, 2, 3],
    position=2,
)
```

`api/content/destinations/himachal.py`:

```python
from content._schema import define_destination

DESTINATION = define_destination(
    slug="himachal",
    name="Himachal",
    tagline="Snow, pines and the Parvati valley",
    intro=(
        "Himachal is the Himalaya you can reach by coach from Delhi overnight. Shimla is the "
        "old summer capital — the Ridge, Mall Road, a toy train and Kufri's hills an hour "
        "up. Manali, seven hours further, is the base for Solang valley's snow, the Atal "
        "tunnel to Lahaul and the deodar forest around the Hadimba temple.\n\n"
        "East of Manali the Parvati valley is a different mood: Kasol's riverside cafés, "
        "the hot springs at Manikaran and hillside villages like Tosh that you walk into.\n\n"
        "**Best time:** March to June for clear skies and open passes; December to February "
        "for snow at Solang (carry proper layers). July to September is monsoon — landslides "
        "close roads and we do not run departures."
    ),
    cover={
        "file": "himachal/manali-mountains.jpg",
        "alt": "Snow peaks above the Manali valley",
    },
    region="North India",
    best_months=[3, 4, 5, 6, 12],
    position=3,
)
```

- [ ] **Step 4: Package 1 — Munnar & Alleppey Houseboat**

`api/content/packages/munnar_alleppey_houseboat.py` — every field below is final except the day `description` strings, which the implementer writes in the Goa voice (2–3 sentences, the named sights, one practical detail such as a drive time or a meal; the comment beside each `"…"` lists what to cover). Titles, meals, stays and locations are fixed:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="munnar-alleppey-houseboat",
    destination="kerala",
    name="Munnar & Alleppey Houseboat",
    summary=(
        "Two nights among Munnar's tea estates, a night on a private houseboat on the "
        "Vembanad backwaters and a last evening in Fort Kochi. The Kerala trip we would pick."
    ),
    themes=["hills", "honeymoon"],
    nights=4,
    departure_city="Ex-Bengaluru",
    highlights=[
        "A night on a private houseboat on the Vembanad backwaters",
        "Eravikulam park and the tea estates above Munnar",
        "Fort Kochi's Chinese fishing nets and a Kathakali evening",
        "A tea-estate stay with the plantation on your doorstep",
    ],
    inclusions=[
        "2 nights at Tea Valley Resort, Munnar, breakfast and dinner",
        "1 night on a private one-bedroom houseboat, Alleppey — lunch, dinner, breakfast",
        "1 night at Fort House, Fort Kochi, breakfast included",
        "Private car with driver for all transfers and sightseeing (Kochi airport to airport)",
        "Eravikulam park entry and the Kathakali performance in Fort Kochi",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights or train to Kochi (we can book them for you at cost)",
        "Meals not listed above",
        "Tea museum entry, boat rides at Mattupetty and camera fees (about ₹600 per person)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Tea Valley Resort", "city": "Munnar", "stars": 3, "nights": 2},
        {"name": "Spice Routes houseboat", "city": "Alleppey", "stars": 4, "nights": 1},
        {"name": "Fort House", "city": "Fort Kochi", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "Is Eravikulam open on our dates?",
            "a": "The park closes for the Nilgiri tahr calving season, usually February to early "
            "April. On those departures we swap in Top Station and the Kolukkumalai tea "
            "estate jeep ride instead.",
        },
        {
            "q": "What is the houseboat like?",
            "a": "A one-bedroom kettuvallam with an air-conditioned cabin, attached bathroom and "
            "an open upper deck. A crew of three cooks on board — Kerala meals, fish if you "
            "want it. It moors by 5.30 pm as the backwater rules require.",
        },
        {
            "q": "Can we add Varkala or Kovalam?",
            "a": "Yes — two extra nights on the coast after Kochi is our most common extension. "
            "Ask when you enquire and we quote it with the same driver.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Kochi, drive up to the tea country",
            "description": "…",  # Kochi airport pick-up; 4 h climb via Cheeyappara falls; check in above the estates; dinner at the resort
            "meals": "D",
            "stay": "Tea Valley Resort, Munnar",
            "location_name": "Munnar",
        },
        {
            "title": "Eravikulam, Mattupetty and the tea museum",
            "description": "…",  # Nilgiri tahr at Eravikulam early; Mattupetty dam and Echo point; KDHP tea museum; evening walk in the estate
            "meals": "BD",
            "stay": "Tea Valley Resort, Munnar",
            "location_name": "Eravikulam",
        },
        {
            "title": "Down to Alleppey, board the houseboat",
            "description": "…",  # 5 h drive; board at noon at Punnamada; lunch under way; canals and paddies; moored by sunset; dinner on deck
            "meals": "BLD",
            "stay": "Houseboat, Vembanad lake",
            "location_name": "Alleppey",
        },
        {
            "title": "Fort Kochi: fishing nets, Mattancherry, Kathakali",
            "description": "…",  # breakfast on board; disembark 9 am; 1.5 h to Fort Kochi; the Chinese nets; Mattancherry palace and Jew Town; Kathakali at 6 pm
            "meals": "B",
            "stay": "Fort House, Fort Kochi",
            "location_name": "Fort Kochi",
        },
        {
            "title": "Kochi morning and departure",
            "description": "…",  # St Francis church walk; coffee on Princess Street; drop at Kochi airport (1 h)
            "meals": "B",
            "location_name": "Kochi",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 13),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 22_999,
            "price_triple_inr": 20_999,
            "price_child_inr": 13_499,
            "single_supplement_inr": 9_500,
        },
        {
            "date": dt.date(2026, 12, 18),
            "seats_total": 10,
            "price_double_inr": 25_999,
            "price_triple_inr": 23_999,
            "price_child_inr": 15_499,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 1, 15),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 2, 12),
            "seats_total": 12,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_999,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "kerala/munnar-tea-aerial.jpg", "alt": "Tea estates of Munnar from above"},
        {"file": "kerala/munnar-tea-gardens.jpg", "alt": "Tea bushes on a Munnar hillside"},
        {"file": "kerala/alleppey-houseboat.jpg", "alt": "A kettuvallam houseboat on the backwaters"},
        {"file": "kerala/alleppey-backwaters-1.jpg", "alt": "A backwater canal near Alleppey"},
        {"file": "kerala/fort-kochi-fishing-nets.jpg", "alt": "Chinese fishing nets at Fort Kochi"},
    ],
    status="live",
    featured=True,
)
```

(Every `"…"` is replaced by real prose before commit — `test_content` does not check prose, the reviewer does. Alt texts are adjusted to what the fetched photo actually shows; ruff will want the long `photos` lines wrapped.)

- [ ] **Step 5: Package 2 — Kochi · Thekkady · Kovalam**

`api/content/packages/kochi_thekkady_kovalam.py` — same rule for descriptions:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="kochi-thekkady-kovalam",
    destination="kerala",
    name="Kochi · Thekkady · Kovalam",
    summary=(
        "Six days from the old harbour to the Periyar forest to the beach at Kovalam — one "
        "coach, one guide, and hotels chosen for families. Kerala's greatest hits, unhurried."
    ),
    themes=["family", "heritage"],
    nights=5,
    departure_city="Ex-Bengaluru",
    highlights=[
        "Periyar lake boat safari at dawn — elephants and bison at the water",
        "Fort Kochi on foot: the fishing nets, St Francis church, the Dutch palace",
        "A spice-plantation walk and a Kalaripayattu show at Thekkady",
        "Two nights beside Lighthouse beach at Kovalam",
    ],
    inclusions=[
        "1 night at Fort House, Fort Kochi; 2 nights at Elephant Court, Thekkady; "
        "2 nights at Uday Samudra, Kovalam — breakfast daily",
        "Air-conditioned coach with a Tripsmith guide, Kochi airport to Thiruvananthapuram airport",
        "Periyar boat safari, spice-plantation walk and the Kalaripayattu show",
        "Fort Kochi walking tour with the Kathakali performance",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Kochi and back from Thiruvananthapuram (we can book them for you at cost)",
        "Lunches and dinners",
        "Padmanabhaswamy temple and Napier museum entries, ayurvedic treatments",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Fort House", "city": "Fort Kochi", "stars": 3, "nights": 1},
        {"name": "Elephant Court", "city": "Thekkady", "stars": 4, "nights": 2},
        {"name": "Uday Samudra Leisure Beach Hotel", "city": "Kovalam", "stars": 4, "nights": 2},
    ],
    faq=[
        {
            "q": "Is this trip suitable for young children?",
            "a": "Yes — the longest drive is the Thekkady to Kovalam day (about six hours with "
            "stops), both resorts have pools, and the Periyar boat is a calm one-and-a-half "
            "hour ride. Children under five travel free without a seat or bed.",
        },
        {
            "q": "Will we see elephants at Periyar?",
            "a": "Usually, at the water's edge on the early boat — but it is a wild reserve and "
            "nothing is guaranteed. Bison, sambar and otters are near-certain; the elephant "
            "camp visit later that day is.",
        },
        {
            "q": "Can we fly in and out of the same airport?",
            "a": "The route is linear, so flying into Kochi and out of Thiruvananthapuram "
            "saves a six-hour drive. If you must use one airport, tell us and we quote the "
            "extra transfer.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Kochi, the fort on foot, Kathakali at dusk",
            "description": "…",  # airport pick-up; Fort Kochi walk: Chinese nets, St Francis church, Mattancherry palace; Kathakali at 6 pm
            "meals": "",
            "stay": "Fort House, Fort Kochi",
            "location_name": "Fort Kochi",
        },
        {
            "title": "Into the hills to Thekkady, spice plantation walk",
            "description": "…",  # 4.5 h via rubber and pineapple country; check in; afternoon plantation walk (pepper, cardamom, cinnamon)
            "meals": "B",
            "stay": "Elephant Court, Thekkady",
            "location_name": "Thekkady",
        },
        {
            "title": "Periyar boat safari, elephant camp, Kalaripayattu",
            "description": "…",  # 7.30 am boat on Periyar lake; elephant camp; evening Kalaripayattu show
            "meals": "B",
            "stay": "Elephant Court, Thekkady",
            "location_name": "Periyar",
        },
        {
            "title": "Down through the Ghats to Kovalam",
            "description": "…",  # 6 h with a lunch stop; Lighthouse beach at sunset
            "meals": "B",
            "stay": "Uday Samudra, Kovalam",
            "location_name": "Kovalam",
        },
        {
            "title": "Kovalam beach day or Thiruvananthapuram",
            "description": "…",  # free morning on the beach or pool; optional Padmanabhaswamy temple + Napier museum in the city (40 min)
            "meals": "B",
            "stay": "Uday Samudra, Kovalam",
            "location_name": "Thiruvananthapuram",
        },
        {
            "title": "Departure from Thiruvananthapuram",
            "description": "…",  # last swim; drop at the airport (30 min)
            "meals": "B",
            "location_name": "Thiruvananthapuram",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 27),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 27_999,
            "price_triple_inr": 25_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 12_000,
        },
        {
            "date": dt.date(2026, 12, 23),
            "seats_total": 14,
            "price_double_inr": 31_999,
            "price_triple_inr": 29_499,
            "price_child_inr": 18_999,
            "single_supplement_inr": 14_000,
        },
        {
            "date": dt.date(2027, 1, 22),
            "seats_total": 16,
            "price_double_inr": 28_499,
            "price_triple_inr": 25_999,
            "price_child_inr": 16_999,
            "single_supplement_inr": 12_000,
        },
    ],
    photos=[
        {"file": "kerala/periyar-lake.jpg", "alt": "Periyar lake at Thekkady"},
        {"file": "kerala/fort-kochi-fishing-nets.jpg", "alt": "Chinese fishing nets at Fort Kochi"},
        {"file": "kerala/kovalam-lighthouse-beach.jpg", "alt": "Lighthouse beach, Kovalam"},
        {"file": "kerala/thekkady-spice-plantation.jpg", "alt": "A spice plantation near Thekkady"},
        {"file": "kerala/mattancherry-palace.jpg", "alt": "Mattancherry in old Kochi"},
    ],
    status="live",
)
```

- [ ] **Step 6: Package 3 — Shimla–Manali Classic**

`api/content/packages/shimla_manali_classic.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="shimla-manali-classic",
    destination="himachal",
    name="Shimla–Manali Classic",
    summary=(
        "The hill trip everyone should do once: two nights on Shimla's Mall Road, two in "
        "Manali, snow at Solang in season, all by coach from Delhi. Easy on families."
    ),
    themes=["hills", "family"],
    nights=4,
    departure_city="Ex-Delhi",
    highlights=[
        "Snow at Solang valley from December to March; ropeway and paragliding after",
        "Kufri's Himalayan nature park and the Ridge at Shimla",
        "The Hadimba temple in its deodar forest and Old Manali's cafés",
        "Coach throughout — no flights to book, no luggage limits",
    ],
    inclusions=[
        "2 nights at Willow Banks, Mall Road, Shimla; 2 nights at Snow Valley Resorts, Manali — "
        "breakfast and dinner daily",
        "Air-conditioned coach Delhi → Shimla → Manali with a Tripsmith guide",
        "Return overnight Volvo coach Manali → Delhi on the last evening",
        "Kufri, Jakhu, Solang valley and Hadimba temple excursions",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Lunches",
        "Solang activities (ropeway about ₹700, paragliding about ₹2,500), snow gear hire",
        "Atal tunnel / Sissu excursion when roads permit (about ₹1,200 per person, paid locally)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Willow Banks", "city": "Shimla", "stars": 3, "nights": 2},
        {"name": "Snow Valley Resorts", "city": "Manali", "stars": 3, "nights": 2},
    ],
    faq=[
        {
            "q": "Will there be snow?",
            "a": "At Solang, reliably from mid-December to early March; Kufri gets it in January. "
            "On the spring departures Solang is green and the ropeway and paragliding are "
            "the draw instead.",
        },
        {
            "q": "How long are the coach days?",
            "a": "Delhi to Shimla is about eight hours with two stops; Shimla to Manali about "
            "seven along the Beas. The return is an overnight Volvo — sleeper-style seats, "
            "reaching Delhi around 7 am.",
        },
        {
            "q": "Is Rohtang pass included?",
            "a": "No. Rohtang needs a permit lottery and closes without notice; the Atal tunnel "
            "to Sissu gives the same views in forty minutes and is offered on the day when "
            "the road is open.",
        },
    ],
    itinerary=[
        {
            "title": "Delhi to Shimla, evening on the Ridge",
            "description": "…",  # 6 am coach; 8 h via Chandigarh; check in on Mall Road; the Ridge and Christ Church at dusk; dinner
            "meals": "D",
            "stay": "Willow Banks, Shimla",
            "location_name": "Shimla",
        },
        {
            "title": "Kufri, Jakhu temple, Lakkar bazaar",
            "description": "…",  # Kufri nature park (Himalayan animals, yak rides); Jakhu hill temple; wooden toys at Lakkar bazaar
            "meals": "BD",
            "stay": "Willow Banks, Shimla",
            "location_name": "Kufri",
        },
        {
            "title": "Along the Beas to Manali, Hadimba at dusk",
            "description": "…",  # 7 h via Kullu; Hadimba temple; Old Manali walk; dinner
            "meals": "BD",
            "stay": "Snow Valley Resorts, Manali",
            "location_name": "Manali",
        },
        {
            "title": "Solang valley (and the Atal tunnel when open)",
            "description": "…",  # snow / ropeway / paragliding; optional Sissu via the tunnel; Vashisht hot springs on the way back
            "meals": "BD",
            "stay": "Snow Valley Resorts, Manali",
            "location_name": "Solang",
        },
        {
            "title": "Manali morning, overnight coach to Delhi",
            "description": "…",  # Mall Road morning; Tibetan monastery; 5 pm Volvo; Delhi about 7 am next day
            "meals": "B",
            "location_name": "Manali",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 19),
            "seats_total": 24,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_999,
            "single_supplement_inr": 8_000,
        },
        {
            "date": dt.date(2027, 3, 20),
            "seats_total": 24,
            "price_double_inr": 18_499,
            "price_triple_inr": 16_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 4, 17),
            "seats_total": 24,
            "guaranteed": True,
            "price_double_inr": 18_499,
            "price_triple_inr": 16_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 5, 15),
            "seats_total": 24,
            "price_double_inr": 19_999,
            "price_triple_inr": 17_999,
            "price_child_inr": 11_999,
            "single_supplement_inr": 7_500,
        },
    ],
    photos=[
        {"file": "himachal/solang-snow-bridge.jpg", "alt": "Snow at Solang valley"},
        {"file": "himachal/shimla-ridge.jpg", "alt": "The Ridge at Shimla"},
        {"file": "himachal/kufri.jpg", "alt": "Hills at Kufri"},
        {"file": "himachal/hadimba-temple.jpg", "alt": "The Hadimba temple among deodars"},
        {"file": "himachal/manali-mountains.jpg", "alt": "Snow peaks above the Manali valley"},
    ],
    status="live",
    featured=True,
)
```

- [ ] **Step 7: Package 4 — Manali · Kasol · Tosh**

`api/content/packages/manali_kasol_tosh.py`:

```python
import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="manali-kasol-tosh",
    destination="himachal",
    name="Manali · Kasol · Tosh",
    summary=(
        "Two nights in Old Manali, two on the Parvati river at Kasol and one up in the "
        "village of Tosh, with the walk in. Cafés, hot springs and a proper hill trail."
    ),
    themes=["hills", "adventure"],
    nights=5,
    departure_city="Ex-Delhi",
    highlights=[
        "Two nights on the Parvati river at Kasol",
        "The hike up to Tosh and a night in the village",
        "Manikaran's hot springs and the drive towards Malana",
        "Solang valley and the Atal tunnel to Sissu",
    ],
    inclusions=[
        "2 nights at Johnson Lodge, Old Manali; 2 nights at Parvati Kuteer, Kasol; 1 night at a "
        "guesthouse in Tosh — breakfast daily",
        "Overnight Volvo coach Delhi → Manali (leaves the evening before day 1) and Kullu → Delhi",
        "Tempo traveller for Manali–Kasol–Barshaini–Kullu with a Tripsmith trip lead",
        "Solang valley and Manikaran excursions; the Tosh walk with the trip lead",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Lunches and dinners (Kasol's cafés are the point)",
        "Atal tunnel / Sissu excursion when roads permit (about ₹1,200 per person, paid locally)",
        "Porter for the Tosh walk if wanted (about ₹500)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Johnson Lodge", "city": "Old Manali", "stars": 3, "nights": 2},
        {"name": "Parvati Kuteer", "city": "Kasol", "stars": 3, "nights": 2},
        {"name": "Hill Top guesthouse", "city": "Tosh", "stars": 2, "nights": 1},
    ],
    faq=[
        {
            "q": "How hard is the walk to Tosh?",
            "a": "About an hour uphill from the road head at Barshaini on a paved path — "
            "trainers are fine. Bags go up by porter if you want. Kheerganga (a further 4–5 "
            "hours) is optional on the morning of day 6 for those who want it.",
        },
        {
            "q": "Is this a party trip?",
            "a": "No. Kasol is relaxed and the cafés close by 11 pm; Tosh is a village with "
            "a few guesthouses. Groups are sixteen at most and mixed — solo travellers, "
            "couples, friends.",
        },
        {
            "q": "What is the guesthouse in Tosh like?",
            "a": "Simple and clean: a double room with an attached bathroom, hot water in the "
            "evening, a café terrace facing the valley. It is the best available in the "
            "village; do not expect a hotel.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Manali, Old Manali and the Manu temple",
            "description": "…",  # overnight coach arrives about 9 am; check in; Old Manali walk; Manu temple; café evening
            "meals": "",
            "stay": "Johnson Lodge, Old Manali",
            "location_name": "Manali",
        },
        {
            "title": "Solang valley, Vashisht hot springs",
            "description": "…",  # Solang (snow / ropeway / paragliding); optional Atal tunnel to Sissu; Vashisht springs on the way back
            "meals": "B",
            "stay": "Johnson Lodge, Old Manali",
            "location_name": "Solang",
        },
        {
            "title": "Down the Beas and up the Parvati to Kasol",
            "description": "…",  # 3 h via Bhuntar; check in on the river; walk across the bridge to Chalal; evening in the cafés
            "meals": "B",
            "stay": "Parvati Kuteer, Kasol",
            "location_name": "Kasol",
        },
        {
            "title": "Manikaran and the road towards Malana",
            "description": "…",  # gurudwara and hot springs at Manikaran; langar lunch; drive to the Malana viewpoint; back by evening
            "meals": "B",
            "stay": "Parvati Kuteer, Kasol",
            "location_name": "Manikaran",
        },
        {
            "title": "Walk up to Tosh",
            "description": "…",  # drive to Barshaini (1 h); the hour's walk up; afternoon on the terrace; sunset over the valley
            "meals": "B",
            "stay": "Hill Top guesthouse, Tosh",
            "location_name": "Tosh",
        },
        {
            "title": "Tosh morning, overnight coach home",
            "description": "…",  # optional early Kheerganga leg; walk down; drive to Kullu; 6 pm Volvo; Delhi about 8 am
            "meals": "B",
            "location_name": "Kullu",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 5),
            "seats_total": 16,
            "price_double_inr": 21_499,
            "price_triple_inr": 19_499,
            "price_child_inr": 12_999,
            "single_supplement_inr": 7_500,
        },
        {
            "date": dt.date(2027, 4, 3),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 19_999,
            "price_triple_inr": 18_499,
            "price_child_inr": 12_499,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 5, 8),
            "seats_total": 16,
            "price_double_inr": 19_999,
            "price_triple_inr": 18_499,
            "price_child_inr": 12_499,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 6, 5),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 20_999,
            "price_triple_inr": 19_499,
            "price_child_inr": 12_999,
            "single_supplement_inr": 7_500,
        },
    ],
    photos=[
        {"file": "himachal/kasol-parvati-river.jpg", "alt": "The Parvati river at Kasol"},
        {"file": "himachal/tosh-village.jpg", "alt": "Tosh village on its ridge"},
        {"file": "himachal/manikaran.jpg", "alt": "Manikaran on the Parvati river"},
        {"file": "himachal/kheerganga.jpg", "alt": "The meadow at Kheerganga"},
        {"file": "himachal/old-manali.jpg", "alt": "A lane in Old Manali"},
        {"file": "himachal/solang-valley.jpg", "alt": "Solang valley in spring"},
    ],
    status="live",
)
```

- [ ] **Step 8: Write the prose, then run the rules test**

Fill every `"…"` (22 day descriptions) and delete the trailing `#` notes. Read `north_goa_beaches.py` first for the register. Then:

Run: `uv run --directory api pytest tests/test_content.py -q`
Expected: **6 passed**. If `test_no_photo_is_unused` fails, either reference the spare photo in a package (≤ 8) or delete it with its credit row — no orphans.

Run: `uv run --directory api python -c "from content import load_content; c = load_content(); print(len(c.destinations), len(c.packages)); print(*[(p.slug, p.nights, len(p.itinerary), len(p.photos)) for p in c.packages], sep='\n')"`
Expected: `3 6` and six rows — the pydantic rules (itinerary = nights + 1, hotel nights = nights, 4–8 photos, unique dates) all passed at import.

- [ ] **Step 9: Seed locally and look at it**

```bash
cd api && uv run python scripts/seed.py --local --database-url $DEV_URL && cd ..
```
Expected: `destinations 3`, `packages 6`, `departures 22`, `images 33` (Goa 6 + 6, Kerala 5 + 5, Himachal 5 + 6).

With the api on 8000 and `pnpm --filter web dev` running: open `http://localhost:3000/packages` — six cards, three destinations in the rail, every theme has a count; `?destination=himachal&month=2026-12` → two cards; open each new `/packages/<slug>` — photos load, itinerary days read well, departures table shows 3–4 rows with the right badges. Fix any prose that reads wrong here, not later.

- [ ] **Step 10: Whole api suite + lint, commit**

Run: `uv run --directory api pytest -q`
Expected: **113 passed** (107 + 6).

Run: `uv run --directory api ruff check . && uv run --directory api ruff format --check . && uv run --directory api pyright`
Expected: clean.

```bash
git add api/content api/tests/test_content.py
git commit -m "content(F4): Kerala and Himachal — four packages, 22 departures, rules test for the live catalog"
```

---

### Task 4: `DestinationCard.bestMonths` + contract regeneration

**Files:**
- Modify: `api/app/schemas/catalog.py` (`DestinationCard`)
- Modify: `api/app/services/catalog/reads.py` (`list_destinations`)
- Modify: `api/tests/test_catalog_reads.py` (`test_destinations_list_counts_live_packages`)
- Regenerate: `api/openapi.json`, `web/src/lib/api-types.ts`

**Interfaces:**
- Produces: `DestinationCard.best_months: list[int]` (JSON `bestMonths`, values 1–12, the destination's display order); `components['schemas']['DestinationCard']['bestMonths']: number[]` on the web.

- [ ] **Step 1: Write the failing assertion**

In `api/tests/test_catalog_reads.py`, inside `test_destinations_list_counts_live_packages` after the `assert goa["coverUrl"].startswith(…)` line, add:

```python
    assert goa["bestMonths"] == [11, 12, 1, 2]  # the S2 pill: "2 trips · best Nov – Feb"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `uv run --directory api pytest tests/test_catalog_reads.py::test_destinations_list_counts_live_packages -q`
Expected: FAIL with `KeyError: 'bestMonths'`

- [ ] **Step 3: Add the field and populate it**

`api/app/schemas/catalog.py`, in `DestinationCard` after `starting_price_paise: int`:

```python
    best_months: list[int] = Field(description="1-12, in the destination's display order")
```

`api/app/services/catalog/reads.py`, in `list_destinations`'s `DestinationCard(...)` after `starting_price_paise=cheapest,`:

```python
            best_months=list(d.best_months),
```

- [ ] **Step 4: Run it to verify it passes; regenerate the contract**

Run: `uv run --directory api pytest tests/test_catalog_reads.py -q`
Expected: all pass.

Run: `pnpm gen:api && git diff --stat api/openapi.json web/src/lib/api-types.ts`
Expected: both files changed (a `bestMonths` array on `DestinationCard`). Then `pnpm --filter web test` → **47 passed** (the contract-freshness test is happy again) and `pnpm --filter web typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas/catalog.py api/app/services/catalog/reads.py api/tests/test_catalog_reads.py api/openapi.json web/src/lib/api-types.ts
git commit -m "feat(F5): bestMonths on the destination card; contract regenerated"
```

---

### Task 5: Web helpers — `monthRange`, prose blocks, destination JSON-LD

**Files:**
- Modify: `web/src/lib/format.ts`
- Create: `web/src/lib/prose.ts`, `web/src/components/site/Prose.tsx`, `web/src/lib/seo/destination-jsonld.ts`
- Test: `web/tests/destinations.test.ts`

**Interfaces:**
- Produces: `monthRange(months: number[]): string`; `MONTHS` (exported, `'Jan'…'Dec'`); `type Inline = string | { strong: string }`; `proseBlocks(markdown: string): Inline[][]`; `<Prose markdown className? />`; `destinationJsonLd(d: DestinationDetail, url: string): Record<string, unknown>`.

- [ ] **Step 1: Write the failing tests**

`web/tests/destinations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { components } from '../src/lib/api-types';
import { monthRange } from '../src/lib/format';
import { proseBlocks } from '../src/lib/prose';
import { destinationJsonLd } from '../src/lib/seo/destination-jsonld';

type DestinationDetail = components['schemas']['DestinationDetail'];

describe('monthRange', () => {
  it('joins a run that wraps the year end', () => {
    expect(monthRange([11, 12, 1, 2])).toBe('Nov – Feb');
    expect(monthRange([2, 1, 12, 11])).toBe('Nov – Feb'); // order does not matter
  });
  it('lists several runs and single months', () => {
    expect(monthRange([3, 4, 5, 6, 12])).toBe('Mar – Jun · Dec');
    expect(monthRange([6])).toBe('Jun');
    expect(monthRange([9, 10, 11, 12, 1, 2, 3])).toBe('Sep – Mar');
  });
  it('handles the edges', () => {
    expect(monthRange([])).toBe('');
    expect(monthRange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('All year');
  });
});

describe('proseBlocks', () => {
  it('splits paragraphs on blank lines and joins soft line breaks', () => {
    expect(proseBlocks('One\nline.\n\nTwo.\n')).toEqual([['One line.'], ['Two.']]);
  });
  it('turns **bold** into strong parts and leaves the rest as text', () => {
    expect(proseBlocks('**Best time:** Nov to Feb — dry.')).toEqual([
      [{ strong: 'Best time:' }, ' Nov to Feb — dry.'],
    ]);
  });
});

describe('destinationJsonLd', () => {
  const card = (slug: string, themes: DestinationDetail['packages'][number]['themes']) => ({
    slug,
    name: slug,
    destination: 'Kerala',
    nights: 4,
    days: 5,
    startingPricePaise: 21_999_00,
    themes,
    coverUrl: 'https://blob.test/x.jpg',
    highlights: ['a'],
    badge: null,
  });
  const d: DestinationDetail = {
    slug: 'kerala',
    name: 'Kerala',
    tagline: 'Backwaters, tea hills and a slow coast',
    intro: 'Kerala is…',
    coverUrl: 'https://blob.test/kerala.jpg',
    region: 'South India',
    bestMonths: [9, 10, 11],
    packages: [card('a', ['hills', 'honeymoon']), card('b', ['family', 'heritage'])],
  };
  it('is a TouristDestination in India with the union of the trips themes', () => {
    const ld = destinationJsonLd(d, 'https://tripsmith.vercel.app/destinations/kerala');
    expect(ld['@type']).toBe('TouristDestination');
    expect(ld.name).toBe('Kerala');
    expect(ld.url).toBe('https://tripsmith.vercel.app/destinations/kerala');
    expect(ld.image).toBe('https://blob.test/kerala.jpg');
    expect(ld.containedInPlace).toEqual({ '@type': 'Country', name: 'India' });
    expect(ld.touristType).toEqual(['hills', 'honeymoon', 'family', 'heritage']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter web test -- tests/destinations.test.ts`
Expected: FAIL — cannot resolve `../src/lib/prose` / `destination-jsonld`; `monthRange` is not exported.

- [ ] **Step 3: `monthRange`**

In `web/src/lib/format.ts` change `const MONTHS` to `export const MONTHS` and append:

```ts
/**
 * `[11, 12, 1, 2]` → `Nov – Feb`. Runs may wrap the year end; several runs join with ` · `
 * (`Mar – Jun · Dec`); every month → `All year`; nothing → ``.
 */
export function monthRange(months: number[]): string {
  const set = new Set(months);
  if (set.size === 0) return '';
  if (set.size === 12) return 'All year';
  const prev = (m: number) => ((m + 10) % 12) + 1;
  const next = (m: number) => (m % 12) + 1;
  const starts = [...set].filter((m) => !set.has(prev(m))).sort((a, b) => a - b);
  return starts
    .map((start) => {
      let end = start;
      while (set.has(next(end))) end = next(end);
      return start === end ? MONTHS[start - 1] : `${MONTHS[start - 1]} – ${MONTHS[end - 1]}`;
    })
    .join(' · ');
}
```

- [ ] **Step 4: Prose**

`web/src/lib/prose.ts`:

```ts
export type Inline = string | { strong: string };

/**
 * The seed's markdown is paragraphs (blank-line separated) with `**bold**` runs — that is all
 * this renders, on purpose: no markdown dependency for two constructs. Line breaks inside a
 * paragraph are soft (joined with a space).
 */
export function proseBlocks(markdown: string): Inline[][] {
  return markdown
    .trim()
    .split(/\n[ \t]*\n/)
    .filter((para) => para.trim())
    .map((para) =>
      para
        .replace(/\s*\n\s*/g, ' ')
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map((part): Inline =>
          part.startsWith('**') && part.endsWith('**') ? { strong: part.slice(2, -2) } : part,
        ),
    );
}
```

`web/src/components/site/Prose.tsx`:

```tsx
import { proseBlocks } from '@/lib/prose';

/** Paragraph + bold markdown (destination intros). The first paragraph reads as a lede. */
export function Prose({ markdown, className = '' }: { markdown: string; className?: string }) {
  return (
    <div className={`grid max-w-[62ch] gap-4 leading-relaxed text-ink2 ${className}`}>
      {proseBlocks(markdown).map((para, i) => (
        <p key={i} className={i === 0 ? 'text-lg' : undefined}>
          {para.map((part, j) =>
            typeof part === 'string' ? (
              part
            ) : (
              <strong key={j} className="font-bold text-ink">
                {part.strong}
              </strong>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: JSON-LD**

`web/src/lib/seo/destination-jsonld.ts`:

```ts
import type { components } from '@/lib/api-types';

type DestinationDetail = components['schemas']['DestinationDetail'];

/** schema.org TouristDestination (R2 acceptance). `touristType` = every theme its live trips carry. */
export function destinationJsonLd(d: DestinationDetail, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: d.name,
    description: d.tagline,
    url,
    image: d.coverUrl,
    containedInPlace: { '@type': 'Country', name: 'India' },
    touristType: [...new Set(d.packages.flatMap((p) => p.themes))],
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter web test`
Expected: **53 passed** (47 + 6).

Run: `pnpm --filter web lint && pnpm --filter web typecheck`
Expected: clean (if prettier wants the `Prose` ternary reflowed: `pnpm --filter web exec prettier --write src/components/site/Prose.tsx`).

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/format.ts web/src/lib/prose.ts web/src/components/site/Prose.tsx web/src/lib/seo/destination-jsonld.ts web/tests/destinations.test.ts
git commit -m "feat(F5): monthRange, prose blocks and TouristDestination JSON-LD helpers"
```

---

### Task 6: `/destinations` — the grid, tiles, header link

**Files:**
- Create: `web/src/components/site/destinations/DestinationTile.tsx`, `web/src/app/(site)/destinations/page.tsx`
- Modify: `web/src/components/site/SiteHeader.tsx`

**Interfaces:**
- Consumes: `api('/destinations', { tags, revalidate })` → `{ items: DestinationCard[] }` with `bestMonths` (Task 4); `Photo`, `Container`; `inr`, `monthRange`; `animate-rise`.
- Produces: `<DestinationTile card index />` (an `<li>`); page `/destinations` with `generateMetadata`; header **Destinations** link.

- [ ] **Step 1: The tile**

`web/src/components/site/destinations/DestinationTile.tsx`:

```tsx
import Link from 'next/link';
import { Photo } from '@/components/site/Photo';
import type { components } from '@/lib/api-types';
import { inr, monthRange } from '@/lib/format';

type Card = components['schemas']['DestinationCard'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * S2 tile: cover with a dark foot, a pill with the trip count and best months, name and
 * "tagline · starting ₹X". 4:3 on the grid, 16:9 one-up on phones; rises in by `index`.
 */
export function DestinationTile({ card, index }: { card: Card; index: number }) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <Link href={`/destinations/${card.slug}`} className="block text-white no-underline">
        <Photo
          src={card.coverUrl}
          alt=""
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/9] rounded-card sm:aspect-[4/3]"
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-[rgb(10_20_30/0.8)] to-transparent to-55%"
          />
          <span className="num absolute top-3 left-3 rounded-chip bg-bg/90 px-2.5 py-1 text-xs font-bold text-ink">
            {plural(card.packageCount, 'trip', 'trips')} · best {monthRange(card.bestMonths)}
          </span>
          <span className="absolute inset-x-3.5 bottom-3.5 grid gap-0.5 [text-shadow:0_2px_16px_rgb(0_0_0/0.35)]">
            <b className="text-[24px] leading-tight font-extrabold tracking-tight sm:text-[26px]">
              {card.name}
            </b>
            <small className="num text-xs font-semibold opacity-95">
              {card.tagline}
              {card.startingPricePaise > 0 && ` · starting ${inr(card.startingPricePaise)}`}
            </small>
          </span>
        </Photo>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: The page**

`web/src/app/(site)/destinations/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { DestinationTile } from '@/components/site/destinations/DestinationTile';
import { api } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Static with hourly ISR like the package page: counts and from-prices follow today's date.
 * Tagged `destinations` so admin edits (F18) can purge it on demand.
 */
const REVALIDATE_SECONDS = 60 * 60;

const load = () => api('/destinations', { tags: ['destinations'], revalidate: REVALIDATE_SECONDS });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `['Goa', 'Kerala', 'Himachal']` → `Goa, Kerala and Himachal` */
const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');

export async function generateMetadata(): Promise<Metadata> {
  const { items } = await load();
  return {
    title: 'Destinations',
    description: `${listNames(items.map((d) => d.name))} — every place Tripsmith runs trips to, with how many trips, the best months and the starting price.`,
    alternates: { canonical: `${SITE_URL}/destinations` },
  };
}

export default async function DestinationsPage() {
  const { items } = await load();
  const trips = items.reduce((n, d) => n + d.packageCount, 0);

  return (
    <Container className="pb-20">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          Destinations
        </span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Places we know like the back of our hand.</h1>
        <p className="num mt-1.5 max-w-[60ch] text-base text-mute">
          {plural(trips, 'trip', 'trips')} across {plural(items.length, 'destination', 'destinations')}{' '}
          — every one run by us, with departures you can count on.
        </p>
      </header>
      {items.length > 0 ? (
        <ul className="grid gap-4 pt-5 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-3">
          {items.map((d, i) => (
            <DestinationTile key={d.slug} card={d} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-card border border-dashed border-line p-8 text-center text-mute">
          No destinations with live trips right now — see{' '}
          <Link href="/packages">holiday packages</Link>.
        </p>
      )}
    </Container>
  );
}
```

- [ ] **Step 3: Header link**

In `web/src/components/site/SiteHeader.tsx` insert before the Trips link (and drop "F5 Destinations" from the comment above the component):

```tsx
          <Link href="/destinations" className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
            Destinations
          </Link>
```

- [ ] **Step 4: Look at it**

With the api (local DB, seeded in Task 3) and `pnpm --filter web dev` running:

```bash
curl -s http://localhost:3000/destinations | grep -o "6 trips across 3 destinations\|best Nov – Feb\|best Sep – Mar\|best Mar – Jun · Dec\|starting ₹21,999\|starting ₹18,499" | sort -u
```
Expected: `6 trips across 3 destinations`, the three `best …` strings, the two `starting …` strings (plus Goa's, whatever `/packages` shows as its cheapest).

Open `http://localhost:3000/destinations` in a browser at desktop and 390 px: three tiles (4:3) rising in one after another; on the phone one-up 16:9; the pill and the name are readable over every cover (if a cover is too bright at the foot, the gradient is the fix, not the photo). `<title>` is "Destinations"; the header shows Home · Destinations · Trips. Reduced motion (DevTools rendering → emulate): tiles simply appear.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck`
Expected: clean.

```bash
git add web/src/components/site/destinations/DestinationTile.tsx "web/src/app/(site)/destinations/page.tsx" web/src/components/site/SiteHeader.tsx
git commit -m "feat(F5): /destinations grid — tiles with trip count, best months and from-price; header link"
```

---

### Task 7: `/destinations/[slug]` — hero, intro, best months, trips, aside; breadcrumb link from packages

**Files:**
- Create: `web/src/components/site/destinations/DestinationHero.tsx`, `web/src/components/site/destinations/BestMonths.tsx`, `web/src/app/(site)/destinations/[slug]/page.tsx`
- Modify: `web/src/components/site/package/PackageHero.tsx`

**Interfaces:**
- Consumes: `api('/destinations/{slug}', { params, tags, revalidate })` → `DestinationDetail` (`packages: PackageCard[]` cheapest first, `bestMonths`, `intro` markdown); `Prose`, `destinationJsonLd`, `monthRange`, `MONTHS`, `inr`, `PackageCard`, `JsonLd`, `Photo`, `Container`; `ApiRequestError` + `notFound()`.
- Produces: `<DestinationHero d from />`, `<BestMonths months />`; page `/destinations/[slug]` with `generateStaticParams` + `generateMetadata`; the package page's breadcrumb links to the destination.

- [ ] **Step 1: Hero**

`web/src/components/site/destinations/DestinationHero.tsx`:

```tsx
import Link from 'next/link';
import { Photo } from '@/components/site/Photo';
import type { components } from '@/lib/api-types';
import { inr, monthRange } from '@/lib/format';

type DestinationDetail = components['schemas']['DestinationDetail'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** S3 `.phero`: breadcrumb, 21:9 cover (4:5 on phones), caption with name, tagline, best months, trips-from. */
export function DestinationHero({ d, from }: { d: DestinationDetail; from: number }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <Link href="/destinations" className="hover:text-ink">
          Destinations
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          {d.name}
        </span>
      </nav>
      <div className="relative mt-3.5">
        <Photo
          src={d.coverUrl}
          alt={`${d.name} — ${d.tagline}`}
          sizes="(min-width: 1280px) 1220px, 100vw"
          priority
          className="aspect-[4/5] rounded-card sm:aspect-[21/9]"
        />
        <div className="absolute inset-x-0 bottom-0 rounded-b-card bg-gradient-to-t from-[rgb(10_20_30/0.7)] to-transparent p-5 text-white [text-shadow:0_2px_20px_rgb(0_0_0/0.4)] sm:p-8">
          <h1 className="text-[clamp(32px,4.6vw,56px)]">{d.name}</h1>
          <div className="num mt-2.5 flex flex-wrap gap-3.5 text-sm font-semibold">
            <span>{d.tagline}</span>
            <span>Best {monthRange(d.bestMonths)}</span>
            <span>
              {plural(d.packages.length, 'trip', 'trips')}
              {from > 0 && ` from ${inr(from)}`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Best months strip**

`web/src/components/site/destinations/BestMonths.tsx`:

```tsx
import { MONTHS, monthRange } from '@/lib/format';

/**
 * Twelve chips, the best months lit and rising in one after another (the page's motion note);
 * the caption carries the same information for screen readers and reduced motion.
 */
export function BestMonths({ months }: { months: number[] }) {
  const best = new Set(months);
  let lit = 0;
  return (
    <div>
      <p className="mb-3 text-ink2">
        Best <b className="text-ink">{monthRange(months)}</b> — the months we run every departure
        with confidence.
      </p>
      <ol aria-hidden className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {MONTHS.map((name, i) => {
          const on = best.has(i + 1);
          const delay = on ? `${lit++ * 70}ms` : undefined;
          return (
            <li
              key={name}
              className={`num rounded-chip py-1.5 text-center text-xs font-bold ${
                on ? 'animate-rise bg-primary text-white' : 'bg-bg2 text-mute'
              }`}
              style={{ animationDelay: delay }}
            >
              {name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3: The page**

`web/src/app/(site)/destinations/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { BestMonths } from '@/components/site/destinations/BestMonths';
import { DestinationHero } from '@/components/site/destinations/DestinationHero';
import { PackageCard } from '@/components/site/PackageCard';
import { Prose } from '@/components/site/Prose';
import { api, ApiRequestError } from '@/lib/api';
import { inr, monthRange } from '@/lib/format';
import { destinationJsonLd } from '@/lib/seo/destination-jsonld';

type Params = { slug: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Tagged `destination:<slug>` for F18's on-demand purge; hourly anyway (from-prices follow today's date). */
const REVALIDATE_SECONDS = 60 * 60;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Cheapest priced trip; 0 when every trip is "on request" (the api sorts 0 first, so min over > 0). */
function cheapest(prices: number[]): number {
  const priced = prices.filter((p) => p > 0);
  return priced.length ? Math.min(...priced) : 0;
}

async function loadDestination(slug: string) {
  try {
    return await api('/destinations/{slug}', {
      params: { slug },
      tags: [`destination:${slug}`],
      revalidate: REVALIDATE_SECONDS,
    });
  } catch (err) {
    // Unknown slug and "no live trips" are both 404s from the api (R2: hidden, not empty).
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
}

/** Prerender every destination with live trips; an unreachable api at build means "none". */
export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { items } = await api('/destinations', {
      tags: ['destinations'],
      revalidate: REVALIDATE_SECONDS,
    });
    return items.map((d) => ({ slug: d.slug }));
  } catch (err) {
    console.warn(
      `generateStaticParams: api unreachable, prerendering no destinations (${String(err)})`,
    );
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await loadDestination(slug);
  const from = cheapest(d.packages.map((p) => p.startingPricePaise));
  const trips = plural(d.packages.length, 'trip', 'trips');
  return {
    title: `${d.name} holiday packages — ${trips}${from ? ` from ${inr(from)}` : ''}`,
    description: `${d.tagline}. Best ${monthRange(d.bestMonths)}. ${d.packages.map((p) => p.name).join(', ')} — real departure dates and per-person prices.`,
    alternates: { canonical: `${SITE_URL}/destinations/${d.slug}` },
    openGraph: {
      title: d.name,
      description: d.tagline,
      type: 'website',
      images: [{ url: d.coverUrl, alt: `${d.name} — ${d.tagline}` }],
    },
  };
}

export default async function DestinationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = await loadDestination(slug);
  const url = `${SITE_URL}/destinations/${d.slug}`;
  const from = cheapest(d.packages.map((p) => p.startingPricePaise));
  const h2 = 'mb-4 text-[clamp(24px,2.8vw,30px)]';

  return (
    <Container className="pb-20">
      <JsonLd data={destinationJsonLd(d, url)} />
      <DestinationHero d={d} from={from} />

      <div className="mt-7 grid gap-12 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="min-w-0">
          <Prose markdown={d.intro} />

          <section aria-labelledby="best-time" className="pt-11">
            <h2 id="best-time" className={h2}>
              Best time to visit
            </h2>
            <BestMonths months={d.bestMonths} />
          </section>

          <section aria-labelledby="trips" className="pt-11">
            <h2 id="trips" className={h2}>
              Trips to {d.name}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2">
              {d.packages.map((card, i) => (
                <li key={card.slug} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
                  <PackageCard card={card} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-card border border-line p-5">
            <small className="label-caps">Trips from</small>
            <b className="num block text-[32px] font-extrabold tracking-tight">
              {from ? inr(from) : 'On request'}
            </b>
            <span className="text-[13px] text-mute">per person, double sharing</span>
            <Link
              href={`/packages?destination=${d.slug}`}
              className="mt-4 block rounded-btn bg-primary px-4 py-3 text-center text-sm font-bold text-white no-underline hover:bg-primary-ink"
            >
              Compare {plural(d.packages.length, 'trip', 'trips')} →
            </Link>
            <p className="mt-3 text-[13px] text-mute">
              Every date listed is a departure we run ourselves.
            </p>
          </div>
        </aside>
      </div>

      <p className="mt-12 text-sm font-semibold">
        <Link href="/destinations">← All destinations</Link>
      </p>
    </Container>
  );
}
```

- [ ] **Step 4: Link the package breadcrumb to the destination**

In `web/src/components/site/package/PackageHero.tsx` replace `<span>{pkg.destination.name}</span>` with:

```tsx
        <Link href={`/destinations/${pkg.destination.slug}`} className="hover:text-ink">
          {pkg.destination.name}
        </Link>
```

- [ ] **Step 5: Look at it**

```bash
curl -s http://localhost:3000/destinations/kerala | grep -o '<title>[^<]*</title>\|"@type":"TouristDestination"\|Best Sep – Mar\|2 trips from ₹21,999\|Compare 2 trips\|Munnar &amp; Alleppey Houseboat\|Kochi · Thekkady · Kovalam' | sort -u
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/destinations/atlantis
```
Expected: `<title>Kerala holiday packages — 2 trips from ₹21,999 …</title>` (the layout's title template may append the site name), the JSON-LD type, both strings, both trip names; `404`.

Browser, desktop + 390 px: the hero caption reads over the cover; the intro's **Best time:** is bold; the twelve chips with Sep–Mar lit one after another; two cards; the sticky aside on desktop, hidden on the phone; **Compare 2 trips →** lands on `/packages?destination=kerala` showing the same two cards; the package page breadcrumb "Kerala" comes back here. Check `/destinations/himachal` reads `Best Mar – Jun · Dec`. Lighthouse (mobile, DevTools) on `/destinations/kerala`: performance ≥ 90, a11y 100, SEO 100 — the hero `Photo` is `priority` so it is the LCP.

- [ ] **Step 6: Lint, typecheck, tests, commit**

Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test`
Expected: clean; **53 passed**.

```bash
git add web/src/components/site/destinations "web/src/app/(site)/destinations/[slug]/page.tsx" web/src/components/site/package/PackageHero.tsx
git commit -m "feat(F5): /destinations/[slug] — hero, intro, best months, trips, from-price aside; breadcrumb link"
```

---

### Task 8: Docs, full verification, production seed, PR, review, merge, tracker

**Files:**
- Modify: `docs/07-plan.md:48` — mark F3 done (deferred here by the F3 plan).

- [ ] **Step 1: Mark F3 in the plan**

In `docs/07-plan.md` change the F3 row's part cell from `**Package search**` to `**Package search** ✅ PR #23`. F4+F5's own mark goes in F6's PR.

```bash
git add docs/07-plan.md
git commit -m "docs: mark F3 done in 07-plan"
```

- [ ] **Step 2: Everything green from the root**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm gen:api && git diff --exit-code api/openapi.json web/src/lib/api-types.ts`
Expected: lint/typecheck clean; pytest **113 passed**, vitest **53 passed**; no contract diff.

Run: `pnpm --filter web build`
Expected: builds; `/destinations` and `/destinations/[slug]` listed as static (●) with `goa`, `kerala`, `himachal` prerendered when the local api is up.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/f4-f5-content
gh pr create --title "feat(F4+F5): six packages across Goa, Kerala and Himachal; /destinations pages" --body "$(cat <<'BODY'
## Summary
- **Content (F4):** Kerala and Himachal destinations; four new packages — Munnar & Alleppey Houseboat, Kochi · Thekkady · Kovalam, Shimla–Manali Classic, Manali · Kasol · Tosh — with full day-by-day, real hotels, 15 departures (Nov 2026 – Jun 2027) and 21 Wikimedia Commons CC photos fetched by the new licence-checked `scripts/fetch_photo.py` (credits in `CREDITS.md`). Every theme now has a live package. `tests/test_content.py` enforces the rules (live-eligible, themes covered, dates ≥ the content floor, from-prices match the locked list, every photo credited and used) instead of counts.
- **Tests:** the db suite now seeds a frozen copy of the two-package Goa catalog (`tests/fixture_content/`, `load_content(package)`), so assertions do not move as the catalog grows (F7 next).
- **api:** `DestinationCard.bestMonths` for the grid pill; contract regenerated.
- **web (F5):** `/destinations` (tiles: cover, trip count, best months, from-price) and `/destinations/[slug]` (hero, intro, best-months strip, trips, from-price aside → filtered listing), static + hourly ISR, unique metadata, JSON-LD `TouristDestination`, 404 for unknown / no-live-trip slugs. Header gains **Destinations**; the package breadcrumb links to its destination. `monthRange`, `proseBlocks`, `destinationJsonLd` covered by vitest.

## Test plan
- [ ] CI green (web · api · contract)
- [ ] Production seeded before merge: `GET /destinations` → 3 items with `bestMonths`; `GET /packages` → 6 items
- [ ] https://tripsmith.vercel.app/destinations → 3 tiles; `/destinations/himachal` → "Best Mar – Jun · Dec", 2 cards; `/destinations/atlantis` → 404
- [ ] Phone: tiles one-up; the aside hidden; reduced motion at rest

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 4: Review before merging**

From the worktree cwd run `/code-review <pr> high` (the skill reviews whatever repo the shell cwd is in). Read the four new package files yourself once more for prose slips (a wrong drive time, a hotel in the wrong town) — the review agent checks code, not itineraries. Fix findings on this branch, push, wait for CI.

- [ ] **Step 5: Seed production, then squash-merge**

`api/.env.local` (copied from the main checkout) carries the Neon **production** `DATABASE_URL` and the Blob token. Confirm before running — the seed is idempotent but it is production:

```bash
grep -o "DATABASE_URL=postgresql+asyncpg://[^@]*@[^/]*" api/.env.local | sed 's#//[^@]*@#//***@#'   # expect an ep-…-pooler…neon.tech host
cd api && uv run python scripts/seed.py && cd ..
curl -s https://tripsmith-api.vercel.app/destinations | grep -o '"slug":"[a-z]*"' | sort -u
curl -s https://tripsmith-api.vercel.app/packages | grep -o '"total":[0-9]*'
```
Expected: `destinations 3 · packages 6 · departures 22 · images 33`; the three slugs; `"total":6`. If `DATABASE_URL` is not the Neon host, stop and ask Viraj which URL to seed.

Then, session policy (2026-09-15): review → squash-merge → verify prod → tracker → next. `gh pr merge --squash --delete-branch` (the "main is already used by worktree" message is harmless).

- [ ] **Step 6: Verify production, redeploy the web if it raced the api**

The web build prerenders `/destinations` against whichever api is live at that moment ([[vercel-web-api-deploy-race]]). After both deployments finish:

```bash
curl -s https://tripsmith-api.vercel.app/destinations | grep -c bestMonths        # 1 (the new api is live)
curl -s https://tripsmith.vercel.app/destinations | grep -o "best Nov – Feb\|best Sep – Mar\|best Mar – Jun · Dec" | sort -u
curl -s -o /dev/null -w "%{http_code}\n" https://tripsmith.vercel.app/destinations/kerala
curl -s -o /dev/null -w "%{http_code}\n" https://tripsmith.vercel.app/destinations/atlantis
```
Expected: `1`; the three `best …` strings; `200`; `404`. If the web page is missing the `best …` strings (built against the old api) or the web build failed: `vercel redeploy <web deployment url>` from the web project and re-check. Previews are behind Vercel Authentication — only production counts.

Then update the tracker artifact rows **F4 → done** and **F5 → done** (row status in the artifact db, `rows/<id>` — list the db to confirm the ids), note the PR number in memory (`tripsmith-status`), and start **F6 Home** in a new worktree.

---

## Summary

| Task | Deliverable | Tests |
|---|---|---|
| 1 | Frozen test catalog `tests/fixture_content/`, `load_content(package)`, tests re-pointed | 1 pytest |
| 2 | `scripts/fetch_photo.py`; 21 licence-checked photos + credits | manual |
| 3 | Kerala + Himachal, four packages, `test_content.py` | 6 pytest |
| 4 | `DestinationCard.bestMonths`; contract regenerated | 1 assertion |
| 5 | `monthRange`, `proseBlocks` + `Prose`, `destinationJsonLd` | 6 vitest |
| 6 | `/destinations` grid, tiles, header link | curl + browser |
| 7 | `/destinations/[slug]`, hero, best-months strip, aside, breadcrumb link | curl + browser |
| 8 | Docs mark, root verification, prod seed, PR, review, merge, prod check, tracker | — |

Totals after merge: pytest 113 · vitest 53.
