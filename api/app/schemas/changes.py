"""Change date (R45, P7): what My trips offers, the dates a booking can move to with their
re-quotes, and the move itself. Prices always come from the server; the client sends the date
it picked and the net amount it was shown, so a price that moved in between is refused."""

import datetime as dt
from typing import Literal

from pydantic import Field

from app.schemas import ApiModel
from app.schemas.bookings import UnbookableReason


class ChangeOffer(ApiModel):
    """The "Change date" card on a booking: open or not, and the fee rule in dates."""

    open: bool
    reason: str | None = Field(description="Why it is closed, in the customer's words")
    fee_per_traveller_paise: int | None = Field(
        description="Today's fee per traveller (0 = free); null = no longer online"
    )
    fee_paise: int | None = Field(description="Today's fee for the whole party")
    free_until: dt.date = Field(description="The last IST day a change is free (departure − 30)")
    last_day: dt.date = Field(description="The last IST day to change online (departure − 15)")
    used: bool = Field(description="The booking's one self-serve change is spent")


class ChangeOption(ApiModel):
    """One date the booking could move to, re-quoted for this booking."""

    departure_id: str
    date: dt.date
    seats_left: int
    bookable: bool
    unbookable: UnbookableReason | None = Field(description="Why it can't be picked")
    fare_paise: int = Field(description="The trip fare on this date, the earned discounts kept")
    difference_paise: int = Field(description="This date's fare − the current fare (signed)")
    fee_paise: int
    net_paise: int = Field(description="difference + fee: above 0 = to pay, below = back")
    total_paise: int = Field(description="The booking's total after the move")
    pay_now_paise: int = Field(description="What the move asks for now (0 = instant)")
    refund_paise: int = Field(description="What goes back to the customer")
    balance_paise: int = Field(description="What would still be owed after the move")
    due_on: dt.date | None = Field(description="When that balance would be due")


class ChangeOptions(ApiModel):
    """`GET /account/bookings/{ref}/change`: the dates, nearest first."""

    current_date: dt.date
    current_fare_paise: int
    party: int
    fee_paise: int
    options: list[ChangeOption]


class ChangeRequest(ApiModel):
    departure_id: str = Field(min_length=1, max_length=40)
    expected_net_paise: int = Field(
        description="The net the customer was shown; a different one now = 409 price_changed"
    )


class ChangeResult(ApiModel):
    """The move: made at once (`done`), or waiting for the difference (`pay` — open Checkout
    with the order; the new date's seats are held until `holdExpiresAt`)."""

    booking_ref: str
    state: Literal["done", "pay"]
    date: dt.date = Field(description="The new date")
    pay_now_paise: int
    refund_paise: int
    order_id: str | None = None
    key_id: str | None = None
    hold_expires_at: dt.datetime | None = None
