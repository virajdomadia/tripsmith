"""The real `Razorpay` client over an in-process transport: orders are answered locally, the
requests are kept for inspection, and signatures are real HMACs under a test secret.

Refunds (P13) behave as test mode did when probed on our account: `processed` straight away,
the same `X-Refund-Idempotency` key answers with the refund it already made (a different body
under it is a 409), never more than the payment's amount, and at least ₹1."""

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
        # `order_payments` answers: order id → the payments Razorpay would list for it.
        self.payments: dict[str, list[dict[str, object]]] = {}
        # Refunds made, by idempotency key; what a refund answers (`processed` | `pending` |
        # `failed`); a refund refused with 400 when set; the refund endpoint down (502) alone.
        self.refunds: dict[str, dict[str, object]] = {}
        self.refund_status = "processed"
        self.refuse_refunds: str | None = None
        self.refunds_down = False
        # Razorpay forgot the idempotency keys (they expire): a resend is a new request.
        self.keys_expired = False
        # What each payment id captured (paise), for the "more than captured" check.
        self.captured: dict[str, int] = {}
        super().__init__(KEY_ID, KEY_SECRET, transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.down:
            return httpx.Response(502, text="Bad Gateway")
        parts = request.url.path.split("/")  # ["", "v1", "orders" | "payments", id, ...]
        if parts[2] == "payments" and parts[-1] == "refund":
            return self._refund(request, parts[3])
        if parts[2] == "payments" and parts[-1] == "refunds" and request.method == "GET":
            items = [r for r in self.refunds.values() if r["payment_id"] == parts[3]]
            return httpx.Response(200, json={"items": items, "count": len(items)})
        if parts[2] == "orders" and request.method == "GET":  # /v1/orders/{id}/payments
            return httpx.Response(200, json={"items": self.payments.get(parts[3], [])})
        if parts[2] == "payments":  # /v1/payments/{id}/capture
            for items in self.payments.values():
                for item in items:
                    if item["id"] == parts[3]:
                        item["status"] = "captured"
                        return httpx.Response(200, json=item)
            return httpx.Response(404, json={"error": {"description": "no such payment"}})
        body = json.loads(request.content)
        order_id = f"order_Fake{len(self.requests):010d}"
        return httpx.Response(200, json={"id": order_id, "status": "created", **body})

    def _refund(self, request: httpx.Request, payment_id: str) -> httpx.Response:
        if self.refunds_down:
            return httpx.Response(502, text="Bad Gateway")
        body = json.loads(request.content)
        key = request.headers.get("X-Refund-Idempotency", "")
        made = None if self.keys_expired else self.refunds.get(key)
        if made is not None:
            if made["amount"] != body["amount"] or made["payment_id"] != payment_id:
                return _error(
                    409,
                    "Different request with the same idempotency key has already been processed.",
                )
            return httpx.Response(200, json=made)
        if self.refuse_refunds:
            return _error(400, self.refuse_refunds)
        if body["amount"] < 100:
            return _error(400, "The amount must be atleast INR 1.00")
        given = sum(
            int(r["amount"])  # type: ignore[arg-type]
            for r in self.refunds.values()
            if r["payment_id"] == payment_id and r["status"] != "failed"
        )
        if given + body["amount"] > self.captured.get(payment_id, 10**9):
            if given >= self.captured.get(payment_id, 10**9):
                return _error(400, "The payment has been fully refunded already")
            return _error(400, "The refund amount provided is greater than amount captured")
        refund = {
            "id": f"rfnd_Fake{len(self.refunds) + 1:010d}",
            "entity": "refund",
            "payment_id": payment_id,
            "amount": body["amount"],
            "currency": "INR",
            "status": self.refund_status,
            "speed_requested": body.get("speed"),
            "speed_processed": "normal",
            "receipt": body.get("receipt"),
            "notes": body.get("notes") or {},
        }
        self.refunds[key if key not in self.refunds else f"{key}#{len(self.refunds)}"] = refund
        return httpx.Response(200, json=refund)

    def refund_calls(self) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path.endswith("/refund")]


def _error(status: int, description: str) -> httpx.Response:
    return httpx.Response(
        status, json={"error": {"code": "BAD_REQUEST_ERROR", "description": description}}
    )


def sign(order_id: str, payment_id: str, secret: str = KEY_SECRET) -> str:
    """What Checkout.js hands the success handler as `razorpay_signature`."""
    return hmac.new(
        secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
