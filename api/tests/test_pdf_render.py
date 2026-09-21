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
