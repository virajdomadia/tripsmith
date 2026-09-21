"""`/auth/*` (06 §C-REST): login (rate-limited 10 / 10 min / IP), logout, session."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.models import Session
from app.schemas.auth import LoginRequest, SessionInfo
from app.services.auth.cookie import COOKIE_NAME, clear_session_cookie, set_session_cookie
from app.services.auth.deps import current_session
from app.services.auth.sessions import delete_session, login, session_info

LOGIN_LIMIT = 10
LOGIN_WINDOW_SECONDS = 600
NO_STORE = {"Cache-Control": "no-store"}


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


router = APIRouter(prefix="/auth", tags=["auth"])


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
    session = await login(
        db,
        payload.email,
        payload.password,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    if session is None:
        raise ApiError("unauthorized", "Wrong email or password")
    set_session_cookie(response, session.token, session.expires_at, request.app.state.settings)
    return session_info(session)


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
    response: Response, session: Annotated[Session | None, Depends(current_session)]
) -> SessionInfo:
    response.headers.update(NO_STORE)
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    return session_info(session)
