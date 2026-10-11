"""The owner's departure calendar (R50, P11): one month of departures with their seats, money
and readiness, a departure's side panel, and adding a departure from a day.

Seat maths, the same everywhere on the calendar: `sold` = travellers on confirmed, part-paid and
completed bookings; `free` = the `departure_availability` view; `held` = seats total − sold −
free, which covers checkout holds, counter payment links, waitlist offers and date-change holds.
So sold + held + free = seats total, always (clamped at 0 when a lowered total oversells).
"""

import datetime as dt
from typing import Literal

from pydantic import Field

from app.models.enums import BookingChannel, BookingStatus
from app.schemas import ApiModel
from app.schemas.catalog import PRICE_MAX_PAISE
from app.schemas.leaders import DeskLeader, LeaderRef
from app.schemas.trip_pack import MeetingPoint

MONTH_PATTERN = r"^20[2-9][0-9]-(0[1-9]|1[0-2])$"


class CalendarDeparture(ApiModel):
    """One chip: a departure starting in the month."""

    id: str
    package_id: str
    date: dt.date
    returns: dt.date = Field(description="date + the package's nights")
    leader_id: str | None = Field(description="Its own leader, else the package's default")
    seats_total: int
    sold: int = Field(description="Travellers on confirmed, part-paid and completed bookings")
    held: int = Field(description="seats total − sold − free: holds, links, offers, date changes")
    free: int = Field(description="The `departure_availability` view's seats left")
    waiting: int = Field(description="Live waitlist places (waiting, offered or claiming)")
    smallest_waiting_party: int | None = Field(
        description="The smallest party still waiting (not offered) — can free seats go to it?"
    )
    guaranteed: bool
    price_double_paise: int
    revenue_paise: int = Field(description="Σ total of confirmed, part-paid, completed bookings")
    collected_paise: int = Field(description="Σ paid of the same bookings")
    balance_paise: int = Field(description="Σ total − paid of its part-paid bookings")
    balance_bookings: int
    first_due_on: dt.date | None = Field(description="The earliest balance due date")
    missing_travellers: int = Field(description="Paid travellers still missing a detail (R49)")
    ready_percent: int | None = Field(description="R49 readiness: null with no paid bookings")


class CalendarPackage(ApiModel):
    """A package for the filters and the add form, with the prefill of its latest date."""

    id: str
    name: str
    destination_id: str
    destination_name: str
    nights: int
    draft: bool
    leader_id: str | None = Field(description="The package's default leader")
    seats_total: int | None = Field(description="Prefill: its latest departure's, else null")
    price_double_paise: int | None
    price_triple_paise: int | None
    price_child_paise: int | None
    single_supplement_paise: int | None


class BusyLeaderTrip(ApiModel):
    """A departure someone leads near the month, so the add form can grey out busy leaders."""

    leader_id: str
    departure_id: str
    package_name: str
    date: dt.date
    returns: dt.date


class CalendarMonth(ApiModel):
    """`GET /admin/calendar?month=YYYY-MM`: everything the month grid draws. Filters run in the
    browser, so this is the whole month."""

    month: str = Field(pattern=MONTH_PATTERN)
    today: dt.date = Field(description="IST")
    departures: list[CalendarDeparture] = Field(description="By date, then package name")
    packages: list[CalendarPackage]
    leaders: list[LeaderRef] = Field(description="Switched on, plus any leading this month")
    leader_trips: list[BusyLeaderTrip] = Field(description="Trips overlapping the month ± 31 days")
    next_busy_month: str | None = Field(description="The first later month with departures")
    prev_busy_month: str | None = Field(description="The last earlier month with departures")


class PanelBooking(ApiModel):
    """A booking on the departure's panel. Holds come first, then balances, then paid."""

    ref: str
    status: BookingStatus
    lead_name: str
    travellers: int
    total_paise: int
    paid_paise: int
    balance_due_on: dt.date | None = Field(description="Part-paid only")
    channel: BookingChannel
    hold_expires_at: dt.datetime | None = Field(description="Pending only: a live hold or link")
    missing_travellers: int
    ready_percent: int | None


class PanelHold(ApiModel):
    """Seats held by something other than a booking: a waitlist offer or a date change."""

    kind: Literal["waitlist_offer", "date_change"]
    name: str = Field(description="Who it is for")
    party: int
    expires_at: dt.datetime | None
    ref: str | None = Field(default=None, description="The moving booking (date change)")


class ReadinessShare(ApiModel):
    key: Literal["details", "balance", "pack", "calendar", "items"]
    label: str
    percent: int


class CalendarPanel(ApiModel):
    """`GET /admin/calendar/departures/{id}`: the side panel. The waitlist itself comes from
    `getDepartureWaitlist`, which walks the list first."""

    departure: CalendarDeparture
    package_name: str
    package_slug: str
    destination_name: str
    nights: int
    draft: bool
    price_triple_paise: int
    price_child_paise: int
    single_supplement_paise: int
    leader: DeskLeader | None
    meeting: MeetingPoint | None
    readiness_parts: list[ReadinessShare] = Field(
        description="Mean of each part over the paid bookings; empty with none"
    )
    bookings: list[PanelBooking]
    holds: list[PanelHold]


class NewDepartureInput(ApiModel):
    """`POST /admin/packages/{id}/departures`: one date added from the calendar. Never touches
    the package's other dates (the editor's PUT replaces the whole list)."""

    date: dt.date
    seats_total: int = Field(ge=1, le=200)
    guaranteed: bool = False
    price_double_paise: int = Field(ge=100, le=PRICE_MAX_PAISE)
    price_triple_paise: int = Field(ge=100, le=PRICE_MAX_PAISE)
    price_child_paise: int = Field(ge=100, le=PRICE_MAX_PAISE)
    single_supplement_paise: int = Field(ge=0, le=PRICE_MAX_PAISE)
    leader_id: str | None = Field(
        default=None, max_length=40, description="Null = the package's default leader"
    )


class NewDeparture(ApiModel):
    id: str
    package_id: str
    date: dt.date
