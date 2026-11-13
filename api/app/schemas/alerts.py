"""`POST /alerts` — "email me when new dates are added" (v3 C3, R30, 06 C6)."""

from enum import StrEnum
from typing import Self

from pydantic import Field, field_validator, model_validator

from app.schemas import ApiModel
from app.schemas.enquiries import EMAIL_RE

SLUG = r"^[a-z0-9-]+$"
ONE_TARGET = "Choose a trip or a destination"


class AlertSubscribe(ApiModel):
    email: str = Field(max_length=120)
    package_slug: str | None = Field(default=None, max_length=120, pattern=SLUG)
    destination_slug: str | None = Field(default=None, max_length=120, pattern=SLUG)

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> str:
        s = v.strip().lower() if isinstance(v, str) else ""
        if not EMAIL_RE.match(s):
            raise ValueError("Enter a valid email address")
        return s

    @model_validator(mode="after")
    def _one_target(self) -> Self:
        if (self.package_slug is None) == (self.destination_slug is None):
            raise ValueError(ONE_TARGET)
        return self


class AlertTarget(StrEnum):
    PACKAGE = "package"
    DESTINATION = "destination"


class AlertSubscribed(ApiModel):
    target: AlertTarget
    slug: str
    name: str = Field(description="The trip's or destination's name, for the confirmation line")
