"""Catalog response models (06 C, Part D)."""

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
