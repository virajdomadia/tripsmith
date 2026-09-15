"""Catalog response models (06 C, Part D)."""

import datetime as dt

from pydantic import Field

from app.models.enums import Theme
from app.schemas import ApiModel
from app.schemas.meta import Badge


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


class PackageList(ApiModel):
    items: list[PackageCard]
    total: int


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
