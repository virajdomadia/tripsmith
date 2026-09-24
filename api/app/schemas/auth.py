"""Auth contract (06 §C-REST `/auth/*`): `LoginRequest` in, `SessionInfo` out."""

from datetime import datetime

from pydantic import Field, field_validator

from app.models.enums import UserRole
from app.schemas import ApiModel


class LoginRequest(ApiModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _normalise(cls, v: str) -> str:
        return v.strip().lower()


class SessionUser(ApiModel):
    id: str
    name: str
    email: str
    role: UserRole


class SessionInfo(ApiModel):
    """What `GET /auth/session` (and `POST /auth/login`) returns. `user.role` is what the web
    `/admin` gate checks; `newEnquiries` feeds the admin sidebar badge (F16) and is owner-only
    data, so it is null for any other role (R18)."""

    user: SessionUser
    expires_at: datetime
    new_enquiries: int | None = Field(
        default=None, ge=0, description="Enquiries still in status `new`; owner sessions only"
    )
