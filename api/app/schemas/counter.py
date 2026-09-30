"""The counter (R56, P18): the owner books for a customer on the phone, at the desk, on WhatsApp
or from an enquiry — the same server quote as the website, plus a manual discount with a reason.

The party is capped by the departure's seats, not the website's 12, and a counter booking may
leave travellers' names and adult ages for later.
"""

import datetime as dt
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.models.enums import BookingStatus, Occupancy
from app.schemas import ApiModel
from app.schemas.admin_bookings import short_note
from app.schemas.bookings import (
    ADDON_CHOICES_MAX,
    AddonChoice,
    BookingContact,
    QuoteTraveller,
    _check_addons,
    normalise_code,
    party_errors,
)
from app.schemas.catalog import AddonOut
from app.schemas.enquiries import CONTROL_RE, EMAIL_RE

COUNTER_MAX_TRAVELLERS = 60  # a whole departure; the service caps it at the seats left
REASON_MIN = 3
REASON_MAX = 120
MANUAL_MAX_RUPEES = 10_00_000
SEARCH_MIN = 2

ManualMode = Literal["inr", "percent"]
SettleKind = Literal["paid", "deposit"]
OfflineMethod = Literal["cash", "upi", "bank"]
CounterChannel = Literal["phone", "walk_in", "whatsapp", "enquiry"]


def _one_line(v: object, what: str) -> object:
    if not isinstance(v, str):
        return v
    v = v.strip()
    if CONTROL_RE.search(v):
        raise ValueError(f"Write the {what} on one line, without special characters")
    return v


class ManualQuoteInput(ApiModel):
    """₹ off, or a % of the trip fare after the deal, the early-bird and the coupon. The live quote
    prices it before its reason is typed; booking needs the reason (`ManualDiscountInput`)."""

    mode: ManualMode
    value: int = Field(ge=1, le=MANUAL_MAX_RUPEES, description="Whole rupees, or a percent 1–100")
    reason: str = Field(default="", max_length=REASON_MAX)

    @field_validator("reason", mode="before")
    @classmethod
    def _reason_line(cls, v: object) -> object:
        return _one_line(v, "reason")

    @model_validator(mode="after")
    def _percent(self) -> "ManualQuoteInput":
        if self.mode == "percent" and self.value > 100:
            raise ValueError("A percent discount is 1–100")
        return self


class ManualDiscountInput(ManualQuoteInput):
    """The manual discount on a booking: the reason is required — it prints on the invoice."""

    @field_validator("reason")
    @classmethod
    def _reason_given(cls, v: str) -> str:
        if len(v) < REASON_MIN:
            raise ValueError("Give a reason for the manual discount — it prints on the invoice")
        return v


def _counter_party(v: list[QuoteTraveller] | list["CounterTraveller"]) -> None:
    if message := party_errors(v):  # type: ignore[arg-type]
        raise ValueError(message)
    if any(t.occupancy == Occupancy.CHILD and t.age is None for t in v):
        raise ValueError("Enter each child's age — it sets the child rate")


class CounterQuoteRequest(ApiModel):
    """`POST /admin/counter/quote`: the website's quote input, plus the manual discount."""

    departure_id: str = Field(min_length=1, max_length=40)
    travellers: list[QuoteTraveller] = Field(min_length=1, max_length=COUNTER_MAX_TRAVELLERS)
    coupon_code: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=120, description="The customer's")
    addons: list[AddonChoice] = Field(default_factory=list, max_length=ADDON_CHOICES_MAX)
    manual: ManualQuoteInput | None = None

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
        _counter_party(v)
        return v


class CounterTraveller(ApiModel):
    """A traveller as the counter takes them: the name and an adult's age may come later."""

    name: str | None = Field(default=None, max_length=80, description="Blank = later")
    age: int | None = Field(default=None, ge=0, le=120, description="Required for a child")
    occupancy: Occupancy

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        v = _one_line(v, "name")
        return v or None

    @field_validator("name")
    @classmethod
    def _name_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 2:
            raise ValueError("Enter at least 2 letters, or leave it for later")
        return v


