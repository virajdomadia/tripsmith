"""B8 — customer accounts (R18): the email code, its limits and tries, the owner kept out, the
bookings a customer owns (attached at verify, and by verified email afterwards), the account
voucher, and the daily pruning. The db tests need TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.ratelimit import UpstashRateLimiter
from app.models import Booking, Session, User, Verification
from app.models.enums import UserRole
from app.services.auth.otp import (
    CODE_TTL,
    DAILY_CODE_EMAILS,
    MAX_ATTEMPTS,
    OTP_EMAIL_CAPS,
    TooManyCodes,
    check_code,
    hash_code,
    issue_code,
    new_code,
    prune_codes,
)
from app.services.auth.passwords import hash_password
from app.services.auth.sessions import SESSION_TTL, login, prune_sessions
from app.services.email.signin import render_signin_code
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_auth import COOKIE, with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking_body, rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_enquiries import CountingLimiter

__all__ = ["rzp"]

EMAIL = "asha@example.test"


# --- units -------------------------------------------------------------------------------------


def test_codes_are_six_digits_and_hashed_under_the_key_per_email() -> None:
    codes = {new_code() for _ in range(200)}
    assert all(len(c) == 6 and c.isdigit() for c in codes) and len(codes) > 150
    h = hash_code(EMAIL, "123456", "k1")
    assert len(h) == 64 and "123456" not in h
    assert h != hash_code(EMAIL, "123456", "k2")  # keyed
    assert h != hash_code("b@example.test", "123456", "k1")  # bound to the email


def test_the_code_email_carries_the_code_in_subject_and_both_bodies() -> None:
    m = render_signin_code(EMAIL, "048213", settings=make_settings(site_url="https://t.example"))
    assert m.to == EMAIL and m.subject.startswith("048213 ")
    assert "048213" in m.html and "048213" in m.text and "10 minutes" in m.text


# --- helpers -----------------------------------------------------------------------------------


async def ask(client: AsyncClient, email: str = EMAIL) -> Response:
    return await client.post("/auth/otp/request", json={"email": email})


async def verify(client: AsyncClient, code: str, email: str = EMAIL) -> Response:
    return await client.post("/auth/otp/verify", json={"email": email, "code": code})


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def cookie_of(res: Response) -> str:
    return res.cookies[COOKIE]


async def count(db: AsyncSession, model: Any) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def signed_in(client: AsyncClient, email: str = EMAIL) -> str:
    code = (await ask(client, email)).json()["demoCode"]
    res = await verify(client, code, email)
    assert res.status_code == 200, res.text
    return cookie_of(res)


async def paid_booking(
    client: AsyncClient, departure_id: str, email: str, phone: str, payment_id: str
) -> str:
    """Book while signed out, then confirm it with a signed webhook — the real path."""
    res = await client.post(
        "/bookings", json=booking_body(departure_id, 1, email=email, phone=phone)
    )
    assert res.status_code == 201, res.text
    order = res.json()
    body = event("payment.captured", order["orderId"], payment_id, order["amountPaise"])
    assert (await deliver(client, body)).json() == {"status": "captured"}
    return order["bookingRef"]


# --- db: the code ------------------------------------------------------------------------------


@pytest.mark.db
async def test_demo_mode_returns_the_code_and_verify_signs_a_new_customer_in(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    before = dt.datetime.now(dt.UTC)
    res = await ask(db_client, "  Asha@Example.TEST ")
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"].startswith("no-store")
    body = res.json()
    assert body["email"] == EMAIL and len(body["demoCode"]) == 6
    expires = dt.datetime.fromisoformat(body["expiresAt"])
    assert (
        before + CODE_TTL - dt.timedelta(seconds=5)
        <= expires
        <= before + CODE_TTL + dt.timedelta(seconds=5)
    )
    # Only the HMAC is stored.
    row = (await db.execute(select(Verification))).scalar_one()
    assert row.identifier == EMAIL and body["demoCode"] not in row.code_hash

    res = await verify(db_client, body["demoCode"][:3] + " " + body["demoCode"][3:])
    assert res.status_code == 200, res.text
    info = res.json()
    assert info["user"]["email"] == EMAIL and info["user"]["role"] == "customer"
    assert info["newEnquiries"] is None
    assert "HttpOnly" in res.headers["set-cookie"] and "SameSite=lax" in res.headers["set-cookie"]
    exp = dt.datetime.fromisoformat(info["expiresAt"])
    assert exp >= before + SESSION_TTL - dt.timedelta(seconds=5)  # 30 days

    token = cookie_of(res)
    session = await db_client.get("/auth/session", headers=with_cookie(token))
    assert session.status_code == 200 and session.json()["user"]["role"] == "customer"
    user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one()
    assert user.role == UserRole.CUSTOMER and user.password_hash is None

    # The code opened one session and is spent.
    again = await verify(db_client, body["demoCode"])
    assert again.status_code == 400 and again.json()["error"]["reason"] == "code_dead"

    # Logout ends it.
    out = await db_client.post("/auth/logout", headers=with_cookie(token))
    assert out.status_code == 204
    gone = await db_client.get("/auth/session", headers=with_cookie(token))
    assert gone.status_code == 401


@pytest.mark.db
async def test_live_mode_emails_the_code_and_never_returns_it(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    sender = mailing(db_app)
    res = await ask(db_client)
    assert res.status_code == 200 and res.json()["demoCode"] is None
    [message] = sender.sent
    assert message.to == EMAIL
    code = message.subject.split(" ")[0]
    assert (await verify(db_client, code)).status_code == 200


@pytest.mark.db
async def test_a_demo_address_shows_its_code_even_with_a_live_sender(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    # v2.5 P0: the seeded demo traveller (@example.com) must stay usable once real email is on.
    sender = mailing(db_app)
    res = await ask(db_client, "traveller.demo@example.com")
    assert res.status_code == 200 and len(res.json()["demoCode"]) == 6
    assert sender.sent == []


@pytest.mark.db
async def test_a_failed_send_is_a_502_the_visitor_can_retry(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    sender = mailing(db_app)
    sender.fail_for = frozenset({EMAIL})
    res = await ask(db_client)
    assert res.status_code == 502 and res.json()["error"]["code"] == "internal"
    sender.fail_for = frozenset()
    assert (await ask(db_client)).status_code == 200


@pytest.mark.db
async def test_five_wrong_tries_kill_the_code(db: AsyncSession, db_client: AsyncClient) -> None:
    code = (await ask(db_client)).json()["demoCode"]
    for left in range(MAX_ATTEMPTS - 1, 0, -1):
        res = await verify(db_client, wrong(code))
        assert res.status_code == 400
        err = res.json()["error"]
        assert err["reason"] == "code_wrong" and f"{left} tr" in err["message"]
        assert err["fieldErrors"] == {"code": "That code isn't right"}
    res = await verify(db_client, wrong(code))  # the fifth
    assert res.json()["error"]["reason"] == "code_dead"
    # Dead for good — even the right code.
    res = await verify(db_client, code)
    assert res.status_code == 400 and res.json()["error"]["reason"] == "code_dead"
    assert await count(db, Session) == 0
    # A new code works.
    assert (await verify(db_client, (await ask(db_client)).json()["demoCode"])).status_code == 200


@pytest.mark.db
async def test_a_new_code_retires_the_old_one_and_codes_expire(db: AsyncSession) -> None:
    first = await issue_code(db, EMAIL, secret="k")
    second = await issue_code(db, EMAIL, secret="k")
    assert not (await check_code(db, EMAIL, first.code, secret="k")).ok
    await db.rollback()
    late = dt.datetime.now(dt.UTC) + CODE_TTL + dt.timedelta(seconds=1)
    assert (await check_code(db, EMAIL, second.code, secret="k", now=late)).tries_left == 0
    assert (await check_code(db, EMAIL, second.code, secret="k")).ok
    # Another email's code never matches this one.
    await db.rollback()
    await issue_code(db, "other@example.test", secret="k")
    assert not (await check_code(db, "other@example.test", second.code, secret="k")).ok


@pytest.mark.db
async def test_limits_five_codes_per_email_and_twenty_per_connection(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    limiter = CountingLimiter(limit=5)
    db_app.state.rate_limiter = limiter
    for _ in range(5):
        assert (await ask(db_client)).status_code == 200
    res = await ask(db_client)
    assert res.status_code == 429 and res.json()["error"]["code"] == "rate_limited"
    assert "otp:asha@example.test" in limiter.hits
    assert any(k.startswith("otp-ip:") for k in limiter.hits)

    per_ip = CountingLimiter(limit=20)
    db_app.state.rate_limiter = per_ip
    for i in range(20):
        assert (await ask(db_client, f"p{i}@example.test")).status_code == 200
    assert (await ask(db_client, "p99@example.test")).status_code == 429


def upstash_down() -> UpstashRateLimiter:
    """The real limiter with Upstash unreachable — it fails open on every hit."""

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("upstash down", request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(refuse))
    return UpstashRateLimiter("https://upstash.test", "t", client=client)


async def codes_at(db: AsyncSession, email: str, *ages: dt.timedelta) -> None:
    """Verification rows for `email`, issued `ages` ago (as the router would have)."""
    now = dt.datetime.now(dt.UTC)
    for age in ages:
        at = now - age
        db.add(
            Verification(
                identifier=email,
                code_hash="x",
                created_at=at,
                expires_at=at + CODE_TTL,
                consumed_at=at,
            )
        )
    await db.commit()


@pytest.mark.db
async def test_with_upstash_down_the_sixth_code_in_15_minutes_is_refused(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    # v2.6 SA-2: the database cap holds when the limiter fails open.
    db_app.state.rate_limiter = upstash_down()
    for _ in range(OTP_EMAIL_CAPS[0][1]):
        assert (await ask(db_client)).status_code == 200
    res = await ask(db_client)
    assert res.status_code == 429 and res.json()["error"]["code"] == "rate_limited"
    assert 0 < int(res.headers["Retry-After"]) <= 15 * 60
    assert await count(db, Verification) == 5  # the refused ask wrote nothing
    # Another email is unaffected.
    assert (await ask(db_client, "other@example.test")).status_code == 200


@pytest.mark.db
async def test_the_code_caps_slide_over_15_minutes_and_a_day(db: AsyncSession) -> None:
    minute = dt.timedelta(minutes=1)
    # Five codes, the oldest 16 minutes ago: only four are in the window — one more is fine.
    await codes_at(db, EMAIL, 16 * minute, 10 * minute, 8 * minute, 6 * minute, 4 * minute)
    await issue_code(db, EMAIL, secret="k")
    with pytest.raises(TooManyCodes) as refused:
        await issue_code(db, EMAIL, secret="k")
    # The oldest code in the window (10 min ago) leaves it in about 5 minutes.
    assert 4 * 60 < refused.value.retry_after <= 5 * 60

    # 20 a day: spread out so no 15 minutes holds five, the 21st in 24 h is still refused.
    other = "daily@example.test"
    await codes_at(db, other, *(dt.timedelta(hours=1 + i) for i in range(20)))
    with pytest.raises(TooManyCodes) as daily:
        await issue_code(db, other, secret="k")
    assert daily.value.retry_after > 3 * 3600  # the oldest (20 h ago) leaves in ~4 h
    # Codes older than a day don't count.
    old = "old@example.test"
    await codes_at(db, old, *(dt.timedelta(hours=25 + i) for i in range(20)))
    await issue_code(db, old, secret="k")


@pytest.mark.db
async def test_the_daily_code_email_budget_keeps_gmail_free_for_booking_mail(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    # v2.6 SA-5: rotating IPs and emails can't burn the ~500/day Gmail cap.
    sender = mailing(db_app)
    day = dt.timedelta(hours=23)
    for i in range(DAILY_CODE_EMAILS - 1):
        await codes_at(db, f"r{i}@example.test", day)
    await codes_at(db, "gone@example.test", dt.timedelta(hours=25))  # outside the day
    await codes_at(db, "traveller.demo@example.com", day)  # never emailed — not counted
    assert (await ask(db_client)).status_code == 200  # the 200th
    assert len(sender.sent) == 1

    res = await ask(db_client, "next@example.test")
    assert res.status_code == 429 and res.json()["error"]["code"] == "rate_limited"
    assert 3000 < int(res.headers["Retry-After"]) <= 3600  # the oldest leaves in about an hour
    assert len(sender.sent) == 1
    # Demo addresses aren't emailed, so the budget doesn't stop them.
    res = await ask(db_client, "traveller.demo@example.com")
    assert res.status_code == 200 and len(res.json()["demoCode"]) == 6


@pytest.mark.db
async def test_the_owner_cannot_sign_in_by_code(db: AsyncSession, db_client: AsyncClient) -> None:
    owner = "owner@tripsmith.demo"
    db.add(User(name="Owner", email=owner, role=UserRole.OWNER, password_hash=hash_password("pw")))
    await db.commit()
    res = await ask(db_client, owner)
    assert res.status_code == 403 and "owner sign-in" in res.json()["error"]["message"]
    # Even with a code planted in the table, verify refuses it.
    await issue_code(db, owner, secret=None)
    code = "000000"
    await db.execute(
        update(Verification)
        .where(Verification.identifier == owner)
        .values(code_hash=hash_code(owner, code, None))
    )
    await db.commit()
    assert (await verify(db_client, code, owner)).status_code == 403
    assert await count(db, Session) == 0


@pytest.mark.db
async def test_bad_input_is_a_400(db_client: AsyncClient) -> None:
    assert (await ask(db_client, "not-an-email")).status_code == 400
    assert (await verify(db_client, "12345")).status_code == 400
    assert (await verify(db_client, "abcdef")).status_code == 400


# --- db: the done-when --------------------------------------------------------------------------


@pytest.mark.db
async def test_a_logged_out_booking_appears_after_verifying_the_same_email(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)  # live email: the codes come by email here, read off the fake sender
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}  # back to demo codes
    )
    _, departure = await seeded(db, seats=8)
    mine = await paid_booking(db_client, departure.id, EMAIL, "9000000041", "pay_B8Mine001")
    theirs = await paid_booking(
        db_client, departure.id, "someone@example.test", "9000000042", "pay_B8Them001"
    )

    assert (await db_client.get("/account/bookings")).status_code == 401
    token = await signed_in(db_client)
    res = await db_client.get("/account/bookings", headers=with_cookie(token))
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"].startswith("no-store")
    trips = res.json()
    assert trips["email"] == EMAIL and trips["name"] == "Asha Rao"  # named after the lead
    [booking] = trips["bookings"]
    assert booking["ref"] == mine and booking["status"] == "confirmed"
    assert booking["hasVoucher"] is True and booking["travellers"] == 1
    assert booking["packageSlug"] and booking["destination"] == "Goa"

    # Attached at verify.
    user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one()
    attached = (await db.execute(select(Booking.user_id).where(Booking.ref == mine))).scalar_one()
    assert attached == user.id

    # A later booking made signed out with the same email shows at once, no second sign-in —
    # and a lapsed checkout is listed as the pending attempt it was.
    later = await db_client.post(
        "/bookings", json=booking_body(departure.id, 1, email=EMAIL, phone="9000000043")
    )
    assert later.status_code == 201
    res = await db_client.get("/account/bookings", headers=with_cookie(token))
    refs = [(b["ref"], b["status"], b["hasVoucher"]) for b in res.json()["bookings"]]
    assert refs == [(later.json()["bookingRef"], "pending", False), (mine, "confirmed", True)]

    # The voucher: this customer's booking yes, anyone else's no.
    pdf = await db_client.get(f"/account/bookings/{mine}/voucher.pdf", headers=with_cookie(token))
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    other = await db_client.get(
        f"/account/bookings/{theirs}/voucher.pdf", headers=with_cookie(token)
    )
    assert other.status_code == 403
    pending = await db_client.get(
        f"/account/bookings/{later.json()['bookingRef']}/voucher.pdf", headers=with_cookie(token)
    )
    assert pending.status_code == 404


@pytest.mark.db
async def test_a_booking_attached_to_one_account_never_shows_on_another(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    _, departure = await seeded(db, seats=8)
    ref = await paid_booking(db_client, departure.id, EMAIL, "9000000051", "pay_B8Own0001")
    await signed_in(db_client)
    # Say the owner re-points it at another customer (B10 could): it goes with the user_id.
    db.add(User(name="Ravi", email="ravi@example.test"))
    await db.commit()
    ravi = (await db.execute(select(User).where(User.email == "ravi@example.test"))).scalar_one()
    await db.execute(update(Booking).where(Booking.ref == ref).values(user_id=ravi.id))
    await db.commit()
    asha = await signed_in(db_client)
    assert (await db_client.get("/account/bookings", headers=with_cookie(asha))).json()[
        "bookings"
    ] == []
    ravi_token = await signed_in(db_client, "ravi@example.test")
    [b] = (await db_client.get("/account/bookings", headers=with_cookie(ravi_token))).json()[
        "bookings"
    ]
    assert b["ref"] == ref


@pytest.mark.db
async def test_the_owner_still_downloads_any_voucher_and_sees_no_trips(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    _, departure = await seeded(db, seats=8)
    ref = await paid_booking(db_client, departure.id, EMAIL, "9000000061", "pay_B8Owner01")
    db.add(
        User(
            name="Owner",
            email="owner@tripsmith.demo",
            role=UserRole.OWNER,
            password_hash=hash_password("pw"),
        )
    )
    await db.commit()
    opened = await login(db, "owner@tripsmith.demo", "pw", ip=None, user_agent=None)
    assert opened is not None
    token = opened[1]
    pdf = await db_client.get(f"/account/bookings/{ref}/voucher.pdf", headers=with_cookie(token))
    assert pdf.status_code == 200
    trips = await db_client.get("/account/bookings", headers=with_cookie(token))
    assert trips.status_code == 200 and trips.json()["bookings"] == []


# --- db: the daily prune ------------------------------------------------------------------------


@pytest.mark.db
async def test_the_daily_job_prunes_expired_sessions_and_old_codes(db: AsyncSession) -> None:
    db.add(User(name="C", email=EMAIL))
    await db.commit()
    user = (await db.execute(select(User))).scalar_one()
    now = dt.datetime.now(dt.UTC)
    for days in (-1, 1):
        db.add(
            Session(
                user_id=user.id, token_hash=f"h{days}", expires_at=now + dt.timedelta(days=days)
            )
        )
    for hours in (-30, -2):
        db.add(
            Verification(
                identifier=EMAIL, code_hash="x", expires_at=now + dt.timedelta(hours=hours)
            )
        )
    await db.commit()
    assert await prune_sessions(db) == 1
    assert await prune_codes(db) == 1  # only the one over a day old
    assert await count(db, Session) == 1 and await count(db, Verification) == 1
    assert (await db.execute(select(Booking))).first() is None  # untouched
