"""Add to calendar and the trip pack (R48, P10): what the booking page shows. Its own module —
account and (P10b) the desk both import it."""

import datetime as dt
from typing import Literal

from pydantic import Field, field_validator

from app.schemas import ApiModel
from app.schemas.enquiries import CONTROL_RE

PackState = Literal["locked", "open", "closed"]
CalendarVia = Literal["google", "ics"]
KnowBeforeKey = Literal["weather", "network", "cash", "rules", "packing"]
KNOW_BEFORE: tuple[tuple[KnowBeforeKey, str], ...] = (
    ("weather", "Weather"),
    ("network", "Network"),
    ("cash", "Cash"),
    ("rules", "Local rules"),
    ("packing", "Packing"),
)


class MeetingPoint(ApiModel):
    place: str
    time: dt.time | None = None
    maps_url: str | None = None
    note: str | None = Field(default=None, description="One line, e.g. look for the blue board")


class PackLeader(ApiModel):
    name: str
    slug: str
    languages: list[str]
    photo_url: str | None = None
    phone: str | None = Field(default=None, description="Only here — never on the voucher")


class PackHotel(ApiModel):
    name: str
    city: str
    stars: int
    nights: int
    address: str | None = None
    phone: str | None = None


class PackDay(ApiModel):
    day_no: int
    date: dt.date
    title: str
    description: str
    stay: str | None = None
    meals: str = Field(description="`Breakfast · Dinner`, or `No meals`")


class KnowBeforeNote(ApiModel):
    key: KnowBeforeKey
    label: str
    text: str


class PackContent(ApiModel):
    """The unlocked pack: everything for the road."""

    meeting: MeetingPoint | None
    leader: PackLeader | None
    hotels: list[PackHotel]
    days: list[PackDay]
    know_before: list[KnowBeforeNote] = Field(description="Only the notes the owner filled in")
    emergency_phone: str = Field(description="The 24×7 line, as printed")
    emergency_e164: str


class TripPack(ApiModel):
    """The booking page's trip-pack coupon. Opens on departure − 7 days (IST) once the booking is
    paid in full; readable until 30 days after the trip."""

    state: PackState = Field(
        description="locked = before the day or not paid in full · open · closed = 30 days "
        "after the trip"
    )
    opens_on: dt.date = Field(description="Departure − 7 days")
    needs_payment: bool = Field(description="Part paid: it opens only once the balance is in")
    day_reached: bool = Field(
        description="IST today ≥ `opensOn`: a locked pack now waits only for the balance"
    )
    read_at: dt.datetime | None = None
    content: PackContent | None = Field(default=None, description="Only while open")


class CalendarBlock(ApiModel):
    """The booking page's calendar coupon. Both links are signed api paths (prefix `/api` on the
    site) that record the click, then send the event."""

    google_url: str | None = Field(description="Null without a SESSION_SECRET (local dev)")
    ics_url: str | None
    added_at: dt.datetime | None = None
    via: CalendarVia | None = None
    stale: bool = Field(description="Added before a date change: add it again to update it")
    starts: dt.date
    ends: dt.date = Field(description="The last day of the trip (inclusive)")
    location: str


# --- the owner's side (P10b) --------------------------------------------------------------------

MEET_TEXT_MAX = 140
KNOW_BEFORE_MAX = 500


def _line(v: object) -> object:
    if not isinstance(v, str):
        return v
    v = v.strip()
    if CONTROL_RE.search(v):
        raise ValueError("Write it on one line, without special characters")
    return v or None


class MeetingPointInput(ApiModel):
    """Where day one starts. The Maps link must be an https address."""

    place: str = Field(min_length=3, max_length=MEET_TEXT_MAX)
    time: dt.time | None = None
    maps_url: str | None = Field(default=None, max_length=500)
    note: str | None = Field(default=None, max_length=MEET_TEXT_MAX)

    @field_validator("place", "note", mode="before")
    @classmethod
    def _one_line(cls, v: object) -> object:
        return _line(v)

    @field_validator("maps_url", mode="before")
    @classmethod
    def _https(cls, v: object) -> object:
        v = _line(v)
        if isinstance(v, str) and not v.lower().startswith("https://"):
            raise ValueError("Paste the Maps link starting with https://")
        return v


class KnowBefore(ApiModel):
    """The five "Know before you go" notes; blank ones are hidden in the pack."""

    weather: str = Field(default="", max_length=KNOW_BEFORE_MAX)
    network: str = Field(default="", max_length=KNOW_BEFORE_MAX)
    cash: str = Field(default="", max_length=KNOW_BEFORE_MAX)
    rules: str = Field(default="", max_length=KNOW_BEFORE_MAX)
    packing: str = Field(default="", max_length=KNOW_BEFORE_MAX)

    @field_validator("weather", "network", "cash", "rules", "packing", mode="before")
    @classmethod
    def _text(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        v = v.strip()
        if CONTROL_RE.search(v.replace("\n", " ").replace("\r", " ")):
            raise ValueError("Write the note without special characters")
        return v


class TripPackSettingsInput(ApiModel):
    """Package editor B's "Meeting point & Know before you go" section (R48)."""

    meeting: MeetingPointInput | None = Field(description="Null = none yet")
    know_before: KnowBefore = Field(default_factory=KnowBefore)


class TripPackSettings(ApiModel):
    meeting: MeetingPoint | None
    know_before: KnowBefore


class DeskPackStatus(ApiModel):
    """The desk's view of a booking's trip pack and calendar (P10b)."""

    pack: TripPack | None = Field(description="Without its content; null = pending/cancelled")
    calendar_added_at: dt.datetime | None
    calendar_via: CalendarVia | None
    calendar_stale: bool = Field(description="Added before a date change, not since")
