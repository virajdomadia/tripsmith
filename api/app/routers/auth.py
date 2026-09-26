"""`/auth/*` (06 §C-REST): the owner's password login (rate-limited 10 / 10 min / IP), the
customer's email code (B8, R18), logout, session.

Email code limits: `otp-ip:{ip}` 20 / 15 min before the body is read, then `otp:{email}` 5 / 15
min — so one address cannot be flooded with codes and one connection cannot spray addresses.
Guessing is capped per code (5 wrong tries, services/auth/otp.py) and only the newest code for
an email is live, so at most 25 guesses per email per 15 minutes reach a million-code space.
The owner signs in with a password only: an owner email is refused here, since in demo mode the
code is printed on screen and would otherwise hand anyone the admin."""

import logging
from typing import Annotated

import sentry_sdk
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.models import Session
from app.models.enums import UserRole
from app.schemas.auth import LoginRequest, OtpRequest, OtpSent, OtpVerify, SessionInfo
from app.services.auth.cookie import COOKIE_NAME, clear_session_cookie, set_session_cookie
from app.services.auth.deps import current_session
from app.services.auth.otp import check_code, issue_code, role_of, sign_in_customer
from app.services.auth.sessions import delete_session, login, session_info
from app.services.booking.desk import count_needing_attention
from app.services.email.send import is_test_mode
from app.services.email.signin import render_signin_code
from app.services.enquiries import count_new_enquiries

log = logging.getLogger(__name__)

LOGIN_LIMIT = 10
LOGIN_WINDOW_SECONDS = 600
OTP_WINDOW_SECONDS = 15 * 60
OTP_EMAIL_LIMIT = 5
OTP_IP_LIMIT = 20
OWNER_USES_PASSWORD = "This email signs in with a password — use the owner sign-in"
TOO_MANY_CODES = "Too many codes asked for — wait a few minutes and try again"


async def login_rate_limit(request: Request) -> None:
    """Runs before the body is parsed, like the enquiry limiter."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"login:{client_ip(request)}", limit=LOGIN_LIMIT, window_seconds=LOGIN_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(
            result.retry_after, "Too many sign-in attempts — try again in a few minutes"
        )


async def otp_ip_rate_limit(request: Request) -> None:
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"otp-ip:{client_ip(request)}", limit=OTP_IP_LIMIT, window_seconds=OTP_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(result.retry_after, TOO_MANY_CODES)


def _secret(request: Request) -> str | None:
    secret = request.app.state.settings.session_secret
    return secret.get_secret_value() if secret else None


router = APIRouter(prefix="/auth", tags=["auth"])


async def _session_info(db: AsyncSession, session: Session) -> SessionInfo:
    """The sidebar counts are owner-only data (R18): a customer session never runs the queries
    and gets `newEnquiries: null`, `bookingsAttention: null`."""
    if session.user.role != UserRole.OWNER:
        return session_info(session, new_enquiries=None)
    return session_info(
        session,
        new_enquiries=await count_new_enquiries(db),
        bookings_attention=await count_needing_attention(db),
    )


@router.post(
    "/login",
    operation_id="login",
    response_model_by_alias=True,
    dependencies=[Depends(login_rate_limit)],
)
async def post_login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionInfo:
    response.headers.update(NO_STORE)
    opened = await login(
        db,
        payload.email,
        payload.password,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    if opened is None:
        raise ApiError("unauthorized", "Wrong email or password")
    session, token = opened
    set_session_cookie(response, token, session.expires_at, request.app.state.settings)
    return await _session_info(db, session)


@router.post(
    "/logout",
    operation_id="logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def post_logout(
    request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Response:
    token = request.cookies.get(COOKIE_NAME, "")
    if token:
        await delete_session(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
    clear_session_cookie(response, request.app.state.settings)
    return response


@router.get("/session", operation_id="getSession", response_model_by_alias=True)
async def get_session_route(
    response: Response,
    session: Annotated[Session | None, Depends(current_session)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionInfo:
    response.headers.update(NO_STORE)
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    return await _session_info(db, session)


@router.post(
    "/otp/request",
    operation_id="requestSignInCode",
    response_model_by_alias=True,
    dependencies=[Depends(otp_ip_rate_limit)],
)
async def post_otp_request(
    payload: OtpRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> OtpSent:
    response.headers.update(NO_STORE)
    if await role_of(db, payload.email) == UserRole.OWNER:
        raise ApiError("forbidden", OWNER_USES_PASSWORD)
    limiter: RateLimiter = request.app.state.rate_limiter
    limited = await limiter.hit(
        f"otp:{payload.email}", limit=OTP_EMAIL_LIMIT, window_seconds=OTP_WINDOW_SECONDS
    )
    if not limited.allowed:
        raise RateLimited(limited.retry_after, TOO_MANY_CODES)

    settings = request.app.state.settings
    issued = await issue_code(db, payload.email, secret=_secret(request))
    if is_test_mode(settings.email_from):
        return OtpSent(email=payload.email, expires_at=issued.expires_at, demo_code=issued.code)
    try:
        await request.app.state.email_sender.send(
            render_signin_code(payload.email, issued.code, settings=settings)
        )
    except Exception as exc:  # noqa: BLE001 — any send failure is the same answer to the visitor
        log.error("sign-in code email failed: %s", type(exc).__name__)
        sentry_sdk.capture_exception(exc)
        raise ApiError(
            "internal", "We couldn't send the code just now — try again", status=502
        ) from exc
    return OtpSent(email=payload.email, expires_at=issued.expires_at)


@router.post("/otp/verify", operation_id="verifySignInCode", response_model_by_alias=True)
async def post_otp_verify(
    payload: OtpVerify,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SessionInfo:
    response.headers.update(NO_STORE)
    if await role_of(db, payload.email) == UserRole.OWNER:
        raise ApiError("forbidden", OWNER_USES_PASSWORD)
    checked = await check_code(db, payload.email, payload.code, secret=_secret(request))
    if not checked.ok:
        if checked.tries_left == 0:
            raise ApiError(
                "validation",
                "This code has expired or been used up — ask for a new one",
                field_errors={"code": "Ask for a new code"},
                reason="code_dead",
            )
        tries = "1 try" if checked.tries_left == 1 else f"{checked.tries_left} tries"
        raise ApiError(
            "validation",
            f"That code isn't right — {tries} left",
            field_errors={"code": "That code isn't right"},
            reason="code_wrong",
        )
    session, token = await sign_in_customer(
        db, payload.email, ip=client_ip(request), user_agent=request.headers.get("user-agent")
    )
    set_session_cookie(response, token, session.expires_at, request.app.state.settings)
    return await _session_info(db, session)
