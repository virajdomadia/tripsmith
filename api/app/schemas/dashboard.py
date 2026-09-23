"""`GET /admin/dashboard` contract (06 §C-REST `getDashboard`, R12, mockup A2).

One document, four bands: the tiles, the two top-five lists, the status breakdown and the
upcoming departures. `byStatus` is the inbox's own `StatusCounts` model rather than a copy of
it — R12's acceptance is that the dashboard reconciles with the inbox, and sharing the shape is
how that stays true when a status is added in v2.
"""

import datetime as dt

from pydantic import Field

from app.schemas import ApiModel
from app.schemas.admin_enquiries import StatusCounts
from app.schemas.meta import Badge

TOP_N = 5
WINDOW_DAYS = 30
VIEW_WINDOW_DAYS = 7
UPCOMING_DAYS = 30
MAX_DEPARTURES = 20


class PackageCount(ApiModel):
    """A bar in one of the two top-five lists (A2 `.bars`)."""

    id: str
    slug: str
    name: str
    count: int


class UpcomingDeparture(ApiModel):
    id: str
    package_id: str
    package_slug: str
    package_name: str
    date: dt.date
    seats_total: int
    seats_left: int = Field(description="From the departure_availability view; never stored")
    guaranteed: bool
    badge: Badge | None = Field(
        description="`pricing.badge_for`, the same rule the public departure table shows"
    )


class Dashboard(ApiModel):
    today: dt.date = Field(description="The IST business day every window below is measured from")
    week_start: dt.date = Field(description="Monday of the current IST week")
    enquiries_this_week: int
    enquiries_last_week: int
    awaiting_first_call: int = Field(description="Enquiries still at status `new`")
    oldest_new_at: dt.datetime | None = Field(description="Null when nothing is waiting")
    # Spelled out rather than `enquiries_30d`: `to_camel` renders a trailing `_30d` as
    # `30D`, where the capital reads as a unit.
    enquiries_last_30_days: int = Field(description="Received in the last 30 IST days")
    converted_last_30_days: int = Field(
        description="Received in that window and now marked converted"
    )
    views_last_7_days: int
    views_previous_7_days: int = Field(description="The 7 days before those, for the delta")
    by_status: StatusCounts
    top_by_enquiries: list[PackageCount]
    top_by_views: list[PackageCount]
    upcoming_departures: list[UpcomingDeparture]
