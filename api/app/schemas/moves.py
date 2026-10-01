"""The owner's move from the desk (R45, P7b): the dates, a preview, and the move itself."""

import datetime as dt
from typing import Literal

from pydantic import Field, field_validator

from app.schemas import ApiModel
from app.schemas.admin_bookings import short_note
from app.schemas.counter import CounterTraveller, OfflineMethod
from app.schemas.counter import _counter_party as counter_party

MoveSettle = Literal["offline", "balance"]


class MoveDate(ApiModel):
    """One date of the trip the owner can move a booking to (its own date included, for a
    change of party only)."""

    departure_id: str
    date: dt.date
    seats_left: int = Field(description="Free seats, counting this booking's own on its date")
    current: bool


class MoveOptions(ApiModel):
    """`GET /admin/bookings/{ref}/move`: the dates, the party and the fee the tier suggests."""

    current_date: dt.date
    travellers: list[CounterTraveller]
    suggested_fee_paise: int = Field(
        description="The self-serve tier on the booking's date: 30+ days free, else ₹1,000 a "
        "traveller"
    )
    dates: list[MoveDate]


class MoveQuoteRequest(ApiModel):
    departure_id: str = Field(min_length=1, max_length=40)
    travellers: list[CounterTraveller] | None = Field(
        default=None, max_length=12, description="The new party; null = the same travellers"
    )
    fee_paise: int | None = Field(
        default=None, ge=0, le=1_00_000_00, description="Null = the suggested fee"
    )

    @field_validator("travellers")
    @classmethod
    def _party(cls, v: list[CounterTraveller] | None) -> list[CounterTraveller] | None:
        if v is not None:
            counter_party(v)
        return v

    @field_validator("fee_paise")
    @classmethod
    def _rupees(cls, v: int | None) -> int | None:
        if v is not None and v % 100:
            raise ValueError("Give the fee in whole rupees")
        return v


class MoveQuote(ApiModel):
    """The owner's preview of a move."""

    current_fare_paise: int
    fare_paise: int = Field(description="The fare on the new date, the earned discounts kept")
    addons_change_paise: int = Field(description="What a party change does to the add-ons")
    fee_paise: int
    suggested_fee_paise: int = Field(
        description="The tier's fee for this party (0 for a fee-only change on the same date)"
    )
    net_paise: int
    total_paise: int
    paid_paise: int
    owed_paise: int = Field(description="What the customer would owe after the move")
    refund_paise: int = Field(description="What would go back after the move")
    due_on: dt.date = Field(description="When an amount added to the balance would be due")
    seats_left: int
    fits: bool


class MoveRequest(MoveQuoteRequest):
    """`POST /admin/bookings/{ref}/move`. A rise is settled now offline, or added to the
    balance; a fall is refunded through Razorpay (or comes off the balance)."""

    fee_reason: str | None = Field(
        default=None, max_length=200, description="Required when the fee differs from the tier"
    )
    settle: MoveSettle | None = Field(default=None, description="Required when the price rises")
    method: OfflineMethod | None = None
    reference: str | None = Field(default=None, max_length=80)
    expected_net_paise: int

    @field_validator("fee_reason", "reference", mode="before")
    @classmethod
    def _note(cls, v: object) -> str | None:
        return short_note(v)
