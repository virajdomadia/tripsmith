"""POST /enquiries — public, rate-limited (04 §rate limiting: 5 / 10 min / IP)."""

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.schemas.enquiries import EnquiryCreate, EnquiryCreated
from app.services.enquiries import submit_enquiry

ENQUIRY_LIMIT = 5
ENQUIRY_WINDOW_SECONDS = 600


TRUSTED_IP_HEADER = "x-client-ip"
INTERNAL_SECRET_HEADER = "x-internal-secret"


def client_ip(request: Request) -> str:
    """The visitor's address for rate limiting and abuse tracing.

    Submits come through the web's route handlers (`/api/enquiries`, `/enquire`), and Vercel
    rewrites `X-Forwarded-For` to the *web function's* egress address on that hop — so the web
    forwards the real address under `X-Client-Ip`, trusted only with the shared
    `REVALIDATE_SECRET`. Direct callers fall back to Vercel's own `X-Forwarded-For`.
    """
    settings = request.app.state.settings
    secret = settings.revalidate_secret.get_secret_value() if settings.revalidate_secret else None
    given = request.headers.get(INTERNAL_SECRET_HEADER, "")
    trusted = request.headers.get(TRUSTED_IP_HEADER, "").strip()
    if secret and trusted and secrets.compare_digest(given, secret):
        return trusted
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimited(ApiError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "rate_limited",
            "Too many enquiries from this connection — try again in a few minutes, or WhatsApp us",
        )
        self.retry_after = retry_after


async def enquiry_rate_limit(request: Request) -> None:
    """Router dependency: runs before the body is parsed, so junk cannot probe rules for free."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"enquiry:{client_ip(request)}", limit=ENQUIRY_LIMIT, window_seconds=ENQUIRY_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(result.retry_after)


router = APIRouter(tags=["public"], dependencies=[Depends(enquiry_rate_limit)])


@router.post(
    "/enquiries",
    operation_id="submitEnquiry",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def post_enquiry(
    payload: EnquiryCreate,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> EnquiryCreated:
    response.headers["Cache-Control"] = "no-store"
    state = request.app.state
    return await submit_enquiry(
        db,
        payload,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        sender=state.email_sender,
        settings=state.settings,
    )
