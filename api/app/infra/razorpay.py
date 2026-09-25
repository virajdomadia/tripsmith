"""Razorpay over its REST API (04 v2 §5): create an order, verify a Checkout payment signature,
list an order's payments (B5's sync, when Checkout closes without calling back).

The official `razorpay` SDK is synchronous (requests); creating an order is one POST, so it goes
through httpx like infra/email.py. Test mode forever. When the keys are unset (dev, CI)
`build_razorpay` returns None and `POST /bookings` answers 503 before holding any seats — the
app still imports and every other route works.
"""

import hashlib
import hmac
import logging
import os
from typing import Any

import httpx

from app.config import Settings

log = logging.getLogger(__name__)

ORDERS_URL = "https://api.razorpay.com/v1/orders"
CURRENCY = "INR"


class RazorpayError(Exception):
    """An order that was not created — HTTP error, transport error, or an unexpected body."""


class Razorpay:
    def __init__(
        self,
        key_id: str,
        key_secret: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.key_id = key_id
        self._secret = key_secret.encode()
        self._client = httpx.AsyncClient(
            auth=(key_id, key_secret),
            timeout=httpx.Timeout(10.0, connect=3.0),
            transport=transport,
        )

    async def create_order(self, *, amount_paise: int, receipt: str) -> str:
        """Returns the order id (`order_…`). `receipt` is the booking ref, so the dashboard
        and every webhook payload name the booking."""
        body = {
            "amount": amount_paise,
            "currency": CURRENCY,
            "receipt": receipt,
            "notes": {"booking_ref": receipt},
        }
        try:
            res = await self._client.post(ORDERS_URL, json=body)
        except httpx.HTTPError as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        if res.status_code // 100 != 2:
            raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")
        order_id = res.json().get("id")
        if not isinstance(order_id, str) or not order_id.startswith("order_"):
            raise RazorpayError(f"Razorpay returned no order id: {res.text[:300]}")
        return order_id

    async def order_payments(self, order_id: str) -> list[dict[str, Any]]:
        """The order's payment attempts as Razorpay records them (`id`, `status`, `amount`, …).
        Read with the key secret, so a `captured` one here is as trustworthy as a signed
        callback."""
        try:
            res = await self._client.get(f"{ORDERS_URL}/{order_id}/payments")
        except httpx.HTTPError as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        if res.status_code // 100 != 2:
            raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")
        items = res.json().get("items")
        return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []

    def verify_payment_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool:
        """Checkout's success handler signs `order_id|payment_id` with the key secret."""
        expected = hmac.new(
            self._secret, f"{order_id}|{payment_id}".encode(), hashlib.sha256
        ).hexdigest()
        # Bytes: the signature is visitor input, and compare_digest refuses non-ASCII str.
        return hmac.compare_digest(expected.encode(), signature.encode())


def build_razorpay(settings: Settings) -> Razorpay | None:
    if settings.razorpay_key_id and settings.razorpay_key_secret:
        return Razorpay(settings.razorpay_key_id, settings.razorpay_key_secret.get_secret_value())
    if os.environ.get("VERCEL"):
        # The site still browses and takes enquiries; Book now answers 503. ERROR for Sentry.
        log.error(
            "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET unset on a deployment: online booking is "
            "switched off. Set both on this project."
        )
    return None
