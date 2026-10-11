"""`/admin/reports` (R55, P12): the owner's reports over one IST date range.

Every booking section is keyed on the **departure date**, the same range the desk's From/To
filter uses, so a report's totals are the desk CSV's columns summed (R55 accept). The funnel is
the one exception: it counts activity (a view, an enquiry, a hold) on the day it happened.
Money is in paise, like every other api response.
"""

import datetime as dt
from enum import StrEnum

from pydantic import Field

from app.models.enums import BookingChannel
from app.schemas import ApiModel

SPAN_MAX_DAYS = 1096  # three years: a custom range wider than that is a mistake, not a report
EMPTIEST_DAYS = 60  # "emptiest upcoming" looks this far ahead
EMPTIEST_MAX = 5
EMPTIEST_SKIP_GUARANTEED_PERCENT = 70  # a guaranteed date already this full is not a worry


class ReportSection(StrEnum):
    MONEY = "money"
    CASH = "cash"
    PACKAGES = "packages"
    OCCUPANCY = "occupancy"
    FUNNEL = "funnel"
    CANCELLATIONS = "cancellations"
    DISCOUNTS = "discounts"
    ADDONS = "addons"
    CHANNELS = "channels"
    CUSTOMERS = "customers"


class DiscountSource(StrEnum):
    DEAL = "deal"
    EARLY_BIRD = "early_bird"
    COUPON = "coupon"
    MANUAL = "manual"


class ReportRange(ApiModel):
    from_: dt.date = Field(alias="from", description="First departure day, IST")
    to: dt.date = Field(description="Last departure day, IST (inclusive)")
    previous_from: dt.date = Field(description="The same number of days just before `from`")
    previous_to: dt.date
    today: dt.date = Field(description="IST today, which splits upcoming from past")
    demo: bool = Field(description="True when the seeded demo history is included")
    demo_bookings: int = Field(description="Seeded demo bookings departing in the range")


class ReportPrevious(ApiModel):
    booked_paise: int
    net_paise: int
    bookings: int


class ReportKpis(ApiModel):
    booked_paise: int
    collected_paise: int
    refunded_paise: int
    net_paise: int
    balance_paise: int
    bookings: int = Field(description="Bookings holding seats (confirmed, deposit paid, done)")
    travellers: int
    seats_sold: int
    seats_total: int = Field(description="Every seat on the range's departures")
    departures: int
    previous: ReportPrevious


class ReportMonth(ApiModel):
    month: str = Field(description="YYYY-MM of the departure", examples=["2026-05"])
    bookings: int
    booked_paise: int
    collected_paise: int
    refunded_paise: int
    net_paise: int
    gst_paise: int
    balance_paise: int


class ReportCashMonth(ApiModel):
    month: str = Field(description="YYYY-MM of the payment or refund, IST")
    in_paise: int
    out_paise: int


class ReportCash(ApiModel):
    """What reached or left the bank in the range, by payment and refund date — whatever the
    departure. Not part of the reconcile."""

    in_paise: int
    out_paise: int
    net_paise: int
    months: list[ReportCashMonth]


class ReportMoney(ApiModel):
    booked_paise: int = Field(description="Σ total of bookings holding seats = desk CSV Total")
    collected_paise: int = Field(description="Captured payments, online and offline")
    refunded_paise: int = Field(description="Refunds sent or on their way (not failed)")
    net_paise: int = Field(description="collected − refunded = desk CSV Paid, every status")
    gst_paise: int = Field(description="The 5 % GST inside net (prices are GST-inclusive)")
    balance_paise: int = Field(description="= desk CSV Balance due")
    balance_bookings: int
    months: list[ReportMonth]
    cash: ReportCash


class ReportPackage(ApiModel):
    package_id: str
    name: str
    bookings: int
    travellers: int
    booked_paise: int
    net_paise: int
    departures: int
    seats_sold: int
    seats_total: int


class ReportDeparture(ApiModel):
    departure_id: str
    package_id: str
    package_name: str
    date: dt.date
    seats_total: int
    sold: int
    held: int = Field(description="Checkout holds, payment links and date-change holds")
    free: int
    guaranteed: bool
    days_to_go: int


class ReportPastFill(ApiModel):
    package_id: str
    name: str
    departures: int
    seats_sold: int
    seats_total: int


class ReportOccupancy(ApiModel):
    upcoming: list[ReportDeparture] = Field(description="Departures from today to `to`")
    past: list[ReportPastFill] = Field(description="Departures from `from` to yesterday")
    emptiest: list[ReportDeparture] = Field(
        description="The emptiest live departures in the next 60 days, whatever the range"
    )


class ReportFunnelPackage(ApiModel):
    package_id: str
    name: str
    views: int
    enquiries: int
    holds: int
    paid: int


class ReportFunnel(ApiModel):
    """By activity date: views (our own counter), package enquiries, web holds started, and
    those holds that were ever paid. Enquiries and holds are parallel paths, not steps."""

    views: int
    enquiries: int
    holds: int
    paid: int
    packages: list[ReportFunnelPackage]


class ReportReason(ApiModel):
    reason: str = Field(description="The cancel reason's key")
    label: str
    bookings: int
    refunded_paise: int
    kept_paise: int = Field(description="Collected − refunded on these bookings")


class ReportCancellations(ApiModel):
    paid_bookings: int = Field(description="Bookings that ever had a captured payment")
    cancelled: int = Field(description="… of those, cancelled since")
    refunded_paise: int
    kept_paise: int = Field(description="Collected − refunded on the cancelled ones: fees kept")
    reasons: list[ReportReason]
    lapsed: list[ReportReason] = Field(
        description="Never paid: holds that lapsed, failed payments, seats gone"
    )


class ReportDiscount(ApiModel):
    source: DiscountSource
    label: str = Field(description="“Deals”, “Early-bird”, the coupon's code, or “Manual”")
    given_paise: int
    bookings: int = Field(description="Bookings that carried it")
    booked_paise: int = Field(description="Those bookings' total")


class ReportDiscounts(ApiModel):
    given_paise: int
    discounted_bookings: int
    bookings: int
    sources: list[ReportDiscount]


class ReportAddon(ApiModel):
    name: str
    bookings: int = Field(description="Bookings that took it")
    eligible: int = Field(description="Bookings on packages that offer it")
    revenue_paise: int


class ReportAddons(ApiModel):
    revenue_paise: int
    with_any: int = Field(description="Bookings with at least one add-on")
    bookings: int
    addons: list[ReportAddon]


class ReportChannel(ApiModel):
    channel: BookingChannel
    bookings: int
    travellers: int
    booked_paise: int


class ReportBucket(ApiModel):
    label: str
    bookings: int


class ReportCustomers(ApiModel):
    bookings: int
    travellers: int
    party: list[ReportBucket]
    lead: list[ReportBucket] = Field(description="Days booked before departure")
    repeat: int = Field(description="Bookings by an email with two or more paid bookings ever")
    first: int


class Reports(ApiModel):
    range: ReportRange
    kpis: ReportKpis
    money: ReportMoney
    packages: list[ReportPackage]
    occupancy: ReportOccupancy
    funnel: ReportFunnel
    cancellations: ReportCancellations
    discounts: ReportDiscounts
    addons: ReportAddons
    channels: list[ReportChannel]
    customers: ReportCustomers
