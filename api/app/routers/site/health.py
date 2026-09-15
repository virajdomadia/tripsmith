from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["public"])


class Health(BaseModel):
    status: Literal["ok"]


@router.get("/health", operation_id="getHealth")
async def get_health() -> Health:
    return Health(status="ok")
