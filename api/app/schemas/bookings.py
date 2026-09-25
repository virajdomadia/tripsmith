"""`POST /bookings/quote`, `POST /bookings` and `POST /bookings/:ref/confirm` (06 C5, Part D).

The client sends who is travelling and in which room — never an amount. Party rules that need no
database (1–12 travellers, ≥ 1 adult, rooms filled exactly, child ages) are enforced here as a
400; bookability (live, priced, date, seats) needs the departure and is a 409 from the service.
"""

import datetime as dt
from collections import Counter
from enum import StrEnum
from typing import Annotated

from pydantic import Field, field_validator

from app.models.enums import BookingStatus, Occupancy
from app.schemas import ApiModel
from app.schemas.enquiries import CONTROL_RE, EMAIL_RE, PHONE_MESSAGE, PHONE_RE, normalise_phone
from app.schemas.meta import MAX_TRAVELLERS

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


class QuoteRequest(ApiModel):
    departure_id: str = Field(min_length=1, max_length=40)
    travellers: list[QuoteTraveller] = Field(min_length=1, max_length=MAX_TRAVELLERS)

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
        )


class QuoteLineKind(StrEnum):
    DOUBLE = "double"
    TRIPLE = "triple"
    SINGLE = "single"  # the double-sharing price; the supplement is its own line
    SINGLE_SUPPLEMENT = "single_supplement"
    CHILD = "child"
    DEAL = "deal"  # negative; one per occupancy, since the discount is capped at the line price


class QuoteLine(ApiModel):
    kind: QuoteLineKind
    occupancy: Occupancy = Field(description="Whose line this is (a deal line names its group)")
    count: int = Field(examples=[2])
    unit_paise: int = Field(description="Per traveller; negative on a deal line")
    amount_paise: int = Field(description="count × unit")


class QuoteDeal(ApiModel):
    label: str | None
    ends_at: dt.datetime
    per_traveller_paise: int = Field(description="Starting price − deal price, before any cap")


class Quote(ApiModel):
    """The server's price for a party on a departure; snapshotted on the booking as-is."""

    departure_id: str
    package_slug: str
    date: dt.date
    seats_left: int
    lines: list[QuoteLine]
    deal: QuoteDeal | None
    subtotal_paise: int = Field(description="Before the deal")
    discount_paise: int = Field(description="The deal lines' total, as a positive number")
    total_paise: int


class BookingOrder(ApiModel):
    """A held booking and its Razorpay order: everything Checkout.js is opened with."""

    booking_ref: str = Field(examples=["TB-7F3K2Q"])
    order_id: str = Field(examples=["order_RB58wdjHk3F0vd"])
    key_id: str = Field(description="Razorpay's public key id (test mode)")
    amount_paise: int
    hold_expires_at: dt.datetime
    quote: Quote


class PaymentCallback(ApiModel):
    """What Checkout's success handler receives, posted back as-is to confirm the booking."""

    razorpay_order_id: str = Field(pattern=r"^order_[A-Za-z0-9]{1,40}$")
    razorpay_payment_id: str = Field(pattern=r"^pay_[A-Za-z0-9]{1,40}$")
    razorpay_signature: str = Field(pattern=r"^[0-9a-f]{64}$", description="Hex HMAC-SHA256")


class PaymentResult(ApiModel):
    """Where the booking stands once the payment is recorded. A late capture that found no
    seats is `cancelled` with `refundNeeded` — the payment is kept and refunded by hand."""

    booking_ref: str
    status: BookingStatus
    refund_needed: bool
    voucher_url: str | None = Field(
        default=None,
        description="Confirmed only, and only for a caller who proved the payment: the voucher "
        "PDF's signed path on this api, valid 30 minutes",
        examples=["/bookings/TB-7F3K2Q/voucher.pdf?exp=1790000000&sig=…"],
    )


class SyncRequest(ApiModel):
    """The booking's Razorpay order id, which only the visitor who started it holds: with it,
    a confirmed answer carries the voucher link."""

    order_id: str | None = Field(default=None, pattern=r"^order_[A-Za-z0-9]{1,40}$")
