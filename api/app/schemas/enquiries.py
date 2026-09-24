"""`POST /enquiries` contract (06 C2, Part D). The zod mirror in web/src/lib/enquiry-schema.ts
must agree with every rule here — tests/fixtures/enquiry_cases.json is run by both sides."""

import datetime as dt
import math
import re
from typing import Annotated, Self

from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.schemas import ApiModel
from app.schemas.meta import ENQUIRY_MESSAGE_MAX, MAX_TRAVELLERS, EnquiryType

PHONE_RE = re.compile(r"^[6-9][0-9]{9}$")  # ASCII digits only (`\d` takes Unicode digits)
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
MONTH_RE = re.compile(r"^([0-9]{4})-(0[1-9]|1[0-2])(?:-[0-9]{2})?$")  # YYYY-MM or a date
BUDGET_MIN_INR = 1_000
BUDGET_MAX_INR = 10_00_000

PHONE_MESSAGE = "Enter a 10-digit Indian mobile number"
# C0 + DEL + C1 controls and the Unicode line/paragraph separators: a name is one line of text,
# and it lands in the owner email's subject (services/email/render.py).
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]")
NAME_CONTROL_MESSAGE = "Enter your name on one line, without special characters"


def normalise_phone(raw: str) -> str:
    """`+91 98450-22110` / `09845022110` / `919845022110` → `9845022110`. Never invents digits."""
    digits = re.sub(r"[\s\-.()]", "", raw.strip())
    if digits.startswith("+91"):
        digits = digits[3:]
    elif len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


class PackageRef(ApiModel):
    slug: str
    name: str


class EnquiryCreate(ApiModel):
    type: EnquiryType
    package_slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]+$", max_length=80)
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: str = Field(max_length=120)
    travel_month: dt.date | None = Field(default=None, description="First of the month")
    adults: Annotated[int, Field(ge=1, le=MAX_TRAVELLERS)]
    children: Annotated[int, Field(ge=0, le=MAX_TRAVELLERS - 1)] = 0
    message: str | None = Field(default=None, max_length=ENQUIRY_MESSAGE_MAX)
    preferred_dates: str | None = Field(default=None, max_length=200)
    budget_paise: int | None = Field(
        default=None, alias="budget", description="Rupees per person on the wire; paise here"
    )
    changes: str | None = Field(default=None, max_length=ENQUIRY_MESSAGE_MAX)
    website: str = Field(default="", description="Honeypot — humans never fill it")

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("name")
    @classmethod
    def _one_line_name(cls, v: str) -> str:
        if CONTROL_RE.search(v):
            raise ValueError(NAME_CONTROL_MESSAGE)
        return v

    @field_validator("message", "preferred_dates", "changes", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip() or None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def _phone(cls, v: object) -> str:
        digits = normalise_phone(v) if isinstance(v, str) else ""
        if not PHONE_RE.match(digits):
            raise ValueError(PHONE_MESSAGE)
        return digits

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> str:
        s = v.strip().lower() if isinstance(v, str) else ""
        if not EMAIL_RE.match(s):
            raise ValueError("Enter a valid email address")
        return s

    @field_validator("travel_month", mode="before")
    @classmethod
    def _month(cls, v: object) -> dt.date | None:
        if v in (None, ""):
            return None
        if isinstance(v, dt.date):
            return v.replace(day=1)
        m = MONTH_RE.match(v) if isinstance(v, str) else None
        if m:
            return dt.date(int(m.group(1)), int(m.group(2)), 1)
        raise ValueError("Pick a month")

    @field_validator("budget_paise", mode="before")
    @classmethod
    def _budget_to_paise(cls, v: object) -> object:
        if v in (None, ""):
            return None
        if isinstance(v, bool) or not isinstance(v, int | float | str):
            raise ValueError("Enter a budget in rupees")
        try:
            # A number input can post "1e3"; zod coerces the same way. "inf", "nan" and 1e400
            # parse as floats but are no budget — `int()` would raise OverflowError, a 500.
            number = float(v)
            if not math.isfinite(number):
                raise ValueError("not finite")
            rupees = int(number)
        except (ValueError, OverflowError) as e:
            raise ValueError("Enter a budget in rupees") from e
        if not BUDGET_MIN_INR <= rupees <= BUDGET_MAX_INR:
            raise ValueError(f"Between ₹{BUDGET_MIN_INR:,} and ₹{BUDGET_MAX_INR:,} per person")
        return rupees * 100

    @field_validator("children")
    @classmethod
    def _party_size(cls, v: int, info: ValidationInfo) -> int:
        adults = info.data.get("adults")
        if isinstance(adults, int) and adults + v > MAX_TRAVELLERS:
            raise ValueError(f"Up to {MAX_TRAVELLERS} travellers per enquiry — for more, call us")
        return v

    @model_validator(mode="before")
    @classmethod
    def _require_package_key(cls, data: object) -> object:
        """A missing key never reaches a field validator; make "standard without a trip" fail
        under the wire name (`packageSlug`) rather than as a silent default."""
        if isinstance(data, dict) and data.get("type") in ("standard", "custom"):
            if not data.get("packageSlug") and not data.get("package_slug"):
                return {**data, "packageSlug": ""}
        return data

    @field_validator("package_slug", mode="before")
    @classmethod
    def _package_matches_type(cls, v: object, info: ValidationInfo) -> object:
        kind = info.data.get("type")
        if kind == EnquiryType.CONTACT:
            return None  # a stray slug from a shared form is dropped, not rejected
        if kind in (EnquiryType.STANDARD, EnquiryType.CUSTOM) and not v:
            raise ValueError("Choose a trip to enquire about")
        return v

    @model_validator(mode="after")
    def _custom_only_fields(self) -> Self:
        if self.type != EnquiryType.CUSTOM:
            self.preferred_dates = None
            self.budget_paise = None
            self.changes = None
        return self

    @property
    def first_name(self) -> str:
        return self.name.split()[0]


class EnquiryCreated(ApiModel):
    ref: str = Field(examples=["TS-7F3K2Q"])
    first_name: str
    package: PackageRef | None
    emailed: bool = Field(
        default=False, description="A confirmation email reached the visitor's address"
    )
