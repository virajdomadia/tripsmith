"""`render_trip_pack`: the trip pack (R48, P10) as a PDF to keep offline — the meeting point,
the trip leader and the 24×7 number up top, then where you stay, the day-by-day plan with dates
and the owner's "Know before you go" notes. On the voucher's `Document` base (same type,
palette and marks); pure and synchronous, no photos. Rendered on demand and never stored: it
carries the leader's phone number.
"""

import datetime as dt
from dataclasses import dataclass

from fpdf import XPos, YPos

from app.business import BUSINESS
from app.schemas.trip_pack import PackContent
from app.services.format import duration, long_date
from app.services.pdf.document import (
    BG2,
    INK,
    INK2,
    MARGIN,
    MUTE,
    OK,
    OK_SOFT,
    PRIMARY,
    PRIMARY_SOFT,
    R_PANEL,
    WARN,
    WARN_SOFT,
    WHITE,
    Document,
)
from app.services.pdf.voucher import _clip

TEXT_X = MARGIN + 13
BADGE = 7.5


@dataclass(frozen=True)
class PackSheet:
    ref: str
    package_name: str
    destination: str
    nights: int
    days: int
    departs: dt.date
    returns: dt.date
    party: int
    lead_name: str
    content: PackContent
    preview: bool = False  # the owner's copy before it opens (P10b)


def trip_pack_filename(ref: str) -> str:
    return f"Tripsmith-{ref}-trip-pack.pdf"


def _time(t: dt.time | None) -> str:
    return t.strftime("%H:%M") if t else ""


