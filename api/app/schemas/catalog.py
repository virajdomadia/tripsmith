"""Catalog response models (06 C, Part D) and the `GET /packages` query model."""

import datetime as dt
from enum import StrEnum
from typing import Annotated

from pydantic import Field, ValidationInfo, field_validator

from app.models.enums import Theme
from app.schemas import ApiModel
from app.schemas.meta import Badge

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
NIGHTS_MAX = 30
BUDGET_MAX_RUPEES = 10_000_000
SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
# Mirrors web/next.config.ts `images.remotePatterns`: prod Blob storage, or (dev only) the
# `http://localhost` origin that `scripts/seed.py --local` writes cover URLs against.
COVER_URL_PATTERN = (
    r"^(https://[a-z0-9-]+\.public\.blob\.vercel-storage\.com/\S*|http://localhost(:\d+)?/\S*)$"
)


class SortOrder(StrEnum):
    PRICE_ASC = "price-asc"
    PRICE_DESC = "price-desc"
    DURATION = "duration"


class SearchParams(ApiModel):
    """R3 filters for `search_packages` — also the v3 `searchPackages` tool's argument schema.

    Lists are any-of; different fields AND together. The query is typed by people, so money is
    whole rupees here (responses stay paise).
    """

    destination: list[str] = Field(
        default_factory=list, max_length=20, description="Destination slugs (≤ 20); any of"
    )
    max_budget: int | None = Field(
        default=None,
        gt=0,
        le=BUDGET_MAX_RUPEES,
        description="Maximum starting price per person, in rupees",
    )
    nights_min: int | None = Field(default=None, ge=1, le=NIGHTS_MAX)
    nights_max: int | None = Field(default=None, ge=1, le=NIGHTS_MAX)
    themes: list[Theme] = Field(default_factory=list, description="Any of")
    month: str | None = Field(
        default=None,
        pattern=MONTH_PATTERN,
        description="YYYY-MM: packages with a departure that month that still has seats",
    )
    sort: SortOrder = Field(default=SortOrder.PRICE_ASC)

    @field_validator("nights_max")
    @classmethod
    def _not_below_nights_min(cls, value: int | None, info: ValidationInfo) -> int | None:
        nights_min = info.data.get("nights_min")
        if value is not None and nights_min is not None and value < nights_min:
            raise ValueError("must be at least nightsMin")
        return value


class PackageCard(ApiModel):
    slug: str
    name: str
    destination: str = Field(description="Destination display name")
    nights: int
    days: int
    starting_price_paise: int
    themes: list[Theme]
    cover_url: str | None
    highlights: list[str]
    badge: Badge | None = Field(description="From the next upcoming departure")


class FacetOption(ApiModel):
    value: str
    label: str
    count: int = Field(description="Live packages in the whole catalog (not the current filter)")


class RangeFacet(ApiModel):
    min: int
    max: int


class SearchFacets(ApiModel):
    """What the filter panel offers — derived from the live catalog, never hard-coded."""

    destinations: list[FacetOption] = Field(description="value = slug; display order")
    themes: list[FacetOption] = Field(description="Every theme in enum order; count may be 0")
    months: list[FacetOption] = Field(
        description="value = YYYY-MM; upcoming months with a departure that has seats, soonest "
        "first"
    )
    nights: RangeFacet = Field(description="Shortest / longest live package; 0/0 when none")
    budget: RangeFacet = Field(
        description="Cheapest / priciest starting price in rupees, rounded out to 1,000; 0/0 if "
        "none"
    )


class PackageList(ApiModel):
    items: list[PackageCard]
    total: int
    facets: SearchFacets


class DestinationRef(ApiModel):
    slug: str
    name: str


class ImageOut(ApiModel):
    url: str
    alt: str
    width: int
    height: int


class Meals(ApiModel):
    breakfast: bool
    lunch: bool
    dinner: bool


class ItineraryDayOut(ApiModel):
    day_no: int
    title: str
    description: str = Field(description="Markdown")
    meals: Meals
    stay: str | None = Field(description="Hotel / city for the night; null on the last day")


class HotelOut(ApiModel):
    name: str
    city: str
    stars: int
    nights: int


