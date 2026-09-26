"""My trips contract (R18, R19): the list, one booking's detail, and a cancellation request."""

import datetime as dt

from pydantic import Field, field_validator

from app.models.enums import BookingStatus, CancellationStatus, Occupancy, PaymentProvider
from app.schemas import ApiModel
from app.schemas.bookings import Quote
from app.schemas.enquiries import CONTROL_RE


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


class AccountBookings(ApiModel):
    name: str
    email: str
    today: dt.date = Field(description="The business day (IST) the list was read on")
    bookings: list[AccountBooking]


class AccountTraveller(ApiModel):
    name: str
    age: int
    occupancy: Occupancy


class AccountPayment(ApiModel):
    provider: PaymentProvider
    reference: str | None = Field(description="Razorpay's payment id; none for an offline one")
    amount_paise: int
    paid_at: dt.datetime


class AccountCancellation(ApiModel):
    status: CancellationStatus
    reason: str
    requested_at: dt.datetime
    refund_note: str | None = None
    refund_paise: int | None = Field(default=None, description="Agreed on approval")
    resolved_at: dt.datetime | None = None


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
    cancellation: AccountCancellation | None = None
    can_request_cancellation: bool = Field(
        description="Confirmed (or part paid), not yet departed, no request made"
    )


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
