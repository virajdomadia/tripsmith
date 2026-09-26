"""`/admin/coupons*` (R26, B15): the owner's coupon codes.

Money is whole rupees in paise (the form edits rupees). Dates are IST days: a coupon runs from
the start of `startsOn` to the end of `endsOn` (none = no end). Rules that need two fields or
the database — the terms matching the kind, the chosen packages, what a used coupon may still
change — are the service's 400 / 409 with `fieldErrors`.
"""

import datetime as dt
import re
from enum import StrEnum

from pydantic import Field, field_validator

from app.models.enums import CouponKind
from app.schemas import ApiModel
from app.schemas.bookings import normalise_code
from app.schemas.catalog import PRICE_MAX_PAISE

CODE_RE = re.compile(r"^[A-Z0-9-]{3,20}$")
CODE_MESSAGE = "3–20 letters, digits or dashes"
USE_LIMIT_MAX = 1_000_000


def whole_rupees(v: int | None) -> int | None:
    if v is not None and v % 100:
        raise ValueError("Whole rupees only")
    return v


class CouponState(StrEnum):
    """What the list's badge says, in the order it is decided."""

    PAUSED = "paused"
    SCHEDULED = "scheduled"  # starts later
    EXPIRED = "expired"
    USED_UP = "used_up"  # captured uses reached the limit
    ACTIVE = "active"


class CouponInput(ApiModel):
    code: str = Field(description="Stored upper case; unique; locked once the coupon is in use")
    kind: CouponKind
    amount_paise: int | None = Field(
        default=None, gt=0, le=PRICE_MAX_PAISE, description="Flat only: ₹ off the booking"
    )
    percent: int | None = Field(default=None, ge=1, le=90, description="Percent only")
    cap_paise: int | None = Field(
        default=None, gt=0, le=PRICE_MAX_PAISE, description="Percent only, optional"
    )
    min_paise: int | None = Field(
        default=None, gt=0, le=PRICE_MAX_PAISE, description="Optional; the total after the deal"
    )
    starts_on: dt.date = Field(description="First IST day it works")
    ends_on: dt.date | None = Field(
        default=None, description="Last IST day it works; none = no end"
    )
    use_limit: int | None = Field(
        default=None, ge=1, le=USE_LIMIT_MAX, description="Captured uses; none = no limit"
    )
    all_packages: bool = True
    package_ids: list[str] = Field(
        default_factory=list, max_length=200, description="When not all packages"
    )
    active: bool = True

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v: object) -> object:
        v = normalise_code(v)
        if not isinstance(v, str) or not CODE_RE.match(v):
            raise ValueError(CODE_MESSAGE)
        return v

    _rupees = field_validator("amount_paise", "cap_paise", "min_paise")(whole_rupees)


class CouponActive(ApiModel):
    active: bool


class CouponPackage(ApiModel):
    id: str
    name: str


class AdminCoupon(ApiModel):
    id: str
    code: str
    kind: CouponKind
    amount_paise: int | None
    percent: int | None
    cap_paise: int | None
    min_paise: int | None
    starts_on: dt.date
    ends_on: dt.date | None
    use_limit: int | None
    all_packages: bool
    packages: list[CouponPackage]
    active: bool
    state: CouponState
    uses: int = Field(description="Bookings with the code and money captured")
    live_holds: int = Field(description="Checkouts holding the code right now")
    locked: bool = Field(
        description="In use (a use or a live hold): code, kind and amount can no longer change, "
        "and it cannot be deleted"
    )
    created_at: dt.datetime


class AdminCouponList(ApiModel):
    items: list[AdminCoupon]
