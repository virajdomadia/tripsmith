"""Typed seed content (04 §4): every package and destination is a validated pydantic model, so
bad content fails at import time, not on the site. Prices are written in whole rupees (`_inr`)
and stored as paise by the seed. Photos are files under `content/photos/`."""

import datetime as dt
from pathlib import Path
from typing import Annotated, Self
from urllib.parse import urlencode

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import AddonBasis, PackageStatus, Theme

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


class Addon(Strict):
    """An add-on (R46, P8). `photo` names one of the package's own photos by file."""

    name: str = Field(min_length=2, max_length=60)
    description: str = Field(max_length=240)
    price_inr: Annotated[int, Field(ge=1)]
    basis: AddonBasis
    max_nights: Annotated[int, Field(ge=1, le=14)] | None = None
    photo: str | None = None

    @model_validator(mode="after")
    def _nights(self) -> Self:
        if (self.basis == AddonBasis.NIGHT) != (self.max_nights is not None):
            raise ValueError(f"{self.name}: max_nights goes with a per-night add-on only")
        return self


class EarlyBirdTier(Strict):
    """An early-bird tier (R47, P17): ₹ off per traveller when booked `days`+ days out."""

    days: Annotated[int, Field(ge=3, le=365)]
    off_inr: Annotated[int, Field(ge=1)]


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
    addons: list[Addon] = Field(default_factory=list, max_length=12)  # R46: 3–4 each
    early_bird: list[EarlyBirdTier] = Field(default_factory=list, max_length=2)  # R47: on if any
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
        if any((a.max_nights or 0) > self.nights for a in self.addons):
            raise ValueError(f"{self.slug}: an add-on offers more nights than the trip has")
        if len({a.name for a in self.addons}) != len(self.addons):
            raise ValueError(f"{self.slug}: two add-ons share a name")
        eb = self.early_bird
        if len(eb) == 2 and not (eb[1].days < eb[0].days and eb[1].off_inr < eb[0].off_inr):
            raise ValueError(f"{self.slug}: early-bird tier 2 must be nearer and smaller")
        files = {p.file for p in self.photos}
        for a in self.addons:
            if a.photo is not None and a.photo not in files:
                raise ValueError(f"{self.slug}: add-on photo {a.photo} is not in the gallery")
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


class LeaderOverride(Strict):
    """One departure this leader leads instead of the package's default."""

    package: Slug
    date: dt.date


class LeaderContent(Strict):
    """A demo trip leader (R41, P3). No photo: the site draws a monogram for made-up people."""

    slug: Slug
    name: str
    languages: list[str] = Field(min_length=1)
    years_leading: int = Field(ge=0, le=60)
    regions: list[str] = Field(min_length=1)
    bio: str = Field(min_length=20, max_length=300)
    fun_fact: str = Field(max_length=140)
    packages: list[Slug] = Field(description="Packages this leader is the default of")
    overrides: list[LeaderOverride] = Field(default_factory=list)


class MeetingContent(Strict):
    """Where day one starts (R48, P10). The Maps link is a search for the place."""

    place: str = Field(min_length=3, max_length=140)
    time: dt.time | None = None
    note: str | None = Field(default=None, max_length=140)

    @property
    def maps_url(self) -> str:
        return "https://www.google.com/maps/search/?" + urlencode({"api": 1, "query": self.place})


class KnowBeforeContent(Strict):
    """The owner's "Know before you go" notes (R48), plain text."""

    weather: str = Field(default="", max_length=500)
    network: str = Field(default="", max_length=500)
    cash: str = Field(default="", max_length=500)
    rules: str = Field(default="", max_length=500)
    packing: str = Field(default="", max_length=500)


class TripPackContent(Strict):
    meeting: MeetingContent
    know_before: KnowBeforeContent
    hotels: dict[str, str] = Field(description="Hotel name → its area-level address")


def define_package(**fields: object) -> PackageContent:
    return PackageContent.model_validate(fields)


def define_destination(**fields: object) -> DestinationContent:
    return DestinationContent.model_validate(fields)
