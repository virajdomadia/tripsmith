"""`Package` → `PackageCard`, shared by search, related trips and destination pages."""

import datetime as dt

from app.models import Package
from app.schemas.catalog import BookingProof, PackageCard
from app.services.catalog.availability import Availability
from app.services.catalog.deals import deal_for
from app.services.catalog.pricing import badge_for
from app.services.reviews import rating_out


def package_card(
    p: Package,
    availability: Availability | None,
    *,
    deal_base: int = 0,
    early_bird: bool = False,
    proof: BookingProof | None = None,
    now: dt.datetime,
) -> PackageCard:
    """`p.destination` and `p.cover_image` must be loaded (selectinload) by the caller;
    `deal_base` is the package's entry in `deals.bases` (0 = no deal can show), `early_bird`
    whether it is in `early_bird.with_savings`, `proof` its entry in `urgency.proofs` (P2)."""
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
        badge=badge_for(availability, likely=availability.likely) if availability else None,
        seats_left=availability.seats_left if availability else None,
        proof=proof,
        deal=deal_for(p, deal_base, now),
        early_bird=early_bird,
        rating=rating_out(p.rating_avg, p.rating_count),
    )
