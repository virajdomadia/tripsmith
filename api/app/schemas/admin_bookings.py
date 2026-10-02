"""Owner-side bookings contract (R22, B10): the desk's list, one booking, its actions, and a
departure's manifest. Nothing here is ever served to a visitor."""

import datetime as dt
from typing import Any, Literal

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import (
    BookingActor,
    BookingChannel,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
    RefundStatus,
)
from app.schemas import ApiModel
from app.schemas.account import AccountCancellation, AccountTraveller, GstDocumentOut
from app.schemas.admin_enquiries import MAX_PAGE, SEARCH_MAX
from app.schemas.bookings import Quote
from app.schemas.enquiries import CONTROL_RE
from app.schemas.extras import BookedAddon
from app.schemas.leaders import DeskLeader
from app.schemas.reviews import AdminReview

NOTE_MAX = 80

BookingFlag = Literal["refund", "cancellation", "balance"]
PaymentVia = Literal["checkout", "sync", "webhook", "desk"]
HistoryGroup = Literal["booking", "payment", "email"]
Decision = Literal["approve", "reject"]
RESOLVE_NOTE_MIN = 5
RESOLVE_NOTE_MAX = 500


class BookingFilters(ApiModel):
    """`GET /admin/bookings` and `GET /admin/bookings.csv` query. Blank values never reach here
    (`BlankQueryParamsMiddleware`), as on the enquiry inbox."""

    status: BookingStatus | None = None
    flag: BookingFlag | None = Field(
        default=None,
        description="`refund` = refund needed; `cancellation` = the customer asked to cancel "
        "and the owner has not answered yet; `balance` = on its deposit, a balance to pay (P5)",
    )
    package_id: str | None = Field(default=None, max_length=40)
    departure_id: str | None = Field(default=None, max_length=40)
    channel: BookingChannel | None = Field(
        default=None, description="P18: where the booking came from (web or the counter)"
    )
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
    partially_paid: int = Field(default=0, description="P5: on its deposit (seats held)")
    confirmed: int
    completed: int
    cancelled: int
    all: int
    refund: int = Field(description="Refund needed")
    cancellation: int = Field(description="Cancellation requested, not yet answered")
    balance: int = Field(default=0, description="P5: on its deposit, a balance still to pay")


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
    waiting: int = Field(default=0, description="P6: places on the date's waitlist")


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
    coupon_code: str | None = Field(description="B15: the coupon the booking was quoted with")
    booked_at: dt.datetime
    balance_due_on: dt.date | None = Field(
        default=None, description="P5: on its deposit — the day the balance is due"
    )
    channel: BookingChannel = Field(
        default=BookingChannel.WEB, description="P18: web, or how the counter took it"
    )


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
    refunded_paise: int | None = Field(
        default=None,
        description="How much of it has gone back or is on its way (refunds not failed); "
        "null when none",
    )
    refundable_paise: int = Field(
        default=0, description="What can still be refunded from it (P13's newest-first split)"
    )
    created_at: dt.datetime
    updated_at: dt.datetime


class AdminRefund(ApiModel):
    """One refund of one payment (R51, P13)."""

    id: str
    payment_id: str
    amount_paise: int
    status: RefundStatus
    reason: str = Field(
        description="cancellation | seats_gone | surplus | owner (later: date_change, balance)"
    )
    by_hand: bool = Field(description="Made outside the API: an offline payment's, or pre-P13")
    razorpay_refund_id: str | None
    error: str | None = Field(description="Why the last try did not go through")
    note: str | None
    created_at: dt.datetime
    processed_at: dt.datetime | None


class HistoryEntry(ApiModel):
    """One line of the booking's history (R54, P16), in the owner's words."""

    id: int
    at: dt.datetime
    kind: str = Field(description="What happened, e.g. `payment.captured`, `email.sent`")
    group: HistoryGroup = Field(description="The desk's filter chip")
    actor: BookingActor
    actor_label: str = Field(description="Who, as the desk shows it (the owner by name)")
    text: str
    customer_visible: bool = Field(description="Shown on the customer's Activity too")
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    rebuilt: bool = Field(description="Rebuilt from v2 records when the log started")
    approx: bool = Field(description="A rebuilt time read off a row's last update")


class BookingHistory(ApiModel):
    entries: list[HistoryEntry] = Field(description="Oldest first")
    rebuilt_on: dt.datetime | None = Field(
        description="When entries were rebuilt from v2 records; null when none were"
    )


class BookingPackage(ApiModel):
    id: str
    name: str
    slug: str
    nights: int
    days: int
    departure_city: str


