"""`render_gst_document`: a payment receipt, tax invoice or credit note (R51, P13b) on the
voucher's `Document` base — same type, palette and marks. Pure and synchronous; rendered on
demand from `GstFacts`, never stored (the `gst_documents` row fixes its number, amount, date).
"""

import datetime as dt
from dataclasses import dataclass

from fpdf import XPos, YPos

from app.services.booking.addons import AddonFact, summary
from app.services.booking.voucher import BookingFacts
from app.services.format import inr, long_date
from app.services.gst.documents import DocRef
from app.services.gst.tax import (
    RATE_PERCENT,
    SAC,
    STATES,
    SUPPLIER,
    place_of_supply,
    rupees_in_words,
    split,
)
from app.services.pdf.document import (
    BG2,
    INK,
    INK2,
    LINE,
    MARGIN,
    MUTE,
    R_PANEL,
    WARN,
    WARN_SOFT,
    Document,
)

REASON_WORDS = {
    "cancellation": "Cancellation approved",
    "date_change": "Date changed to a cheaper departure",
    "balance": "Balance not paid — booking cancelled",
    "owner": "Refund agreed with the customer",
    "addon": "Add-on taken off the booking",
}


@dataclass(frozen=True)
class GstFacts:
    doc: DocRef  # issued: `number` is set
    booking: BookingFacts
    billing_state: str | None
    gstin: str | None
    company_name: str | None
    payment_label: str | None = None  # receipt: "Razorpay · pay_…" or "Offline · UTR …"
    invoice_number: str | None = None  # credit note: the invoice it credits
    invoice_dated: dt.date | None = None
    refund_reason: str | None = None
    # P8b, an invoice: the add-ons it covers — the booking's own for the first invoice, the
    # payment's for an Add extras invoice. Read from the rows each covers, so a later purchase or
    # an add-on taken off never changes an invoice already issued.
    invoice_addons: tuple[AddonFact, ...] = ()


def gst_filename(ref: str, number: str) -> str:
    return f"Tripsmith-{ref}-{number.replace('/', '-')}.pdf"


def _money(paise: int) -> str:
    rupees, p = divmod(paise, 100)
    return f"{inr(rupees)}.{p:02d}"


