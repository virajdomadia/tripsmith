"""Saved trips contract (R39, P1): the ♡'s list, the guest merge on sign-in, the Saved tab."""

import datetime as dt

from pydantic import Field

from app.schemas import ApiModel
from app.schemas.catalog import SLUG_PATTERN, PackageCard

MAX_SAVED = 60  # per account
MAX_GUEST = 30  # the browser's own list (web/src/lib/saved.ts keeps the same cap)


class SavedSlugs(ApiModel):
    """What the hearts need: the account's saved live packages, newest first."""

    slugs: list[str]
    max: int = Field(default=MAX_SAVED, description="How many trips one account can keep")


class SavedMergeItem(ApiModel):
    slug: str = Field(pattern=SLUG_PATTERN, min_length=1, max_length=80)
    at: dt.datetime | None = Field(
        default=None, description="When the guest saved it; clamped to the last year, else now"
    )


class SavedMergeInput(ApiModel):
    items: list[SavedMergeItem] = Field(max_length=MAX_GUEST)


class SavedMerge(SavedSlugs):
    added: int = Field(description="Browser saves that are new to the account")
    left_out: int = Field(
        description="Browser saves dropped because the account was full (oldest first)"
    )


class NextDeparture(ApiModel):
    date: dt.date
    seats_left: int


class SavedTrip(ApiModel):
    saved_at: dt.datetime
    card: PackageCard
    next_departure: NextDeparture | None = Field(
        description="The soonest upcoming date with seats; null when none is on sale"
    )


class SavedTrips(ApiModel):
    items: list[SavedTrip] = Field(description="Live packages only, newest save first")
    max: int = Field(default=MAX_SAVED)
