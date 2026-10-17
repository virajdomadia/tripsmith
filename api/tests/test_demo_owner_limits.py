"""v2.6 V2: what the public demo owner login is limited to (docs/12 "v2.6 — Hardening audit").

- SA-1: while `PUBLIC_DEMO_OWNER` is on, a customer's real inbox gets only mail that customer
  triggered in that request — the sign-in code and their own capture receipt. Everything else
  (a decline note, a waitlist offer naming a renamed package, the cron's mail) goes to the owner
  as `[Test → …]`.
- SA-3: the switch defaults on in production unless set to 'false', and refuses a live key.
- SB-4: owner routes that reach Razorpay are limited per booking and per address.
- SA-4: every `/admin` write refuses another site.
The db tests need TEST_DATABASE_URL."""

import importlib
import pkgutil
from collections.abc import Sequence

import pytest
from fastapi import APIRouter, FastAPI, params
from fastapi.routing import APIRoute
from httpx import AsyncClient
from pydantic_settings import SettingsConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

import app.routers.admin as admin_pkg
from app.config import Settings
from app.infra.email import EmailMessage
from app.infra.razorpay import build_razorpay
from app.routers.admin.limits import owner_razorpay_limit
from app.routers.site.guards import same_origin_write
from app.services.booking.after_capture import Notify
from app.services.email.bookings import deliver
from app.services.email.waitlist import send_due
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking_body, callback, rzp
from tests.test_booking_webhook import OWNER_INBOX, mailing, with_webhook_secret
from tests.test_cancellation_resolve import asked, resolve
from tests.test_counter_links import link_booking
from tests.test_customer_accounts import EMAIL, paid_booking
from tests.test_email_send import FakeSender
from tests.test_enquiries import CountingLimiter
from tests.test_public_demo_owner import LIVE_FROM, demo_owner
from tests.test_waitlist import SETTINGS, join, lapse_holds, sold_out, walk

__all__ = ["rzp"]

REAL = "stranger@gmail.com"


class EnvOnlySettings(Settings):
    model_config = SettingsConfigDict(env_file=None)


def _mail(to: str = REAL) -> EmailMessage:
    return EmailMessage(to=to, subject="Your trip", html="<p>Hi</p>", text="Hi")


# --- SA-1 (pure) --------------------------------------------------------------------------------


async def test_owner_triggered_customer_mail_goes_to_the_owner_on_the_public_demo() -> None:
    settings = make_settings(
        email_from=LIVE_FROM, owner_notify_email=OWNER_INBOX, public_demo_owner=True
    )
    sender = FakeSender()
    lines = await deliver(sender, settings, [("customer", _mail())], ref="TB-ABC123", what="x")
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject == f"[Test → {REAL}] Your trip"
    assert [line.outcome for line in lines] == ["held"]

    # The customer's own capture receipt, triggered by them in that request, still reaches them.
    sender.sent.clear()
    await deliver(
        sender,
        settings,
        [("customer", _mail())],
        ref="TB-ABC123",
        what="booking",
        customer_triggered=True,
    )
    assert [m.to for m in sender.sent] == [REAL]

    # Off (a private owner login), the owner's mail reaches the customer as before.
    sender.sent.clear()
    off = settings.model_copy(update={"public_demo_owner": False})
    await deliver(sender, off, [("customer", _mail())], ref="TB-ABC123", what="x")
    assert [m.to for m in sender.sent] == [REAL]


# --- SA-3 (pure) --------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("vercel_env", "flag", "on"),
    [
        ("production", None, True),  # lost or never set on production: on
        ("production", "", True),
        ("production", "false", False),  # only an explicit 'false' turns it off
        ("production", "true", True),
        ("preview", None, False),
        (None, None, False),  # local dev and CI
        (None, "true", True),
    ],
)
def test_the_demo_switch_defaults_on_in_production(
    monkeypatch: pytest.MonkeyPatch, vercel_env: str | None, flag: str | None, on: bool
) -> None:
    for key, value in (("VERCEL_ENV", vercel_env), ("PUBLIC_DEMO_OWNER", flag)):
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    assert EnvOnlySettings().public_demo_owner is on


def test_a_live_razorpay_key_is_refused_while_the_demo_switch_is_on() -> None:
    live = make_settings(
        razorpay_key_id="rzp_live_Abc123", razorpay_key_secret="s", public_demo_owner=True
    )
    assert build_razorpay(live) is None
    test_key = live.model_copy(update={"razorpay_key_id": "rzp_test_Abc123"})
    assert build_razorpay(test_key) is not None
    private = live.model_copy(update={"public_demo_owner": False})
    assert build_razorpay(private) is not None


# --- SA-4 / SB-4 (routes) -----------------------------------------------------------------------


