"""A hand-built `PackageDetail` for the PDF tests — long enough to force page breaks."""

import datetime as dt

from app.schemas.catalog import (
    DepartureOut,
    DestinationRef,
    FaqItem,
    HotelOut,
    ImageOut,
    ItineraryDayOut,
    Meals,
    PackageDetail,
)
from app.schemas.meta import Badge

UPDATED_AT = dt.datetime(2026, 9, 20, 10, 30, tzinfo=dt.UTC)
LONG = (
    "Morning at leisure on the sand, then a slow drive up the coast past paddy fields and "
    "whitewashed churches. Lunch is a thali at a family-run place we have eaten at for years. "
    "Evening at the fort for the sunset, back to the hotel for dinner on the terrace. "
)


def departure(i: int, seats_left: int, *, guaranteed: bool = False) -> DepartureOut:
    return DepartureOut(
        id=f"dep{i}",
        date=dt.date(2026, 11, 6) + dt.timedelta(days=7 * i),
        seats_total=16,
        seats_left=seats_left,
        guaranteed=guaranteed,
        price_double_paise=1_849_900 + i * 50_000,
        price_triple_paise=1_699_900 + i * 50_000,
        price_child_paise=999_900,
        single_supplement_paise=650_000,
        badge=(
            Badge.SOLD_OUT
            if seats_left <= 0
            else Badge.FILLING_FAST
            if seats_left <= 4
            else Badge.GUARANTEED
            if guaranteed
            else None
        ),
    )


def package(
    *,
    days: int = 7,
    departures: int = 12,
    faq: bool = True,
    summary: str | None = None,
    images: int = 1,
) -> PackageDetail:
    photos = [
        ImageOut(url=f"https://blob.test/photo-{k}.jpg", alt=f"Photo {k}", width=1400, height=933)
        for k in range(images)
    ]
    return PackageDetail(
        slug="north-goa-beaches",
        name="North Goa Beaches",
        summary=summary
        or "Easy days between Calangute and Morjim — beach mornings, a spice farm, a heritage "
        "walk and one sunset cruise, with the hotel a minute from the sand.",
        destination=DestinationRef(slug="goa", name="Goa"),
        themes=["beach", "family"],  # type: ignore[arg-type]
        nights=days - 1,
        days=days,
        departure_city="Ex-Mumbai",
        starting_price_paise=1_849_900 if departures else 0,  # 0 = "On request", as the api does
        highlights=[
            "Hotel a minute's walk from Calangute beach",
            "Spice plantation lunch at Sahakari",
            "Sunset cruise on the Mandovi",
            "Fontainhas heritage walk with a local guide",
        ],
        inclusions=[
            "3 nights in a 4-star hotel, breakfast included",
            "Airport transfers in an air-conditioned vehicle",
            "Spice plantation visit with lunch",
            "Sunset cruise tickets",
            "All tolls, parking and driver allowance",
        ],
        exclusions=["Flights", "Lunches and dinners not mentioned", "Anything personal"],
        hotels=[
            HotelOut(name="Sea Breeze Resort", city="Calangute", stars=4, nights=2),
            HotelOut(name="Morjim Beach House", city="Morjim", stars=3, nights=days - 3),
        ],
        faq=[FaqItem(q="Is this okay for kids?", a="Yes — every day has a free afternoon.")]
        if faq
        else [],
        itinerary=[
            ItineraryDayOut(
                day_no=i,
                title=f"Day {i} title — arrive and settle in" if i == 1 else f"Day {i} title",
                description=LONG * 3,
                meals=Meals(breakfast=i > 1, lunch=i % 2 == 0, dinner=i == 1),
                stay=None if i == days else "Sea Breeze Resort, Calangute",
            )
            for i in range(1, days + 1)
        ],
        images=photos,
        cover=photos[0],
        departures=[
            departure(i, seats_left=(0 if i == 1 else 3 if i == 2 else 9), guaranteed=i == 0)
            for i in range(departures)
        ],
        related=[],
        updated_at=UPDATED_AT,
    )
