"""P18a — counter booking (R56): the counter prices exactly like the website apart from the
manual discount (after the coupon, fare only, whole rupees, never below ₹1, reason required);
dates run to the departure day and the party to the seats left; paid now confirms with a receipt
and the usual emails, deposit now leaves the balance due; converting an enquiry marks it and
links it once; details can wait (lead's name, "Traveller N", adult ages empty) and be edited on
the desk; customers are found by phone, email or name; the desk filters and exports by channel.
Unit tests need nothing; the rest need TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Booking, BookingEvent, BookingTraveller, Departure, Enquiry, EnquiryNote
from app.models.enums import BookingChannel, BookingStatus, EnquiryStatus, Occupancy
from app.services.analytics import ist_today
from app.services.booking.pricing import apply_manual, manual_off
from tests.razorpay_fake import FakeRazorpay
from tests.test_addons import addon_ids, with_addons
from tests.test_admin_enquiries import make_enquiry
from tests.test_booking_orders import SOON, seeded
from tests.test_booking_payments import booking_body, rzp
from tests.test_booking_pricing import quote
from tests.test_booking_webhook import mailing
from tests.test_bookings_desk import owner_cookie
from tests.test_coupons import add_coupon

__all__ = ["rzp"]

CUSTOMER = {"name": "Priya Nair", "phone": "9845011223", "email": "priya.nair@customer.in"}
MANUAL = {"mode": "inr", "value": 2000, "reason": "Repeat customer, 2024 Goa trip"}


# --- units ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("fare", "mode", "value", "off"),
    [
        (40_000_00, "inr", 2_000, 2_000_00),
        (40_000_00, "percent", 5, 2_000_00),
        (39_999_00, "percent", 5, 1_999_00),  # ₹1,999.95 → rounded down to the rupee
        (40_000_00, "inr", 50_000, 39_999_00),  # never below ₹1
        (40_000_00, "percent", 100, 39_999_00),
        (1_00, "inr", 5, 0),  # no room
    ],
)
def test_the_manual_discount_is_whole_rupees_and_leaves_at_least_one(
    fare: int, mode: str, value: int, off: int
) -> None:
    assert manual_off(fare, mode=mode, value=value) == off


def test_the_manual_discount_joins_the_discount_and_never_touches_add_ons() -> None:
    q = quote([Occupancy.DOUBLE, Occupancy.DOUBLE])
    q = q.model_copy(update={"addons_paise": 1_800_00, "total_paise": q.total_paise + 1_800_00})
    fare = q.fare_paise
    after = apply_manual(q, mode="percent", value=10, reason="Returning family")
    assert after.manual is not None
    assert after.manual.off_paise == fare * 10 // 100 // 100 * 100
    assert after.manual.percent == 10 and after.manual.reason == "Returning family"
    assert after.discount_paise == q.discount_paise + after.manual.off_paise
    assert after.total_paise == q.total_paise - after.manual.off_paise
    assert after.addons_paise == 1_800_00
    tiny = q.model_copy(update={"total_paise": 1_00 + q.addons_paise})
    with pytest.raises(ApiError) as refused:
        apply_manual(tiny, mode="inr", value=100, reason="Too much")
    assert refused.value.reason == "manual_no_room"


# --- helpers ------------------------------------------------------------------------------------


def party(n_double: int = 2, *, child: int | None = None) -> list[dict[str, Any]]:
    people: list[dict[str, Any]] = [{"occupancy": "double"} for _ in range(n_double)]
    if child is not None:
        people.append({"occupancy": "child", "age": child})
    return people


def counter_body(departure_id: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "departureId": departure_id,
        "travellers": party(),
        "contact": {**CUSTOMER, "state": "Kerala"},
        "channel": "phone",
        "settle": "paid",
        "method": "upi",
        "reference": "4271 9953 0187",
        "expectedTotalPaise": 1,  # `post_booking` puts the quoted total here
    }
    return body | overrides


QUOTE_KEYS = ("departureId", "travellers", "couponCode", "addons", "manual")


async def post_booking(client: AsyncClient, owner: dict[str, str], body: dict[str, Any]) -> Any:
    """Book as the page does: quote the draft first and send the total the receipt showed."""
    ask = {k: body[k] for k in QUOTE_KEYS if k in body} | {"email": body["contact"]["email"]}
    ask["travellers"] = [
        {k: v for k, v in t.items() if k in ("occupancy", "age") and v is not None}
        for t in body["travellers"]
    ]
    quoted = await client.post("/admin/counter/quote", json=ask, headers=owner)
    total = quoted.json()["totalPaise"] if quoted.status_code == 200 else 1
    return await client.post(
        "/admin/counter/bookings", json={**body, "expectedTotalPaise": total}, headers=owner
    )


async def book(client: AsyncClient, owner: dict[str, str], body: dict[str, Any]) -> Any:
    res = await post_booking(client, owner, body)
    assert res.status_code == 201, res.text
    return res.json()


async def events(db: AsyncSession, ref: str) -> list[BookingEvent]:
    db.expire_all()
    b = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    return list(
        (
            await db.execute(
                select(BookingEvent)
                .where(BookingEvent.booking_id == b.id)
                .order_by(BookingEvent.id)
            )
        ).scalars()
    )


# --- the quote -----------------------------------------------------------------------------------


@pytest.mark.db
async def test_counter_and_web_quote_the_same_party_identically_apart_from_the_manual_discount(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    pkg, _ = await seeded(db, seats=12)
    pkg_id = pkg.id
    dep_id = await later_date(db, pkg_id)  # 37 days out: a deposit is on offer
    await with_addons(db, pkg_id)
    ids = await addon_ids(db, pkg_id)
    await add_coupon(db)
    owner = await owner_cookie(db)
    common = {
        "departureId": dep_id,
        "travellers": party(child=8),
        "couponCode": "save10",
        "email": CUSTOMER["email"],
        "addons": [
            {"addonId": ids["Airport transfers"]},
            {"addonId": ids["Rafting"], "travellers": 2},
        ],
    }
    web = await db_client.post("/bookings/quote", json=common)
    assert web.status_code == 200, web.text
    counter = await db_client.post("/admin/counter/quote", json=common, headers=owner)
    assert counter.status_code == 200, counter.text
    w, c = web.json(), counter.json()
    assert c["manual"] is None
    assert {k: v for k, v in c.items() if k != "ladder"} == {
        k: v for k, v in w.items() if k != "ladder"
    }

    manual = await db_client.post(
        "/admin/counter/quote", json={**common, "manual": MANUAL}, headers=owner
    )
    assert manual.status_code == 200, manual.text
    m = manual.json()
    assert m["manual"] == {"offPaise": 2_000_00, "percent": None, "reason": MANUAL["reason"]}
    assert m["totalPaise"] == w["totalPaise"] - 2_000_00
    assert m["discountPaise"] == w["discountPaise"] + 2_000_00
    assert m["addonsPaise"] == w["addonsPaise"] and m["coupon"] == w["coupon"]
    assert m["deposit"]["amountPaise"] == -(-m["totalPaise"] * 25 // 10_000) * 100

    early = await db_client.post(  # priced before its reason is typed; booking needs one
        "/admin/counter/quote", json={**common, "manual": {**MANUAL, "reason": ""}}, headers=owner
    )
    assert early.status_code == 200 and early.json()["totalPaise"] == m["totalPaise"]
    over = await db_client.post(
        "/admin/counter/quote",
        json={**common, "manual": {**MANUAL, "mode": "percent", "value": 101}},
        headers=owner,
    )
    assert over.status_code == 400
    assert any(k.startswith("manual") for k in over.json()["error"]["fieldErrors"])
    assert (await db_client.post("/admin/counter/quote", json=common)).status_code == 401


@pytest.mark.db
async def test_the_counter_books_to_the_departure_day_and_caps_the_party_by_seats(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    pkg, dep = await seeded(db, seats=14)
    await db.execute(
        update(Departure).where(Departure.id == dep.id).values(date=ist_today())
    )  # departs today: the web says too soon, the counter still books it
    await db.commit()
    owner = await owner_cookie(db)
    body = {"departureId": dep.id, "travellers": party(14)}  # more than the web's 12
    web = await db_client.post("/bookings/quote", json={**body, "travellers": party(2)})
    assert web.status_code == 409 and web.json()["error"]["reason"] == "too_soon"
    res = await db_client.post("/admin/counter/quote", json=body, headers=owner)
    assert res.status_code == 200, res.text
    assert res.json()["seatsLeft"] == 14 and res.json()["deposit"] is None  # due day passed

    over = await db_client.post(
        "/admin/counter/quote", json={**body, "travellers": party(16)}, headers=owner
    )
    assert over.status_code == 409 and over.json()["error"]["reason"] == "sold_out"
    assert "Only 14 seats left" in over.json()["error"]["message"]

    await db.execute(
        update(Departure)
        .where(Departure.id == dep.id)
        .values(date=ist_today() - dt.timedelta(days=1))
    )
    await db.commit()
    gone = await db_client.post("/admin/counter/quote", json=body, headers=owner)
    assert gone.status_code == 409 and "already departed" in gone.json()["error"]["message"]


# --- book and settle -----------------------------------------------------------------------------


@pytest.mark.db
async def test_paid_now_confirms_with_a_receipt_the_voucher_and_the_usual_emails(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender = mailing(db_app)
    pkg, dep = await seeded(db, seats=6)
    dep_id = dep.id
    owner = await owner_cookie(db)

    missing = await db_client.post(
        "/admin/counter/bookings", json=counter_body(dep_id, reference=None), headers=owner
    )
    assert missing.status_code == 400
    assert "UTR" in missing.json()["error"]["fieldErrors"]["reference"]
    no_reason = await db_client.post(
        "/admin/counter/bookings",
        json=counter_body(dep_id, manual={**MANUAL, "reason": " "}),
        headers=owner,
    )
    assert no_reason.status_code == 400
    assert "reason" in str(no_reason.json()["error"]["fieldErrors"])

    body = await book(db_client, owner, counter_body(dep_id, manual=MANUAL))
    assert body["status"] == "confirmed"
    assert body["paidPaise"] == body["totalPaise"]
    assert body["channel"] == "phone" and body["createdBy"] == "Meera Nair"
    assert body["quote"]["manual"]["offPaise"] == 2_000_00
    assert [d["kind"] for d in body["documents"]] == ["receipt", "invoice"]
    assert body["payments"][0]["provider"] == "offline"
    assert body["payments"][0]["reference"] == "UPI · 4271 9953 0187"
    assert [t["name"] for t in body["travellers"]] == ["Priya Nair", "Traveller 2"]
    assert [t["age"] for t in body["travellers"]] == [None, None]
    assert body["canEditTravellers"] is True

    kinds = [e.kind for e in await events(db, body["ref"])]
    assert kinds[:3] == ["booked.counter", "discount.manual", "payment.offline"]
    history = await events(db, body["ref"])
    assert "channel Phone" in history[0].text and "manual discount −₹2,000" in history[0].text
    assert "Repeat customer" in history[1].text and history[1].actor_user_id is not None

    to_customer = [m for m in sender.sent if m.to == CUSTOMER["email"]]
    assert len(to_customer) == 1 and "Discount:    −₹2,000 · Repeat customer" in to_customer[0].text
    assert any(a.filename.endswith(".pdf") for a in to_customer[0].attachments)

    listed = (await db_client.get("/admin/bookings?channel=phone", headers=owner)).json()
    assert [r["ref"] for r in listed["items"]] == [body["ref"]]
    assert listed["items"][0]["channel"] == "phone"
    assert (await db_client.get("/admin/bookings?channel=web", headers=owner)).json()["total"] == 0
    csv = (await db_client.get("/admin/bookings.csv", headers=owner)).text
    header, line = csv.splitlines()[:2]
    assert header.endswith(',"Channel"') and line.endswith(',"Phone"')


@pytest.mark.db
async def test_deposit_now_leaves_the_balance_due_as_on_the_website(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    pkg, _ = await seeded(db, seats=6)
    far = (
        await db.execute(
            select(Departure).where(
                Departure.package_id == pkg.id, Departure.date == SOON + dt.timedelta(days=7)
            )
        )
    ).scalar_one()
    owner = await owner_cookie(db)
    body = await book(
        db_client,
        owner,
        counter_body(far.id, settle="deposit", method="cash", reference=None, channel="walk_in"),
    )
    assert body["status"] == "partially_paid"
    deposit = body["quote"]["deposit"]
    assert body["paidPaise"] == deposit["amountPaise"] == body["balance"]["depositPaise"]
    assert body["balance"]["dueOn"] == deposit["dueOn"]
    assert body["payments"][0]["reference"] == "Cash"
    assert [d["kind"] for d in body["documents"]] == ["receipt"]

    near = await post_booking(
        db_client,
        owner,
        counter_body(
            (await seeded_near(db, pkg.id)), settle="deposit", method="cash", reference=None
        ),
    )
    assert near.status_code == 409 and near.json()["error"]["reason"] == "deposit_unavailable"


async def later_date(db: AsyncSession, package_id: str) -> str:
    return (
        await db.execute(
            select(Departure.id).where(
                Departure.package_id == package_id, Departure.date == SOON + dt.timedelta(days=7)
            )
        )
    ).scalar_one()


async def seeded_near(db: AsyncSession, package_id: str) -> str:
    """The package's cheap date, 30 days out: the balance would already be due."""
    return (
        await db.execute(
            select(Departure.id).where(Departure.package_id == package_id, Departure.date == SOON)
        )
    ).scalar_one()


