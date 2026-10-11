"""Compare contract (R39, P1b): up to three live packages side by side, from the URL alone."""

from pydantic import Field

from app.schemas import ApiModel
from app.schemas.catalog import (
    DealOut,
    DepartureOut,
    DestinationRef,
    EarlyBirdOut,
    HotelOut,
    ImageOut,
)
from app.schemas.public_leaders import PublicLeaderRef
from app.schemas.reviews import RatingOut

MAX_COMPARE = 3
NEXT_DEPARTURES = 3


class MealCount(ApiModel):
    """Included meals over the whole trip, counted from the itinerary."""

    breakfasts: int
    lunches: int
    dinners: int


class CompareTrip(ApiModel):
    slug: str
    name: str
    destination: DestinationRef
    nights: int
    days: int
    departure_city: str
    cover: ImageOut | None
    starting_price_paise: int = Field(description="Cheapest upcoming double-sharing price")
    deal: DealOut | None
    early_bird: EarlyBirdOut | None
    places: list[str] = Field(description="Where the nights are spent, in order (hotel cities)")
    hotels: list[HotelOut]
    meals: MealCount
    inclusions: list[str]
    exclusions: list[str]
    departures: list[DepartureOut] = Field(
        description=f"The next {NEXT_DEPARTURES} upcoming dates that still have seats"
    )
    rating: RatingOut | None
    leader: PublicLeaderRef | None = Field(description="The package's default trip leader")
    deposit: bool = Field(description="P5: the trip can be reserved with 25 % now")


class CompareResult(ApiModel):
    items: list[CompareTrip] = Field(description=f"In the order asked, at most {MAX_COMPARE}")
    missing: list[str] = Field(
        description="Asked-for slugs that are not live packages (unknown, draft or malformed)"
    )
