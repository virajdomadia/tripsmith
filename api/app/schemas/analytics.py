"""`POST /views` contract (06 C3): the package page's view beacon."""

from pydantic import Field

from app.schemas import ApiModel


class ViewCreate(ApiModel):
    slug: str = Field(min_length=1, max_length=120)
