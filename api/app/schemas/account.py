"""My trips contract (R18, R19): the list, one booking's detail, and a cancellation request."""

import datetime as dt
from typing import Literal

from pydantic import Field, field_validator

from app.models.enums import BookingStatus, CancellationStatus, Occupancy, PaymentProvider
from app.schemas import ApiModel
from app.schemas.bookings import Quote
from app.schemas.changes import ChangeOffer
from app.schemas.enquiries import CONTROL_RE
from app.schemas.extras import BookedAddon, ExtrasOffer
from app.schemas.reviews import AccountReview
from app.schemas.waitlist import AccountWaitlistEntry


class AccountBooking(ApiModel):
    ref: str
    status: BookingStatus
    hold_expires_at: dt.datetime = Field(
        description="A pending booking holds its seats until then; after it, the checkout lapsed"
    )
    total_paise: int
    paid_paise: int
    booked_at: dt.datetime
    package_name: str
    package_slug: str
    destination: str
    departs: dt.date
    travellers: int
    has_voucher: bool = Field(description="Confirmed or completed: the voucher PDF is ready")
    cover_url: str | None = Field(default=None, description="The package's cover photo")
    cancellation: CancellationStatus | None = Field(
        default=None, description="Set once the customer has asked to cancel (B9)"
    )
    review_rating: int | None = Field(description="The stars of the customer's review, if any")
    can_review: bool = Field(description="Completed and not reviewed yet (B13)")
    balance_due_on: dt.date | None = Field(
        default=None, description="P5: on its deposit — the day the balance is due"
    )


class AccountBookings(ApiModel):
    name: str
    email: str
    today: dt.date = Field(description="The business day (IST) the list was read on")
    bookings: list[AccountBooking]
    waitlist: list[AccountWaitlistEntry] = Field(
        description="P6: this email's live waitlist entries, offers first to act on"
    )


class AccountTraveller(ApiModel):
    name: str
    age: int | None = Field(description="Null when the counter left it for later (P18)")
    occupancy: Occupancy


class AccountPayment(ApiModel):
    provider: PaymentProvider
    reference: str | None = Field(description="Razorpay's payment id; none for an offline one")
    amount_paise: int
    paid_at: dt.datetime


class ActivityEntry(ApiModel):
    """One line of the booking's history the customer may see (R54, P16), in their words."""

    at: dt.datetime
    kind: str
    group: Literal["booking", "payment", "email"]
    text: str
    approx: bool = Field(description="A time rebuilt from records, read off a row's last update")


class AccountCancellation(ApiModel):
    status: CancellationStatus
    reason: str
    requested_at: dt.datetime
    refund_note: str | None = None
    refund_paise: int | None = Field(default=None, description="Agreed on approval")
    resolved_at: dt.datetime | None = None


class GstDocumentOut(ApiModel):
    """A receipt, tax invoice or credit note the booking has (R51, P13b). `number` is null until
    it is first downloaded (or emailed) — the number is issued then, and never changes."""

    key: str = Field(description="receipt-<payment id> | invoice | credit-<refund id>")
    kind: Literal["receipt", "invoice", "credit_note"]
    title: str
    number: str | None
    amount_paise: int = Field(description="GST-inclusive")
    dated: dt.date = Field(description="The IST day of the payment, full payment or refund")


class AccountBalance(ApiModel):
    """R43 (P5): a booking made on a deposit — what is paid, what is left and by when, and
    whether "Pay the balance" is open (it closes while a cancellation request waits)."""

    deposit_paise: int
    balance_paise: int = Field(description="Still to pay; 0 once paid in full")
    due_on: dt.date = Field(description="The IST day the balance is due")
    last_day_on: dt.date = Field(description="The last day of grace; cancelled the day after")
    min_part_paise: int = Field(description="The smallest part accepted now: ₹1,000, or less left")
    open: bool = Field(description="Pay the balance is available")
    reason: str | None = Field(
        default=None, description="Why it is closed, in the customer's words"
    )


class BalanceRequest(ApiModel):
    """How much of the balance to pay now — at least the minimum part, at most what is left."""

    amount_paise: int = Field(ge=100, description="Whole rupees, unless it is all that is left")


class BalanceOrder(ApiModel):
    """A Razorpay order for a part of the balance; Checkout's success handler posts to
    `confirmPayment` like any booking payment."""

    booking_ref: str
    order_id: str
    key_id: str
    amount_paise: int
    balance_paise: int = Field(description="The balance before this part")


class AccountBookingDetail(ApiModel):
    """`GET /account/bookings/{ref}`: everything the customer's booking page shows."""

    ref: str
    status: BookingStatus
    hold_expires_at: dt.datetime
    booked_at: dt.datetime
    today: dt.date = Field(description="The business day (IST), for the countdown and the tier")
    package_name: str
    package_slug: str
    destination: str
    nights: int
    days: int
    departure_city: str
    departs: dt.date
    returns: dt.date
    cover_url: str | None = None
    travellers: list[AccountTraveller]
    quote: Quote = Field(description="The price as it was when the booking was made")
    total_paise: int
    paid_paise: int
    payments: list[AccountPayment] = Field(description="Captured payments, oldest first")
    lead_name: str
    lead_phone: str
    lead_email: str
    has_voucher: bool
    documents: list[GstDocumentOut] = Field(
        description="GST documents, in the order they happened (P13b)"
    )
    cancellation: AccountCancellation | None = None
    can_request_cancellation: bool = Field(
        description="Confirmed (or part paid), not yet departed, no request made"
    )
    review: AccountReview | None = Field(description="The customer's review of this trip (B13)")
    can_review: bool = Field(description="Completed and not reviewed yet")
    activity: list[ActivityEntry] = Field(description="The customer-safe history, oldest first")
    addons: list[BookedAddon] = Field(
        description="P8: the add-ons bought, oldest first, taken-off ones included"
    )
    extras: ExtrasOffer = Field(description="P8b: Add extras — open or not, and what")
    balance: AccountBalance | None = Field(
        default=None, description="P5: made on a deposit (null = booked paying in full)"
    )
    change: ChangeOffer = Field(description="P7: Change date — open or not, and the fee rule")


class CancellationRequest(ApiModel):
    reason: str = Field(min_length=10, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("reason")
    @classmethod
    def _plain(cls, v: str) -> str:
        # Newlines are fine in a reason; other control characters are not.
        if CONTROL_RE.search(v.replace("\n", " ").replace("\r", " ").replace("\t", " ")):
            raise ValueError("Write the reason without special characters")
        return v
