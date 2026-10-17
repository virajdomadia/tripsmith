"""V2 (SB-4): a limit on every owner route that reaches Razorpay, while the owner login is
public (`PUBLIC_DEMO_OWNER`). "Check payment" makes one Razorpay GET per unsettled link on every
call, and refunds, link cancels and counter links are calls too, all under the merchant key —
so anyone holding the printed login could spend its API quota. 10 per booking per 10 minutes,
plus a per-address cap across bookings. A private owner login is not limited."""

from fastapi import Request

from app.infra.client_ip import RateLimited, client_ip
from app.infra.ratelimit import RateLimiter

PER_BOOKING_LIMIT = 10
PER_IP_LIMIT = 30
WINDOW_SECONDS = 600
MESSAGE = "Too many payment actions just now — try again in a few minutes"


async def owner_razorpay_limit(request: Request) -> None:
    """Keyed by the route's booking (`{ref}`, or a cancellation's `{id}`) and the caller's
    address; a route with neither (a new counter booking) has only the address cap."""
    if not request.app.state.settings.public_demo_owner:
        return
    limiter: RateLimiter = request.app.state.rate_limiter
    params = request.path_params
    subject = params.get("ref") or params.get("id")
    keys = [(f"owner-rzp-ip:{client_ip(request)}", PER_IP_LIMIT)]
    if subject:
        keys.insert(0, (f"owner-rzp:{subject}", PER_BOOKING_LIMIT))
    for key, limit in keys:
        result = await limiter.hit(key, limit=limit, window_seconds=WINDOW_SECONDS)
        if not result.allowed:
            raise RateLimited(result.retry_after, MESSAGE)
