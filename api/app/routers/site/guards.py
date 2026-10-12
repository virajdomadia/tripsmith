"""P19: shared guards for the customer's `/account/*` routers (account, saved)."""

from fastapi import Request

from app.errors import ApiError

UNSAFE = frozenset({"POST", "PUT", "PATCH", "DELETE"})


async def same_origin_write(request: Request) -> None:
    """P19: a write must come from the site itself. The browser reaches these through the
    web's `/api/*` rewrite (`Sec-Fetch-Site: same-origin`) or a web route handler (server-side,
    no header). Until now only SameSite=Lax plus the JSON body's CORS preflight stood in the
    way of another `*.virajdomadia.com` page — this makes it explicit."""
    if request.method in UNSAFE and request.headers.get("sec-fetch-site") in (
        "cross-site",
        "same-site",
    ):
        raise ApiError("forbidden", "Requests to your account must come from this site")
