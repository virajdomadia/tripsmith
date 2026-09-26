"""My trips contract (R18): `GET /account/bookings`."""

import datetime as dt

from pydantic import Field

from app.models.enums import BookingStatus
from app.schemas import ApiModel


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


class AccountBookings(ApiModel):
    name: str
    email: str
    bookings: list[AccountBooking]
