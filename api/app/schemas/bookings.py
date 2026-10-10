"""`POST /bookings/quote`, `POST /bookings` and `POST /bookings/:ref/confirm` (06 C5, Part D).

The client sends who is travelling and in which room — never an amount. Party rules that need no
database (1–12 travellers, ≥ 1 adult, rooms filled exactly, child ages) are enforced here as a
400; bookability (live, priced, date, seats) needs the departure and is a 409 from the service.
"""

import datetime as dt
import re
from collections import Counter
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.models.enums import AddonBasis, BookingStatus, Occupancy
from app.schemas import ApiModel
from app.schemas.enquiries import CONTROL_RE, EMAIL_RE, PHONE_MESSAGE, PHONE_RE, normalise_phone
from app.schemas.meta import MAX_TRAVELLERS
from app.services.gst.tax import STATES

STATE_OF_CODE = {code: name for name, code in STATES.items()}

# A GSTIN: 2-digit State code, PAN (5 letters, 4 digits, 1 letter), entity, "Z", check character.
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

CHILD_MIN_AGE = 5
CHILD_MAX_AGE = 11
ADULT_MIN_AGE = CHILD_MAX_AGE + 1
# Adults per room: a double is filled by two, a triple by three (03-requirements-v2 R16).
ROOM_SIZE = {Occupancy.SINGLE: 1, Occupancy.DOUBLE: 2, Occupancy.TRIPLE: 3}


class UnbookableReason(StrEnum):
    """Why a departure cannot be booked — the 409's `reason`, and the picker's grey label."""

    ON_REQUEST = "on_request"  # a price is 0: "On request — enquire"
    TOO_SOON = "too_soon"  # before IST today + 2 days
    SOLD_OUT = "sold_out"  # not enough seats for the whole party


class CouponReason(StrEnum):
    """Why a code was refused (R26) — the 409's `reason`; the sheet shows it under the field."""

    UNKNOWN = "coupon_unknown"  # no such code, or paused
    NOT_STARTED = "coupon_not_started"
    EXPIRED = "coupon_expired"
    USED_UP = "coupon_used_up"  # captured uses + other live holds reached the limit
    NOT_FOR_TRIP = "coupon_not_for_trip"
    BELOW_MINIMUM = "coupon_below_minimum"  # measured after the deal
    USED_BY_EMAIL = "coupon_used_by_email"


PayChoice = Literal["full", "deposit"]  # P5: pay in full, or the deposit now


def normalise_code(v: object) -> object:
    """Codes are case-insensitive: trimmed and upper-cased on the way in; blank = none."""
    if not isinstance(v, str):
        return v
    return v.strip().upper() or None


class QuoteTraveller(ApiModel):
    occupancy: Occupancy
    age: Annotated[int, Field(ge=0, le=120)] | None = None


class BookingTraveller(ApiModel):
    name: str = Field(min_length=2, max_length=80)
    age: Annotated[int, Field(ge=0, le=120)]
    occupancy: Occupancy

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("name")
    @classmethod
    def _one_line_name(cls, v: str) -> str:
        if CONTROL_RE.search(v):
            raise ValueError("Enter the name on one line, without special characters")
        return v


def party_errors(travellers: list[QuoteTraveller] | list[BookingTraveller]) -> str | None:
    """The first party rule the travellers break, or None. Shared by quote and order."""
    counts = Counter(t.occupancy for t in travellers)
    if sum(n for occ, n in counts.items() if occ != Occupancy.CHILD) < 1:
        return "At least one adult travels on every booking"
    for occ, size in ROOM_SIZE.items():
        if counts[occ] % size:
            return f"A {occ.value} room takes {size} adults — add or move a traveller"
    for t in travellers:
        if t.age is None:
            continue
        if t.occupancy == Occupancy.CHILD and not CHILD_MIN_AGE <= t.age <= CHILD_MAX_AGE:
            return f"The child rate is for ages {CHILD_MIN_AGE}–{CHILD_MAX_AGE}"
        if t.occupancy != Occupancy.CHILD and t.age < ADULT_MIN_AGE:
            return f"Travellers under {ADULT_MIN_AGE} go at the child rate"
    return None


