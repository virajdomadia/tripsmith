"""Add-ons after booking (R46, P8b): what a booking has, "Add extras" in My trips, and the
owner taking one off. Prices always come from the server; the client sends choices only."""

import datetime as dt

from pydantic import Field, field_validator

from app.models.enums import AddonBasis
from app.schemas import ApiModel
from app.schemas.bookings import ADDON_CHOICES_MAX, AddonChoice, QuoteAddon
from app.schemas.catalog import AddonOut
from app.schemas.enquiries import CONTROL_RE


class BookedAddon(ApiModel):
    """One add-on a booking has (or had: `removedAt`), as bought — its own copy of the price."""

    id: str
    name: str
    basis: AddonBasis
    travellers: int
    nights: int
    unit_paise: int
    amount_paise: int
    added_later: bool = Field(description="Bought through Add extras, after the booking")
    added_at: dt.datetime
    removed_at: dt.datetime | None = Field(description="Taken off by the owner, refunded")


class ExtrasOffer(ApiModel):
    """My trips → Add extras: open or not (and why), until when, and what can still be added."""

    open: bool
    closes_on: dt.date = Field(description="The last IST day to add extras: departure − 7 days")
    reason: str | None = Field(description="Why extras are closed, in the customer's words")
    offered: list[AddonOut] = Field(
        description="Switched-on add-ons the booking does not have yet, in the owner's order"
    )


class ExtrasRequest(ApiModel):
    addons: list[AddonChoice] = Field(min_length=1, max_length=ADDON_CHOICES_MAX)

    @field_validator("addons")
    @classmethod
    def _once_each(cls, v: list[AddonChoice]) -> list[AddonChoice]:
        ids = [c.addon_id for c in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Each add-on can be picked once")
        return v


class ExtrasQuote(ApiModel):
    addons: list[QuoteAddon]
    total_paise: int = Field(
        description="What Add extras charges: the lines' sum, never discounted"
    )


class ExtrasOrder(ApiModel):
    """The Razorpay order for the extras — Checkout is opened with it, and its success handler
    posts to `confirmPayment` like any booking payment."""

    booking_ref: str
    order_id: str
    key_id: str
    amount_paise: int
    addons: list[QuoteAddon]


class RemoveAddonInput(ApiModel):
    note: str | None = Field(
        default=None, max_length=200, description="Optional, shown to the customer"
    )

    @field_validator("note", mode="before")
    @classmethod
    def _note(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        s = v.strip()
        if CONTROL_RE.search(s.replace("\n", " ")):
            raise ValueError("Write the note without special characters")
        return s or None
