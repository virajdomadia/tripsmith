"""ApiError + exception handlers → `{ error: { code, message, fieldErrors? } }`.

The seven codes and their statuses are the contract in docs/06-data-and-api.md Part C0.
"""

import logging
from collections.abc import Mapping
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

ErrorCode = Literal[
    "validation",
    "unauthorized",
    "forbidden",
    "not_found",
    "rate_limited",
    "conflict",
    "internal",
]

STATUS_FOR_CODE: dict[ErrorCode, int] = {
    "validation": 400,
    "unauthorized": 401,
    "forbidden": 403,
    "not_found": 404,
    "rate_limited": 429,
    "conflict": 409,
    "internal": 500,
}
CODE_FOR_STATUS: dict[int, ErrorCode] = {status: code for code, status in STATUS_FOR_CODE.items()}

INTERNAL_MESSAGE = "Internal server error"


class ApiError(Exception):
    """Raise from a router or service; the handler renders the envelope."""

    code: ErrorCode
    message: str
    status: int
    field_errors: dict[str, str] | None

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        field_errors: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = STATUS_FOR_CODE[code]
        self.field_errors = field_errors


def envelope(
    code: ErrorCode,
    message: str,
    *,
    status: int | None = None,
    field_errors: dict[str, str] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    error: dict[str, object] = {"code": code, "message": message}
    if field_errors is not None:
        error["fieldErrors"] = field_errors
    return JSONResponse(
        {"error": error}, status_code=status or STATUS_FOR_CODE[code], headers=headers
    )


def field_errors_from(exc: RequestValidationError) -> dict[str, str]:
    """`("body", "itinerary", 2, "title")` → `"itinerary.2.title"`; first message per path wins."""
    errors: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(part) for part in err["loc"]]
        if err.get("type") == "json_invalid":
            # loc is ("body", <byte offset>) — the whole body is the field.
            path = "body"
        else:
            # Drop the source (body/query/path/header/cookie) unless it is all there is.
            path = ".".join(loc[1:]) if len(loc) > 1 else ".".join(loc)
        errors.setdefault(path, str(err["msg"]))
    return errors


async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return envelope(exc.code, exc.message, field_errors=exc.field_errors)


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return envelope("validation", "Request validation failed", field_errors=field_errors_from(exc))


async def _http_exception(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    status = exc.status_code
    if status == 405:
        # Not one of the seven codes: a route that does not exist for this method is not_found.
        return envelope("not_found", "Not Found")
    if status >= 500:
        log.error("HTTPException %s: %s", status, exc.detail)
        return envelope("internal", INTERNAL_MESSAGE)
    # Unmapped 4xx (413, 415, …) keep their status and headers under the closest code.
    code = CODE_FOR_STATUS.get(status, "validation")
    return envelope(code, str(exc.detail), status=status, headers=exc.headers)


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    # S8: Sentry captures this through its middleware; here we only log and hide the detail.
    log.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    # Starlette's ServerErrorMiddleware runs outside the request-id middleware, so echo it here.
    request_id: str | None = getattr(request.state, "request_id", None)
    headers = {"X-Request-Id": request_id} if request_id else None
    return envelope("internal", INTERNAL_MESSAGE, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_exception)
    app.add_exception_handler(Exception, _unhandled)
