"""`POST /waitlist` and `GET /waitlist/claim/{token}` — public (R44, P6).

Joining shares the booking-start limit (`booking:{ip}` 5 / 10 min): both put a visitor's hand on
seats. The web reaches it through its own `POST /api/waitlist` handler, which forwards the
visitor's address like `/api/bookings`. The claim read is keyed by an HMAC-signed token, walks
its date first (a lapsed offer reads as lapsed) and sends whatever the walk made owed.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.client_ip import client_ip
from app.infra.db import get_session
from app.routers.site.bookings import booking_rate_limit, notify
from app.schemas.waitlist import WaitlistClaim, WaitlistJoin, WaitlistJoined
from app.services.booking import waitlist
from app.services.booking.freshness import refresh_quietly
from app.services.email.waitlist import send_due

router = APIRouter(tags=["public"])
Token = Annotated[
    str, Path(min_length=10, max_length=120, pattern=r"^[A-Za-z0-9]+\.\d+\.[0-9a-f]+$")
]


def secret_of(request: Request) -> str | None:
    secret = request.app.state.settings.session_secret
    return secret.get_secret_value() if secret else None


@router.post(
    "/waitlist",
    operation_id="joinWaitlist",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
    dependencies=[Depends(booking_rate_limit)],
)
async def post_join(
    payload: WaitlistJoin,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> WaitlistJoined:
    response.headers.update(NO_STORE)
    joined = await waitlist.join(
        db,
        departure_id=payload.departure_id,
        name=payload.name,
        email=payload.email,
        party=payload.party,
        ip=client_ip(request),
    )
    await send_due(db, notify(request))  # the walk before joining may have made offers
    package_id = await waitlist.package_of(db, payload.departure_id)
    if package_id:  # "N waiting" on the package page
        await refresh_quietly(db, {package_id}, after="a waitlist join")
    return WaitlistJoined(position=joined.position, waiting=joined.waiting)


@router.get(
    "/waitlist/claim/{token}", operation_id="getWaitlistClaim", response_model_by_alias=True
)
async def get_claim(
    token: Token,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> WaitlistClaim:
    response.headers.update(NO_STORE)
    out = await waitlist.claim_view(db, token, secret_of(request))
    await send_due(db, notify(request))
    return out