class FaqItem(ApiModel):
    q: str
    a: str


class DepartureOut(ApiModel):
    id: str
    date: dt.date
    seats_total: int
    seats_left: int = Field(description="From the departure_availability view")
    guaranteed: bool
    price_double_paise: int = Field(description="Per adult, double sharing")
    price_triple_paise: int
    price_child_paise: int = Field(description="Child 5-11 sharing the parents' room")
    single_supplement_paise: int
    badge: Badge | None


class DepartureList(ApiModel):
    items: list[DepartureOut] = Field(description="Upcoming departures, soonest first")


class PackageDetail(ApiModel):
    slug: str
    name: str
    summary: str
    destination: DestinationRef
    themes: list[Theme]
    nights: int
    days: int
    departure_city: str
    starting_price_paise: int = Field(
        description="Cheapest upcoming double-sharing price; 0 if none"
    )
    highlights: list[str]
    inclusions: list[str]
    exclusions: list[str]
    hotels: list[HotelOut]
    faq: list[FaqItem]
    itinerary: list[ItineraryDayOut]
    images: list[ImageOut] = Field(description="Gallery order; the cover is first")
    cover: ImageOut | None
    departures: list[DepartureOut] = Field(description="Upcoming only, soonest first")
    related: list[PackageCard] = Field(description="Up to 3: same destination, then shared theme")
    updated_at: dt.datetime


class DestinationCard(ApiModel):
    slug: str
    name: str
    tagline: str
    cover_url: str
    package_count: int = Field(description="Live packages")
    starting_price_paise: int
    best_months: list[int] = Field(description="1-12, in the destination's display order")


class DestinationList(ApiModel):
    items: list[DestinationCard] = Field(
        description="Only destinations with at least 1 live package"
    )


class DestinationDetail(ApiModel):
    slug: str
    name: str
    tagline: str
    intro: str = Field(description="Markdown")
    cover_url: str
    region: str
    best_months: list[int] = Field(description="1-12")
    packages: list[PackageCard] = Field(description="Live packages, cheapest first")


class TestimonialOut(ApiModel):
    name: str
    city: str
    text: str
    rating: int = Field(ge=1, le=5)
    package_slug: str | None = Field(description="Null when unlinked or the package is not live")
    package_name: str | None


class HomeStats(ApiModel):
    destinations: int = Field(description="Destinations with at least 1 live package")
    packages: int = Field(description="Live packages")
    departures: int = Field(description="Upcoming departures of live packages with seats left")


class HomeData(ApiModel):
    destinations: list[DestinationCard] = Field(description="Display order, at most 6")
    packages: list[PackageCard] = Field(description="Featured first, then cheapest; at most 6")
    testimonials: list[TestimonialOut] = Field(description="By position")
    stats: HomeStats


class DestinationInput(ApiModel):
    """Owner create/update body (06 §A3). Months are de-duplicated and sorted."""

    slug: str = Field(pattern=SLUG_PATTERN, min_length=1, max_length=60)
    name: str = Field(min_length=1, max_length=80)
    tagline: str = Field(min_length=1, max_length=80)
    intro: str = Field(min_length=40, max_length=5000, description="Markdown, 2–3 paragraphs")
    cover_url: str = Field(pattern=COVER_URL_PATTERN, max_length=1000)
    region: str = Field(min_length=1, max_length=80)
    best_months: list[Annotated[int, Field(ge=1, le=12)]] = Field(min_length=1, max_length=12)
    position: int = Field(ge=0, le=999, default=0)

    @field_validator("name", "tagline", "intro", "region", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("best_months")
    @classmethod
    def _unique_sorted(cls, v: list[int]) -> list[int]:
        return sorted(set(v))


class AdminDestination(ApiModel):
    """A destination row as the owner sees it — including ones the public list hides."""

    id: str
    slug: str
    name: str
    tagline: str
    intro: str
    cover_url: str
    region: str
    best_months: list[int]
    position: int
    package_count: int = Field(description="All packages, draft or live")
    live_package_count: int
    updated_at: dt.datetime


class AdminDestinationList(ApiModel):
    items: list[AdminDestination]


class UploadedImage(ApiModel):
    url: str
    width: int
    height: int