class CounterBookingRequest(ApiModel):
    """`POST /admin/counter/bookings`: book and settle in one step.

    `paid` = the whole total taken now (cash, UPI or bank), confirmed at once with a receipt;
    `deposit` = the quote's deposit taken now, the balance due later as on the website."""

    departure_id: str = Field(min_length=1, max_length=40)
    travellers: list[CounterTraveller] = Field(min_length=1, max_length=COUNTER_MAX_TRAVELLERS)
    contact: BookingContact
    coupon_code: str | None = Field(default=None, max_length=40)
    addons: list[AddonChoice] = Field(default_factory=list, max_length=ADDON_CHOICES_MAX)
    manual: ManualDiscountInput | None = None
    channel: CounterChannel
    enquiry_id: str | None = Field(
        default=None, max_length=40, description="Converting: marked converted and linked"
    )
    settle: SettleKind
    expected_total_paise: int = Field(
        ge=1,
        description="The total on the owner's receipt: refused with 409 `price_changed` when the "
        "server's price differs now (a deal or tier ended, an add-on changed), so the money taken "
        "at the counter always matches the booking",
    )
    method: OfflineMethod
    reference: str | None = Field(
        default=None,
        max_length=80,
        validate_default=True,
        description="UPI reference (UTR) or bank reference; optional for cash",
    )

    _code = field_validator("coupon_code", mode="before")(normalise_code)
    _addons = field_validator("addons")(_check_addons)

    @field_validator("travellers")
    @classmethod
    def _party(cls, v: list[CounterTraveller]) -> list[CounterTraveller]:
        _counter_party(v)
        return v

    @field_validator("reference", mode="before")
    @classmethod
    def _reference(cls, v: object) -> str | None:
        return short_note(v)

    @model_validator(mode="after")
    def _enquiry_channel(self) -> "CounterBookingRequest":
        # A converted enquiry is the `enquiry` channel, and only a converted one is.
        if self.enquiry_id:
            self.channel = "enquiry"
        elif self.channel == "enquiry":
            raise ValueError("The Enquiry channel is for bookings converted from an enquiry")
        return self

    @field_validator("reference")
    @classmethod
    def _reference_given(cls, v: str | None, info: ValidationInfo) -> str | None:
        method = info.data.get("method")
        if v is None and method in ("upi", "bank"):
            raise ValueError(
                "Add the UPI reference (UTR)" if method == "upi" else "Add the bank reference"
            )
        return v

    def as_quote(self) -> CounterQuoteRequest:
        return CounterQuoteRequest(
            departure_id=self.departure_id,
            travellers=[QuoteTraveller(occupancy=t.occupancy, age=t.age) for t in self.travellers],
            coupon_code=self.coupon_code,
            email=self.contact.email,
            addons=self.addons,
            manual=self.manual,
        )


# --- the trip picker ---------------------------------------------------------------------------


class CounterDeparture(ApiModel):
    id: str
    date: dt.date
    seats_total: int
    seats_left: int
    price_double_paise: int = Field(description="0 = on request")
    on_request: bool = Field(description="A price is 0: not bookable")


class CounterPackage(ApiModel):
    id: str
    name: str
    slug: str
    destination: str
    cover_url: str | None
    nights: int
    days: int
    deposit_on: bool
    departures: list[CounterDeparture] = Field(description="From today (IST), soonest first")
    addons: list[AddonOut] = Field(description="Switched-on add-ons, in the owner's order")


class CounterTrips(ApiModel):
    """`GET /admin/counter/trips`: every live package with its departures from today on."""

    packages: list[CounterPackage]


# --- customers ---------------------------------------------------------------------------------


class CustomerTrip(ApiModel):
    ref: str
    package_name: str
    departs: dt.date
    status: BookingStatus


class CustomerMatch(ApiModel):
    """One customer, by email: their latest details and their trips (newest first)."""

    name: str
    email: str
    phone: str
    state: str | None
    gstin: str | None
    company_name: str | None
    has_account: bool = Field(description="Signed in before: the booking shows in My trips")
    trip_count: int
    trips: list[CustomerTrip] = Field(description="The latest three")


class CustomerSearch(ApiModel):
    items: list[CustomerMatch]


# --- details later ------------------------------------------------------------------------------


class TravellerDetails(ApiModel):
    name: str = Field(min_length=2, max_length=80)
    age: int | None = Field(default=None, ge=0, le=120)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        return _one_line(v, "name")


class EditTravellersInput(ApiModel):
    """`PUT /admin/bookings/{ref}/travellers`: names and ages, in the booking's order; rooms and
    the party stay as booked."""

    travellers: list[TravellerDetails] = Field(min_length=1, max_length=COUNTER_MAX_TRAVELLERS)
