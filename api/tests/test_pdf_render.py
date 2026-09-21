"""services/pdf/itinerary.py — R6: a valid A4 PDF under 2 MB, rendered in under 3 s, whose
content matches the package page section for section."""

import datetime as dt
import io
import re
import time
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

from app.services.format import meals_label
from app.services.pdf.itinerary import (
    GALLERY_CELL,
    HERO_SIZE,
    PDF_PREFIX,
    _Itinerary,
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
    assert all(c >= 245 for c in im.getpixel((0, 0)))  # type: ignore[union-attr]  # JPEG-white
    top = sum(im.getpixel((HERO_SIZE[0] // 2, 40)))  # type: ignore[arg-type]
    bottom = sum(im.getpixel((HERO_SIZE[0] // 2, HERO_SIZE[1] - 10)))  # type: ignore[arg-type]
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


# --- page-break-safety sweeps -------------------------------------------------------------
# Regression for a bug where a hand-positioned row/chip that started in roughly the last 10 mm
# above the footer margin (~257.5-269.8 mm on an A4 page whose page_break_trigger is ~275 mm)
# could have its check pass but its own cell/pill auto-break mid-draw, scattering content across
# a cascade of near-empty pages. Both sweeps walk start positions across that danger zone (and
# well beyond it) at 1 mm steps — the danger band is only ~3 mm wide, so this still lands inside
# it 2-3 times per cycle — and assert the section always lands cleanly.


def _itinerary(pkg: object) -> _Itinerary:
    return _Itinerary(
        pkg,  # type: ignore[arg-type]
        cover=None,
        gallery=(),
        site_url=SITE,
        whatsapp_number="919845012345",
    )


def test_departures_table_never_breaks_inside_a_row() -> None:
    pkg = package(departures=24)
    max_pages = 0
    for tenth_mm in range(1500, 2760, 10):  # start_y 150 .. 275 mm, 1 mm steps
        start_y = tenth_mm / 10
        it = _itinerary(pkg)
        it.doc.add_page()
        it.doc.set_y(start_y)
        it.dates_and_prices()
        pages = _pages(bytes(it.doc.output()))
        max_pages = max(max_pages, len(pages))
        for text in pages:
            if re.search(r"Fri \d{1,2} \w{3} 20\d\d", text):
                assert "DEPARTURE PER PERSON SEATS STATUS" in text, (start_y, text[:200])
    # The fixed loop opens at most one extra page for the header re-print plus the occupancy
    # grid section that follows in the same call — never a cascade.
    assert max_pages <= 3, max_pages


def test_day_chips_never_split_across_pages() -> None:
    # The fix only promises the chip *row* is atomic (its rect and its text move together);
    # it does not promise the chips stay glued to the day's title/description above them, so
    # the invariant under test is "meals chip and stay chip land on the same page", not "same
    # page as the day". The pre-fix bug split exactly this pair across two pages (rect for
    # "Dinner" auto-broke onto its own near-empty page, "Stay · ..." onto a third).
    pkg = package(days=2)
    max_pages = 0
    for tenth_mm in range(1500, 2760, 10):  # start_y 150 .. 275 mm, 1 mm steps
        start_y = tenth_mm / 10
        it = _itinerary(pkg)
        it.doc.add_page()
        it.doc.set_y(start_y)
        it.days()
        pages = _pages(bytes(it.doc.output()))
        max_pages = max(max_pages, len(pages))
        for day in pkg.itinerary:  # type: ignore[attr-defined]
            meals = meals_label(day.meals.breakfast, day.meals.lunch, day.meals.dinner)
            meal_pages = [i for i, t in enumerate(pages) if meals in t]
            assert meal_pages, (start_y, day.day_no, "meals chip missing")
            if day.stay:
                stay_text = f"Stay · {day.stay}"
                stay_pages = [i for i, t in enumerate(pages) if stay_text in t]
                assert stay_pages, (start_y, day.day_no, "stay chip missing")
                assert set(meal_pages) & set(stay_pages), (
                    start_y,
                    day.day_no,
                    "chip row split across pages",
                    meal_pages,
                    stay_pages,
                )
    # Two days, each ensure()d individually: never more than one break per day plus one spare.
    assert max_pages <= 3, max_pages
