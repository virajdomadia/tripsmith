"""Constants both sides need, defined once (04 §3, 06 C0).

The enums become OpenAPI enums in the generated TS types; `GET /meta` serves the same values
with labels at runtime for anything the UI renders as text (and for MCP clients, v4).
"""

from enum import StrEnum

from pydantic import Field

from app.schemas import ApiModel


class Theme(StrEnum):
    BEACH = "beach"
    HILLS = "hills"
    HONEYMOON = "honeymoon"
    FAMILY = "family"
    ADVENTURE = "adventure"
    HERITAGE = "heritage"


class Badge(StrEnum):
    """Computed per departure by `services/catalog/pricing.badge_for` (04 §3)."""

    FILLING_FAST = "filling-fast"
    SOLD_OUT = "sold-out"
    GUARANTEED = "guaranteed"


class EnquiryType(StrEnum):
    """The v1 subset of the `enquiry_type` DB enum (06 A1) — what the form can submit.

    `callback`, `group` and `chat-handoff` are forward-compat DB values that join here with
    their features (v2 add-on / v3).
    """

    STANDARD = "standard"
    CUSTOM = "custom"
    CONTACT = "contact"


THEME_LABELS: dict[Theme, str] = {
    Theme.BEACH: "Beach",
    Theme.HILLS: "Hills",
    Theme.HONEYMOON: "Honeymoon",
    Theme.FAMILY: "Family",
    Theme.ADVENTURE: "Adventure",
    Theme.HERITAGE: "Heritage",
}

BADGE_LABELS: dict[Badge, str] = {
    Badge.FILLING_FAST: "Filling fast",
    Badge.SOLD_OUT: "Sold out",
    Badge.GUARANTEED: "Guaranteed departure",
}

ENQUIRY_TYPE_LABELS: dict[EnquiryType, str] = {
    EnquiryType.STANDARD: "Enquire about this package",
    EnquiryType.CUSTOM: "Customise this trip",
    EnquiryType.CONTACT: "General enquiry",
}

# Validation rules from 06 Part D; the pydantic models in later parts import these constants.
MAX_TRAVELLERS = 12  # adults + children per enquiry/booking
MAX_THEMES_PER_PACKAGE = 3
ENQUIRY_MESSAGE_MAX = 1000  # chars; not fixed by the docs — chosen in S4b
IMAGE_MAX_BYTES = 5 * 1024 * 1024  # 04 §4: uploads ≤ 5 MB


class ThemeOption(ApiModel):
    value: Theme
    label: str


class BadgeOption(ApiModel):
    value: Badge
    label: str


class EnquiryTypeOption(ApiModel):
    value: EnquiryType
    label: str


class Limits(ApiModel):
    max_travellers: int = Field(examples=[MAX_TRAVELLERS])
    max_themes_per_package: int = Field(examples=[MAX_THEMES_PER_PACKAGE])
    enquiry_message_max: int = Field(examples=[ENQUIRY_MESSAGE_MAX])
    image_max_bytes: int = Field(examples=[IMAGE_MAX_BYTES])


class Meta(ApiModel):
    themes: list[ThemeOption]
    badges: list[BadgeOption]
    enquiry_types: list[EnquiryTypeOption]
    limits: Limits


def build_meta() -> Meta:
    return Meta(
        themes=[ThemeOption(value=t, label=THEME_LABELS[t]) for t in Theme],
        badges=[BadgeOption(value=b, label=BADGE_LABELS[b]) for b in Badge],
        enquiry_types=[
            EnquiryTypeOption(value=e, label=ENQUIRY_TYPE_LABELS[e]) for e in EnquiryType
        ],
        limits=Limits(
            max_travellers=MAX_TRAVELLERS,
            max_themes_per_package=MAX_THEMES_PER_PACKAGE,
            enquiry_message_max=ENQUIRY_MESSAGE_MAX,
            image_max_bytes=IMAGE_MAX_BYTES,
        ),
    )