@pytest.mark.db
async def test_converting_an_enquiry_marks_it_links_it_and_only_once(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, dep = await seeded(db, seats=6)
    dep_id = dep.id
    enquiry = await make_enquiry(
        db, ref="TS-8KQ2MN", follow_up_on=ist_today(), status=EnquiryStatus.CONTACTED
    )
    enquiry_id = enquiry.id
    await db.commit()
    owner = await owner_cookie(db)
    body = await book(
        db_client, owner, counter_body(dep_id, channel="enquiry", enquiryId=enquiry_id)
    )
    assert body["enquiry"] == {"id": enquiry_id, "ref": "TS-8KQ2MN"}
    assert body["channel"] == "enquiry"
    db.expire_all()
    row = (await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id))).scalar_one()
    assert row.status == EnquiryStatus.CONVERTED and row.follow_up_on is None
    note = (
        await db.execute(select(EnquiryNote.body).where(EnquiryNote.enquiry_id == enquiry_id))
    ).scalar_one()
    assert note == f"Converted to booking {body['ref']}"
    assert "enquiry.converted" in [e.kind for e in await events(db, body["ref"])]

    again = await post_booking(
        db_client, owner, counter_body(dep_id, channel="enquiry", enquiryId=enquiry_id)
    )
    assert again.status_code == 409
    assert again.json()["error"]["reason"] == "already_converted"
    assert body["ref"] in again.json()["error"]["message"]
    count = (await db.execute(select(Booking.id).where(Booking.enquiry_id == enquiry_id))).all()
    assert len(count) == 1


