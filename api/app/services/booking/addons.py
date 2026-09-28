"""Add-ons (R46, P8): the words every surface prints for one — the voucher, the emails, the
manifest, the CSV, the history — so they cannot disagree. Pricing is `pricing.price_addons`."""

from dataclasses import dataclass

from app.models import BookingAddon
from app.models.enums import AddonBasis
from app.schemas.bookings import QuoteAddon


@dataclass(frozen=True)
class AddonFact:
    """One add-on a booking has, as plain values for a render."""

    name: str
    basis: AddonBasis
    travellers: int
    nights: int
    amount_paise: int

    @property
    def detail(self) -> str:
        return detail(self.basis, self.travellers, self.nights)

    @property
    def label(self) -> str:
        return f"{self.name} ({self.detail})"


def detail(basis: AddonBasis, travellers: int, nights: int) -> str:
    """ "per booking", "2 travellers", "2 nights · 4 travellers"."""
    people = f"{travellers} traveller{'s' if travellers != 1 else ''}"
    match basis:
        case AddonBasis.BOOKING:
            return "per booking"
        case AddonBasis.TRAVELLER:
            return people
        case AddonBasis.NIGHT:
            return f"{nights} night{'s' if nights != 1 else ''} · {people}"


def facts(rows: list[BookingAddon]) -> tuple[AddonFact, ...]:
    """The add-ons a booking still has (an owner-removed one is gone), in the order bought."""
    return tuple(
        AddonFact(r.name, r.basis, r.travellers, r.nights, r.amount_paise)
        for r in rows
        if r.removed_at is None
    )


def from_quote(lines: list[QuoteAddon]) -> tuple[AddonFact, ...]:
    return tuple(AddonFact(a.name, a.basis, a.travellers, a.nights, a.amount_paise) for a in lines)


def summary(items: tuple[AddonFact, ...]) -> str:
    """ "Kullu river rafting (2 travellers), Bonfire + BBQ night (per booking)" — or ""."""
    return ", ".join(a.label for a in items)
