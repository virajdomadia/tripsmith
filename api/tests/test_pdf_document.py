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