ADDON_CHOICES_MAX = 12


class AddonChoice(ApiModel):
    """One add-on the visitor picked (R46, P8). Per booking: nothing else. Per traveller: how
    many of the party take it. Per night: how many nights — the whole party stays on."""

    addon_id: str = Field(min_length=1, max_length=40)
    travellers: Annotated[int, Field(ge=1, le=MAX_TRAVELLERS)] | None = Field(
        default=None, description="Per-traveller add-ons: how many take it (≤ the party)"
    )
    nights: Annotated[int, Field(ge=1, le=14)] | None = Field(
        default=None, description="Per-night add-ons: how many nights (≤ the add-on's maximum)"
    )


def addon_choice_errors(choices: list[AddonChoice], party: int) -> str | None:
    """The first rule the choices break without the database: each add-on once, and never more
    travellers than the party. The rest (on sale, nights ≤ the maximum) is the service's."""
    ids = [c.addon_id for c in choices]
    if len(ids) != len(set(ids)):
        return "Each add-on can be picked once"
    if any(c.travellers is not None and c.travellers > party for c in choices):
        return "An add-on can't be taken by more travellers than are booked"
    return None


def _check_addons(v: list[AddonChoice], info: ValidationInfo) -> list[AddonChoice]:
    party = len(info.data.get("travellers") or [])
    if party and (message := addon_choice_errors(v, party)):
        raise ValueError(message)
    return v


class QuoteRequest(ApiModel):
    departure_id: str = Field(min_length=1, max_length=40)
    travellers: list[QuoteTraveller] = Field(min_length=1, max_length=MAX_TRAVELLERS)
    coupon_code: str | None = Field(
        default=None, max_length=40, description="Case-insensitive; refused with its reason"
    )
    email: str | None = Field(
        default=None,
        max_length=120,
        description="The contact email once typed, so the visitor's own live hold does not count "
        "against a code's use limit; a malformed one is ignored. 'Already used by this email' is "
        "answered when Pay starts the hold, not here",
    )
    addons: list[AddonChoice] = Field(
        default_factory=list, max_length=ADDON_CHOICES_MAX, description="P8: Make it yours"
    )
    claim: str | None = Field(
        default=None,
        max_length=120,
        description="P6: a waitlist claim link's token — the seats its offer holds count as free "
        "for this quote",
    )

    _code = field_validator("coupon_code", mode="before")(normalise_code)
    _addons = field_validator("addons")(_check_addons)

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> object:
        s = v.strip().lower() if isinstance(v, str) else None
        return s if s and EMAIL_RE.match(s) else None

    @field_validator("travellers")
    @classmethod
    def _party(cls, v: list[QuoteTraveller]) -> list[QuoteTraveller]:
        if message := party_errors(v):
            raise ValueError(message)
        return v


