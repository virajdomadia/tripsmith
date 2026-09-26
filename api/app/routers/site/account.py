"""`/account/*` for a signed-in customer (R18). `GET /account/bookings` feeds My trips; the
voucher download lives beside the signed link in vouchers.py."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.models import User
from app.schemas.account import AccountBookings
from app.services.account import list_bookings
from app.services.auth.deps import require_user

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/bookings", operation_id="listMyBookings", response_model_by_alias=True)
async def get_my_bookings(
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountBookings:
    response.headers.update(NO_STORE)
    return AccountBookings(name=user.name, email=user.email, bookings=await list_bookings(db, user))