def _admin_routers() -> dict[str, APIRouter]:
    """Every `app/routers/admin` module's router (FastAPI 0.141 hides included routes behind a
    lazy wrapper, so they are read from their routers)."""
    out = {}
    for info in pkgutil.iter_modules(admin_pkg.__path__):
        module = importlib.import_module(f"{admin_pkg.__name__}.{info.name}")
        router = getattr(module, "router", None)
        if isinstance(router, APIRouter):
            out[info.name] = router
    return out


def _calls(deps: Sequence[params.Depends]) -> set[object]:
    return {d.dependency for d in deps}


def test_every_admin_router_has_the_same_origin_check() -> None:
    routers = _admin_routers()
    assert len(routers) >= 13
    missing = [n for n, r in routers.items() if same_origin_write not in _calls(r.dependencies)]
    assert missing == []


@pytest.mark.db
async def test_an_admin_write_from_another_site_is_403_before_the_sign_in(
    db_client: AsyncClient,
) -> None:
    client = db_client
    for site in ("cross-site", "same-site"):
        res = await client.post(
            "/admin/bookings/TB-ABC123/link/check", headers={"Sec-Fetch-Site": site}
        )
        assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"
    res = await client.post("/admin/bookings/TB-ABC123/link/check")
    assert res.status_code == 401


RAZORPAY_ROUTES = {
    ("POST", "/admin/bookings/{ref}/mark-paid"),
    ("POST", "/admin/bookings/{ref}/balance-paid"),
    ("POST", "/admin/bookings/{ref}/move"),
    ("POST", "/admin/bookings/{ref}/link/check"),
    ("POST", "/admin/bookings/{ref}/link/cancel"),
    ("POST", "/admin/bookings/{ref}/refund"),
    ("POST", "/admin/bookings/{ref}/addons/{addon_id}/remove"),
    ("POST", "/admin/cancellations/{id}/resolve"),
    ("POST", "/admin/counter/bookings"),
}


def test_every_owner_route_that_reaches_razorpay_is_limited() -> None:
    limited = {
        (m, r.path)
        for router in _admin_routers().values()
        for r in router.routes
        if isinstance(r, APIRoute) and owner_razorpay_limit in _calls(r.dependencies)
        for m in r.methods or ()
    }
    assert limited == RAZORPAY_ROUTES


# --- db -----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_decline_note_never_reaches_the_customer_on_the_public_demo(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, _, owner, id = await asked(db, db_app, db_client)
    demo_owner(db_app)
    res = await resolve(db_client, id, owner, decision="reject", note="Visit https://spam.test now")
    assert res.status_code == 200, res.text
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject.startswith(f"[Test → {EMAIL}]")


@pytest.mark.db
async def test_the_customers_own_receipt_still_reaches_them_on_the_public_demo(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    demo_owner(db_app)
    _, departure = await seeded(db, seats=8)
    dep_id = departure.id

    # Paid through Checkout, confirmed by the webhook (the real path).
    await paid_booking(db_client, dep_id, EMAIL, "9000000081", "pay_V2Own00001")
    assert EMAIL in [m.to for m in sender.sent]

    # Confirmed by Checkout's success handler.
    sender.sent.clear()
    held = await db_client.post(
        "/bookings", json=booking_body(dep_id, 1, email=REAL, phone="9000000082")
    )
    assert held.status_code == 201, held.text
    order = held.json()
    res = await db_client.post(
        f"/bookings/{order['bookingRef']}/confirm", json=callback(order["orderId"], "pay_V2Own2")
    )
    assert res.status_code == 200, res.text
    assert REAL in [m.to for m in sender.sent]


@pytest.mark.db
async def test_a_waitlist_offer_goes_to_the_owner_on_the_public_demo(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    sender = FakeSender()
    settings = SETTINGS.model_copy(update={"public_demo_owner": True})
    assert await send_due(db, Notify(sender, settings)) == 1
    [mail] = sender.sent
    assert mail.to == "owner@tripsmith.test"
    assert mail.subject.startswith("[Test → asha@customer.in] Seats are free on")


@pytest.mark.db
async def test_owner_razorpay_calls_are_limited_per_booking_and_address_on_the_public_demo(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    desk, owner, _ = await link_booking(db, db_app, db_client)
    ref = desk["ref"]
    limiter = CountingLimiter(limit=10)
    db_app.state.rate_limiter = limiter

    # Off (a private owner login): no limit.
    for _ in range(11):
        res = await db_client.post(f"/admin/bookings/{ref}/link/check", headers=owner)
        assert res.status_code == 200, res.text
    assert limiter.hits == []

    demo_owner(db_app)
    for _ in range(10):
        res = await db_client.post(f"/admin/bookings/{ref}/link/check", headers=owner)
        assert res.status_code == 200, res.text
    res = await db_client.post(f"/admin/bookings/{ref}/link/check", headers=owner)
    assert res.status_code == 429 and res.headers["Retry-After"]
    assert f"owner-rzp:{ref}" in limiter.hits
    assert any(k.startswith("owner-rzp-ip:") for k in limiter.hits)
