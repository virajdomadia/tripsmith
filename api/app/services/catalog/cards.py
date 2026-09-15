"""`Package` → `PackageCard`, shared by search, related trips and destination pages."""

from app.models import Package
from app.schemas.catalog import PackageCard
from app.services.catalog.availability import Availability
from app.services.catalog.pricing import badge_for


def package_card(p: Package, availability: Availability | None) -> PackageCard:
    """`p.destination` and `p.cover_image` must be loaded (selectinload) by the caller."""
    return PackageCard(
        slug=p.slug,
        name=p.name,
        destination=p.destination.name,
        nights=p.nights,
        days=p.days,
        starting_price_paise=p.starting_price_paise,
        themes=list(p.themes),
        cover_url=p.cover_image.url if p.cover_image else None,
        highlights=list(p.highlights),
        badge=badge_for(availability) if availability else None,
    )
