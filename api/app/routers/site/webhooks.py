"""`POST /webhooks/razorpay` — Razorpay's server-to-server events (B6, 04 v2 §5 step 4).

Registered on production only, at https://tripsmith-api.vercel.app/webhooks/razorpay (previews
are behind Vercel's SSO). The raw body's HMAC is checked with `RAZORPAY_WEBHOOK_SECRET` before
the body is parsed: a forged or unsigned call is a 400 and a log line. Once an event is recorded
(or deliberately ignored) the answer is 200, so Razorpay stops retrying; a database error is a
500 and Razorpay retries it. Not in the OpenAPI contract: the web never calls it.
"""

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.client_ip import client_ip
from app.infra.db import get_session
from app.infra.razorpay import verify_webhook_signature
from app.services.booking.after_capture import Notify
from app.services.booking.webhook import handle_razorpay_event

BAD_SIGNATURE = "Webhook signature missing or wrong"

log = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"], include_in_schema=False)


async def signed_event(request: Request) -> dict[str, Any]:
    """The verified, parsed event. Runs before the session, so a forged call never opens one."""
    setting = request.app.state.settings.razorpay_webhook_secret
    # Blank counts as unset: an empty key is one anyone can sign with.
    secret = setting.get_secret_value() if setting else ""
    if not secret:
        # ERROR for Sentry: Razorpay keeps retrying, so events are delayed, not lost.
        log.error("RAZORPAY_WEBHOOK_SECRET is unset: the Razorpay webhook cannot verify events")
        raise ApiError(
            "internal", "Webhook not configured", status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    if not signature or not verify_webhook_signature(secret, body, signature):
        log.warning("Razorpay webhook signature did not verify (from %s)", client_ip(request))
        raise ApiError("validation", BAD_SIGNATURE)
    try:
        event = json.loads(body)
    except ValueError:
        event = None
    if not isinstance(event, dict):
        log.warning("Razorpay webhook body is signed but not a JSON object")
        raise ApiError("validation", "Webhook body is not a JSON object")
    return event


@router.post("/webhooks/razorpay")
async def post_razorpay_webhook(
    event: Annotated[dict[str, Any], Depends(signed_event)],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    state = request.app.state
    return {
        "status": await handle_razorpay_event(db, event, Notify(state.email_sender, state.settings))
    }
