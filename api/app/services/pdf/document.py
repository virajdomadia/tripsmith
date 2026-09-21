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
from fpdf.drawing_primitives import DeviceRGB

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

    # --- chrome (fpdf2 calls these itself) ---

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

    # --- type ---

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
        result = self.multi_cell(w, 5.6, text, dry_run=True, output="LINES")
        return len(result.text) if hasattr(result, "text") else len(result)  # type: ignore[return-value]

    # --- marks (the site's icons, drawn) ---

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

    # --- surfaces ---

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
