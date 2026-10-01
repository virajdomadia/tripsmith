"""The waitlist on the wire (R44, P6)."""

import datetime as dt
from typing import Literal

from pydantic import Field, field_validator

from app.schemas import ApiModel
from app.schemas.enquiries import CONTROL_RE, EMAIL_RE
from app.schemas.meta import MAX_TRAVELLERS

ClaimState = Literal["offered", "claimed", "waiting", "booked", "closed", "removed"]


class WaitlistJoin(ApiModel):
    """`joinWaitlist`: a sold-out date, and who is waiting for it. No account needed."""

    departure_id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=120)
    party: int = Field(ge=1, le=MAX_TRAVELLERS, description="How many seats the party needs")

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        if isinstance(v, str):
            v = " ".join(v.split())
            if CONTROL_RE.search(v):
                raise ValueError("Enter your name")
        return v

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> str:
        s = v.strip().lower() if isinstance(v, str) else ""
        if not EMAIL_RE.match(s):
            raise ValueError("Enter a valid email address")
        return s


class WaitlistJoined(ApiModel):
    position: int = Field(description="Where the party stands: 1 = next in line")
    waiting: int = Field(description="Everyone on this date's list now, this party included")


class WaitlistClaim(ApiModel):
    """`getWaitlistClaim`: what a claim link's offer holds, read when the sheet opens with it."""

    state: ClaimState = Field(
        description="offered = held for you; claimed = your booking is started and still held; "
        "waiting = the offer ended and you're back on the list; booked, closed or removed = done"
    )
    departure_id: str
    date: dt.date
    package_slug: str
    package_name: str
    name: str
    email: str
    party: int
    held_seats: int = Field(
        description="Seats held for this claim right now (the offer's party, or the started "
        "booking's): add them to the date's `seatsLeft` when choosing the party"
    )
    expires_at: dt.datetime | None = Field(description="When the offer (and any hold) ends")
    position: int | None = Field(description="Place on the list when back to waiting")


class AccountWaitlistEntry(ApiModel):
    """A waitlist entry on My trips (matched by the account's email)."""

    departure_id: str
    date: dt.date
    package_slug: str
    package_name: str
    party: int
    state: Literal["waiting", "offered", "claimed"]
    position: int = Field(description="1 = next in line")
    offer_expires_at: dt.datetime | None
    claim_path: str | None = Field(
        description="The Book-now sheet with the offer, while one is held for you"
    )


class WaitlistTick(ApiModel):
    """`/cron/waitlist`'s report."""

    offered: int
    lapsed: int
    closed: int
    emails: int
