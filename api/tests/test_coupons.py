"""B15 — coupon codes (R26): the sum to the paisa (flat, % with a cap, rounding, after the deal,
the ₹1 floor), the seven refusals, the real path (quote → hold → Razorpay order → signed webhook
capture → one use), an abandoned hold that uses nothing, the last use going to one hold, and
the admin rules. The db tests need TEST_DATABASE_URL."""

import datetime as dt
import json
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Coupon, Package
from app.models.enums import CouponKind, Occupancy
from app.schemas.bookings import QuoteRequest
from app.services.booking.pricing import apply_coupon, coupon_off
from app.services.email.render import IST
from scripts.seed import DEMO_COUPON, seed_demo_coupon
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking, booking_body
from tests.test_booking_pricing import DEAL, quote
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import owner_cookie

D = Occupancy.DOUBLE
SINGLE_PRICE = 29_000_00  # tests.test_booking_orders.seeded: ₹20,000 double + ₹9,000 supplement


def coupon(**overrides: object) -> Coupon:
    fields: dict[str, object] = {
        "code": "SAVE10",
        "kind": CouponKind.PERCENT,
        "percent": 10,
        "starts_at": dt.datetime(2026, 1, 1, tzinfo=dt.UTC),
        "all_packages": True,
        "active": True,
    }
    return Coupon(**(fields | overrides))


# --- the sum -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("terms", "amount", "off"),
    [
        ({"kind": CouponKind.FLAT, "percent": None, "amount_paise": 500_00}, 49_998_00, 500_00),
        ({}, 49_998_00, 4_999_00),  # 10 % = ₹4,999.80 → rounded down to the rupee
        ({"cap_paise": 1_000_00}, 49_998_00, 1_000_00),
        ({"percent": 90}, 2_00, 1_00),  # never below ₹1: 90 % of ₹2 leaves ₹1
        (
            {"kind": CouponKind.FLAT, "percent": None, "amount_paise": 60_000_00},
            49_998_00,
            49_997_00,
        ),
        ({}, 1_00, 0),
    ],
)
def test_coupon_off_rounds_down_caps_and_never_goes_below_one_rupee(
    terms: dict[str, object], amount: int, off: int
) -> None:
    assert coupon_off(coupon(**terms), amount) == off


def test_the_coupon_comes_after_the_deal_and_joins_the_discount() -> None:
    q = quote([D, D], **DEAL)  # 2 × ₹24,999 − 2 × ₹3,000 deal = ₹43,998
    assert (q.subtotal_paise, q.discount_paise, q.total_paise) == (49_998_00, 6_000_00, 43_998_00)
    with_code = apply_coupon(q, coupon())
    assert with_code.coupon is not None
    assert (with_code.coupon.code, with_code.coupon.off_paise) == ("SAVE10", 4_399_00)
    assert with_code.discount_paise == 6_000_00 + 4_399_00
    assert with_code.total_paise == 43_998_00 - 4_399_00
    assert with_code.lines == q.lines  # no new line: the coupon has its own field


def test_codes_are_case_insensitive_and_old_snapshots_still_read() -> None:
    req = QuoteRequest.model_validate(
        {
            "departureId": "d",
            "travellers": [{"occupancy": "double"}] * 2,
            "couponCode": "  save10 ",
            "email": "Not an email",
        }
    )
    assert (req.coupon_code, req.email) == ("SAVE10", None)
    snapshot = quote([D, D]).model_dump(mode="json", by_alias=True)
    del snapshot["coupon"]  # a booking quoted before B15
    assert type(quote([D, D])).model_validate(snapshot).coupon is None


# --- db ------------------------------------------------------------------------------------------


@pytest.fixture
def rzp(db_app: FastAPI) -> FakeRazorpay:
    from tests.test_enquiries import CountingLimiter

    fake = FakeRazorpay()
    db_app.state.razorpay = fake
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    return fake


def quote_body(departure_id: str, code: str | None, email: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"departureId": departure_id, "travellers": [{"occupancy": "single"}]}
    if code is not None:
        body["couponCode"] = code
    if email is not None:
        body["email"] = email
    return body


def hold_body(departure_id: str, code: str | None, n: int) -> dict[str, Any]:
    body = booking_body(departure_id, 1, email=f"c{n}@example.test", phone=f"91000000{n:02d}")
    return {**body, "couponCode": code} if code else body


