"""The GST arithmetic every document shares (R51): 5 % on tour operator services (SAC 998555),
prices GST-inclusive. Karnataka — where the supplier is — pays CGST 2.5 % + SGST 2.5 %; every
other State IGST 5 %. Pure functions; paise throughout, rounded once.

The supplier's details are a clearly labelled demo (decided at row start, 2026-09-27): the
GSTIN is well-formed but not registered, and every document prints the label beside it.
"""

import datetime as dt
from dataclasses import dataclass

RATE_PERCENT = 5
SAC = "998555"  # tour operator services
SUPPLIER = {
    "name": "Tripsmith (demo business)",
    "address": "Bengaluru, Karnataka 560038",
    "state": "Karnataka",
    "state_code": "29",
    "gstin": "29AABCT1234F1Z5",
    "gstin_label": "Demo GSTIN, not registered",
}

# GST State codes (the first two digits of a GSTIN), States and Union Territories.
STATES: dict[str, str] = {
    "Andaman and Nicobar Islands": "35",
    "Andhra Pradesh": "37",
    "Arunachal Pradesh": "12",
    "Assam": "18",
    "Bihar": "10",
    "Chandigarh": "04",
    "Chhattisgarh": "22",
    "Dadra and Nagar Haveli and Daman and Diu": "26",
    "Delhi": "07",
    "Goa": "30",
    "Gujarat": "24",
    "Haryana": "06",
    "Himachal Pradesh": "02",
    "Jammu and Kashmir": "01",
    "Jharkhand": "20",
    "Karnataka": "29",
    "Kerala": "32",
    "Ladakh": "38",
    "Lakshadweep": "31",
    "Madhya Pradesh": "23",
    "Maharashtra": "27",
    "Manipur": "14",
    "Meghalaya": "17",
    "Mizoram": "15",
    "Nagaland": "13",
    "Odisha": "21",
    "Puducherry": "34",
    "Punjab": "03",
    "Rajasthan": "08",
    "Sikkim": "11",
    "Tamil Nadu": "33",
    "Telangana": "36",
    "Tripura": "16",
    "Uttar Pradesh": "09",
    "Uttarakhand": "05",
    "West Bengal": "19",
}


@dataclass(frozen=True)
class TaxSplit:
    total_paise: int  # GST-inclusive, as charged
    taxable_paise: int
    cgst_paise: int
    sgst_paise: int
    igst_paise: int

    @property
    def tax_paise(self) -> int:
        return self.cgst_paise + self.sgst_paise + self.igst_paise

    @property
    def intra_state(self) -> bool:
        return self.igst_paise == 0 and self.tax_paise > 0


def place_of_supply(state: str | None) -> str:
    """The customer's State; a booking made before checkout asked for one is the supplier's."""
    return state if state in STATES else SUPPLIER["state"]


def split(total_paise: int, state: str | None) -> TaxSplit:
    """`total_paise` (GST-inclusive) → taxable value + tax. The tax is whatever the rounded
    taxable value leaves, so the parts always add up to the total to the paisa."""
    taxable = round(total_paise * 100 / (100 + RATE_PERCENT))
    tax = total_paise - taxable
    if place_of_supply(state) == SUPPLIER["state"]:
        cgst = tax // 2
        return TaxSplit(total_paise, taxable, cgst, tax - cgst, 0)
    return TaxSplit(total_paise, taxable, 0, 0, tax)


def fy_of(day: dt.date) -> str:
    """India's financial year, April to March: 28 Sep 2026 → "2026-27", 10 Feb 2027 → "2026-27"."""
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


_ONES = (
    "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen "
    "Fifteen Sixteen Seventeen Eighteen Nineteen"
).split()
_TENS = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()


def _below_100(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + ("" if n % 10 == 0 else f"-{_ONES[n % 10]}")


def _below_1000(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = [f"{_ONES[hundreds]} Hundred"] if hundreds else []
    if rest:
        parts.append(_below_100(rest))
    return " ".join(parts)


def rupees_in_words(paise: int) -> str:
    """Indian numbering, as invoices print it: 1,23,45,600 paise → "Rupees One Lakh Twenty-Three
    Thousand Four Hundred Fifty-Six only"."""
    rupees, paise_left = divmod(abs(paise), 100)
    if rupees == 0 and paise_left == 0:
        return "Rupees Zero only"
    parts: list[str] = []
    crore, rest = divmod(rupees, 1_00_00_000)
    lakh, rest = divmod(rest, 1_00_000)
    thousand, rest = divmod(rest, 1_000)
    if crore:
        parts.append(f"{_below_1000(crore) if crore < 1000 else str(crore)} Crore")
    if lakh:
        parts.append(f"{_below_100(lakh)} Lakh")
    if thousand:
        parts.append(f"{_below_100(thousand)} Thousand")
    if rest:
        parts.append(_below_1000(rest))
    words = "Rupees " + " ".join(parts) if parts else "Rupees Zero"
    if paise_left:
        words += f" and {_below_100(paise_left)} Paise"
    return words + " only"
