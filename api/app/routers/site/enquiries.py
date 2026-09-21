"""POST /enquiries — public, rate-limited (04 §rate limiting: 5 / 10 min / IP)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.schemas.enquiries import EnquiryCreate, EnquiryCreated
from app.services.enquiries import submit_enquiry

ENQUIRY_LIMIT = 5
ENQUIRY_WINDOW_SECONDS = 600


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
        pdf=state.pdf,
    )
