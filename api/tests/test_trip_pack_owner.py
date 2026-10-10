"""P10b — the owner's side of the trip pack (R48): Package editor B's meeting point and "Know
before you go", hotel address and phone (kept when a form leaves them out), a date's own meeting
point, the copy keeping them, and the desk's pack + calendar status and the manifest's meeting
point. The db tests need TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.catalog import AdminDeparture, HotelInput
from app.schemas.trip_pack import MeetingPointInput
from app.services.booking import trip_pack
from app.services.catalog import admin_packages as svc
from tests.razorpay_fake import FakeRazorpay
from tests.test_admin_packages import goa_id, never_published, payload, revalidated, seeded
from tests.test_auth import with_cookie
from tests.test_booking_payments import rzp
from tests.test_bookings_desk import owner_cookie
from tests.test_traveller_details import booked
from tests.test_trip_pack import _open_soon

__all__ = ["revalidated", "rzp"]

MEET = {
    "place": "Dabolim Airport (GOI), Arrivals exit",
    "time": "12:00:00",
    "mapsUrl": "https://www.google.com/maps/search/?api=1&query=Dabolim",
    "note": "Look for the blue board",
}
HOTEL = {"name": "Lemon Tree Amarante", "city": "Candolim", "stars": 4, "nights": 3}


def _dep(d: AdminDeparture, **extra: Any) -> dict[str, Any]:
    return {
        "id": d.id,
        "date": d.date.isoformat(),
        "seatsTotal": d.seats_total,
        "guaranteed": d.guaranteed,
        "priceDoublePaise": d.price_double_paise,
        "priceTriplePaise": d.price_triple_paise,
        "priceChildPaise": d.price_child_paise,
        "singleSupplementPaise": d.single_supplement_paise,
        **extra,
    }


def test_the_maps_link_must_be_https_and_text_one_line() -> None:
    for bad in ("javascript:alert(1)", "http://maps.google.com/x"):
        with pytest.raises(ValidationError, match="https://"):
            MeetingPointInput.model_validate({"place": "Dabolim", "mapsUrl": bad})
    with pytest.raises(ValidationError, match="one line"):
        MeetingPointInput.model_validate({"place": "Dabolim\nGate 2"})
    with pytest.raises(ValidationError, match="one line"):
        HotelInput.model_validate({**HOTEL, "phone": "+91\x0798450"})


def test_an_older_form_never_wipes_a_hotels_address_or_phone() -> None:
    saved = [{**HOTEL, "address": "Fort Aguada Road", "phone": "+91 98450 12345"}]
    kept = trip_pack.hotels_to_save(saved, [HotelInput.model_validate(HOTEL)])
    assert kept[0]["address"] == "Fort Aguada Road" and kept[0]["phone"] == "+91 98450 12345"
    cleared = trip_pack.hotels_to_save(
        saved, [HotelInput.model_validate({**HOTEL, "address": "", "phone": None})]
    )
    assert cleared[0]["address"] is None and cleared[0]["phone"] is None


@pytest.mark.db
async def test_package_editor_saves_the_meeting_point_notes_hotels_and_a_dates_own_point(
    db: AsyncSession, revalidated: object
) -> None:
    await seeded(db)
    pkg = await never_published(db, "north-goa-beaches")
    pkg_id = pkg.id
    before = await svc.get_package(db, pkg_id)
    assert before.trip_pack.meeting is None and before.trip_pack.know_before.weather == ""
    first = before.departures[0]
    base = {"slug": "north-goa-beaches", "destinationId": await goa_id(db), "nights": 3}

    out = await svc.update_package(
        db,
        pkg_id,
        payload(
            **base,
            name="North Goa Beaches",
            hotels=[{**HOTEL, "address": "Fort Aguada Road, Candolim", "phone": "+91 98450 12345"}],
            departures=[_dep(d) for d in before.departures[:1]]
            + [
                _dep(d, meeting={"place": "Thivim station", "time": "09:30"})
                for d in before.departures[1:2]
            ],
            tripPack={"meeting": MEET, "knowBefore": {"weather": " Hot. ", "cash": ""}},
        ),
    )
    m = out.trip_pack.meeting
    assert m and m.place == MEET["place"] and m.time == dt.time(12) and m.note == MEET["note"]
    assert out.trip_pack.know_before.weather == "Hot." and out.trip_pack.know_before.cash == ""
    assert out.hotels[0].address == "Fort Aguada Road, Candolim"
    assert out.departures[0].meeting is None
    own = out.departures[1].meeting
    assert own and own.place == "Thivim station" and own.time == dt.time(9, 30)

    # Omitted = left as saved: the settings, the date's point and the hotel's contacts.
    out = await svc.update_package(
        db,
        pkg_id,
        payload(
            **base,
            name="North Goa",
            hotels=[HOTEL],
            departures=[_dep(d) for d in out.departures[:2]],
        ),
    )
    assert out.trip_pack.meeting and out.trip_pack.meeting.place == MEET["place"]
    assert out.departures[1].meeting and out.departures[1].meeting.place == "Thivim station"
    assert out.hotels[0].phone == "+91 98450 12345"

    # Null clears: the package's point and the date's own (back to the package's).
    out = await svc.update_package(
        db,
        pkg_id,
        payload(
            **base,
            name="North Goa",
            departures=[_dep(out.departures[0]), _dep(out.departures[1], meeting=None)],
            tripPack={"meeting": None, "knowBefore": {}},
        ),
    )
    assert out.trip_pack.meeting is None and out.departures[1].meeting is None
    assert first.id == out.departures[0].id


@pytest.mark.db
async def test_the_copy_keeps_the_meeting_points_and_notes(
    db: AsyncSession, revalidated: object
) -> None:
    await seeded(db)
    pkg = await never_published(db, "north-goa-beaches")
    pkg_id = pkg.id
    before = await svc.get_package(db, pkg_id)
    await svc.update_package(
        db,
        pkg_id,
        payload(
            slug="north-goa-beaches", destinationId=await goa_id(db), name="North Goa", nights=3,
            departures=[_dep(before.departures[0], meeting={"place": "Thivim station"})],
            tripPack={"meeting": MEET, "knowBefore": {"packing": "Swimwear."}},
        ),
    )  # fmt: skip
    copy = await svc.duplicate_package(db, pkg_id)
    assert copy.trip_pack.meeting and copy.trip_pack.meeting.place == MEET["place"]
    assert copy.trip_pack.know_before.packing == "Swimwear."
    assert copy.departures[0].meeting and copy.departures[0].meeting.place == "Thivim station"


@pytest.mark.db
async def test_the_desk_shows_pack_and_calendar_status_and_the_manifest_the_meeting_point(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    dep_id = departure.id
    owner = await owner_cookie(db)
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    status = detail["packStatus"]
    assert status["pack"]["state"] == "locked" and status["pack"]["content"] is None
    assert status["calendarAddedAt"] is None and status["calendarStale"] is False

    cal = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()[
        "calendar"
    ]
    assert (await db_client.get(cal["googleUrl"], follow_redirects=False)).status_code == 302
    await _open_soon(db, dep_id)
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["packStatus"]["calendarVia"] == "google"
    assert detail["packStatus"]["pack"]["state"] == "open"
    assert detail["packStatus"]["pack"]["readAt"] is None

    manifest = (await db_client.get(f"/admin/departures/{dep_id}/manifest", headers=owner)).json()
    assert manifest["meeting"] is None  # the fixture package has none yet
