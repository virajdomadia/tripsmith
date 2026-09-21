"""The visitor's address behind Vercel's rewrites, and the 429 every limited route raises."""

import secrets

from fastapi import Request

from app.errors import ApiError

TRUSTED_IP_HEADER = "x-client-ip"
INTERNAL_SECRET_HEADER = "x-internal-secret"


def client_ip(request: Request) -> str:
    """The visitor's address for rate limiting and abuse tracing.

    Submits come through the web's route handlers (`/api/enquiries`, `/enquire`,
    `/api/auth/login`), and Vercel rewrites `X-Forwarded-For` to the *web function's* egress
    address on that hop — so the web forwards the real address under `X-Client-Ip`, trusted
    only with the shared `REVALIDATE_SECRET`. Direct callers fall back to Vercel's own
    `X-Forwarded-For`.
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
    def __init__(
        self,
        retry_after: int,
        message: str = (
            "Too many enquiries from this connection — try again in a few minutes, or WhatsApp us"
        ),
    ) -> None:
        super().__init__("rate_limited", message)
        self.retry_after = retry_after
