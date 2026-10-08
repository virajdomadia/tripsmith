"""P9b — the owner's side of R49: Package editor B's required fields and checklist, the desk's
"details missing" flag and Ready %, the booking detail (masked) with the owner's edit past the
lock, the printable manifest (the one place an ID number is shown in full), the CSV (never an
ID), readiness per departure, and the Send details link email. The db tests need
TEST_DATABASE_URL."""

import datetime as dt
import json

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BookingEvent, Departure, Package
from app.schemas.details import TravellerDetailsSettingsInput
from app.services.analytics import ist_today
from app.services.booking import details
from app.services.catalog import admin_packages as svc
from tests.razorpay_fake import FakeRazorpay
from tests.test_admin_packages import goa_id, never_published, payload, revalidated, seeded
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import OWNER_INBOX
from tests.test_bookings_desk import owner_cookie
from tests.test_traveller_details import FULL, booked, card_body, detail, save

__all__ = ["revalidated", "rzp"]


# --- pure ---------------------------------------------------------------------------------------


def test_settings_keep_keys_order_fields_and_make_new_keys_from_labels() -> None:
    pkg = Package(details_required=["id", "emergency", "food"], checklist=[])
    details.apply_details_settings(
        pkg,
        TravellerDetailsSettingsInput.model_validate(
            {
                "required": ["food", "dob", "id"],
                "checklist": [
                    {"key": "rain", "label": "A rain jacket (renamed)"},
                    {"label": "Carry ₹2,000 in cash!", "note": "Stalls take cash only"},
                    {"label": "Carry ₹2,000 in cash!"},
                ],
            }
        ),
    )
    assert pkg.details_required == ["id", "dob", "food"]
    assert [i["key"] for i in pkg.checklist] == [
        "rain",
        "carry-2-000-in-cash",
        "carry-2-000-in-cash-2",
    ]
    out = details.details_settings(pkg)
    assert out.checklist[0].label == "A rain jacket (renamed)" and out.checklist[1].note


# --- db -----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_package_editor_saves_and_returns_the_settings(
    db: AsyncSession, revalidated: object
) -> None:
    await seeded(db)
    pkg = await never_published(db, "north-goa-beaches")
    before = await svc.get_package(db, pkg.id)
    assert before.traveller_details.required == ["id", "emergency", "food"]
    assert before.traveller_details.checklist == []
    body = payload(
        slug="north-goa-beaches",
        destinationId=await goa_id(db),
        name="North Goa Beaches",
        nights=3,
        departures=[],
        travellerDetails={"required": ["id", "medical"], "checklist": [{"label": "Sunscreen"}]},
    )
    out = await svc.update_package(db, pkg.id, body)
    assert out.traveller_details.required == ["id", "medical"]
    assert [(i.key, i.label) for i in out.traveller_details.checklist] == [
        ("sunscreen", "Sunscreen")
    ]

    # Omitted = left as saved.
    body = payload(
        slug="north-goa-beaches",
        destinationId=await goa_id(db),
        name="North Goa",
        nights=3,
        departures=[],
    )
    out = await svc.update_package(db, pkg.id, body)
    assert out.traveller_details.required == ["id", "medical"]


