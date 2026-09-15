"""Postgres enums (06 A1) as Python StrEnums — the single definition the ORM, the migration and
the pydantic schemas share. v1 creates every v1 value plus the ⏩ forward-compat ones."""

from enum import StrEnum


class UserRole(StrEnum):
    OWNER = "owner"
    CUSTOMER = "customer"  # ⏩ v2


class PackageStatus(StrEnum):
    DRAFT = "draft"
    LIVE = "live"


class Theme(StrEnum):
    BEACH = "beach"
    HILLS = "hills"
    HONEYMOON = "honeymoon"
    FAMILY = "family"
    ADVENTURE = "adventure"
    HERITAGE = "heritage"


class Occupancy(StrEnum):
    DOUBLE = "double"
    TRIPLE = "triple"
    SINGLE = "single"
    CHILD = "child"


class EnquiryType(StrEnum):
    STANDARD = "standard"
    CUSTOM = "custom"
    CONTACT = "contact"
    CALLBACK = "callback"  # ⏩ v2 add-on
    GROUP = "group"  # ⏩ v2 add-on
    CHAT_HANDOFF = "chat-handoff"  # ⏩ v3


class EnquiryStatus(StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    CLOSED = "closed"


class EmailStatus(StrEnum):
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"
