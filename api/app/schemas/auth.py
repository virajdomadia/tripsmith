"""Auth contract (06 §C-REST `/auth/*`): the owner's `LoginRequest` and the customer's email
code (`OtpRequest` → `OtpSent`, `OtpVerify`), both answered with `SessionInfo`."""

from datetime import datetime

from pydantic import Field, field_validator

from app.models.enums import UserRole
from app.schemas import ApiModel
from app.schemas.enquiries import EMAIL_RE


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
    bookings_attention: int | None = Field(
        default=None,
        ge=0,
        description="Bookings with a refund to record or a cancellation to answer (B10); "
        "owner sessions only",
    )


class OtpRequest(ApiModel):
    email: str = Field(max_length=120)

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> str:
        s = v.strip().lower() if isinstance(v, str) else ""
        if not EMAIL_RE.match(s):
            raise ValueError("Enter a valid email address")
        return s


class OtpSent(ApiModel):
    """`POST /auth/otp/request`. `demoCode` is set only in demo mode (EMAIL_FROM still on
    Resend's test domain, which can deliver nowhere but the owner's inbox): the sign-in screen
    prints it, labelled, instead of emailing it."""

    email: str
    expires_at: datetime
    demo_code: str | None = None


class OtpVerify(OtpRequest):
    code: str = Field(pattern=r"^\d{6}$", description="The 6 digits, no spaces")

    @field_validator("code", mode="before")
    @classmethod
    def _digits(cls, v: object) -> object:
        return "".join(v.split()) if isinstance(v, str) else v
