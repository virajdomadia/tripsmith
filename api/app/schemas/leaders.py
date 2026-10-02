"""Trip leaders (R41, P3): the owner's `/admin/leaders*` contract and the small leader reference
the package editor, the desk and (P3b) the public pages carry.

A leader with no photo is drawn as a monogram from the slug and name — never stored — so
`photoUrl` is simply null for them.
"""

import datetime as dt

from pydantic import Field, field_validator

from app.schemas import ApiModel
from app.schemas.catalog import COVER_URL_PATTERN, SLUG_PATTERN

NAME_MAX = 80
BIO_MAX = 300  # 2–3 lines on the card (the table's check matches)
FUN_FACT_MAX = 140
TAG_MAX = 40  # one language or region
TAGS_MAX = 8
YEARS_MAX = 60
PHONE_PATTERN = r"^\+?[0-9][0-9 ()-]{6,19}$"


def _clean_tags(v: object) -> object:
    """Trimmed, blanks dropped, case-insensitive duplicates dropped (first spelling kept)."""
    if not isinstance(v, list):
        return v
    out: list[object] = []
    seen: set[str] = set()
    for item in v:
        if isinstance(item, str):
            item = item.strip()
            if not item or item.lower() in seen:
                continue
            seen.add(item.lower())
        out.append(item)
    return out


class LeaderRef(ApiModel):
    """Enough to draw a leader's avatar and name anywhere."""

    id: str
    slug: str
    name: str
    photo_url: str | None = Field(description="Null = draw the monogram")
    active: bool


class DeskLeader(LeaderRef):
    """The leader on the owner's desk and manifest — with the phone, which travellers only see
    in the trip pack (R48)."""

    phone: str
    by_default: bool = Field(description="True = the package's default; false = this date's own")


class LeaderInput(ApiModel):
    """Owner create/update body. Switching off goes through `setLeaderActive`, which checks
    the leader no longer leads anything upcoming."""

    slug: str = Field(pattern=SLUG_PATTERN, min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=NAME_MAX)
    photo_url: str | None = Field(default=None, pattern=COVER_URL_PATTERN, max_length=1000)
    languages: list[str] = Field(min_length=1, max_length=TAGS_MAX)
    years_leading: int = Field(ge=0, le=YEARS_MAX)
    regions: list[str] = Field(min_length=1, max_length=TAGS_MAX)
    bio: str = Field(min_length=20, max_length=BIO_MAX)
    fun_fact: str = Field(default="", max_length=FUN_FACT_MAX)
    phone: str = Field(
        pattern=PHONE_PATTERN, description="Shown to travellers only in the trip pack (R48)"
    )

    @field_validator("name", "bio", "fun_fact", "phone", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("photo_url", mode="before")
    @classmethod
    def _blank_photo(cls, v: object) -> object:
        return (v.strip() or None) if isinstance(v, str) else v

    @field_validator("languages", "regions", mode="before")
    @classmethod
    def _tags(cls, v: object) -> object:
        return _clean_tags(v)

    @field_validator("languages", "regions")
    @classmethod
    def _tag_length(cls, v: list[str]) -> list[str]:
        if any(len(t) > TAG_MAX for t in v):
            raise ValueError(f"Keep each one to {TAG_MAX} characters")
        return v


class LeaderActiveInput(ApiModel):
    active: bool


class AdminLeader(ApiModel):
    id: str
    slug: str
    name: str
    photo_url: str | None
    languages: list[str]
    years_leading: int
    regions: list[str]
    bio: str
    fun_fact: str
    phone: str
    active: bool
    default_for: int = Field(description="Packages with this leader as their default")
    upcoming: int = Field(
        description="Departures from today on that this leader leads (their own or by default)"
    )
    deletable: bool = Field(
        description="Never assigned to a package or a departure (past ones included)"
    )
    updated_at: dt.datetime


class AdminLeaderList(ApiModel):
    items: list[AdminLeader] = Field(description="Active first, then by name")