class _GstDoc:
    def __init__(self, facts: GstFacts) -> None:
        self.f = facts
        assert facts.doc.number, "render an issued document"
        self.doc = Document(
            title=f"{facts.doc.title} {facts.doc.number} · {facts.booking.ref}",
            running_title=facts.doc.number,
            kind=facts.doc.title,
        )
        self.tax = split(facts.doc.amount_paise, facts.billing_state)

    def render(self) -> bytes:
        self.doc.add_page()
        self.top()
        self.parties()
        if self.f.doc.kind == "receipt":
            self.received()  # money received, no tax split: the invoice charges the GST
        else:
            self.lines()
            self.totals()
        self.small_print()
        return bytes(self.doc.output())

    def top(self) -> None:
        d, f = self.doc, self.f
        d.wordmark(MARGIN, 11.5, size=7)
        d.set_xy(MARGIN, 11.5)
        d.font(8.5, "", MUTE)
        d.cell(0, 7, "Prices include GST", align="R")
        d.set_y(26)
        d.label(f"Booking {f.booking.ref}")
        d.gap(1.5)
        d.heading(f.doc.title, 24)
        d.gap(3)
        cells = [("Number", f.doc.number or ""), ("Date", long_date(f.doc.dated))]
        if f.doc.kind == "credit_note" and f.invoice_number:
            when = long_date(f.invoice_dated) if f.invoice_dated else ""
            cells.append(("Against invoice", f"{f.invoice_number} · {when}"))
        elif f.doc.kind == "receipt" and f.payment_label:
            cells.append(("Paid by", f.payment_label))
        h, top = 16.0, d.get_y()
        widths = [48.0, 44.0, d.epw - 92.0][: len(cells)]
        if len(cells) == 2:
            widths = [d.epw / 2, d.epw / 2]
        d.card(MARGIN, top, d.epw, h, fill=BG2, r=R_PANEL)
        x = MARGIN
        for i, ((label, value), w) in enumerate(zip(cells, widths, strict=True)):
            if i:
                d.set_draw_color(*LINE)
                d.line(x, top, x, top + h)
            d.set_xy(x + 4, top + 3.2)
            d.label(label, w=w - 8)
            d.set_xy(x + 4, top + 8)
            d.font(10.5, "XB", INK)
            d.cell(w - 8, 6, _fit(d, value, w - 8))
            x += w
        d.set_y(top + h + 6)

    def parties(self) -> None:
        d, f = self.doc, self.f
        col = (d.epw - 6) / 2
        top = d.get_y()
        state = place_of_supply(f.billing_state)
        buyer = [f.company_name or f.booking.lead_name]
        if f.company_name:
            buyer.append(f"Attn: {f.booking.lead_name}")
        buyer.append(f"{f.booking.lead_email} · {f.booking.lead_phone}")
        buyer.append(
            f"State: {state} ({STATES[state]})"
            + ("" if f.billing_state else " — not given at booking")
        )
        seller = [
            SUPPLIER["name"],
            SUPPLIER["address"],
            f"State: Karnataka ({SUPPLIER['state_code']})",
        ]
        h = 40.0
        for i, (title, lines, gstin) in enumerate(
            (("From", seller, SUPPLIER["gstin"]), ("Bill to", buyer, f.gstin))
        ):
            x = MARGIN + i * (col + 6)
            d.card(x, top, col, h, r=R_PANEL)
            d.set_xy(x + 4, top + 3.5)
            d.label(title, w=col - 8)
            y = top + 9
            for k, line in enumerate(lines):
                d.set_xy(x + 4, y)
                d.font(10 if k == 0 else 9, "B" if k == 0 else "", INK if k == 0 else INK2)
                d.cell(col - 8, 5, _fit(d, line, col - 8))
                y += 5
            if gstin:
                d.set_xy(x + 4, y + 0.5)
                d.font(9, "B", INK)
                d.cell(d.get_string_width(f"GSTIN {gstin}") + 2, 5, f"GSTIN {gstin}")
                if i == 0:
                    d.pill(  # on its own line: beside the GSTIN it overflows the card
                        x + 4,
                        y + 6.2,
                        SUPPLIER["gstin_label"],
                        fill=WARN_SOFT,
                        color=WARN,
                    )
        d.set_y(top + h + 3)
        d.font(9, "", MUTE)
        d.cell(
            0, 5, f"Place of supply: {state} ({STATES[state]}) · SAC {SAC} · Tour operator services"
        )
        d.set_y(d.get_y() + 8)

    def lines(self) -> None:
        d, f, t = self.doc, self.f, self.tax
        b = f.booking
        cols = (
            ("Description", d.epw - 98),
            ("SAC", 18),
            ("Taxable", 28),
            ("GST", 24),
            ("Amount", 28),
        )
        x = MARGIN
        for name, w in cols:
            d.set_xy(x, d.get_y())
            d.font(7.5, "B", MUTE)
            d.set_char_spacing(0.9)
            d.cell(w, 4, name.upper(), align="L" if name == "Description" else "R")
            d.set_char_spacing(0)
            x += w
        d.set_y(d.get_y() + 5.5)
        d.hairline(d.get_y())
        extras = f.doc.kind == "invoice" and f.doc.payment_id is not None
        what = {
            "receipt": "Payment received towards",
            "invoice": "Add-ons for the tour package" if extras else "Tour package",
            "credit_note": f"Credit — {REASON_WORDS.get(f.refund_reason or '', 'refund')} ·",
        }[f.doc.kind]
        party = f"{len(b.travellers)} traveller{'s' if len(b.travellers) != 1 else ''}"
        desc = f"{what} {b.package_name}, {long_date(b.departs)} to {long_date(b.returns)}, {party}"
        if f.doc.kind == "invoice" and f.invoice_addons:  # P8: the add-ons it covers
            desc += f"{': ' if extras else ', with '}{summary(f.invoice_addons)}"
        if f.doc.kind == "invoice" and not extras and b.manual_off_paise:  # P18
            desc += f" · after a discount of {inr(b.manual_off_paise // 100)}: {b.manual_reason}"
        y = d.get_y() + 2
        d.set_xy(MARGIN, y)
        d.font(10, "", INK)
        dw = cols[0][1] - 3
        d.multi_cell(dw, 5, desc, align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
        rows_h = d.lines_of(desc, dw, 10) * 5
        x = MARGIN + cols[0][1]
        values = (SAC, _money(t.taxable_paise), _money(t.tax_paise), _money(t.total_paise))
        for (_, w), value in zip(cols[1:], values, strict=True):
            d.set_xy(x, y)
            d.font(10, "B" if w == 28 and value == values[-1] else "", INK)
            d.cell(w, 5, value, align="R")
            x += w
        d.set_y(y + max(rows_h, 5) + 2)
        d.hairline(d.get_y())
        d.gap(4)

    def totals(self) -> None:
        d, t = self.doc, self.tax
        half = RATE_PERCENT / 2
        rows = [("Taxable value", t.taxable_paise)]
        if t.intra_state:
            rows += [(f"CGST {half:g}%", t.cgst_paise), (f"SGST {half:g}%", t.sgst_paise)]
        else:
            rows.append((f"IGST {RATE_PERCENT}%", t.igst_paise))
        w, x = 86.0, MARGIN + d.epw - 86.0
        for label, value in rows:
            d.set_x(x)
            d.font(10, "", INK2)
            d.cell(w - 34, 6, label)
            d.cell(34, 6, _money(value), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        y = d.get_y() + 1
        d.set_draw_color(*INK)
        d.line(x, y, x + w, y)
        d.set_xy(x, y + 1.5)
        total_label = {
            "receipt": "Received (incl. GST)",
            "invoice": "Total (incl. GST)",
            "credit_note": "Credited (incl. GST)",
        }[self.f.doc.kind]
        d.font(11.5, "XB", INK)
        d.cell(w - 34, 7, total_label)
        d.cell(34, 7, _money(t.total_paise), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        d.gap(2)
        d.font(9, "", MUTE)
        d.multi_cell(
            0, 4.6, rupees_in_words(t.total_paise), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT
        )
        d.gap(6)

    def received(self) -> None:
        d, f = self.doc, self.f
        b = f.booking
        party = f"{len(b.travellers)} traveller{'s' if len(b.travellers) != 1 else ''}"
        h, top = 22.0, d.get_y()
        d.card(MARGIN, top, d.epw, h, r=R_PANEL)
        d.set_xy(MARGIN + 5, top + 4)
        d.label("Received towards")
        d.set_xy(MARGIN + 5, top + 9.5)
        d.font(10.5, "", INK)
        d.cell(
            d.epw - 70,
            6,
            _fit(d, f"{b.package_name} · {long_date(b.departs)} · {party}", d.epw - 70),
        )
        d.set_xy(MARGIN + d.epw - 60, top + 7)
        d.font(16, "XB", INK)
        d.cell(55, 8, _money(f.doc.amount_paise), align="R")
        d.set_y(top + h + 3)
        d.font(9, "", MUTE)
        d.multi_cell(
            0,
            4.6,
            rupees_in_words(f.doc.amount_paise),
            align="R",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        d.gap(6)

    def small_print(self) -> None:
        d, f = self.doc, self.f
        kind = {
            "receipt": "This receipt acknowledges a payment towards the booking. It is not a tax "
            "invoice: the GST is charged on the tax invoice, issued once the booking is paid in "
            "full (money that buys no seat is refunded and never invoiced).",
            "invoice": "The total is the package price, paid in full.",
            "credit_note": "This credit note reduces the tax invoice above by the amount refunded.",
        }[f.doc.kind]
        d.para(
            f"{kind} Prices include GST at {RATE_PERCENT}% under SAC {SAC}. Computer-generated; no "
            "signature needed. Demo site: the payments are Razorpay test-mode transactions, no "
            f"money moved, and the supplier's GSTIN {SUPPLIER['gstin']} is a demo number, not "
            "registered.",
            size=8.5,
            color=MUTE,
            line=4.4,
        )


def _fit(d: Document, text: str, w: float) -> str:
    if d.get_string_width(text) <= w:
        return text
    while text and d.get_string_width(text + "…") > w:
        text = text[:-1]
    return text.rstrip() + "…"


def render_gst_document(facts: GstFacts) -> bytes:
    return _GstDoc(facts).render()
