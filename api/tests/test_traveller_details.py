"""P9 — traveller details and the pre-trip checklist (R49): the per-traveller cards after
payment, the masked ID (encrypted at rest), the lock 3 days before departure, the readiness
parts, the checklist ticks, the purge 30 days after the trip, and a party change keeping the
details that still match. The db tests need TEST_DATABASE_URL."""

import datetime as dt
import json

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import (
    Booking,
    BookingEvent,
    BookingTraveller,
    Departure,
    Package,
    TravellerDetail,
)
from app.models.enums import BookingStatus, IdType, Occupancy
from app.services.analytics import ist_today
from app.services.booking import details, id_numbers
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_auth import with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_customer_accounts import EMAIL, signed_in

__all__ = ["rzp"]

KEY = Fernet.generate_key().decode()
AADHAAR = "0000 0000 4821"
PARTY = [
    {"name": "Asha Rao", "age": 34, "occupancy": "double"},
    {"name": "Vikram Rao", "age": 36, "occupancy": "double"},
    {"name": "Mira Rao", "age": 8, "occupancy": "child"},
]


# --- pure ---------------------------------------------------------------------------------------


def test_numbers_are_checked_by_shape_only_and_normalised() -> None:
    assert id_numbers.check(IdType.AADHAAR, "0000-0000 4821") == "000000004821"
    assert id_numbers.check(IdType.PASSPORT, " a1234567 ") == "A1234567"
    assert id_numbers.check(IdType.VOTER_ID, "abc 1234567") == "ABC1234567"
    assert id_numbers.check(IdType.DRIVING_LICENCE, "KA01 20190012345") == "KA0120190012345"
    for kind, bad in (
        (IdType.AADHAAR, "1234 5678 901"),
        (IdType.PASSPORT, "12345678"),
        (IdType.VOTER_ID, "AB12345678"),
        (IdType.DRIVING_LICENCE, "KA01"),
    ):
        with pytest.raises(ValueError):
            id_numbers.check(kind, bad)


def test_the_mask_shows_the_last_four_only() -> None:
    assert id_numbers.masked(IdType.AADHAAR, "4821") == "XXXX XXXX 4821"
    assert id_numbers.masked(IdType.PASSPORT, "7730") == "XXXX 7730"
    assert id_numbers.spaced(IdType.AADHAAR, "000000004821") == "0000 0000 4821"


def test_sealed_numbers_open_with_any_listed_key_and_never_without_one() -> None:
    old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    sealed = id_numbers.seal(make_settings(id_number_key=old), "000000004821")
    assert sealed.last4 == "4821" and "4821" not in sealed.enc
    rotated = make_settings(id_number_key=f"{new}, {old}")
    assert id_numbers.reveal(rotated, sealed.enc) == "000000004821"
    assert id_numbers.reveal(make_settings(id_number_key=new), sealed.enc) is None
    assert id_numbers.reveal(make_settings(), sealed.enc) is None
    with pytest.raises(ApiError) as e:
        id_numbers.seal(make_settings(), "000000004821")
    assert e.value.status == 503 and e.value.reason == "id_key_missing"


def test_the_form_state_follows_payment_the_lock_and_the_trip() -> None:
    dep = dt.date(2026, 11, 13)
    back = dep + dt.timedelta(days=4)
    s = details.state_of
    assert details.locks_on(dep) == dt.date(2026, 11, 10)
    assert s(BookingStatus.PENDING, dep, back, dt.date(2026, 10, 1)) == "not_yet"
    assert s(BookingStatus.PARTIALLY_PAID, dep, back, dt.date(2026, 11, 9)) == "open"
    assert s(BookingStatus.CONFIRMED, dep, back, dt.date(2026, 11, 10)) == "locked"
    assert s(BookingStatus.COMPLETED, dep, back, dt.date(2026, 11, 20)) == "closed"
    assert s(BookingStatus.CANCELLED, dep, back, dt.date(2026, 10, 1)) == "closed"


