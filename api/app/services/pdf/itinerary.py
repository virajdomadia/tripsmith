"""`render_itinerary`: the package page as an A4 PDF (R6), section for section — hero, quick
facts, highlights, the price box, day by day, what's in the price, where you stay, dates &
prices, questions — drawn with the same tokens, radii and marks as the web components in
web/src/components/site/package/. Pure and synchronous: takes a `PackageDetail` (the object
the page renders) and the cover photo's bytes; every network step lives in service.py.

Blob pathnames: `pdf/{slug}/{version}/Tripsmith-{slug}-itinerary.pdf` — the basename is the
download filename, `pdf/{slug}/` scopes a package's versions, `pdf/` scopes the GC. `version`
(`pdf_version`) hashes what the PDF draws, not `packages.updated_at`: that column only moves
when the package row itself is written, never for a day, a departure, a photo, a seat sold or
the destination's name — and a departure that has passed drops out of the upcoming list, so
yesterday's PDF is never served after its first date is gone.
"""

import hashlib
import io
import json
from collections.abc import Sequence
from pathlib import Path

from fpdf import XPos, YPos
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

from app.business import BUSINESS, whatsapp_href
from app.schemas.catalog import DepartureOut, PackageDetail
from app.schemas.meta import BADGE_LABELS, Badge
from app.services.format import duration, inr, long_date, meals_label, seats_label
from app.services.pdf.document import (
    ACTION,
    BG2,
    FOOTER_HEIGHT,
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


# The renderer's own source and the business details in the chrome are part of the version too:
# a deploy that changes the layout, or the phone number in the footer, re-renders every PDF once
# instead of serving the old drawing until the next catalog edit.
_RENDERER = hashlib.sha256(
    b"".join(
        (Path(__file__).parent / name).read_text(encoding="utf-8").encode()  # newlines unified
        for name in ("itinerary.py", "document.py")
    )
).hexdigest()


def pdf_version(pkg: PackageDetail, *, site_url: str, whatsapp_number: str) -> str:
    """16 hex chars over everything `render_itinerary` draws: the package page as served today
    (`related` and `updated_at` are not drawn), the two settings it prints, the business block
    and the renderer. Any change → a new pathname; nothing else → the same one."""
    drawn = pkg.model_dump(mode="json", exclude={"related", "updated_at"})
    payload = [drawn, site_url, whatsapp_number, BUSINESS, _RENDERER]
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def pdf_pathname(slug: str, version: str) -> str:
    return f"{pdf_prefix(slug)}{version}/{pdf_filename(slug)}"


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
    assert px is not None
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
            d.cell(left_w - 6, 5, seats_label(nxt.seats_left), align="R")
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
            # `pill`'s own `cell` auto-breaks mid-draw when the chip row starts too close to the
            # footer (its rect lands on this page, its text on the next) — keep the chips whole.
            d.ensure(5.2 + 4.5)
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
                round_corners=("TOP_LEFT", "TOP_RIGHT"),  # type: ignore[arg-type]
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
        # These rows are hand-positioned (`set_xy`/`cell` against the row's own `y`, not fpdf2's
        # running `d.y`), so fpdf2's implicit auto break — which reads `d.y` — cannot be trusted
        # here: after a row's last `cell`/`pill`, `d.y` sits ~7.5 mm above the row's real top and
        # an implicit break can fire mid-row. Break on the row's real top ourselves, and disable
        # auto page break for the loop as a backstop so a stray cell can never trigger one.
        d.set_auto_page_break(False, margin=FOOTER_HEIGHT + 6)
        for k, dep in enumerate(rows):
            if y + row_h + 2 > d.page_break_trigger:
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
        d.set_auto_page_break(True, margin=FOOTER_HEIGHT + 6)
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
