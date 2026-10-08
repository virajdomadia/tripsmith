"""Traveller details and the pre-trip checklist (R49, P9): the customer's form, the readiness
bar, and (P9b) the owner's views. Its own module: account, desk and manifest all import it."""

import datetime as dt
from typing import Literal

from pydantic import Field, field_validator

from app.models.enums import FoodChoice, IdType, Occupancy
from app.schemas import ApiModel
from app.schemas.enquiries import CONTROL_RE, PHONE_MESSAGE, PHONE_RE, normalise_phone

DetailField = Literal["id", "dob", "emergency", "food", "medical"]
DETAIL_FIELDS: tuple[DetailField, ...] = ("id", "dob", "emergency", "food", "medical")
DEFAULT_REQUIRED: tuple[DetailField, ...] = ("id", "emergency", "food")

DetailsState = Literal["open", "locked", "not_yet", "closed"]


def _one_line(v: object, what: str) -> object:
    if not isinstance(v, str):
        return v
    v = v.strip()
    if CONTROL_RE.search(v):
        raise ValueError(f"Write the {what} on one line, without special characters")
    return v or None


def _text(v: object, what: str) -> object:
    """Several lines are fine (medical notes); other control characters are not."""
    if not isinstance(v, str):
        return v
    v = v.strip()
    if CONTROL_RE.search(v.replace("\n", " ").replace("\r", " ")):
        raise ValueError(f"Write the {what} without special characters")
    return v or None


class TravellerDetailsOut(ApiModel):
    """One traveller's card. The ID number never leaves the api in full: `id_masked` only."""

    traveller_id: str
    name: str
    age: int | None
    occupancy: Occupancy
    id_type: IdType | None = None
    id_masked: str | None = Field(default=None, description="`XXXX XXXX 4821` — never the number")
    dob: dt.date | None = None
    emergency_name: str | None = None
    emergency_relation: str | None = None
    emergency_phone: str | None = None
    food: FoodChoice | None = None
    allergies: str | None = None
    medical: str | None = None
    missing: list[DetailField] = Field(description="The package's required fields still empty")
    complete: bool


class TravellerDetailsBlock(ApiModel):
    """The booking page's "Traveller details" section."""

    state: DetailsState = Field(
        description="open = the customer can edit · locked = 3 days before departure · "
        "not_yet = not paid yet · closed = cancelled, departed or deleted after the trip"
    )
    locks_on: dt.date = Field(description="The first IST day the form is read-only")
    required: list[DetailField]
    travellers: list[TravellerDetailsOut]
    complete: int = Field(description="Travellers with every required field")
    purged: bool = Field(description="Deleted 30 days after the trip (R49)")


class ReadinessPart(ApiModel):
    key: str = Field(description="`details`, `balance`, or `item:<checklist key>`")
    kind: Literal["details", "balance", "item"]
    label: str
    note: str = Field(description="One line under the label")
    fraction: float = Field(ge=0, le=1)
    done: bool


class Readiness(ApiModel):
    """Equal parts (R49): details (complete ÷ travellers), balance paid, each owner item. P10
    adds the trip pack and the calendar as two more parts."""

    percent: int = Field(ge=0, le=100)
    parts: list[ReadinessPart]


class DepartureReadiness(ApiModel):
    """P9b: one departure's readiness — the mean of its paid bookings' (null with none)."""

    percent: int | None = Field(ge=0, le=100)
    missing_travellers: int = Field(description="Travellers still missing a required detail")
    bookings: int = Field(description="Confirmed and part-paid bookings counted")


class ChecklistItem(ApiModel):
    key: str
    label: str
    note: str = ""
    done: bool


class TravellerDetailsInput(ApiModel):
    """`PUT /account/bookings/{ref}/travellers/{id}/details`. A partial save is fine — `missing`
    says what is left. `id_number` blank keeps the saved number (it is never sent back);
    `id_type` null removes the ID."""

    name: str = Field(min_length=2, max_length=80)
    id_type: IdType | None = None
    id_number: str | None = Field(default=None, max_length=24)
    dob: dt.date | None = None
    emergency_name: str | None = Field(default=None, max_length=80)
    emergency_relation: str | None = Field(default=None, max_length=40)
    emergency_phone: str | None = None
    food: FoodChoice | None = None
    allergies: str | None = Field(default=None, max_length=200)
    medical: str | None = Field(default=None, max_length=500)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v: object) -> object:
        return _one_line(v, "name") or ""

    @field_validator("id_number", "emergency_name", "emergency_relation", mode="before")
    @classmethod
    def _line(cls, v: object) -> object:
        return _one_line(v, "details")

    @field_validator("allergies", "medical", mode="before")
    @classmethod
    def _notes(cls, v: object) -> object:
        return _text(v, "notes")

    @field_validator("emergency_phone", mode="before")
    @classmethod
    def _phone(cls, v: object) -> object:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        digits = normalise_phone(v) if isinstance(v, str) else ""
        if not PHONE_RE.match(digits):
            raise ValueError(PHONE_MESSAGE)
        return digits


class ChecklistTick(ApiModel):
    done: bool


# --- P9b: the owner's side ----------------------------------------------------------------------

CHECKLIST_MAX = 6
CHECKLIST_LABEL_MAX = 80
CHECKLIST_NOTE_MAX = 160


class ChecklistItemInput(ApiModel):
    key: str | None = Field(
        default=None,
        max_length=40,
        pattern=r"^[a-z0-9-]+$",
        description="Keep it to keep the customers' ticks; omitted = a new item",
    )
    label: str = Field(min_length=2, max_length=CHECKLIST_LABEL_MAX)
    note: str = Field(default="", max_length=CHECKLIST_NOTE_MAX)

    @field_validator("label", "note", mode="before")
    @classmethod
    def _plain(cls, v: object) -> object:
        return _one_line(v, "item") or ""


class ChecklistItemOut(ApiModel):
    key: str
    label: str
    note: str


class TravellerDetailsSettingsInput(ApiModel):
    """Package editor B's "Traveller details" section (R49)."""

    required: list[DetailField] = Field(max_length=len(DETAIL_FIELDS))
    checklist: list[ChecklistItemInput] = Field(default_factory=list, max_length=CHECKLIST_MAX)


class TravellerDetailsSettings(ApiModel):
    required: list[DetailField]
    checklist: list[ChecklistItemOut]


class ManifestTraveller(ApiModel):
    """The printable manifest's traveller: every field, the ID number in full (R49) — the one
    place it is ever decrypted. `id_number` is null when the key can't read it."""

    traveller_id: str
    name: str
    age: int | None
    occupancy: Occupancy
    id_type: IdType | None = None
    id_number: str | None = None
    dob: dt.date | None = None
    emergency_name: str | None = None
    emergency_relation: str | None = None
    emergency_phone: str | None = None
    food: FoodChoice | None = None
    allergies: str | None = None
    medical: str | None = None
    missing: list[DetailField] = Field(default_factory=list)