def test_age_on_counts_birthdays() -> None:
    assert details.age_on(dt.date(2018, 2, 19), dt.date(2026, 2, 18)) == 7
    assert details.age_on(dt.date(2018, 2, 19), dt.date(2026, 2, 19)) == 8


# --- db -----------------------------------------------------------------------------------------


async def booked(
    db: AsyncSession, db_app: FastAPI, client: AsyncClient, *, pay: bool = True
) -> tuple[str, str, Departure]:
    """A paid three-person booking (2 adults, 1 child) for EMAIL; ref, sign-in token, date."""
    with_webhook_secret(db_app)
    mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        # Demo-mode email, so sign-in hands back its code (as test_my_trips does).
        update={"id_number_key": SecretStr(KEY), "email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    _, departure = await seeded(db, seats=8)
    res = await client.post(
        "/bookings",
        json={
            "departureId": departure.id,
            "travellers": PARTY,
            "contact": {"name": "Asha Rao", "phone": "9000000081", "email": EMAIL},
        },
    )
    assert res.status_code == 201, res.text
    order = res.json()
    if pay:
        body = event("payment.captured", order["orderId"], "pay_P9Trip0001", order["amountPaise"])
        assert (await deliver(client, body)).json() == {"status": "captured"}
    return order["bookingRef"], await signed_in(client), departure


async def detail(client: AsyncClient, ref: str, token: str) -> dict:
    res = await client.get(f"/account/bookings/{ref}", headers=with_cookie(token))
    assert res.status_code == 200, res.text
    return res.json()


def card_body(name: str, **fields: object) -> dict[str, object]:
    return {"name": name, **fields}


FULL = {
    "idType": "aadhaar",
    "idNumber": AADHAAR,
    "emergencyName": "Sunita Rao",
    "emergencyRelation": "mother",
    "emergencyPhone": "+91 98450 12763",
    "food": "veg",
}


async def save(client: AsyncClient, ref: str, token: str, tid: str, body: dict) -> object:
    return await client.put(
        f"/account/bookings/{ref}/travellers/{tid}/details",
        json=body,
        headers=with_cookie(token),
    )


@pytest.mark.db
async def test_a_paid_booking_opens_a_card_per_traveller_and_readiness_counts_them(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    b = await detail(db_client, ref, token)
    d = b["details"]
    assert d["state"] == "open" and d["purged"] is False
    assert d["locksOn"] == (departure.date - dt.timedelta(days=3)).isoformat()
    assert d["required"] == ["id", "emergency", "food"] and d["complete"] == 0
    assert [t["name"] for t in d["travellers"]] == ["Asha Rao", "Vikram Rao", "Mira Rao"]
    assert all(t["missing"] == ["id", "emergency", "food"] for t in d["travellers"])
    r = b["readiness"]
    assert [p["key"] for p in r["parts"]] == ["details", "balance"]
    assert r["parts"][1]["done"] is True and r["percent"] == 50
    assert b["checklist"] == []


@pytest.mark.db
async def test_saving_a_card_masks_the_id_everywhere_and_encrypts_it_at_rest(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, _ = await booked(db, db_app, db_client)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][2]["travellerId"]

    res = await save(db_client, ref, token, tid, card_body("Mira Rao", **FULL))
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["complete"] is True and out["missing"] == []
    assert out["idMasked"] == "XXXX XXXX 4821" and out["emergencyPhone"] == "9845012763"
    assert "idNumber" not in out

    b = await detail(db_client, ref, token)
    page = json.dumps(b)
    assert "000000004821" not in page and AADHAAR not in page
    assert b["details"]["complete"] == 1 and b["readiness"]["percent"] == round(
        (1 / 3 + 1) / 2 * 100
    )
    assert any("Aadhaar ending 4821" in a["text"] for a in b["activity"])

    await db.rollback()
    row = (await db.execute(select(TravellerDetail))).scalar_one()
    assert row.id_last4 == "4821" and row.id_number_enc and "4821" not in row.id_number_enc
    settings = db_app.state.settings
    assert id_numbers.reveal(settings, row.id_number_enc) == "000000004821"
    events = (await db.execute(select(BookingEvent.text, BookingEvent.after))).all()
    assert not any("000000004821" in f"{t} {a}" for t, a in events)

    # Blank keeps the saved number; a new type needs a number; a bad shape names the field.
    keep = {**FULL, "idNumber": None, "food": "jain"}
    res = await save(db_client, ref, token, tid, card_body("Mira Rao", **keep))
    assert res.status_code == 200 and res.json()["idMasked"] == "XXXX XXXX 4821"
    res = await save(
        db_client, ref, token, tid, card_body("Mira Rao", **{**keep, "idType": "passport"})
    )
    assert res.status_code == 400 and res.json()["error"]["fieldErrors"] == {
        "idNumber": "Enter the ID number"
    }
    res = await save(
        db_client, ref, token, tid, card_body("Mira Rao", **{**FULL, "idNumber": "1234"})
    )
    assert res.status_code == 400 and "idNumber" in res.json()["error"]["fieldErrors"]


@pytest.mark.db
async def test_the_date_of_birth_must_fit_the_rate_booked(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    cards = (await detail(db_client, ref, token))["details"]["travellers"]
    child, adult = cards[2]["travellerId"], cards[0]["travellerId"]
    grown = (departure.date - dt.timedelta(days=365 * 20)).isoformat()
    res = await save(db_client, ref, token, child, card_body("Mira Rao", dob=grown))
    assert res.status_code == 400 and "child rate" in res.json()["error"]["fieldErrors"]["dob"]
    res = await save(db_client, ref, token, adult, card_body("Asha Rao", dob="2019-01-01"))
    assert res.status_code == 400 and "adult" in res.json()["error"]["fieldErrors"]["dob"]
    res = await save(db_client, ref, token, child, card_body("Mira Rao", dob="2018-02-19"))
    assert res.status_code == 200, res.text

    # A counter booking's empty age is filled from the date of birth; the rename sticks.
    await db.execute(update(BookingTraveller).where(BookingTraveller.id == adult).values(age=None))
    await db.commit()
    res = await save(db_client, ref, token, adult, card_body("Asha R. Rao", dob="1992-03-12"))
    assert res.status_code == 200 and res.json()["name"] == "Asha R. Rao"
    assert res.json()["age"] == details.age_on(dt.date(1992, 3, 12), departure.date)


@pytest.mark.db
async def test_the_form_locks_three_days_out_and_needs_a_paid_booking_of_your_own(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][0]["travellerId"]

    other = await signed_in(db_client, "ravi@example.test")
    res = await save(db_client, ref, other, tid, card_body("Asha Rao", **FULL))
    assert res.status_code == 404
    res = await save(db_client, ref, token, "nosuchtraveller", card_body("Asha Rao", **FULL))
    assert res.status_code == 404

    await db.execute(
        update(Departure)
        .where(Departure.id == departure.id)
        .values(date=ist_today() + dt.timedelta(days=3))
    )
    await db.commit()
    res = await save(db_client, ref, token, tid, card_body("Asha Rao", **FULL))
    assert res.status_code == 409 and res.json()["error"]["reason"] == "locked"
    assert (await detail(db_client, ref, token))["details"]["state"] == "locked"

    await db.execute(
        update(Departure)
        .where(Departure.id == departure.id)
        .values(date=ist_today() + dt.timedelta(days=4))
    )
    await db.execute(update(Booking).values(status=BookingStatus.PENDING))
    await db.commit()
    res = await save(db_client, ref, token, tid, card_body("Asha Rao", **FULL))
    assert res.status_code == 409 and res.json()["error"]["reason"] == "not_paid"


@pytest.mark.db
async def test_checklist_ticks_and_required_fields_come_from_the_package(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, _ = await booked(db, db_app, db_client)
    await db.execute(
        update(Package).values(
            details_required=["food"],
            checklist=[
                {"key": "rain", "label": "A light rain jacket each", "note": "Evening showers"},
                {"key": "cash", "label": "Carry ₹2,000 in cash", "note": ""},
            ],
        )
    )
    await db.commit()
    b = await detail(db_client, ref, token)
    assert b["details"]["required"] == ["food"]
    assert [i["key"] for i in b["checklist"]] == ["rain", "cash"]
    assert [p["key"] for p in b["readiness"]["parts"]] == [
        "details",
        "balance",
        "item:rain",
        "item:cash",
    ]
    assert b["readiness"]["percent"] == 25

    res = await db_client.put(
        f"/account/bookings/{ref}/checklist/rain", json={"done": True}, headers=with_cookie(token)
    )
    assert res.status_code == 204, res.text
    res = await db_client.put(
        f"/account/bookings/{ref}/checklist/nope", json={"done": True}, headers=with_cookie(token)
    )
    assert res.status_code == 404
    b = await detail(db_client, ref, token)
    assert [i["done"] for i in b["checklist"]] == [True, False] and b["readiness"]["percent"] == 50

    for t in b["details"]["travellers"]:
        res = await save(
            db_client, ref, token, t["travellerId"], card_body(t["name"], food="vegan")
        )
        assert res.status_code == 200
    b = await detail(db_client, ref, token)
    assert b["details"]["complete"] == 3 and b["readiness"]["percent"] == 75


@pytest.mark.db
async def test_the_daily_tidy_deletes_details_thirty_days_after_the_trip(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][0]["travellerId"]
    assert (
        await save(db_client, ref, token, tid, card_body("Asha Rao", **FULL))
    ).status_code == 200
    nights = (await db.execute(select(Package.nights))).scalar_one()
    dep_id = departure.id  # purge's rollback expires loaded rows
    today = ist_today()

    # Back 29 days ago: kept. 30: deleted, with one history entry the customer sees.
    back = today - dt.timedelta(days=29)
    await db.execute(
        update(Departure)
        .where(Departure.id == dep_id)
        .values(date=back - dt.timedelta(days=nights))
    )
    await db.commit()
    assert await details.purge(db, today=today) == 0
    await db.execute(
        update(Departure)
        .where(Departure.id == dep_id)
        .values(date=back - dt.timedelta(days=nights + 1))
    )
    await db.commit()
    assert await details.purge(db, today=today) == 1
    assert (await db.execute(select(TravellerDetail))).first() is None
    assert await details.purge(db, today=today) == 0

    b = await detail(db_client, ref, token)
    assert b["details"]["purged"] is True and b["details"]["state"] == "closed"
    assert any(a["text"].startswith("Traveller details deleted") for a in b["activity"])


@pytest.mark.db
async def test_a_party_change_keeps_the_details_of_travellers_with_the_same_name(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, _ = await booked(db, db_app, db_client)
    cards = (await detail(db_client, ref, token))["details"]["travellers"]
    for t in cards[:2]:
        res = await save(db_client, ref, token, t["travellerId"], card_body(t["name"], **FULL))
        assert res.status_code == 200
    await db.rollback()
    booking_id = (await db.execute(select(Booking.id))).scalar_one()

    kept = await details.carry_over(db, booking_id)
    assert set(kept) == {"asha rao", "vikram rao"}
    await db.execute(delete(BookingTraveller).where(BookingTraveller.booking_id == booking_id))
    new = [
        BookingTraveller(
            booking_id=booking_id, name="Vikram Rao", age=36, occupancy=Occupancy.SINGLE, position=0
        )
    ]
    db.add_all(new)
    await db.flush()
    details.reattach(db, booking_id, kept, new)
    await db.commit()
    row = (await db.execute(select(TravellerDetail))).scalar_one()
    assert row.traveller_id == new[0].id and row.id_last4 == "4821"
