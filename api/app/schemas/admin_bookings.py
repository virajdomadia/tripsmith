"""Owner-side bookings contract (R22, B10): the desk's list, one booking, its actions, and a
departure's manifest. Nothing here is ever served to a visitor."""

import datetime as dt
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import (
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas import ApiModel
from app.schemas.account import AccountCancellation, AccountTraveller
from app.schemas.admin_enquiries import MAX_PAGE, SEARCH_MAX
from app.schemas.bookings import Quote
from app.schemas.enquiries import CONTROL_RE

NOTE_MAX = 80

BookingFlag = Literal["refund", "cancellation"]
PaymentVia = Literal["checkout", "sync", "webhook", "desk"]
TimelineKind = Literal[
    "booked", "order", "captured", "failed", "refunded", "offline", "lapsed", "cancelled",
    "completed", "cancellation",
]  # fmt: skip


class BookingFilters(ApiModel):
    """`GET /admin/bookings` and `GET /admin/bookings.csv` query. Blank values never reach here
    (`BlankQueryParamsMiddleware`), as on the enquiry inbox."""

    status: BookingStatus | None = None
    flag: BookingFlag | None = Field(
        default=None,
        description="`refund` = refund needed; `cancellation` = the customer asked to cancel "
        "and the owner has not answered yet",
    )
    package_id: str | None = Field(default=None, max_length=40)
    departure_id: str | None = Field(default=None, max_length=40)
    from_: dt.date | None = Field(
        default=None, alias="from", description="Departing on or after this day"
    )
    to: dt.date | None = Field(default=None, description="Departing on or before this day")
    q: str | None = Field(
        default=None, max_length=SEARCH_MAX, description="Ref, lead name, phone or email"
    )
    page: int = Field(default=1, ge=1, le=MAX_PAGE, description="1-based; ignored by the CSV")

    @field_validator("to")
    @classmethod
    def _not_before_from(cls, value: dt.date | None, info: ValidationInfo) -> dt.date | None:
        start = info.data.get("from_")
        if value is not None and start is not None and value < start:
            raise ValueError("must not be before `from`")
        return value


class BookingCounts(ApiModel):
    """Every tab counted with the other filters applied — status and flag each leave
    themselves out, so a tab's number is what clicking it would show."""

    pending: int
    confirmed: int
    completed: int
    cancelled: int
    all: int
    refund: int = Field(description="Refund needed")
    cancellation: int = Field(description="Cancellation requested, not yet answered")


class DepartureSeats(ApiModel):
    """One departure's seats. `seatsLeft` is the `departure_availability` view itself; `booked`
    and `held` are counted the way the view counts them, so total − booked − held = left
    (until a lowered `seatsTotal` makes the view clamp at 0)."""

    departure_id: str
    package_id: str
    package_name: str
    date: dt.date
    seats_total: int
    booked: int = Field(description="Travellers on confirmed, part-paid and completed bookings")
    held: int = Field(description="Travellers on pending bookings whose hold is still live")
    seats_left: int


class DepartureOption(ApiModel):
    """A departure the desk's filter offers: every one that has at least one booking."""

    id: str
    package_name: str
    date: dt.date


class BookingRow(ApiModel):
    ref: str
    status: BookingStatus
    cancel_reason: CancelReason | None
    hold_expires_at: dt.datetime
    hold_live: bool = Field(description="Pending and still inside its hold (database clock)")
    refund_needed: bool
    cancellation: CancellationStatus | None
    package_name: str
    departure_id: str
    departs: dt.date
    travellers: int
    lead_name: str
    lead_phone: str
    total_paise: int
    paid_paise: int
    booked_at: dt.datetime


class BookingList(ApiModel):
    items: list[BookingRow]
    page: int
    page_size: int
    total: int
    total_pages: int = Field(ge=1)
    counts: BookingCounts
    departures: list[DepartureOption]
    seats: DepartureSeats | None = Field(
        default=None, description="Set when the list is filtered to one departure"
    )


class AdminPayment(ApiModel):
    id: str
    provider: PaymentProvider
    status: PaymentStatus
    amount_paise: int
    order_id: str | None
    payment_id: str | None
    reference: str | None = Field(description="What the owner typed when marking it paid")
    via: PaymentVia | None = Field(
        description="How the capture reached us; null while the order is still open"
    )
    created_at: dt.datetime
    updated_at: dt.datetime


class TimelineEvent(ApiModel):
    at: dt.datetime
    kind: TimelineKind
    text: str


class BookingPackage(ApiModel):
    id: str
    name: str
    slug: str
    nights: int
    days: int
    departure_city: str


class AdminBooking(ApiModel):
    """`GET /admin/bookings/{ref}` and every desk action's answer."""

    ref: str
    status: BookingStatus
    cancel_reason: CancelReason | None
    refund_needed: bool
    hold_expires_at: dt.datetime
    hold_live: bool
    booked_at: dt.datetime
    package: BookingPackage
    departure: DepartureSeats
    departs: dt.date
    returns: dt.date
    travellers: list[AccountTraveller] = Field(description="In the order they were entered")
    quote: Quote
    total_paise: int
    paid_paise: int
    lead_name: str
    lead_phone: str
    lead_email: str
    payments: list[AdminPayment] = Field(description="Every attempt, oldest first")
    timeline: list[TimelineEvent] = Field(
        description="Derived from the booking and its payments, oldest first"
    )
    cancellation: AccountCancellation | None
    has_voucher: bool
    can_mark_paid: bool = Field(description="Pending, or swept as hold_expired")
    can_release: bool = Field(description="Pending")
    seats_short: int = Field(
        description="Seats the party is missing right now; mark paid refuses while > 0"
    )


def short_note(v: object) -> str | None:
    """Strip; blank → None; no control characters (it lands in a CSV and on a voucher)."""
    if v is None:
        return None
    if not isinstance(v, str):
        raise ValueError("Must be text")
    v = v.strip()
    if CONTROL_RE.search(v):
        raise ValueError("Write it without special characters")
    return v or None


class MarkPaidInput(ApiModel):
    reference: str | None = Field(
        default=None, max_length=NOTE_MAX, description="Optional: bank UTR, 'cash at office'…"
    )

    @field_validator("reference", mode="before")
    @classmethod
    def _reference(cls, v: object) -> str | None:
        return short_note(v)


class RefundMadeInput(ApiModel):
    note: str | None = Field(default=None, max_length=NOTE_MAX, description="Optional")

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, v: object) -> str | None:
        return short_note(v)


class ManifestBooking(ApiModel):
    ref: str
    status: BookingStatus
    lead_name: str
    lead_phone: str
    cancellation_requested: bool
    travellers: list[AccountTraveller]


class Manifest(ApiModel):
    """`GET /admin/departures/{id}/manifest`: who travels, grouped by booking."""

    seats: DepartureSeats
    package_slug: str
    nights: int
    days: int
    departure_city: str
    returns: dt.date
    bookings: list[ManifestBooking] = Field(
        description="Confirmed, part-paid and completed bookings, oldest first"
    )
    travellers: int
    generated_at: dt.datetime