class _TripPack:
    def __init__(self, sheet: PackSheet, site_url: str) -> None:
        self.s = sheet
        self.c = sheet.content
        self.site = site_url.rstrip("/")
        self.doc = Document(
            title=f"Trip pack {sheet.ref} — {sheet.package_name} · {BUSINESS['name']}",
            running_title=sheet.ref,
            kind="Trip pack",
        )

    def render(self) -> bytes:
        self.doc.add_page()
        self.top()
        self.meeting()
        self.people()
        self.hotels()
        self.days()
        self.know_before()
        self.small_print()
        return bytes(self.doc.output())

    def section(self, title: str, *, keep: float) -> None:
        d = self.doc
        d.ensure(min(keep, 150) + 14)
        d.gap(5)
        d.heading(title, 15)
        d.gap(2.5)

    def top(self) -> None:
        d, s = self.doc, self.s
        d.wordmark(MARGIN, 11.5, size=7, link=self.site)
        d.set_xy(MARGIN, 11.5)
        d.font(8.5, "", MUTE)
        d.cell(0, 7, "Trip pack", align="R")
        d.set_y(26)
        d.label(f"{s.destination} · {duration(s.nights, s.days)}")
        d.gap(1.5)
        d.heading(s.package_name, 22)
        d.gap(2)
        party = f"{s.party} traveller{'s' if s.party != 1 else ''}"
        d.para(
            f"{long_date(s.departs)} – {long_date(s.returns)} · {party} · {s.ref} · "
            f"lead {s.lead_name}",
            size=10,
            color=INK2,
        )
        d.gap(3)
        if s.preview:
            d.pill(MARGIN, d.get_y(), "Owner preview — not yet open", fill=WARN_SOFT, color=WARN)
            d.gap(8)

    def meeting(self) -> None:
        """The day-one box: place, date and time, the note, and the Maps button."""
        d, m = self.doc, self.c.meeting
        top = d.get_y()
        h = 30.0
        d.card(MARGIN, top, d.epw, h, fill=PRIMARY_SOFT, stroke=None)
        d.set_xy(MARGIN + 6, top + 4)
        d.label("Meeting point", w=110)
        d.set_xy(MARGIN + 6, top + 9)
        d.font(13, "XB", INK)
        if m is None:
            d.cell(110, 6, "Shared with you soon")
            d.set_xy(MARGIN + 6, top + 16)
            d.font(9.5, "", INK2)
            d.multi_cell(110, 5, "We'll send the meeting point before you travel.", align="L")
            d.set_y(top + h + 2)
            return
        d.cell(110, 6, _clip(d, m.place, 110))
        d.set_xy(MARGIN + 6, top + 16)
        d.font(10, "B", INK2)
        when = long_date(self.s.departs) + (f" · {_time(m.time)}" if m.time else "")
        d.cell(110, 5, when)
        if m.note:
            d.set_xy(MARGIN + 6, top + 21.5)
            d.font(9.5, "", INK2)
            d.cell(110, 5, _clip(d, m.note, 110))
        if m.maps_url:
            d.button(
                MARGIN + d.epw - 58,
                top + (h - 9.5) / 2,
                52,
                "Open in Google Maps",
                fill=PRIMARY,
                color=WHITE,
                link=m.maps_url,
            )
        d.set_y(top + h + 2)

    def people(self) -> None:
        """The leader and the 24×7 line, side by side."""
        d, c = self.doc, self.c
        top = d.get_y() + 2
        w = (d.epw - 4) / 2
        h = 24.0
        d.ensure(h + 4)
        for i, (eyebrow, name, line, fill) in enumerate(
            (
                (
                    "Your trip leader",
                    c.leader.name if c.leader else "Confirmed soon",
                    (c.leader.phone or "Phone shared soon")
                    if c.leader
                    else f"Call {c.emergency_phone} meanwhile",
                    BG2,
                ),
                ("24×7 emergency line", c.emergency_phone, "Any time during the trip", OK_SOFT),
            )
        ):
            x = MARGIN + i * (w + 4)
            d.card(x, top, w, h, fill=fill, stroke=None, r=R_PANEL)
            d.set_xy(x + 5, top + 4)
            d.label(eyebrow, w=w - 10)
            d.set_xy(x + 5, top + 9)
            d.font(12.5, "XB", INK)
            d.cell(w - 10, 6, _clip(d, name, w - 10))
            d.set_xy(x + 5, top + 16)
            d.font(10, "B", OK if i else INK2)
            d.cell(w - 10, 5, _clip(d, line, w - 10))
        if c.leader and c.leader.languages:
            d.set_xy(MARGIN, top + h + 1.5)
            d.font(8.5, "", MUTE)
            d.cell(w, 4.5, _clip(d, "Speaks " + ", ".join(c.leader.languages), w))
        d.set_y(top + h + 6)

    def hotels(self) -> None:
        d, hotels = self.doc, self.c.hotels
        if not hotels:
            return
        self.section("Where you stay", keep=16 * len(hotels))
        for h in hotels:
            lines = [p for p in (h.address, h.phone) if p]
            box = 11 + 5 * len(lines)
            d.ensure(box + 2)
            y = d.get_y()
            d.card(MARGIN, y, d.epw, box, r=R_PANEL)
            d.set_xy(MARGIN + 4, y + 2.6)
            d.font(10.5, "B", INK)
            d.cell(110, 6, _clip(d, h.name, 108))
            d.set_xy(MARGIN + 116, y + 2.6)
            d.font(9.5, "", INK2)
            nights = f"{h.nights} night{'s' if h.nights != 1 else ''}" if h.nights else ""
            d.cell(d.epw - 120, 6, " · ".join(p for p in (h.city, nights) if p), align="R")
            for k, line in enumerate(lines):
                d.set_xy(MARGIN + 4, y + 9 + 5 * k)
                d.font(9.5, "", INK2)
                d.cell(d.epw - 8, 5, _clip(d, line, d.epw - 8))
            d.set_y(y + box + 2)

    def days(self) -> None:
        d, days = self.doc, self.c.days
        if not days:
            return
        self.section("Day by day", keep=34)
        text_w = d.epw - (TEXT_X - MARGIN)
        for day in days:
            d.ensure(26)
            top = d.get_y() + 2
            d.card(MARGIN, top, BADGE, BADGE, fill=PRIMARY, stroke=None, r=1.6)
            d.set_xy(MARGIN, top + 0.3)
            d.font(9.5, "XB", WHITE)
            d.cell(BADGE, BADGE, str(day.day_no), align="C")
            d.set_xy(TEXT_X, top - 0.5)
            d.label(long_date(day.date), w=text_w)
            d.set_xy(TEXT_X, d.get_y())
            d.font(12, "XB", INK)
            d.multi_cell(text_w, 6, day.title, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            d.set_x(TEXT_X)
            d.para(day.description, w=text_w, size=10, line=5.2)
            stay = f"Stay · {day.stay}" if day.stay else ""
            extra = " · ".join(p for p in (day.meals, stay) if p)
            if extra:
                d.set_x(TEXT_X)
                d.para(extra, w=text_w, size=8.5, color=MUTE, line=4.6)
            d.gap(2)

    def know_before(self) -> None:
        d, notes = self.doc, self.c.know_before
        if not notes:
            return
        self.section("Know before you go", keep=24)
        for n in notes:
            d.ensure(14)
            d.label(n.label)
            d.para(n.text, size=10, line=5.2)
            d.gap(2)

    def small_print(self) -> None:
        self.doc.gap(4)
        self.doc.para(
            f"Keep this on your phone — it works offline. Questions before you travel: "
            f"{BUSINESS['phone_display']} ({BUSINESS['hours']}) or {BUSINESS['email']}. "
            "Demo site: the trip, the hotels and the phone numbers are made up.",
            size=8.5,
            color=MUTE,
            line=4.4,
        )


def render_trip_pack(sheet: PackSheet, *, site_url: str) -> bytes:
    return _TripPack(sheet, site_url).render()
