"""`/admin/coupons*` (R26, B15): the owner's coupon codes — list, create, edit, pause/resume and
delete (only while unused). The rules are in services/admin_coupons.py."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.coupons import AdminCoupon, AdminCouponList, CouponActive, CouponInput
from app.services import admin_coupons as svc
from app.services.auth.deps import require_owner

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("/coupons", operation_id="listCoupons", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminCouponList:
    response.headers.update(NO_STORE)
    return await svc.list_coupons(db)


@router.post(
    "/coupons",
    operation_id="createCoupon",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(payload: CouponInput, response: Response, db: Db) -> AdminCoupon:
    response.headers.update(NO_STORE)
    return await svc.create_coupon(db, payload)


@router.get("/coupons/{id}", operation_id="getCoupon", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminCoupon:
    response.headers.update(NO_STORE)
    return await svc.get_coupon(db, id)


@router.put("/coupons/{id}", operation_id="updateCoupon", response_model_by_alias=True)
async def update_route(id: str, payload: CouponInput, response: Response, db: Db) -> AdminCoupon:
    response.headers.update(NO_STORE)
    return await svc.update_coupon(db, id, payload)


@router.post("/coupons/{id}/active", operation_id="setCouponActive", response_model_by_alias=True)
async def active_route(id: str, payload: CouponActive, response: Response, db: Db) -> AdminCoupon:
    response.headers.update(NO_STORE)
    return await svc.set_active(db, id, payload.active)


@router.delete("/coupons/{id}", operation_id="deleteCoupon", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(id: str, db: Db) -> Response:
    await svc.delete_coupon(db, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
