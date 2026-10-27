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
    LIKELY_TO_SELL_OUT = "likely-to-sell-out"  # P2 (R40): services/catalog/urgency.py
    GUARANTEED = "guaranteed"


class EnquiryType(StrEnum):
    """The v1 subset of the `enquiry_type` DB enum (06 A1) — what the public form can submit.

    `callback`, `group` and `chat-handoff` are forward-compat DB values that join here with
    their features (v2 add-on / v3). The owner's inbox reads all six via `AdminEnquiryType`.
    """

    STANDARD = "standard"
    CUSTOM = "custom"
    CONTACT = "contact"


class AdminEnquiryType(StrEnum):
    """Every `enquiry_type` DB value (`app.models.enums.EnquiryType`), as the inbox reads and
    filters them (R24): a row of any type lists and loads. A separate wire enum rather than the
    ORM one because two enums both named `EnquiryType` would collide in the OpenAPI schema;
    tests/test_admin_enquiries.py keeps the values identical to the ORM enum's.
    """

    STANDARD = "standard"
    CUSTOM = "custom"
    CONTACT = "contact"
    CALLBACK = "callback"
    GROUP = "group"
    CHAT_HANDOFF = "chat-handoff"


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
    Badge.LIKELY_TO_SELL_OUT: "Likely to sell out",
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
# 04 §4 said 5 MB, but Vercel caps a function's request body at 4.5 MB: a 5 MB upload never
# reaches the API. 4 MB is the one limit — enforced by services/images.py, advertised here.
IMAGE_MAX_BYTES = 4 * 1024 * 1024


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


class CancellationTierOut(ApiModel):
    from_days: int = Field(description="Fewest days before departure this tier starts at")
    kept_percent: int = Field(description="Share of the package price the policy keeps")
    refund: str = Field(description="What the tier refunds, as the policy page says it")


class AgeLimits(ApiModel):
    child_min: int
    child_max: int
    adult_min: int


class BookingRules(ApiModel):
    """The money and party rules the api enforces, served so the web quotes them, never copies
    them (Q-5). Each comes from the module that applies it — see `services/meta.py`."""

    deposit_percent: int
    balance_days: int = Field(description="The balance falls due this many days before departure")
    grace_days: int
    min_part_paise: int
    reminder_days: list[int] = Field(description="Days before the due day a reminder goes")
    hold_minutes: int
    lead_days: int = Field(description="A date is bookable from IST today + this many days")
    free_change_days: int
    online_change_days: int
    change_fee_paise: int = Field(description="Per traveller, for a change inside the free days")
    gst_percent: int
    cancellation_tiers: list[CancellationTierOut] = Field(description="From the earliest tier")
    ages: AgeLimits


class Retention(ApiModel):
    """How long the nightly job keeps things — the privacy page quotes these."""

    enquiry_days: int
    details_days: int
    session_days: int


class Meta(ApiModel):
    themes: list[ThemeOption]
    badges: list[BadgeOption]
    enquiry_types: list[EnquiryTypeOption]
    limits: Limits
    rules: BookingRules
    retention: Retention
