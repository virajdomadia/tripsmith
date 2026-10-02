"""Trip leaders on the public site (R41, P3b) — never the phone, which travellers see only in the
trip pack (R48). No imports beyond the base model, so `catalog` and `reviews` can both use it."""

from pydantic import Field

from app.schemas import ApiModel


class PublicLeaderRef(ApiModel):
    """Enough to draw a leader's avatar and name (a departure row, "Led by")."""

    slug: str
    name: str
    photo_url: str | None = Field(description="Null = draw the monogram from slug + name")


class LeaderCardOut(PublicLeaderRef):
    """The "Your trip leader" card and the leader's own page."""

    languages: list[str]
    years_leading: int
    regions: list[str]
    bio: str
    fun_fact: str = Field(description="Blank = none")


class ReviewLeader(ApiModel):
    """Who led the trip a review is about (the departure's leader, read live)."""

    name: str
    slug: str | None = Field(description="Null once the leader is switched off: no page to link")
