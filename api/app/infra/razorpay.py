"""Razorpay over its REST API (04 v2 §5): create an order, verify a Checkout payment signature,
list an order's payments (B5's sync, when Checkout closes without calling back), verify a
webhook's signature (B6), refund a payment (P13), and Payment Links for the counter (P18b).

Payment Links, as probed in test mode (2026-09-30): `expire_by` must be at least 15 minutes
ahead; a `reference_id` can be used once; a paid link can't be cancelled; a burst of about five
creates answers 429 for a moment; the ₹15,000 test cap is checked when the link is CREATED. The
link gets its order only when the payer opens it, and the payment carries the link's notes.

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
PAYMENTS_URL = "https://api.razorpay.com/v1/payments"
LINKS_URL = "https://api.razorpay.com/v1/payment_links"
TEST_LINK_MAX_PAISE = 15_000_00  # test mode refuses to create a larger link
CURRENCY = "INR"


class RazorpayError(Exception):
    """An order that was not created — HTTP error, transport error, or an unexpected body."""


class RefundRefused(RazorpayError):
    """Razorpay answered a refund with a 4xx: it definitely made no refund (below ₹1, more than
    is left, already fully refunded…). `description` is Razorpay's own words. Any other
    `RazorpayError` from `refund` means the outcome is unknown — retry with the same key."""

    def __init__(self, status: int, description: str) -> None:
        super().__init__(f"Razorpay refused the refund ({status}): {description}")
        self.status = status
        self.description = description


class LinkAlreadyPaid(RazorpayError):
    """Cancelling a link Razorpay says was paid (or part paid): sync its payment instead."""


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

    @property
    def link_max_paise(self) -> int | None:
        """The largest Payment Link Razorpay will create: ₹15,000 with test keys, else none."""
        return TEST_LINK_MAX_PAISE if self.key_id.startswith("rzp_test_") else None

    async def create_payment_link(
        self,
        *,
        amount_paise: int,
        reference_id: str,
        expire_by: int,
        description: str,
        customer: dict[str, str],
        notes: dict[str, str],
        callback_url: str,
    ) -> dict[str, Any]:
        """Create a link (`plink_…`); returns its entity (`id`, `short_url`, `status`, …).
        Razorpay sends nothing itself (`notify` off): we share it by copy, WhatsApp or email."""
        body = {
            "amount": amount_paise,
            "currency": CURRENCY,
            "accept_partial": False,
            "reference_id": reference_id,
            "expire_by": expire_by,
            "description": description[:2048],
            "customer": customer,
            "notify": {"sms": False, "email": False},
            "reminder_enable": False,
            "notes": notes,
            "callback_url": callback_url,
            "callback_method": "get",
        }
        entity = await self._json("POST", LINKS_URL, json=body)
        link_id = entity.get("id")
        if not isinstance(link_id, str) or not link_id.startswith("plink_"):
            raise RazorpayError(f"Razorpay returned no link id: {str(entity)[:300]}")
        return entity

    async def payment_link(self, link_id: str) -> dict[str, Any]:
        """The link as Razorpay has it now: `status` (created | paid | expired | cancelled |
        partially_paid), `order_id` once opened, `payments` (`payment_id`, `status`, …)."""
        return await self._json("GET", f"{LINKS_URL}/{link_id}")

    async def cancel_payment_link(self, link_id: str) -> None:
        """Cancel an unpaid link. A paid one raises `LinkAlreadyPaid`; one already cancelled or
        expired is fine (it can't be paid either way)."""
        try:
            res = await self._client.post(f"{LINKS_URL}/{link_id}/cancel")
        except httpx.HTTPError as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        if res.status_code // 100 == 2:
            return
        text = res.text.lower()
        if res.status_code == 400 and ("already paid" in text or "partially paid" in text):
            raise LinkAlreadyPaid(res.text[:300])
        if res.status_code == 400 and ("cancelled" in text or "expired" in text):
            return
        raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")

    async def _json(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        try:
            res = await self._client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        if res.status_code // 100 != 2:
            raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")
        try:
            data = res.json()
        except ValueError as exc:
            raise RazorpayError(f"Razorpay answered with no JSON: {res.text[:300]}") from exc
        if not isinstance(data, dict):
            raise RazorpayError(f"Razorpay answered with no object: {res.text[:300]}")
        return data

    def verify_link_signature(
        self, *, link_id: str, reference_id: str, status: str, payment_id: str, signature: str
    ) -> bool:
        """The redirect back from a paid link signs `link_id|reference_id|status|payment_id`
        with the key secret."""
        payload = f"{link_id}|{reference_id}|{status}|{payment_id}".encode()
        expected = hmac.new(self._secret, payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected.encode(), signature.encode())

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

    async def capture_payment(self, payment_id: str, *, amount_paise: int) -> str:
        """Capture an `authorized` payment; returns the status Razorpay reports afterwards. An
        account set to auto-capture may beat us to it — then the capture call is refused, and
        the payment's own status (`captured`) is what we return."""
        try:
            res = await self._client.post(
                f"{PAYMENTS_URL}/{payment_id}/capture",
                json={"amount": amount_paise, "currency": CURRENCY},
            )
            if res.status_code // 100 != 2:
                res = await self._client.get(f"{PAYMENTS_URL}/{payment_id}")
        except httpx.HTTPError as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        if res.status_code // 100 != 2:
            raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")
        status = res.json().get("status")
        return status if isinstance(status, str) else ""

    async def refund(
        self, payment_id: str, *, amount_paise: int, key: str, notes: dict[str, str]
    ) -> dict[str, Any]:
        """Refund part or all of a captured payment; returns Razorpay's refund entity (`id`,
        `status`: processed | pending | failed). `key` goes in `X-Refund-Idempotency`: the same
        key with the same body returns the refund already made (checked in test mode, P13), so a
        retry after a lost answer never refunds twice. Always `speed: normal` — instant costs a
        fee in live mode and test mode ignores it."""
        body = {
            "amount": amount_paise,
            "speed": "normal",
            "receipt": key[:40],
            "notes": notes,
        }
        try:
            res = await self._client.post(
                f"{PAYMENTS_URL}/{payment_id}/refund",
                json=body,
                headers={"X-Refund-Idempotency": key},
            )
        except httpx.HTTPError as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        # 409 = this key already made a refund with another body (ours never changes), 429 =
        # slow down: neither says no refund exists, so both stay "unknown — retry".
        if res.status_code // 100 == 4 and res.status_code not in (409, 429):
            try:
                error = res.json().get("error") or {}
                description = str(error.get("description") or res.text[:300])
            except ValueError:
                description = res.text[:300]
            raise RefundRefused(res.status_code, description)
        if res.status_code // 100 != 2:
            raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")
        try:
            entity = res.json()
        except ValueError as exc:
            raise RazorpayError(f"Razorpay answered with no JSON: {res.text[:300]}") from exc
        refund_id = entity.get("id") if isinstance(entity, dict) else None
        if not isinstance(refund_id, str) or not refund_id.startswith("rfnd_"):
            raise RazorpayError(f"Razorpay returned no refund id: {res.text[:300]}")
        return entity

    async def find_refund(self, payment_id: str, key: str) -> dict[str, Any] | None:
        """The payment's refund made under our `key` (sent as `notes.refund_id` and the receipt),
        or None. Asked before a refusal is believed: "fully refunded already" may mean our own
        earlier call landed (its answer lost, or its idempotency key since expired)."""
        try:
            res = await self._client.get(f"{PAYMENTS_URL}/{payment_id}/refunds")
            items = res.json().get("items") if res.status_code // 100 == 2 else None
        except (httpx.HTTPError, ValueError) as exc:
            raise RazorpayError(f"Razorpay unreachable: {exc}") from exc
        if not isinstance(items, list):
            raise RazorpayError(f"Razorpay {res.status_code}: {res.text[:300]}")
        for item in items:
            if not isinstance(item, dict):
                continue
            notes = item.get("notes")
            if (isinstance(notes, dict) and notes.get("refund_id") == key) or item.get(
                "receipt"
            ) == key[:40]:
                return item
        return None

    def verify_payment_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool:
        """Checkout's success handler signs `order_id|payment_id` with the key secret."""
        expected = hmac.new(
            self._secret, f"{order_id}|{payment_id}".encode(), hashlib.sha256
        ).hexdigest()
        # Bytes: the signature is visitor input, and compare_digest refuses non-ASCII str.
        return hmac.compare_digest(expected.encode(), signature.encode())


def verify_webhook_signature(secret: str, body: bytes, signature: str) -> bool:
    """Razorpay signs a webhook's raw body with the webhook secret (not the key secret):
    `X-Razorpay-Signature` = hex HMAC-SHA256. Checked before the body is parsed."""
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
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
