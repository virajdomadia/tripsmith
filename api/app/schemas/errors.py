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


class ApiErrorBody(ApiModel):
    code: ErrorCode
    message: str
    # Optional but never null on the wire (the handlers omit the key), hence SkipJsonSchema.
    field_errors: dict[str, str] | SkipJsonSchema[None] = Field(
        default=None, description="Present only for `validation`; keyed by dotted field path."
    )
    reason: str | SkipJsonSchema[None] = Field(
        default=None,
        description="A machine-readable cause on some 409s — booking: `on_request`, `too_soon`,"
        " `sold_out` (`UnbookableReason`).",
    )


class ApiErrorResponse(ApiModel):
    error: ApiErrorBody