@pytest.mark.db
async def test_the_desk_flags_missing_details_with_a_ready_percent(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    dep_id = departure.id
    owner = await owner_cookie(db)

    desk = (await db_client.get("/admin/bookings?flag=details", headers=owner)).json()
    assert desk["counts"]["details"] == 1 and [r["ref"] for r in desk["items"]] == [ref]
    [row] = desk["items"]
    assert row["detailsMissing"] == 3 and row["readyPercent"] == 50

    cards = (await detail(db_client, ref, token))["details"]["travellers"]
    for t in cards:
        assert (
            await save(db_client, ref, token, t["travellerId"], card_body(t["name"], **FULL))
        ).status_code == 200
    desk = (await db_client.get("/admin/bookings?flag=details", headers=owner)).json()
    assert desk["counts"]["details"] == 0 and desk["items"] == []
    desk = (await db_client.get(f"/admin/bookings?departureId={dep_id}", headers=owner)).json()
    assert desk["items"][0]["detailsMissing"] == 0 and desk["items"][0]["readyPercent"] == 100
    assert desk["readiness"] == {"percent": 100, "missingTravellers": 0, "bookings": 1}

    # A departed trip is never flagged, however short.
    await db.execute(update(Package).values(details_required=["id", "dob"]))
    await db.execute(
        update(Departure)
        .where(Departure.id == dep_id)
        .values(date=ist_today() - dt.timedelta(days=1))
    )
    await db.commit()
    desk = (await db_client.get("/admin/bookings?flag=details", headers=owner)).json()
    assert desk["counts"]["details"] == 0


@pytest.mark.db
async def test_only_the_manifest_shows_the_id_in_full(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    dep_id = departure.id
    owner = await owner_cookie(db)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][0]["travellerId"]
    full = {**FULL, "dob": "1992-03-12", "medical": "Mild asthma"}
    assert (
        await save(db_client, ref, token, tid, card_body("Asha Rao", **full))
    ).status_code == 200

    manifest = (await db_client.get(f"/admin/departures/{dep_id}/manifest", headers=owner)).json()
    first = manifest["bookings"][0]["travellers"][0]
    assert first["idNumber"] == "0000 0000 4821" and first["medical"] == "Mild asthma"
    assert first["emergencyPhone"] == "9845012763" and first["missing"] == []
    assert manifest["bookings"][0]["travellers"][1]["missing"] == ["id", "emergency", "food"]
    assert manifest["readiness"]["missingTravellers"] == 2
    assert manifest["required"] == ["id", "emergency", "food"]

    booking = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert booking["details"]["travellers"][0]["idMasked"] == "XXXX XXXX 4821"
    assert booking["canEditDetails"] is True and booking["canSendDetailsLink"] is True
    for page in (
        json.dumps(booking),
        json.dumps((await db_client.get("/admin/bookings", headers=owner)).json()),
        (await db_client.get("/admin/bookings.csv", headers=owner)).text,
    ):
        assert "000000004821" not in page and "0000 0000 4821" not in page
    csv = (await db_client.get("/admin/bookings.csv", headers=owner)).text
    header, line = csv.splitlines()[:2]
    assert header.endswith('"Details missing","Ready (%)"') and line.endswith('"2","67"')


@pytest.mark.db
async def test_the_owner_edits_details_past_the_lock(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    dep_id = departure.id
    owner = await owner_cookie(db)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][1]["travellerId"]
    await db.execute(
        update(Departure)
        .where(Departure.id == dep_id)
        .values(date=ist_today() + dt.timedelta(days=1))
    )
    await db.commit()
    res = await save(db_client, ref, token, tid, card_body("Vikram Rao", **FULL))
    assert res.status_code == 409 and res.json()["error"]["reason"] == "locked"

    res = await db_client.put(
        f"/admin/bookings/{ref}/travellers/{tid}/details",
        json=card_body("Vikram Rao", **FULL),
        headers=owner,
    )
    assert res.status_code == 200, res.text
    b = res.json()
    assert b["details"]["state"] == "locked" and b["details"]["complete"] == 1
    assert b["canSendDetailsLink"] is False
    entry = next(e for e in b["history"]["entries"] if e["text"].startswith("Added Vikram"))
    assert entry["actor"] == "owner"


@pytest.mark.db
async def test_send_details_link_names_who_owes_what_and_never_an_id(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, _ = await booked(db, db_app, db_client)
    owner = await owner_cookie(db)
    tid = (await detail(db_client, ref, token))["details"]["travellers"][0]["travellerId"]
    assert (
        await save(db_client, ref, token, tid, card_body("Asha Rao", **FULL))
    ).status_code == 200
    sender = db_app.state.email_sender
    sender.sent.clear()

    res = await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)
    assert res.status_code == 200, res.text
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX  # demo mode: the customer's copy lands with the owner
    assert "Vikram Rao: ID · emergency contact · food" in mail.text
    assert "Mira Rao" in mail.text and "Asha Rao:" not in mail.text
    assert f"/account/bookings/{ref}#details" in mail.text
    assert "4821" not in mail.text and "4821" not in (mail.html or "")
    await db.rollback()
    texts = (await db.execute(select(BookingEvent.text))).scalars().all()
    assert any(
        "traveller details for" in t and t.startswith("Email to the customer held") for t in texts
    )

    for t in (await detail(db_client, ref, token))["details"]["travellers"][1:]:
        await save(db_client, ref, token, t["travellerId"], card_body(t["name"], **FULL))
    res = await db_client.post(f"/admin/bookings/{ref}/details-link", headers=owner)
    assert res.status_code == 409 and res.json()["error"]["reason"] == "complete"
