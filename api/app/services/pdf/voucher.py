"""`render_voucher`: the booking voucher (R17) — booking ref, travellers, departure, hotels,
inclusions and contact — on the itinerary's `Document` base, so it shares its type, palette and
marks. Pure and synchronous, no photos: the whole render is a few hundred milliseconds, well
inside R17's 3 s. Rendered on demand from `BookingFacts`; never stored.
"""

from fpdf import XPos, YPos

from app.business import BUSINESS, whatsapp_href
from app.services.booking.voucher import BookingFacts
from app.services.format import duration, inr, long_date
from app.services.pdf.document import (
    BG2,
    INK,
    INK2,
    LINE,
    MARGIN,
    MUTE,
    OK,
    OK_SOFT,
    PRIMARY_SOFT,
    R_PANEL,
    WA,
    Document,
)


def _clip(d: Document, text: str, w: float) -> str:
    """`text` cut with an ellipsis to fit `w` mm in the current font — a cell never wraps, so a
    long name would run over the next column."""
    if d.get_string_width(text) <= w:
        return text
    while text and d.get_string_width(text + "…") > w:
        text = text[:-1]
    return text.rstrip() + "…"


def voucher_filename(ref: str) -> str:
    return f"Tripsmith-{ref}-voucher.pdf"


class _Voucher:
    def __init__(self, facts: BookingFacts, site_url: str, whatsapp_number: str) -> None:
        self.f = facts
        self.site = site_url.rstrip("/")
        self.whatsapp_url = whatsapp_href(
            whatsapp_number, f"Hi Tripsmith, about my booking {facts.ref} ({facts.package_name})."
        )
        self.doc = Document(
            title=f"Booking voucher {facts.ref} — {facts.package_name} · {BUSINESS['name']}",
            running_title=facts.ref,
            kind="Booking voucher",
        )

    def render(self) -> bytes:
        self.doc.add_page()
        self.top()
        self.facts()
        self.travellers()
        self.hotels()
        self.inclusions()
        self.contact()
        self.small_print()
        return bytes(self.doc.output())

    def top(self) -> None:
        d, f = self.doc, self.f
        d.wordmark(MARGIN, 11.5, size=7, link=self.site)
        d.set_xy(MARGIN, 11.5)
        d.font(8.5, "", MUTE)
        d.cell(0, 7, "Booking voucher", align="R")
        d.set_y(26)
        d.label(f"{f.destination} · {duration(f.nights, f.days)} · {f.departure_city}")
        d.gap(1.5)
        d.heading(f.package_name, 22)
        d.gap(4)
        # The reference chip (dashed like the success sheet's) and the status pill.
        y = d.get_y()
        d.font(12, "XB", INK)
        d.set_char_spacing(0.06 * 12)
        w = d.get_string_width(f.ref) + 8
        d.set_fill_color(*BG2)
        d.set_draw_color(0xC4, 0xCF, 0xDE)
        d.set_dash_pattern(dash=1.2, gap=0.9)
        d.rect(MARGIN, y, w, 8.5, style="DF", round_corners=True, corner_radius=1.6)
        d.set_dash_pattern()
        d.set_xy(MARGIN, y)
        d.cell(w, 8.5, f.ref, align="C")
        d.set_char_spacing(0)
        paid_in_full = f.paid_paise >= f.total_paise
        status = "Confirmed · paid in full" if paid_in_full else "Confirmed"
        d.pill(MARGIN + w + 3, y + 1.65, status, fill=OK_SOFT, color=OK)
        d.set_y(y + 8.5 + 6)

    def section(self, title: str, *, keep: float) -> None:
        """A heading at the itinerary's "Highlights" size — one page holds a usual booking —
        kept with `keep` mm of what follows."""
        d = self.doc
        d.ensure(min(keep, 150) + 14)
        d.gap(5)
        d.heading(title, 15)
        d.gap(2.5)

    def facts(self) -> None:
        """One bg2 strip like the itinerary's quick facts: departs, returns, party, paid."""
        d, f = self.doc, self.f
        cells = [
            ("Departs", long_date(f.departs)),
            ("Returns", long_date(f.returns)),
            ("Travellers", str(len(f.travellers))),
            ("Paid", inr(f.paid_paise // 100)),
        ]
        h, top, cw = 16.0, d.get_y(), d.epw / len(cells)
        d.card(MARGIN, top, d.epw, h, fill=BG2, r=R_PANEL)
        for i, (label, value) in enumerate(cells):
            x = MARGIN + i * cw
            if i:
                d.set_draw_color(*LINE)
                d.line(x, top, x, top + h)
            d.set_xy(x + 4, top + 3.2)
            d.label(label, w=cw - 8)
            d.set_xy(x + 4, top + 8)
            d.font(11.5, "XB", INK)
            d.cell(cw - 8, 6, value)
        d.set_y(top + h)
        if f.coupon_code:  # B15: under the strip, like a receipt's discount line
            d.set_xy(MARGIN, top + h + 2)
            d.font(9, "", MUTE)
            d.cell(0, 5, f"Coupon {f.coupon_code} · {inr(f.coupon_off_paise // 100)} off the total")
            d.set_y(top + h + 7)

    def travellers(self) -> None:
        d, f = self.doc, self.f
        self.section("Travellers", keep=8 + 7 * len(f.travellers))
        cols = (("#", 10), ("Name", 104), ("Age", 20), ("Room", 40))
        x = MARGIN
        for name, w in cols:
            d.set_xy(x, d.get_y())
            d.label(name, w=w, new_line=False)
            x += w
        d.set_y(d.get_y() + 5.5)
        d.hairline(d.get_y())
        for i, t in enumerate(f.travellers, start=1):
            y = d.get_y() + 1.5
            values = (str(i), t.name, str(t.age), t.room)
            x = MARGIN
            for k, ((_, w), value) in enumerate(zip(cols, values, strict=True)):
                d.set_xy(x, y)
                d.font(10.5, "B" if k == 1 else "", INK if k == 1 else INK2)
                d.cell(w, 5.6, _clip(d, value, w - 2))
                x += w
            d.set_y(y + 5.6 + 1.5)
            d.hairline(d.get_y())
        d.gap(1)
        d.font(9.5, "", MUTE)
        d.multi_cell(
            0,
            5,
            f"Lead traveller: {f.lead_name} · {f.lead_phone} · {f.lead_email}",
            align="L",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

    def hotels(self) -> None:
        d, f = self.doc, self.f
        if not f.hotels:
            return
        self.section("Where you stay", keep=12 * len(f.hotels))
        for h in f.hotels:
            y = d.get_y()
            d.card(MARGIN, y, d.epw, 11, r=R_PANEL)
            d.set_xy(MARGIN + 4, y + 2.6)
            d.font(10.5, "B", INK)
            d.cell(90, 6, _clip(d, h.name, 78))
            for s in range(5):
                d.star(MARGIN + 100 + s * 4.4, y + 5.6, 1.7, filled=s < h.stars)
            if h.stars:
                d.set_xy(MARGIN + 100 + 4 * 4.4 + 2.6, y + 3.4)
                d.font(8.5, "B", INK2)
                d.cell(6, 4.4, str(h.stars))
            d.set_xy(MARGIN + 126, y + 2.6)
            d.font(9.5, "", INK2)
            nights = f"{h.nights} night{'s' if h.nights != 1 else ''}" if h.nights else ""
            d.cell(d.epw - 130, 6, " · ".join(p for p in (h.city, nights) if p), align="R")
            d.set_y(y + 13)

    def inclusions(self) -> None:
        d, f = self.doc, self.f
        if not f.inclusions:
            return
        self.section("What's included", keep=20)
        col = (d.epw - 6) / 2
        y = d.get_y()
        items = list(f.inclusions)
        for r in range(0, len(items), 2):
            pair = items[r : r + 2]
            row_h = max(d.lines_of(t, col - 5.5, 10) for t in pair) * 5.2
            if d.will_page_break(row_h + 2):
                d.add_page()
                y = d.get_y()
            for k, text in enumerate(pair):
                x = MARGIN + k * (col + 6)
                d.check(x, y + 1.0)
                d.set_xy(x + 5.5, y)
                d.font(10, "", INK)
                d.multi_cell(col - 5.5, 5.2, text, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            y += row_h + 1.8
        d.set_y(y + 1)

    def contact(self) -> None:
        """The price box's place on the itinerary: who to call, and the WhatsApp button."""
        d = self.doc
        h = 26.0
        d.ensure(h + 16)  # the card and the small print under it stay together
        d.gap(4)
        y = d.get_y()
        d.card(MARGIN, y, d.epw, h, fill=PRIMARY_SOFT, stroke=None)
        d.set_xy(MARGIN + 6, y + 4)
        d.font(13, "XB", INK)
        d.cell(100, 6, "Questions before you travel?")
        d.set_xy(MARGIN + 6, y + 11)
        d.font(9.5, "", INK2)
        d.multi_cell(
            100,
            5,
            f"Call {BUSINESS['phone_display']} ({BUSINESS['hours']}) or write to "
            f"{BUSINESS['email']}. Quote {self.f.ref}.",
            align="L",
        )
        d.button(
            MARGIN + d.epw - 60,
            y + (h - 9.5) / 2,
            54,
            "WhatsApp us",
            fill=WA,
            color=INK,
            link=self.whatsapp_url,
        )
        d.set_y(y + h + 3)

    def small_print(self) -> None:
        d, f = self.doc, self.f
        ids = ", ".join(f.payment_ids) or "—"
        how = (
            "marked paid offline by the owner"
            if f.paid_offline
            else "paid with a Razorpay test payment"
        )
        d.para(
            f"Show this voucher, printed or on your phone, at check-in. Payment {ids}. "
            f"Demo site: {how} — no money moved, and no trip is booked.",
            size=8.5,
            color=MUTE,
            line=4.4,
        )


def render_voucher(facts: BookingFacts, *, site_url: str, whatsapp_number: str) -> bytes:
    return _Voucher(facts, site_url, whatsapp_number).render()
