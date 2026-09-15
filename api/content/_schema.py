"""Typed seed content (04 §4): every package and destination is a validated pydantic model, so
bad content fails at import time, not on the site. Prices are written in whole rupees (`_inr`)
and stored as paise by the seed. Photos are files under `content/photos/`."""

import datetime as dt
from pathlib import Path
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import PackageStatus, Theme

PHOTOS_DIR = Path(__file__).resolve().parent / "photos"

Slug = Annotated[str, Field(pattern=r"^[a-z0-9-]+$")]
Rupees = Annotated[int, Field(ge=0)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Photo(Strict):
    file: str  # relative to content/photos, e.g. "goa/vagator-palms-1.jpg"
    alt: str = Field(min_length=3)

    @property
    def path(self) -> Path:
        return PHOTOS_DIR / self.file

    @model_validator(mode="after")
    def _exists(self) -> Self:
        if not self.path.is_file():
            raise ValueError(f"photo not found: {self.file}")
        return self


class Hotel(Strict):
    name: str
    city: str
    stars: Annotated[int, Field(ge=1, le=5)]
    nights: Annotated[int, Field(ge=1)]


class Faq(Strict):
    q: str
    a: str


class Day(Strict):
    title: str
    description: str  # markdown
    meals: Annotated[str, Field(pattern=r"^[BLD]*$")] = ""  # e.g. "BD"
    stay: str | None = None
    location_name: str | None = None  # ⏩ storyboard / route map


class Departure(Strict):
    date: dt.date
    seats_total: Annotated[int, Field(ge=1, le=60)]
    guaranteed: bool = False
    price_double_inr: Rupees
    price_triple_inr: Rupees
    price_child_inr: Rupees
    single_supplement_inr: Rupees


class PackageContent(Strict):
    slug: Slug
    destination: Slug
    name: str
    summary: str = Field(min_length=40, max_length=220)
    themes: list[Theme] = Field(min_length=1, max_length=3)
    nights: Annotated[int, Field(ge=1, le=21)]
    departure_city: str = "Ex-Mumbai"
    highlights: list[str] = Field(min_length=3, max_length=5)
    inclusions: list[str] = Field(min_length=1)
    exclusions: list[str] = Field(min_length=1)
    hotels: list[Hotel] = Field(min_length=1)
    faq: list[Faq] = Field(default_factory=list)
    itinerary: list[Day]
    departures: list[Departure] = Field(min_length=1)
    photos: list[Photo] = Field(min_length=4, max_length=8)  # 03 R4: gallery of 4–8
    status: PackageStatus = PackageStatus.LIVE
    featured: bool = False

    @property
    def days(self) -> int:
        return self.nights + 1

    @property
    def cover(self) -> Photo:
        return self.photos[0]

    @model_validator(mode="after")
    def _rules(self) -> Self:
        if len(self.itinerary) != self.days:
            raise ValueError(
                f"{self.slug}: {len(self.itinerary)} itinerary days for {self.days} days"
            )
        if len({d.date for d in self.departures}) != len(self.departures):
            raise ValueError(f"{self.slug}: duplicate departure dates")
        if sum(h.nights for h in self.hotels) != self.nights:
            raise ValueError(f"{self.slug}: hotel nights do not add up to {self.nights}")
        if len({p.file for p in self.photos}) != len(self.photos):
            raise ValueError(f"{self.slug}: duplicate photos")
        return self


class DestinationContent(Strict):
    slug: Slug
    name: str
    tagline: str = Field(max_length=80)
    intro: str = Field(min_length=100)  # markdown, 2–3 paragraphs
    cover: Photo
    region: str
    best_months: list[Annotated[int, Field(ge=1, le=12)]] = Field(min_length=1)
    position: int = 0


class TestimonialContent(Strict):
    name: str
    city: str
    text: str = Field(min_length=40)
    rating: Annotated[int, Field(ge=1, le=5)]
    package: Slug | None = None
    position: int = 0


def define_package(**fields: object) -> PackageContent:
    return PackageContent.model_validate(fields)


def define_destination(**fields: object) -> DestinationContent:
    return DestinationContent.model_validate(fields)
