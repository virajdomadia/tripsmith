"""`GET /admin/money` (R59, P20 · Dashboard C "Money desk"): read-only.

The cash equation for the IST month so far (collected − refunds = kept, with live holds as an
optional extra), cash by day over a window ending today, and three columns — coming in, going
out, at risk. Every amount is paise; every day is an IST calendar day. v2.5 rows add balances
due (P5) and channels (P18) to this shape when they ship.
"""

import datetime as dt
from typing import Literal

from pydantic import Field

from app.schemas import ApiModel

WINDOW_DEFAULT = 40
WINDOW_MIN = 7
WINDOW_MAX = 90

LineKind = Literal["in", "out", "owe"]


class MoneyLine(ApiModel):
    ref: str
    name: str = Field(description="The booking's lead")
    kind: LineKind = Field(description="`in` collected · `out` refund recorded · `owe` to record")
    label: str = Field(description="How the money moved, e.g. `Razorpay` or `Offline · UTR 44`")
    amount_paise: int = Field(description="Always positive; `kind` says the direction")


class MoneyDay(ApiModel):
    date: dt.date
    in_paise: int
    out_paise: int
    owe_paise: int = Field(description="Refunds still to record — only ever on today")
    lines: list[MoneyLine]


class MoneyHold(ApiModel):
    ref: str
    name: str
    total_paise: int
    hold_expires_at: dt.datetime
    package_name: str
    departs: dt.date


class MoneyOwed(ApiModel):
    ref: str
    name: str
    amount_paise: int = Field(description="What 'Refund made' would give back now")
    why: str


class MoneyRefund(ApiModel):
    ref: str
    name: str
    amount_paise: int
    at: dt.datetime


class MoneyRisk(ApiModel):
    ref: str
    name: str
    kind: Literal["cancellation", "lapsed"]
    amount_paise: int = Field(
        description="`cancellation`: the refund the policy suggests; `lapsed`: the unpaid total"
    )
    text: str
    departs: dt.date


class MoneyDesk(ApiModel):
    today: dt.date
    month_start: dt.date
    window_start: dt.date
    collected_paise: int = Field(description="Captured this month, refunded later or not")
    collected_count: int
    refunded_paise: int = Field(description="Refunds recorded this month")
    to_record_paise: int = Field(description="Refunds owed and not yet recorded")
    holds_paise: int = Field(description="Live checkout holds, not money yet")
    days: list[MoneyDay] = Field(description="The window, oldest first, one entry per day")
    holds: list[MoneyHold]
    owed: list[MoneyOwed]
    refunded: list[MoneyRefund] = Field(description="This month, newest first")
    at_risk: list[MoneyRisk]
