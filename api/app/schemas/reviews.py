"""Reviews contract (R21, R24, B13): the customer's review of a completed booking, the published
ones on a package page, and the owner's moderation queue."""

import datetime as dt
from enum import StrEnum

from pydantic import Field, field_validator

from app.schemas import ApiModel
from app.schemas.enquiries import CONTROL_RE

TEXT_MIN = 20
TEXT_MAX = 1000
PUBLIC_PAGE_SIZE = 6
ADMIN_PAGE_SIZE = 20
MAX_PAGE = 500


class ReviewState(StrEnum):
    """Derived from `approved` + `moderated_at` (see `models.Review`)."""

    PENDING = "pending"
    PUBLISHED = "published"
    HIDDEN = "hidden"

    @classmethod
    def of(cls, approved: bool, moderated_at: dt.datetime | None) -> "ReviewState":
        if moderated_at is None:
            return cls.PENDING
        return cls.PUBLISHED if approved else cls.HIDDEN


class ReviewInput(ApiModel):
    """`POST /account/bookings/{ref}/review`. Final once sent: no edit, no delete (B13)."""

    rating: int = Field(ge=1, le=5)
    text: str = Field(
        min_length=TEXT_MIN, max_length=TEXT_MAX, description="Plain text; line breaks kept"
    )

    @field_validator("text", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("text")
    @classmethod
    def _plain(cls, v: str) -> str:
        if CONTROL_RE.search(v.replace("\n", " ").replace("\r", " ").replace("\t", " ")):
            raise ValueError("Write the review without special characters")
        return v.replace("\r\n", "\n")


class AccountReview(ApiModel):
    """The customer's own review, as their booking page shows it."""

    rating: int
    text: str
    state: ReviewState
    created_at: dt.datetime


class RatingOut(ApiModel):
    """The cached aggregate (`packages.rating_avg / rating_count`): published reviews only."""

    avg: float = Field(description="One decimal, 1.0–5.0")
    count: int = Field(ge=1)


class PublicReview(ApiModel):
    id: str
    rating: int
    text: str
    name: str = Field(description="First name + last initial, e.g. 'Asha B.'")
    travelled: dt.date = Field(description="The departure date; the page shows its month")
    created_at: dt.datetime


class PublicReviewPage(ApiModel):
    """`GET /packages/{slug}/reviews?page=N`: newest first, six a page."""

    items: list[PublicReview]
    page: int
    total: int
    total_pages: int = Field(ge=1)


class AdminReview(ApiModel):
    id: str
    rating: int
    text: str
    state: ReviewState
    name: str = Field(description="The booking's lead name, in full")
    email: str
    booking_ref: str
    package_name: str
    package_slug: str
    travelled: dt.date
    created_at: dt.datetime
    moderated_at: dt.datetime | None


class ReviewCounts(ApiModel):
    pending: int
    published: int
    hidden: int


class AdminReviewList(ApiModel):
    items: list[AdminReview]
    counts: ReviewCounts
    state: ReviewState
    page: int
    page_size: int
    total: int
    total_pages: int = Field(ge=1)
