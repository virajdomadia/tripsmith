"""The real `Razorpay` client over an in-process transport: orders are answered locally, the
requests are kept for inspection, and signatures are real HMACs under a test secret."""

import hashlib
import hmac
import json

import httpx

from app.infra.razorpay import Razorpay

KEY_ID = "rzp_test_Fake0000000000"
KEY_SECRET = "fake-secret-for-tests"


class FakeRazorpay(Razorpay):
    def __init__(self, *, down: bool = False) -> None:
        self.requests: list[httpx.Request] = []
        self.down = down
        super().__init__(KEY_ID, KEY_SECRET, transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.down:
            return httpx.Response(502, text="Bad Gateway")
        body = json.loads(request.content)
        order_id = f"order_Fake{len(self.requests):010d}"
        return httpx.Response(200, json={"id": order_id, "status": "created", **body})


def sign(order_id: str, payment_id: str, secret: str = KEY_SECRET) -> str:
    """What Checkout.js hands the success handler as `razorpay_signature`."""
    return hmac.new(
        secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