# --- details later -------------------------------------------------------------------------------


@pytest.mark.db
async def test_details_can_wait_and_the_desk_fills_them_in(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, dep = await seeded(db, seats=6)
    dep_id = dep.id
    owner = await owner_cookie(db)
    no_age = await db_client.post(
        "/admin/counter/bookings",
        json=counter_body(dep_id, travellers=[*party(), {"occupancy": "child"}]),
        headers=owner,
    )
    assert no_age.status_code == 400 and "child's age" in no_age.text

    body = await book(db_client, owner, counter_body(dep_id, travellers=party(child=7)))
    ref = body["ref"]
    assert [t["age"] for t in body["travellers"]] == [None, None, 7]
    url = f"/admin/bookings/{ref}/travellers"
    wrong = await db_client.put(
        url, json={"travellers": [{"name": "Priya Nair", "age": 34}]}, headers=owner
    )
    assert wrong.status_code == 400 and "3 travellers" in wrong.text
    child_age = await db_client.put(
        url,
        json={
            "travellers": [
                {"name": "Priya Nair", "age": 34},
                {"name": "Arun Nair", "age": None},
                {"name": "Meenu Nair", "age": 14},
            ]
        },
        headers=owner,
    )
    assert child_age.status_code == 400
    assert "travellers.2.age" in child_age.json()["error"]["fieldErrors"]
    ok = await db_client.put(
        url,
        json={
            "travellers": [
                {"name": "Priya Nair", "age": 34},
                {"name": "Arun Nair", "age": 36},
                {"name": "Meenu Nair", "age": 7},
            ]
        },
        headers=owner,
    )
    assert ok.status_code == 200, ok.text
    assert [(t["name"], t["age"]) for t in ok.json()["travellers"]] == [
        ("Priya Nair", 34),
        ("Arun Nair", 36),
        ("Meenu Nair", 7),
    ]
    updated = [e for e in await events(db, ref) if e.kind == "travellers.updated"]
    assert len(updated) == 1 and "3 travellers changed" in updated[0].text
    rows = (
        await db.execute(
            select(BookingTraveller.occupancy)
            .join(Booking, Booking.id == BookingTraveller.booking_id)
            .where(Booking.ref == ref)
            .order_by(BookingTraveller.position)
        )
    ).scalars()
    assert [o.value for o in rows] == ["double", "double", "child"]  # rooms as booked
    voucher = await db_client.get(f"/admin/bookings/{ref}", headers=owner)
    assert voucher.status_code == 200


# --- customers -----------------------------------------------------------------------------------


@pytest.mark.db
async def test_customers_are_found_by_phone_email_or_name_with_their_trips(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, dep = await seeded(db, seats=8)
    dep_id = dep.id
    owner = await owner_cookie(db)
    first = await book(db_client, owner, counter_body(dep_id))
    web = await db_client.post(
        "/bookings",
        json=booking_body(dep_id, 1, email="rahul@customer.in", phone="9000000077"),
    )
    assert web.status_code == 201
    await make_enquiry(
        db, ref="TS-ENQ001", name="Priyanka Iyer", email="Priyanka@Customer.in", phone="9811122233"
    )
    await db.commit()

    async def search(q: str) -> list[dict[str, Any]]:
        res = await db_client.get("/admin/customers", params={"q": q}, headers=owner)
        assert res.status_code == 200, res.text
        return res.json()["items"]

    by_phone = await search("+91 98450 11223")
    assert [c["email"] for c in by_phone] == [CUSTOMER["email"]]
    assert by_phone[0]["state"] == "Kerala" and by_phone[0]["tripCount"] == 1
    assert by_phone[0]["trips"][0]["ref"] == first["ref"]
    assert by_phone[0]["hasAccount"] is False
    by_name = await search("priya")
    assert [c["email"] for c in by_name] == [CUSTOMER["email"], "priyanka@customer.in"]
    assert by_name[1]["trips"] == [] and by_name[1]["tripCount"] == 0
    assert [c["email"] for c in await search("rahul@")] == ["rahul@customer.in"]
    assert await search("p") == []
    assert (await db_client.get("/admin/customers?q=priya")).status_code == 401


@pytest.mark.db
async def test_web_bookings_read_as_web(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, dep = await seeded(db, seats=4)
    res = await db_client.post(
        "/bookings", json=booking_body(dep.id, 1, email="w@customer.in", phone="9000000088")
    )
    assert res.status_code == 201
    b = (
        await db.execute(select(Booking).where(Booking.ref == res.json()["bookingRef"]))
    ).scalar_one()
    assert b.channel == BookingChannel.WEB and b.created_by_user_id is None
    assert b.status == BookingStatus.PENDING


@pytest.mark.db
async def test_a_price_that_moved_since_the_receipt_is_refused_and_nothing_is_recorded(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, dep = await seeded(db, seats=6)
    dep_id = dep.id
    owner = await owner_cookie(db)
    stale = await db_client.post(
        "/admin/counter/bookings",
        json=counter_body(dep_id, expectedTotalPaise=39_000_00),  # the receipt the owner saw
        headers=owner,
    )
    assert stale.status_code == 409 and stale.json()["error"]["reason"] == "price_changed"
    assert "₹39,000" in stale.json()["error"]["message"]
    assert (await db.execute(select(Booking.id))).first() is None


@pytest.mark.db
async def test_an_enquiry_marked_won_by_hand_still_converts_and_links(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, dep = await seeded(db, seats=6)
    dep_id = dep.id
    won = await make_enquiry(db, ref="TS-WON001", status=EnquiryStatus.CONVERTED)
    won_id = won.id
    await db.commit()
    owner = await owner_cookie(db)
    body = await book(db_client, owner, counter_body(dep_id, channel="phone", enquiryId=won_id))
    assert body["enquiry"]["ref"] == "TS-WON001"
    assert body["channel"] == "enquiry"  # a converted enquiry is always the enquiry channel

    no_enquiry = await db_client.post(
        "/admin/counter/bookings", json=counter_body(dep_id, channel="enquiry"), headers=owner
    )
    assert no_enquiry.status_code == 400
    punctuation = await db_client.get("/admin/customers", params={"q": "()"}, headers=owner)
    assert punctuation.json()["items"] == []  # not "every phone number"
