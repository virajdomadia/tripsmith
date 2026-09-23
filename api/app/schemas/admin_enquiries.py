"""Owner-side enquiry contract (06 §C-REST `/admin/enquiries*`, F21).

The public `POST /enquiries` shapes stay in app/schemas/enquiries.py. Nothing here is ever
served to a visitor, and `ip_hash` is deliberately absent from every model below: it is a hash,
useless to the owner and PII-adjacent.
"""

import datetime as dt
from typing import Literal

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import EmailStatus, EnquiryStatus, PackageStatus
from app.schemas import ApiModel
from app.schemas.enquiries import PackageRef
from app.schemas.meta import EnquiryType

PAGE_SIZE = 50
MAX_PAGE = 10_000
NOTE_MAX = 2000
SEARCH_MAX = 80

Device = Literal["Mobile", "Desktop", "Unknown"]


class EnquiryFilters(ApiModel):
    """`GET /admin/enquiries` and `GET /admin/enquiries.csv` query.

    Blank values never reach here — `BlankQueryParamsMiddleware` drops `?status=&q=` so the
    no-JS GET form on the inbox validates as "not provided" rather than as bad input.
    """

    status: EnquiryStatus | None = None
    type: EnquiryType | None = None
    package_id: str | None = Field(default=None, max_length=40)
    from_: dt.date | None = Field(
        default=None, alias="from", description="Received on or after this IST day"
    )
    to: dt.date | None = Field(default=None, description="Received on or before this IST day")
    q: str | None = Field(default=None, max_length=SEARCH_MAX, description="Name or phone")
    page: int = Field(default=1, ge=1, le=MAX_PAGE, description="1-based; ignored by the CSV")

    @field_validator("to")
    @classmethod
    def _not_before_from(cls, value: dt.date | None, info: ValidationInfo) -> dt.date | None:
        start = info.data.get("from_")
        if value is not None and start is not None and value < start:
            raise ValueError("must not be before `from`")
        return value


class StatusCounts(ApiModel):
    """Every status counted with the current filters applied **except** `status` itself, so
    "New 3" means new within the view the owner is looking at (A6 tabs)."""

    new: int
    contacted: int
    converted: int
    closed: int
    all: int


class EnquiryRow(ApiModel):
    """One line of the A6 table."""

    id: str
    ref: str
    type: EnquiryType
    status: EnquiryStatus
    name: str
    phone: str
    package: PackageRef | None
    travel_month: dt.date | None = Field(description="First of the month")
    adults: int
    children: int
    created_at: dt.datetime


class EnquiryList(ApiModel):
    items: list[EnquiryRow]
    page: int
    page_size: int
    total: int = Field(description="Rows matching every filter, including status")
    total_pages: int = Field(ge=1)
    counts: StatusCounts


class EnquiryNoteOut(ApiModel):
    """Append-only; no author column in v1 — the UI renders the signed-in owner."""

    id: str
    body: str
    created_at: dt.datetime


class RelatedEnquiry(ApiModel):
    """A7's "other enquiries · same phone" panel."""

    id: str
    ref: str
    status: EnquiryStatus
    package_name: str | None
    created_at: dt.datetime


class EnquiryPackage(ApiModel):
    slug: str
    name: str
    nights: int
    days: int
    starting_price_paise: int
    cover_url: str | None
    status: PackageStatus


class AdminEnquiry(ApiModel):
    """Everything the visitor submitted, plus the timeline (A7)."""

    id: str
    ref: str
    type: EnquiryType
    status: EnquiryStatus
    name: str
    phone: str
    email: str
    travel_month: dt.date | None
    adults: int
    children: int
    message: str | None
    preferred_dates: str | None = Field(description="Custom enquiries only")
    budget_paise: int | None = Field(description="Custom enquiries only; per person")
    changes: str | None = Field(description="Custom enquiries only")
    package: EnquiryPackage | None
    email_status: EmailStatus
    device: Device = Field(description="Derived from the user agent; no geo lookup exists")
    user_agent: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    notes: list[EnquiryNoteOut]
    related: list[RelatedEnquiry]


class EnquiryStatusInput(ApiModel):
    status: EnquiryStatus


class EnquiryNoteInput(ApiModel):
    body: str = Field(min_length=1, max_length=NOTE_MAX)

    @field_validator("body", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v
