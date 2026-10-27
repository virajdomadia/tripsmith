"""The error envelope as contract models — only for the OpenAPI document (06 C0).

The handlers in `app/errors.py` build the JSON by hand; these models exist so the envelope and
its code enum reach `web/src/lib/api-types.ts`.
"""

from enum import StrEnum

from pydantic import Field
from pydantic.json_schema import SkipJsonSchema

from app.schemas import ApiModel


class ErrorCode(StrEnum):
    """Mirrors `app.errors.ErrorCode` (the Literal the handlers use); a test keeps them equal."""

    VALIDATION = "validation"
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    NOT_FOUND = "not_found"
    RATE_LIMITED = "rate_limited"
    CONFLICT = "conflict"
    INTERNAL = "internal"


class ErrorReason(StrEnum):
    """Every machine-readable cause an error can carry; the web branches on these (OP-10).

    `ApiError(reason=...)` takes this enum (or the two below, whose values are a subset — a test
    keeps them so), so a new reason cannot reach the wire without reaching `api-types.ts`.
    """

    # Booking a departure — UnbookableReason, and the steps around Checkout.
    ON_REQUEST = "on_request"
    TOO_SOON = "too_soon"
    SOLD_OUT = "sold_out"
    PRICE_CHANGED = "price_changed"
    DEPOSIT_UNAVAILABLE = "deposit_unavailable"
    ADDON_UNAVAILABLE = "addon_unavailable"
    MANUAL_NO_ROOM = "manual_no_room"
    # Coupons — CouponReason.
    COUPON_UNKNOWN = "coupon_unknown"
    COUPON_NOT_STARTED = "coupon_not_started"
    COUPON_EXPIRED = "coupon_expired"
    COUPON_USED_UP = "coupon_used_up"
    COUPON_NOT_FOR_TRIP = "coupon_not_for_trip"
    COUPON_BELOW_MINIMUM = "coupon_below_minimum"
    COUPON_USED_BY_EMAIL = "coupon_used_by_email"
    # Waitlist and its claim links.
    WAITLIST_CLOSED = "waitlist_closed"
    SEATS_AVAILABLE = "seats_available"
    ALREADY_WAITING = "already_waiting"
    NOT_WAITING = "not_waiting"
    NOT_LIVE = "not_live"
    OFFERS_CLOSED = "offers_closed"
    CLAIM_SHORT = "claim_short"
    CLAIM_OTHER = "claim_other"
    CLAIM_EMAIL = "claim_email"
    CLAIM_EXPIRED = "claim_expired"
    # My trips: cancel, balance, date change, extras, details, trip pack, reviews.
    ALREADY_REQUESTED = "already_requested"
    NOT_PAID = "not_paid"
    NOT_ACTIVE = "not_active"
    DEPARTED = "departed"
    BALANCE_CLOSED = "balance_closed"
    NOT_ON_DEPOSIT = "not_on_deposit"
    CHANGE_CLOSED = "change_closed"
    SAME_DATE = "same_date"
    EXTRAS_CLOSED = "extras_closed"
    CLOSED = "closed"
    LOCKED = "locked"
    NOT_OPEN = "not_open"
    COMPLETE = "complete"
    PACK_LOCKED = "pack_locked"
    NOT_COMPLETED = "not_completed"
    ALREADY_REVIEWED = "already_reviewed"
    SAVED_FULL = "saved_full"
    # Sign-in codes.
    CODE_DEAD = "code_dead"
    CODE_WRONG = "code_wrong"
    # The owner's desk: counter, payment links, moves, refunds, requests, emails, enquiries.
    ALREADY_CONVERTED = "already_converted"
    LINK_UNAVAILABLE = "link_unavailable"
    LINK_OVER_CAP = "link_over_cap"
    LINK_PAID = "link_paid"
    NO_LINK = "no_link"
    NOT_EDITABLE = "not_editable"
    NOT_PAYABLE = "not_payable"
    NOT_PENDING = "not_pending"
    SEATS_SHORT = "seats_short"
    NOT_MOVABLE = "not_movable"
    NOTHING_TO_MOVE = "nothing_to_move"
    NO_REFUND = "no_refund"
    REFUND_EXCEEDS_PAYMENTS = "refund_exceeds_payments"
    RESOLVED = "resolved"
    NO_SWITCH = "no_switch"
    NOT_FITTING = "not_fitting"
    NO_OWNER_EMAIL = "no_owner_email"
    SEND_FAILED = "send_failed"
    SENT = "sent"
    ID_KEY_MISSING = "id_key_missing"


class ApiErrorBody(ApiModel):
    code: ErrorCode
    message: str
    # Optional but never null on the wire (the handlers omit the key), hence SkipJsonSchema.
    field_errors: dict[str, str] | SkipJsonSchema[None] = Field(
        default=None, description="Present only for `validation`; keyed by dotted field path."
    )
    reason: ErrorReason | SkipJsonSchema[None] = Field(
        default=None,
        description="A machine-readable cause, mostly on 409s; the web branches on it.",
    )


class ApiErrorResponse(ApiModel):
    error: ApiErrorBody