class AdminCancellation(AccountCancellation):
    """The request as the owner decides it (B11): the policy tier is read at the day the
    customer asked, and the refund it implies is only a suggestion — the owner can change it."""

    id: str
    days_out: int = Field(description="Days before departure when the customer asked")
    tier: str = Field(description="What the policy refunds at `days_out`")
    suggested_refund_paise: int = Field(description="The tier applied to what was paid")
    can_approve: bool = Field(description="Requested, and the booking still holds its seats")


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
    leader: DeskLeader | None = Field(
        default=None, description="P3: who leads the booking's departure now (read live)"
    )
    travellers: list[AccountTraveller] = Field(description="In the order they were entered")
    quote: Quote
    total_paise: int
    paid_paise: int
    lead_name: str
    lead_phone: str
    lead_email: str
    payments: list[AdminPayment] = Field(description="Every attempt, oldest first")
    refunds: list[AdminRefund] = Field(description="Every refund, oldest first (P13)")
    documents: list[GstDocumentOut] = Field(
        description="GST documents, in the order they happened (P13b)"
    )
    refund_to_send_paise: int = Field(
        description="What 'Send refund' would send now: owed and not yet sent, plus refunds "
        "that never reached Razorpay"
    )
    refund_offline_paise: int = Field(
        description="Offline payments' refunds waiting for 'Refund made (offline)'"
    )
    history: BookingHistory = Field(
        description="Every change, payment and email, oldest first (R54)"
    )
    cancellation: AdminCancellation | None
    has_voucher: bool
    can_mark_paid: bool = Field(description="Pending, or swept as hold_expired")
    can_release: bool = Field(description="Pending")
    seats_short: int = Field(
        description="Seats the party is missing right now; mark paid refuses while > 0"
    )
    review: AdminReview | None = Field(description="The customer's review of the trip (B13)")
    addons: list[BookedAddon] = Field(
        description="P8: every add-on the booking bought, oldest first, taken-off ones included"
    )
    can_remove_addons: bool = Field(description="Confirmed or part paid (P8b)")
    can_move: bool = Field(description="P7b: confirmed or part paid — Move on the desk")
    balance: "AdminBalance | None" = Field(
        default=None, description="P5: made on a deposit (null = paid in full at booking)"
    )
    channel: BookingChannel = Field(default=BookingChannel.WEB, description="P18")
    created_by: str | None = Field(
        default=None, description="P18: the owner who made it at the counter, by name"
    )
    enquiry: "LinkedEnquiry | None" = Field(
        default=None, description="P18: the enquiry it was converted from"
    )
    payment_link: "AdminPaymentLink | None" = Field(
        default=None, description="P18b: the counter's payment link, if it sent one"
    )
    can_edit_travellers: bool = Field(
        default=False, description="P18: pending, part paid or confirmed — names and ages"
    )


class AdminPaymentLink(ApiModel):
    """P18b: the counter's Razorpay Payment Link on a booking."""

    id: str
    url: str | None = Field(description="While open: the link to share (rzp.io)")
    amount_paise: int
    expires_at: dt.datetime = Field(description="When the seats and the link end")
    status: Literal["open", "paid", "expired", "cancelled"]
    can_cancel: bool
    can_check: bool = Field(description="Ask Razorpay whether it was paid (open or lapsed)")


class LinkedEnquiry(ApiModel):
    id: str
    ref: str


class AdminBalance(ApiModel):
    """R43 (P5): a booking made on a deposit, as the owner runs it."""

    deposit_paise: int
    balance_paise: int = Field(description="Still to pay; 0 once paid in full or cancelled")
    due_on: dt.date
    last_day_on: dt.date = Field(description="The grace's last day; the tidy cancels after it")
    days_left: int = Field(description="From today (IST) to the due day; negative = overdue")
    can_mark_paid: bool = Field(description="On its deposit: record the balance paid offline")
    can_extend: bool = Field(description="On its deposit: move the due day later")
    extend_until: dt.date = Field(description="The latest due day allowed: the departure day")


class ExtendDueInput(ApiModel):
    """Move the balance's due day later (P5): after the current one, by the departure day."""

    due_on: dt.date


AdminBooking.model_rebuild()  # `balance` names AdminBalance, defined after it


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


class ResolveCancellationInput(ApiModel):
    """`POST /admin/cancellations/{id}/resolve` (R19, B11). The note goes to the customer — in
    the email and on their booking page — so it is required either way. `refundPaise` is required
    to approve (0 when the policy refunds nothing) and must be left out to reject."""

    decision: Decision
    note: str = Field(min_length=RESOLVE_NOTE_MIN, max_length=RESOLVE_NOTE_MAX)
    refund_paise: int | None = Field(
        default=None, ge=0, validate_default=True, description="Approve only; at most what was paid"
    )

    @field_validator("note", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("note")
    @classmethod
    def _plain(cls, v: str) -> str:
        if CONTROL_RE.search(v.replace("\n", " ").replace("\r", " ").replace("\t", " ")):
            raise ValueError("Write the note without special characters")
        return v

    @field_validator("refund_paise")
    @classmethod
    def _refund_goes_with_approve(cls, v: int | None, info: ValidationInfo) -> int | None:
        # `validate_default` on the field: a missing refund on approve must still fail here.
        decision = info.data.get("decision")
        if decision == "approve" and v is None:
            raise ValueError("Enter the refund — ₹0 if the policy refunds nothing")
        if decision == "reject" and v is not None:
            raise ValueError("A rejected request refunds nothing")
        return v


class ManifestBooking(ApiModel):
    ref: str
    status: BookingStatus
    lead_name: str
    lead_phone: str
    cancellation_requested: bool
    travellers: list[AccountTraveller]
    addons: list[str] = Field(description="P8: e.g. 'Kullu river rafting (2 travellers)'")


class ManifestAddon(ApiModel):
    """One add-on across the departure — what the team has to arrange (P8)."""

    name: str
    bookings: int
    travellers: int = Field(description="Travellers taking it; 0 for a per-booking add-on")


class Manifest(ApiModel):
    """`GET /admin/departures/{id}/manifest`: who travels, grouped by booking."""

    seats: DepartureSeats
    package_slug: str
    nights: int
    days: int
    departure_city: str
    returns: dt.date
    leader: DeskLeader | None = Field(
        default=None, description="P3: who leads this departure, with their phone"
    )
    bookings: list[ManifestBooking] = Field(
        description="Confirmed, part-paid and completed bookings, oldest first"
    )
    travellers: int
    addons: list[ManifestAddon] = Field(description="Totals per add-on, in first-booked order")
    generated_at: dt.datetime