class BookingContact(ApiModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: str = Field(max_length=120)
    # P13b: the place of supply and an optional business GSTIN for the tax invoice. The web
    # asks for the State; the api keeps it optional for older clients (treated as Karnataka).
    state: str | None = Field(default=None, description="The customer's State or UT (GST)")
    gstin: str | None = Field(default=None, max_length=15, description="Business GSTIN")
    company_name: str | None = Field(
        default=None,
        max_length=100,
        validate_default=True,
        description="Required with a GSTIN; printed on the invoice",
    )

    @field_validator("state", mode="before")
    @classmethod
    def _state(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        if not isinstance(v, str) or v.strip() not in STATES:
            raise ValueError("Pick your State from the list")
        return v.strip()

    @field_validator("gstin", mode="before")
    @classmethod
    def _gstin(cls, v: object, info: ValidationInfo) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        s = v.strip().upper().replace(" ", "") if isinstance(v, str) else ""
        if not GSTIN_RE.match(s):
            raise ValueError("Enter a 15-character GSTIN, like 29ABCDE1234F1Z5")
        state = info.data.get("state")
        if state is None and s[:2] not in STATE_OF_CODE:
            raise ValueError("This GSTIN's State code isn't one we know — check the number")
        if state is not None and STATES[state] != s[:2]:
            raise ValueError(
                f"This GSTIN is registered in another State (code {s[:2]}) — pick that State, "
                "or check the number"
            )
        return s

    @field_validator("company_name", mode="before")
    @classmethod
    def _company(cls, v: object, info: ValidationInfo) -> object:
        if "gstin" not in info.data:
            return None  # the GSTIN itself failed; its own error is the one to show
        if info.data["gstin"] is None:
            return None  # no business GSTIN: nothing to print a company against
        s = v.strip() if isinstance(v, str) else ""
        if not s:
            raise ValueError("Enter the company name registered to this GSTIN")
        if CONTROL_RE.search(s):
            raise ValueError("Write the company name on one line")
        return s

    @model_validator(mode="after")
    def _state_from_gstin(self) -> "BookingContact":
        # A GSTIN names its State: an older client that sends one without a State still gets the
        # right place of supply (IGST for a Maharashtra business), never the Karnataka fallback.
        if self.gstin is not None and self.state is None:
            self.state = STATE_OF_CODE[self.gstin[:2]]
        return self

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("name")
    @classmethod
    def _one_line_name(cls, v: str) -> str:
        if CONTROL_RE.search(v):
            raise ValueError("Enter your name on one line, without special characters")
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def _phone(cls, v: object) -> str:
        digits = normalise_phone(v) if isinstance(v, str) else ""
        if not PHONE_RE.match(digits):
            raise ValueError(PHONE_MESSAGE)
        return digits

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> str:
        s = v.strip().lower() if isinstance(v, str) else ""
        if not EMAIL_RE.match(s):
            raise ValueError("Enter a valid email address")
        return s


class BookingRequest(ApiModel):
    """`createBookingOrder`: the quote input with names and ages, plus the contact."""

    departure_id: str = Field(min_length=1, max_length=40)
    travellers: list[BookingTraveller] = Field(min_length=1, max_length=MAX_TRAVELLERS)
    contact: BookingContact
    coupon_code: str | None = Field(default=None, max_length=40, description="As on the quote")
    addons: list[AddonChoice] = Field(
        default_factory=list, max_length=ADDON_CHOICES_MAX, description="As on the quote"
    )
    pay: PayChoice = Field(
        default="full",
        description="P5: `deposit` pays the quote's deposit now and the balance later; refused "
        "with 409 `deposit_unavailable` when the quote offers none",
    )
    claim: str | None = Field(
        default=None,
        max_length=120,
        description="P6: a waitlist claim link's token. The booking uses the seats its offer "
        "holds, keeps them until the offer would have ended, and must use the offer's email",
    )

    _code = field_validator("coupon_code", mode="before")(normalise_code)
    _addons = field_validator("addons")(_check_addons)

    @field_validator("travellers")
    @classmethod
    def _party(cls, v: list[BookingTraveller]) -> list[BookingTraveller]:
        if message := party_errors(v):
            raise ValueError(message)
        return v

    def as_quote(self) -> QuoteRequest:
        return QuoteRequest(
            departure_id=self.departure_id,
            travellers=[QuoteTraveller(occupancy=t.occupancy, age=t.age) for t in self.travellers],
            coupon_code=self.coupon_code,
            email=self.contact.email,
            addons=self.addons,
        )


class QuoteLineKind(StrEnum):
    DOUBLE = "double"
    TRIPLE = "triple"
    SINGLE = "single"  # the double-sharing price; the supplement is its own line
    SINGLE_SUPPLEMENT = "single_supplement"
    CHILD = "child"
    DEAL = "deal"  # negative; one per occupancy, since the discount is capped at the line price
    EARLY_BIRD = "early_bird"  # P17: negative, one per occupancy, after the deal lines


class QuoteLine(ApiModel):
    kind: QuoteLineKind
    occupancy: Occupancy = Field(description="Whose line this is (a deal line names its group)")
    count: int = Field(examples=[2])
    unit_paise: int = Field(description="Per traveller; negative on a deal or early-bird line")
    amount_paise: int = Field(description="count × unit")


class QuoteDeal(ApiModel):
    label: str | None
    ends_at: dt.datetime
    per_traveller_paise: int = Field(description="Starting price − deal price, before any cap")


class QuoteEarlyBird(ApiModel):
    """The early-bird tier this booking day earns (R47, P17)."""

    tier: int = Field(description="1 or 2", examples=[1])
    days: int = Field(description="Booked this many days or more before departure, IST")
    per_traveller_paise: int = Field(description="The tier's ₹ off per traveller, before any cap")
    book_by: dt.date = Field(description="The last IST day this tier applies: departure − days")


class LadderRung(ApiModel):
    """One step of the price ladder (R47): the trip fare for this party if booked from `fromOn`
    on — deal, early-bird and coupon applied, add-ons left out."""

    from_on: dt.date | None = Field(description="Null = booked today")
    early_bird: QuoteEarlyBird | None = Field(description="The tier still running from that day")
    deal: bool = Field(description="A deal still runs from that day (one may end first)")
    fare_paise: int


class QuoteCoupon(ApiModel):
    code: str = Field(examples=["WELCOME10"])
    off_paise: int = Field(
        description="Off the trip fare, after the deal and the early-bird; whole rupees"
    )


class QuoteManual(ApiModel):
    """R56 (P18): the owner's discount at the counter — after the coupon, off the trip fare only,
    whole rupees, never taking the fare below ₹1. Printed on the invoice with its reason."""

    off_paise: int = Field(description="Off the trip fare, after every other discount")
    percent: int | None = Field(description="Set when the owner gave a % (1–100); null for ₹")
    reason: str = Field(
        description="Why — required to book (a live quote may not have it yet); on the invoice "
        "and in the history"
    )


class QuoteAddon(ApiModel):
    """One add-on line on the quote (P8): the server's price, never discounted."""

    addon_id: str | None = Field(description="The package add-on it was priced from")
    name: str
    basis: AddonBasis
    unit_paise: int = Field(description="The price per booking, traveller or traveller-night")
    travellers: int = Field(description="1 for a per-booking add-on")
    nights: int = Field(description="1 unless charged per night")
    amount_paise: int = Field(description="unit × travellers × nights")


class QuoteDeposit(ApiModel):
    """R43 (P5): "Reserve with 25 % now" — offered when the package allows it and the balance
    would not yet be due. On a booking's snapshot: the deposit it was made on, or null."""

    percent: int = Field(examples=[25])
    amount_paise: int = Field(description="25 % of the total, rounded up to the whole rupee")
    balance_paise: int = Field(description="total − deposit")
    due_on: dt.date = Field(description="The IST day the balance is due: departure − 30 days")


class Quote(ApiModel):
    """The server's price for a party on a departure; snapshotted on the booking as-is."""

    departure_id: str
    package_slug: str
    date: dt.date
    seats_left: int
    lines: list[QuoteLine]
    deal: QuoteDeal | None
    early_bird: QuoteEarlyBird | None = Field(description="P17: null when no tier applies")
    coupon: QuoteCoupon | None
    manual: QuoteManual | None = Field(
        description="P18: the owner's discount at the counter; null on the web"
    )
    addons: list[QuoteAddon] = Field(description="P8: the add-ons, after the trip fare")
    ladder: list[LadderRung] = Field(
        description="P17: today's fare, then the fare from the day after each running tier ends; "
        "only on `quoteBooking` (a booking's snapshot has none)"
    )
    subtotal_paise: int = Field(description="The trip fare before its discounts")
    discount_paise: int = Field(
        description="The deal and early-bird lines' total plus the coupon and the counter's "
        "manual discount, as a positive number; never touches the add-ons"
    )
    addons_paise: int = Field(description="The add-on lines' total, at full price")
    change_fee_paise: int = Field(
        default=0, description="P7: date-change fees paid on this booking so far (0 = none)"
    )
    total_paise: int = Field(description="subtotal − discount + add-ons + change fees")
    deposit: QuoteDeposit | None = Field(
        default=None, description="P5: the deposit option (null = pay in full only)"
    )

    @property
    def fare_paise(self) -> int:
        """The trip fare after its discounts — what a coupon's %, cap and minimum are measured
        on. Add-ons are never discounted (R46); a date-change fee (P7) is not fare."""
        return self.total_paise - self.addons_paise - self.change_fee_paise

    @model_validator(mode="before")
    @classmethod
    def _older_snapshot(cls, data: object) -> object:
        """Bookings snapshotted before B15 have no `coupon` key, before P8 no add-ons, and before
        P17 no early-bird or ladder, and every web booking has no manual discount (P18); the fields
        stay required on the wire."""
        if not isinstance(data, dict):
            return data
        filled: dict[str, object] = {}
        if "coupon" not in data:
            filled["coupon"] = None
        if "manual" not in data:
            filled["manual"] = None
        if "earlyBird" not in data and "early_bird" not in data:
            filled["earlyBird"] = None
        if "ladder" not in data:
            filled["ladder"] = []
        if "addons" not in data:
            filled["addons"] = []
        if "deposit" not in data:
            filled["deposit"] = None
        if "addonsPaise" not in data and "addons_paise" not in data:
            filled["addonsPaise"] = 0
        return {**data, **filled} if filled else data


class BookingOrder(ApiModel):
    """A held booking and its Razorpay order: everything Checkout.js is opened with."""

    booking_ref: str = Field(examples=["TB-7F3K2Q"])
    order_id: str = Field(examples=["order_RB58wdjHk3F0vd"])
    key_id: str = Field(description="Razorpay's public key id (test mode)")
    amount_paise: int = Field(description="What Checkout charges now: the total, or the deposit")
    hold_expires_at: dt.datetime
    quote: Quote


class PaymentCallback(ApiModel):
    """What Checkout's success handler receives, posted back as-is to confirm the booking."""

    razorpay_order_id: str = Field(pattern=r"^order_[A-Za-z0-9]{1,40}$")
    razorpay_payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,40}$")
    razorpay_signature: str = Field(pattern=r"^[0-9a-f]{64}$", description="Hex HMAC-SHA256")


class PaymentResult(ApiModel):
    """Where the booking stands once the payment is recorded. A late capture that found no
    seats is `cancelled` with `refundNeeded` — the payment is kept and refunded through Razorpay
    on its own (P13)."""

    booking_ref: str
    status: BookingStatus
    refund_needed: bool = Field(
        description="Money is going back to the customer: owed, on its way, or already refunded"
    )
    voucher_url: str | None = Field(
        default=None,
        description="Confirmed only, and only for a caller who proved the payment: the voucher "
        "PDF's signed path on this api, valid 30 minutes",
        examples=["/bookings/TB-7F3K2Q/voucher.pdf?exp=1790000000&sig=…"],
    )
    calendar_google_url: str | None = Field(
        default=None,
        description="P10: with `voucherUrl` — Add to Google Calendar, a signed api path valid "
        "30 minutes (it records the click, then redirects)",
    )
    calendar_ics_url: str | None = Field(
        default=None, description="P10: the same for the `.ics` file"
    )


class LinkCallback(ApiModel):
    """What Razorpay appends to the callback URL after a Payment Link is paid (P18b), posted
    back as-is. The signature covers the link id, its reference id, the status and the payment."""

    razorpay_payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,40}$")
    razorpay_payment_link_id: str = Field(pattern=r"^plink_[A-Za-z0-9]{1,40}$")
    razorpay_payment_link_reference_id: str = Field(min_length=1, max_length=60)
    razorpay_payment_link_status: str = Field(min_length=1, max_length=30)
    razorpay_signature: str = Field(pattern=r"^[0-9a-f]{64}$", description="Hex HMAC-SHA256")


class SyncRequest(ApiModel):
    """The booking's Razorpay order id, which only the visitor who started it holds: with it,
    a confirmed answer carries the voucher link."""

    order_id: str | None = Field(default=None, pattern=r"^order_[A-Za-z0-9]{1,40}$")