async def add_coupon(db: AsyncSession, **overrides: object) -> Coupon:
    c = coupon(**overrides)
    db.add(c)
    await db.commit()
    return c


def refusal(res: Any) -> str:
    assert res.status_code == 409, res.text
    return res.json()["error"]["reason"]


@pytest.mark.db
async def test_a_coupon_lowers_the_order_to_the_paisa_and_counts_on_capture(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id
    await add_coupon(db, cap_paise=2_000_00)  # 10 % of ₹29,000 = ₹2,900 → capped at ₹2,000

    quoted = await db_client.post("/bookings/quote", json=quote_body(dep_id, "save10"))
    assert quoted.status_code == 200, quoted.text
    assert quoted.json()["coupon"] == {"code": "SAVE10", "offPaise": 2_000_00}
    assert quoted.json()["totalPaise"] == SINGLE_PRICE - 2_000_00

    held = await db_client.post("/bookings", json=hold_body(dep_id, "Save10", 1))
    assert held.status_code == 201, held.text
    order = held.json()
    assert order["amountPaise"] == SINGLE_PRICE - 2_000_00
    sent = [r for r in rzp.requests if r.url.path == "/v1/orders"]
    assert json.loads(sent[-1].content)["amount"] == SINGLE_PRICE - 2_000_00  # paise, to the paisa
    ref = order["bookingRef"]
    assert (await booking(db, ref)).coupon_code == "SAVE10"

    # A hold is not a use.
    owner = await owner_cookie(db)
    listed = (await db_client.get("/admin/coupons", headers=owner)).json()["items"]
    assert (listed[0]["uses"], listed[0]["liveHolds"], listed[0]["locked"]) == (0, 1, True)

    body = event("payment.captured", order["orderId"], "pay_Coupon001", order["amountPaise"])
    assert (await deliver(db_client, body)).status_code == 200
    paid = await booking(db, ref)
    assert paid.paid_paise == SINGLE_PRICE - 2_000_00
    listed = (await db_client.get("/admin/coupons", headers=owner)).json()["items"]
    assert (listed[0]["uses"], listed[0]["liveHolds"]) == (1, 0)
    customer = next(m for m in sender.sent if m.to != "owner@example.com")
    assert "SAVE10 (−₹2,000)" in customer.text

    desk = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert desk["quote"]["coupon"] == {"code": "SAVE10", "offPaise": 2_000_00}
    rows = (await db_client.get("/admin/bookings", headers=owner)).json()["items"]
    assert rows[0]["couponCode"] == "SAVE10"

    # The same email again: refused at the hold, which is rate-limited. The unlimited quote does
    # not answer it, or it would say which addresses have a paid booking (B14 security pass).
    again = quote_body(dep_id, "SAVE10", email="C1@example.test")
    assert (await db_client.post("/bookings/quote", json=again)).status_code == 200
    res = await db_client.post("/bookings", json=hold_body(dep_id, "SAVE10", 1))
    assert refusal(res) == "coupon_used_by_email"
    # Another email may still use it.
    assert (
        await db_client.post("/bookings", json=hold_body(dep_id, "SAVE10", 2))
    ).status_code == 201


@pytest.mark.db
async def test_each_refusal_says_why(db: AsyncSession, db_client: AsyncClient) -> None:
    pkg, departure = await seeded(db, seats=4)
    dep_id = departure.id
    now = dt.datetime.now(dt.UTC)
    other = Package(
        slug="other-trip",
        name="Other",
        summary="x",
        themes=[],
        nights=1,
        days=2,
        destination_id=pkg.destination_id,
    )
    db.add(other)
    await db.commit()
    await add_coupon(db, code="PAUSED", active=False)
    await add_coupon(db, code="LATER", starts_at=now + dt.timedelta(days=3))
    await add_coupon(
        db, code="OLD", starts_at=now - dt.timedelta(days=9), ends_at=now - dt.timedelta(days=1)
    )
    await add_coupon(db, code="ELSEWHERE", all_packages=False, packages=[other])
    await add_coupon(db, code="BIGSPEND", min_paise=30_000_00)
    await add_coupon(db, code="ONCE", use_limit=1)
    await add_coupon(db, code="MINE", all_packages=False, packages=[pkg])
    db.add(
        Booking(
            ref="TB-USED01",
            package_id=pkg.id,
            departure_id=dep_id,
            hold_expires_at=now,
            contact_name="X Y",
            contact_phone="9999999999",
            contact_email="x@example.test",
            quote={},
            total_paise=1,
            paid_paise=1,
            coupon_code="ONCE",
        )
    )
    await db.commit()

    async def why(code: str) -> tuple[str, str]:
        res = await db_client.post("/bookings/quote", json=quote_body(dep_id, code))
        return refusal(res), res.json()["error"]["message"]

    assert (await why("NOPE"))[0] == "coupon_unknown"
    assert (await why("paused"))[0] == "coupon_unknown"  # a paused code does not exist
    reason, message = await why("LATER")
    starts = (now + dt.timedelta(days=3)).astimezone(IST).date()
    assert reason == "coupon_not_started" and str(starts.day) in message
    reason, message = await why("OLD")
    assert reason == "coupon_expired" and "expired on" in message
    assert (await why("ELSEWHERE"))[0] == "coupon_not_for_trip"
    reason, message = await why("BIGSPEND")
    assert reason == "coupon_below_minimum" and "₹30,000" in message
    assert (await why("ONCE"))[0] == "coupon_used_up"
    ok = await db_client.post("/bookings/quote", json=quote_body(dep_id, "MINE"))
    assert ok.status_code == 200 and ok.json()["coupon"]["code"] == "MINE"
    # No code, or a blank one: an ordinary quote.
    plain = await db_client.post("/bookings/quote", json=quote_body(dep_id, " "))
    assert plain.status_code == 200 and plain.json()["coupon"] is None


@pytest.mark.db
async def test_a_live_hold_reserves_the_last_use_and_an_abandoned_one_gives_it_back(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id
    await add_coupon(db, code="LAST", use_limit=1)

    first = await db_client.post("/bookings", json=hold_body(dep_id, "LAST", 1))
    assert first.status_code == 201, first.text
    second = await db_client.post("/bookings", json=hold_body(dep_id, "LAST", 2))
    assert refusal(second) == "coupon_used_up"
    # The holder's own re-quote still sees the code (their hold is theirs).
    mine = quote_body(dep_id, "LAST", email="c1@example.test")
    assert (await db_client.post("/bookings/quote", json=mine)).status_code == 200

    # The first checkout is abandoned: its hold lapses, nothing was used, the code is free.
    await db.execute(
        update(Booking)
        .where(Booking.ref == first.json()["bookingRef"])
        .values(hold_expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1))
    )
    await db.commit()
    await db.rollback()
    uses = (
        await db.execute(
            select(Booking).where(Booking.coupon_code == "LAST", Booking.paid_paise > 0)
        )
    ).all()
    assert uses == []
    third = await db_client.post("/bookings", json=hold_body(dep_id, "LAST", 3))
    assert third.status_code == 201, third.text


@pytest.mark.db
async def test_admin_create_edit_lock_pause_and_delete(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    pkg, departure = await seeded(db, seats=4)
    dep_id, pkg_id = departure.id, pkg.id
    owner = await owner_cookie(db)
    base = {
        "code": "diwali-25",
        "kind": "flat",
        "amountPaise": 500_00,
        "startsOn": dt.date.today().isoformat(),
        "useLimit": 5,
        "allPackages": False,
        "packageIds": [pkg_id],
    }
    assert (await db_client.post("/admin/coupons", json=base)).status_code == 401  # owner only
    created = await db_client.post("/admin/coupons", json=base, headers=owner)
    assert created.status_code == 201, created.text
    c = created.json()
    assert (c["code"], c["state"], c["locked"], c["packages"][0]["id"]) == (
        "DIWALI-25",
        "active",
        False,
        pkg_id,
    )
    cid = c["id"]

    dup = await db_client.post("/admin/coupons", json=base, headers=owner)
    assert dup.status_code == 409 and "code" in dup.json()["error"]["fieldErrors"]
    bad = await db_client.post(
        "/admin/coupons", json={**base, "code": "X", "capPaise": 10_00}, headers=owner
    )
    assert bad.status_code == 400
    mixed = await db_client.post(
        "/admin/coupons", json={**base, "code": "MIXED", "capPaise": 100_00}, headers=owner
    )
    assert mixed.status_code == 400 and "capPaise" in mixed.json()["error"]["fieldErrors"]
    none = await db_client.post(
        "/admin/coupons", json={**base, "code": "NONE", "packageIds": []}, headers=owner
    )
    assert none.status_code == 400 and "packageIds" in none.json()["error"]["fieldErrors"]

    # Unused: everything may change.
    edited = await db_client.put(
        f"/admin/coupons/{cid}", json={**base, "amountPaise": 700_00}, headers=owner
    )
    assert edited.status_code == 200 and edited.json()["amountPaise"] == 700_00

    # In use (a live hold): code / kind / amount lock; dates, limit, packages still move.
    assert (
        await db_client.post("/bookings", json=hold_body(dep_id, "DIWALI-25", 1))
    ).status_code == 201
    live = {**base, "amountPaise": 700_00}
    locked = await db_client.put(
        f"/admin/coupons/{cid}", json={**live, "amountPaise": 900_00}, headers=owner
    )
    assert locked.status_code == 409 and "amountPaise" in locked.json()["error"]["fieldErrors"]
    later = (dt.date.today() + dt.timedelta(days=30)).isoformat()
    ok = await db_client.put(
        f"/admin/coupons/{cid}", json={**live, "endsOn": later, "allPackages": True}, headers=owner
    )
    assert ok.status_code == 200 and ok.json()["endsOn"] == later and ok.json()["packages"] == []
    assert (await db_client.delete(f"/admin/coupons/{cid}", headers=owner)).status_code == 409

    paused = await db_client.post(
        f"/admin/coupons/{cid}/active", json={"active": False}, headers=owner
    )
    assert paused.status_code == 200 and paused.json()["state"] == "paused"
    q = await db_client.post("/bookings/quote", json=quote_body(dep_id, "DIWALI-25"))
    assert refusal(q) == "coupon_unknown"

    # An unused coupon can be deleted.
    spare = (
        await db_client.post("/admin/coupons", json={**base, "code": "SPARE"}, headers=owner)
    ).json()
    assert (
        await db_client.delete(f"/admin/coupons/{spare['id']}", headers=owner)
    ).status_code == 204
    assert (await db_client.get(f"/admin/coupons/{spare['id']}", headers=owner)).status_code == 404


@pytest.mark.db
async def test_the_limit_cannot_go_below_the_uses(db: AsyncSession, db_client: AsyncClient) -> None:
    pkg, departure = await seeded(db, seats=4)
    owner = await owner_cookie(db)
    c = await add_coupon(db, code="TWICE", use_limit=5)
    cid = c.id
    for i in range(2):
        db.add(
            Booking(
                ref=f"TB-TWICE{i}",
                package_id=pkg.id,
                departure_id=departure.id,
                hold_expires_at=dt.datetime.now(dt.UTC),
                contact_name="X Y",
                contact_phone="9999999999",
                contact_email=f"t{i}@example.test",
                quote={},
                total_paise=1,
                paid_paise=1,
                coupon_code="TWICE",
            )
        )
    await db.commit()
    body = {
        "code": "TWICE",
        "kind": "percent",
        "percent": 10,
        "startsOn": "2026-01-01",
        "useLimit": 1,
    }
    res = await db_client.put(f"/admin/coupons/{cid}", json=body, headers=owner)
    assert res.status_code == 400 and "useLimit" in res.json()["error"]["fieldErrors"]
    res = await db_client.put(f"/admin/coupons/{cid}", json={**body, "useLimit": 2}, headers=owner)
    assert res.status_code == 200 and res.json()["state"] == "used_up"


@pytest.mark.db
async def test_demo_coupon_seed_is_idempotent_and_restores_its_terms(db: AsyncSession) -> None:
    await seed_demo_coupon(db)
    await db.execute(update(Coupon).values(active=False, percent=50))
    await db.commit()
    await seed_demo_coupon(db)
    db.expire_all()
    [c] = (await db.execute(select(Coupon))).scalars().all()
    assert (c.code, c.percent, c.cap_paise, c.use_limit, c.active, c.all_packages) == (
        DEMO_COUPON,
        10,
        1_000_00,
        1_000,
        True,
        True,
    )
