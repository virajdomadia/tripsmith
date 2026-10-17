"""P19 security pass: what the public demo owner login can no longer do (docs/12 "P19").

With `PUBLIC_DEMO_OWNER` on (production), owner actions can't reach a real inbox or a real
customer's full ID number: customer emails on counter bookings and inbox replies go to the owner's
inbox, the details-link email is limited per booking, and the manifest masks the IDs of anyone
but the seeded demo addresses. Plus the `/account` same-origin guard and the calendar's lone CR.
The db tests need TEST_DATABASE_URL."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking
from app.models.enums import BookingChannel
from app.services.booking.calendar import _escape
from app.services.enquiry_reply import _deliver
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import OWNER_INBOX
from tests.test_bookings_desk import owner_cookie
from tests.test_customer_accounts import EMAIL
from tests.test_email_send import FakeSender
from tests.test_enquiries import CountingLimiter
from tests.test_traveller_details import FULL, booked, card_body, detail, save

__all__ = ["rzp"]

LIVE_FROM = "Tripsmith <hello@tripsmith.in>"  # a real sender: only the P19 rule holds mail back


def demo_owner(app: FastAPI, on: bool = True) -> None:
    app.state.settings = app.state.settings.model_copy(
        update={"public_demo_owner": on, "email_from": LIVE_FROM}
    )


# --- pure ---------------------------------------------------------------------------------------


def test_a_lone_carriage_return_never_reaches_an_ics_line() -> None:
    assert _escape("Gate 3\rBEGIN:VEVENT") == "Gate 3BEGIN:VEVENT"
    assert _escape("a\r\nb") == "a\\nb"


async def test_an_inbox_reply_goes_to_the_owner_on_the_public_demo() -> None:
    sender = FakeSender()
    settings = make_settings(
        email_from=LIVE_FROM, owner_notify_email=OWNER_INBOX, public_demo_owner=True
    )
    sent, error = await _deliver(
        None,  # type: ignore[arg-type]  # only read for a package PDF
        sender=sender,
        settings=settings,
        pdf=None,
        enquiry_ref="TS-ABCDEF",
        to="stranger@gmail.com",
        subject="About your trip",
        body="Hello",
        package=None,
    )
    assert error is None and sent
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject.startswith("[Test → stranger@gmail.com]")

    sender.sent.clear()
    await _deliver(
        None,  # type: ignore[arg-type]
        sender=sender,
        settings=settings.model_copy(update={"public_demo_owner": False}),
        pdf=None,
        enquiry_ref="TS-ABCDEF",
        to="stranger@gmail.com",
        subject="About your trip",
        body="Hello",
        package=None,
    )
    assert sender.sent[0].to == "stranger@gmail.com"


@pytest.mark.db
async def test_account_writes_refuse_other_sites(db_client: AsyncClient) -> None:
    client = db_client
    for site in ("cross-site", "same-site"):
        res = await client.post(
            "/account/bookings/TB-ABC123/balance",
            json={"amountPaise": 100000},
            headers={"Sec-Fetch-Site": site},
        )
        assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"
    res = await client.put(
        "/account/saved/goa-quiet-escape", headers={"Sec-Fetch-Site": "cross-site"}
    )
    assert res.status_code == 403
    # The site itself (through the rewrite) or a server-side handler (no header) gets through to
    # the sign-in check.
    for headers in ({"Sec-Fetch-Site": "same-origin"}, {}):
        res = await client.post(
            "/account/bookings/TB-ABC123/balance", json={"amountPaise": 100000}, headers=headers
        )
        assert res.status_code == 401
    assert (
        await client.get("/account/bookings", headers={"Sec-Fetch-Site": "cross-site"})
    ).status_code == 401


# --- db -----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_counter_booking_emails_go_to_the_owner_on_the_public_demo(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await booked(db, db_app, db_client)
    owner = await owner_cookie(db)
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    demo_owner(db_app)
    sender = db_app.state.email_sender

    # V2 (SA-1): even on a web booking, mail the owner sends goes to the owner's inbox.
    sender.sent.clear()
    assert (await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)).is_success
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject.startswith(f"[Test → {EMAIL}]")

    # Made at the counter, the address is anyone's choice: the owner gets it instead.
    await db.execute(update(Booking).where(Booking.ref == ref).values(channel=BookingChannel.PHONE))
    await db.commit()
    sender.sent.clear()
    assert (await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)).is_success
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject.startswith(f"[Test → {EMAIL}]")

    # Off (a private owner login), the counter booking's customer is mailed as before.
    demo_owner(db_app, on=False)
    sender.sent.clear()
    assert (await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)).is_success
    assert [m.to for m in sender.sent] == [EMAIL]


@pytest.mark.db
async def test_the_details_link_is_limited_per_booking(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await booked(db, db_app, db_client)
    owner = await owner_cookie(db)
    limiter = CountingLimiter(limit=3)
    db_app.state.rate_limiter = limiter
    for _ in range(3):
        res = await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)
        assert res.status_code == 200, res.text
    res = await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)
    assert res.status_code == 429 and res.headers["Retry-After"]
    assert limiter.hits == [f"details-link:{ref}"] * 4


@pytest.mark.db
async def test_the_manifest_masks_real_customers_ids_on_the_public_demo(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    owner = await owner_cookie(db)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][0]["travellerId"]
    assert (
        await save(db_client, ref, token, tid, card_body("Asha Rao", **FULL))
    ).status_code == 200
    url = f"/admin/departures/{departure.id}/manifest"

    demo_owner(db_app)
    first = (await db_client.get(url, headers=owner)).json()["bookings"][0]["travellers"][0]
    assert first["idNumber"] == "XXXX XXXX 4821" and first["idType"] == "aadhaar"

    # The seeded demo bookings (example.com) still show the feature in full.
    await db.execute(
        update(Booking).where(Booking.ref == ref).values(contact_email="demo.rao@example.com")
    )
    await db.commit()
    first = (await db_client.get(url, headers=owner)).json()["bookings"][0]["travellers"][0]
    assert first["idNumber"] == "0000 0000 4821"
