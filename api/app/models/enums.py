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


# --- v2 booking engine (0004_v2) ---


class MessageDirection(StrEnum):
    OUTBOUND = "outbound"
    INBOUND = "inbound"


class BookingStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PARTIALLY_PAID = "partially_paid"  # add-on D (split payment)
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class PaymentProvider(StrEnum):
    RAZORPAY = "razorpay"
    OFFLINE = "offline"


class PaymentStatus(StrEnum):
    CREATED = "created"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"


class RefundStatus(StrEnum):
    """A refund's state (R51, P13): written `requested` before the API call; Razorpay's answer
    or its webhook moves it on. A by-hand refund is `requested` until the owner records it."""

    REQUESTED = "requested"
    PROCESSED = "processed"
    FAILED = "failed"


class CancellationStatus(StrEnum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"


class CancelReason(StrEnum):
    """Why a booking is `cancelled` — set in the same UPDATE as the status."""

    HOLD_EXPIRED = "hold_expired"
    PAYMENT_FAILED = "payment_failed"
    SEATS_GONE = "seats_gone"
    CANCELLATION_APPROVED = "cancellation_approved"
    OWNER_RELEASED = "owner_released"
    BALANCE_UNPAID = "balance_unpaid"  # P5: the daily tidy, after the 2-day grace


class CouponKind(StrEnum):
    FLAT = "flat"  # ₹ off the booking
    PERCENT = "percent"  # % off the booking after the deal, optionally capped


class BookingActor(StrEnum):
    """Who made a change in a booking's history (R54, P16)."""

    OWNER = "owner"
    CUSTOMER = "customer"
    WEBHOOK = "webhook"  # Razorpay's server-to-server event
    CRON = "cron"  # /cron/daily
    SYSTEM = "system"  # the api on its own: a late capture's outcome, an email, the seed


class AddonBasis(StrEnum):
    """How an add-on is charged (R46, P8)."""

    # Kept in a text column with a check constraint (models/base.py `TextEnum`), not a native enum.

    BOOKING = "booking"  # once per booking
    TRAVELLER = "traveller"  # per traveller who takes it
    NIGHT = "night"  # per traveller per night, for the whole party, up to `max_nights`


class BookingChannel(StrEnum):
    """Where a booking came from (R56, P18): the Book-now sheet, or the owner's counter."""

    WEB = "web"
    PHONE = "phone"
    WALK_IN = "walk_in"
    WHATSAPP = "whatsapp"
    ENQUIRY = "enquiry"  # converted from an enquiry


class WaitlistState(StrEnum):
    """A waitlist entry (R44, P6). `offered` holds seats until `offer_expires_at` (the
    availability view subtracts them); `claimed` = the claim link made a pending booking;
    `booked` = that email paid for this date; `closed` = the date stopped taking offers."""

    WAITING = "waiting"
    OFFERED = "offered"
    CLAIMED = "claimed"
    BOOKED = "booked"
    REMOVED = "removed"
    CLOSED = "closed"


class WaitlistMail(StrEnum):
    """The email a waitlist entry still owes (sent after the commit, claimed once)."""

    OFFER = "offer"
    LAPSE = "lapse"


class DateChangeState(StrEnum):
    """A date change (R45, P7). `held` keeps the party's seats on the new date until
    `hold_expires_at` while the difference is paid (the availability view subtracts them);
    `done` = the booking moved; `lapsed` = paid too late for seats that had gone, refunded;
    `cancelled` = replaced by a newer change, or its order never opened."""

    HELD = "held"
    DONE = "done"
    LAPSED = "lapsed"
    CANCELLED = "cancelled"
