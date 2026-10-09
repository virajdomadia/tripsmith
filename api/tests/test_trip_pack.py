"""P10 — add to calendar and the trip pack (R48): the `.ics` (a real parser reads it), the Google
link, the signed buttons that record the click, a date change un-ticking the calendar, the pack
locked until 7 days out and paid in full, its content and PDF, "read" recorded once, readiness
with the two new parts, the emails' calendar links and the `--pack` seed. The db tests need
TEST_DATABASE_URL."""

import datetime as dt
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from icalendar import Calendar
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingEvent, Departure, ItineraryDay, Package, TripLeader
from app.models.enums import BookingStatus
from app.services.analytics import ist_today
from app.services.booking import calendar, trip_pack
from app.services.booking.calendar import TripEvent
from content import load_content
from content._schema import KnowBeforeContent, MeetingContent, TripPackContent
from scripts.seed import seed_trip_packs
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_payments import rzp
from tests.test_booking_voucher import pdf_text
from tests.test_bookings_desk import owner_cookie
from tests.test_date_changes import UP, fresh, move, setup
from tests.test_traveller_details import booked, detail

__all__ = ["rzp"]

SECRET = "calendar-test-secret"


def _event(**over: object) -> TripEvent:
    fields: dict[str, object] = {
        "ref": "TB-7K2M9Q",
        "package_name": "Munnar & Alleppey Houseboat",
        "starts": dt.date(2026, 11, 13),
        "days": 5,
        "location": "Cochin International Airport, Arrivals Gate 3; T1",
        "booking_url": "https://tripsmith.virajdomadia.com/account/bookings/TB-7K2M9Q",
        "opens_on": dt.date(2099, 11, 6),  # ahead: the pack is not open yet
        "updated_at": dt.datetime(2026, 10, 9, 10, 0, tzinfo=dt.UTC),
    }
    return TripEvent(**{**fields, **over})  # type: ignore[arg-type]


# --- pure: the event ----------------------------------------------------------------------------


def test_the_ics_is_one_all_day_event_a_calendar_reads_back() -> None:
    text = calendar.ics(_event(), now=dt.datetime(2026, 10, 9, 10, 0, tzinfo=dt.UTC))
    assert text.endswith("\r\n") and "\n" not in text.replace("\r\n", "")
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))
    cal = Calendar.from_ical(text)
    assert cal["METHOD"] == "PUBLISH" and cal["VERSION"] == "2.0"
    [ev] = cal.walk("VEVENT")
    assert ev["UID"] == "TB-7K2M9Q@tripsmith.virajdomadia.com"
    assert ev.decoded("DTSTART") == dt.date(2026, 11, 13)
    assert ev.decoded("DTEND") == dt.date(2026, 11, 18)  # exclusive: 13–17 Nov
    assert str(ev["SUMMARY"]) == "Munnar & Alleppey Houseboat (TB-7K2M9Q)"
    assert str(ev["LOCATION"]) == "Cochin International Airport, Arrivals Gate 3; T1"
    assert "trip pack from Fri 6 Nov 2099" in str(ev["DESCRIPTION"])
    opened = _event(opens_on=dt.date(2026, 1, 1)).description
    assert opened.endswith("phone are in your trip pack.")
    assert str(ev["DESCRIPTION"]).startswith("Your Tripsmith booking TB-7K2M9Q: https://")


def test_a_later_file_keeps_the_uid_and_raises_the_sequence() -> None:
    first = Calendar.from_ical(calendar.ics(_event())).walk("VEVENT")[0]
    later = _event(
        starts=dt.date(2026, 12, 4), updated_at=dt.datetime(2026, 10, 20, 8, 0, tzinfo=dt.UTC)
    )
    second = Calendar.from_ical(calendar.ics(later)).walk("VEVENT")[0]
    assert first["UID"] == second["UID"]
    assert second.decoded("SEQUENCE") > first.decoded("SEQUENCE") > 0


def test_long_and_non_ascii_lines_fold_without_splitting_a_character() -> None:
    place = "Majnu Ka Tilla Volvo stand, New Delhi — gate 1 · " * 4
    text = calendar.ics(_event(location=place))
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))
    [ev] = Calendar.from_ical(text).walk("VEVENT")
    assert str(ev["LOCATION"]) == place


def test_the_google_link_carries_the_dates_place_and_title() -> None:
    url = urlsplit(calendar.google_url(_event()))
    assert url.netloc == "calendar.google.com" and url.path == "/calendar/render"
    q = parse_qs(url.query)
    assert q["action"] == ["TEMPLATE"] and q["dates"] == ["20261113/20261118"]
    assert q["text"] == ["Munnar & Alleppey Houseboat (TB-7K2M9Q)"]
    assert q["location"] == ["Cochin International Airport, Arrivals Gate 3; T1"]


def test_calendar_links_are_signed_per_booking_and_expire() -> None:
    exp = calendar.short_link_exp(now=1_000)
    path = calendar.calendar_path("TB-AAAAAA", "ics", SECRET, exp=exp)
    assert path and path.startswith("/calendar/TB-AAAAAA.ics?exp=")
    sig = parse_qs(urlsplit(path).query)["sig"][0]
    assert calendar.link_is_valid("TB-AAAAAA", exp, sig, SECRET, now=1_000)
    assert not calendar.link_is_valid("TB-BBBBBB", exp, sig, SECRET, now=1_000)
    assert not calendar.link_is_valid("TB-AAAAAA", exp, sig, SECRET, now=exp + 1)
    assert not calendar.link_is_valid("TB-AAAAAA", exp, sig, None, now=1_000)
    assert calendar.calendar_path("TB-AAAAAA", "google", None, exp=exp) is None
    google = calendar.calendar_path("TB-AAAAAA", "google", SECRET, exp=exp)
    assert google and google.startswith("/calendar/TB-AAAAAA/google?exp=")
    # An email's link lives until the details purge day, 30 days after the trip.
    back = dt.date(2026, 11, 17)
    end = dt.datetime.fromtimestamp(calendar.trip_link_exp(back), dt.UTC)
    assert end.date() == dt.date(2026, 12, 17)


# --- pure: the pack's lock ----------------------------------------------------------------------


def test_the_pack_opens_seven_days_out_once_paid_in_full() -> None:
    dep, back = dt.date(2026, 11, 13), dt.date(2026, 11, 17)
    s = trip_pack.state_of
    assert trip_pack.opens_on(dep) == dt.date(2026, 11, 6)
    assert s(BookingStatus.CONFIRMED, dep, back, dt.date(2026, 11, 5)) == "locked"
    assert s(BookingStatus.CONFIRMED, dep, back, dt.date(2026, 11, 6)) == "open"
    assert s(BookingStatus.PARTIALLY_PAID, dep, back, dt.date(2026, 11, 10)) == "locked"
    assert s(BookingStatus.COMPLETED, dep, back, dt.date(2026, 12, 16)) == "open"
    assert s(BookingStatus.COMPLETED, dep, back, dt.date(2026, 12, 17)) == "closed"
    assert s(BookingStatus.PENDING, dep, back, dt.date(2026, 11, 10)) is None
    assert s(BookingStatus.CANCELLED, dep, back, dt.date(2026, 11, 10)) is None


# --- db -----------------------------------------------------------------------------------------


async def _open_soon(db: AsyncSession, departure_id: str, *, days: int = 5) -> dt.date:
    """Move the departure inside the 7 days, so the pack is open."""
    day = ist_today() + dt.timedelta(days=days)
    await db.execute(update(Departure).where(Departure.id == departure_id).values(date=day))
    await db.commit()
    return day


async def _furnish(db: AsyncSession, departure: Departure) -> None:
    """A meeting point on the package and another on the date, a leader, a hotel address and
    two Know-before-you-go notes."""
    pkg = await db.get(Package, departure.package_id)
    assert pkg is not None
    leader = TripLeader(
        slug="kavya-rawat", name="Kavya Rawat", languages=["Hindi", "English"], regions=["Goa"],
        bio="Leads small groups along the coast since 2019.", phone="+91 98450 12345",
        years_leading=6, fun_fact="", active=True,
    )  # fmt: skip
    db.add(leader)
    await db.flush()
    pkg.leader_id = leader.id
    pkg.meet_place, pkg.meet_time = "Dabolim Airport (GOI), Arrivals exit", dt.time(12)
    pkg.know_before = {"weather": "30–33 °C by day.", "cash": "", "packing": "Swimwear."}
    pkg.hotels = [
        {"name": "Art Resort Goa", "city": "Palolem", "stars": 4, "nights": 3,
         "address": "Ourem Road, Palolem", "phone": "+91 98450 12345"},
    ]  # fmt: skip
    db.add_all(
        ItineraryDay(package_id=pkg.id, day_no=n, title=f"Day {n}", description="Beach.")
        for n in (1, 2)
    )
    await db.execute(
        update(Departure)
        .where(Departure.id == departure.id)
        .values(
            meet_place="Madgaon railway station, main exit",
            meet_time=dt.time(13, 30),
            meet_maps_url="https://www.google.com/maps/search/?api=1&query=Madgaon",
            meet_note="Look for the blue board",
        )
    )
    await db.commit()


async def _events(db: AsyncSession, kind: str) -> list[str]:
    db.expire_all()
    return list(
        (await db.execute(select(BookingEvent.text).where(BookingEvent.kind == kind))).scalars()
    )


@pytest.mark.db
async def test_the_pack_is_locked_until_seven_days_out_and_says_when_it_opens(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    b = await detail(db_client, ref, token)
    pack = b["pack"]
    opens = departure.date - dt.timedelta(days=7)
    assert pack == {
        "state": "locked",
        "opensOn": opens.isoformat(),
        "needsPayment": False,
        "readAt": None,
        "content": None,
    }
    parts = {p["key"]: p for p in b["readiness"]["parts"]}
    assert list(parts) == ["details", "balance", "pack", "calendar"]
    assert parts["pack"]["kind"] == "pack" and parts["pack"]["note"].startswith("Opens ")
    assert parts["calendar"]["note"].startswith("Google Calendar or an .ics")
    assert b["readiness"]["percent"] == 25

    cookie = with_cookie(token)
    res = await db_client.put(f"/account/bookings/{ref}/pack/read", headers=cookie)
    assert res.status_code == 409 and res.json()["error"]["reason"] == "pack_locked"
    res = await db_client.get(f"/account/bookings/{ref}/trip-pack.pdf", headers=cookie)
    assert res.status_code == 409

    # The owner previews it any time; the preview doesn't count as reading it.
    res = await db_client.get(
        f"/account/bookings/{ref}/trip-pack.pdf", headers=await owner_cookie(db)
    )
    assert res.status_code == 200 and res.content.startswith(b"%PDF")
    assert "Owner preview" in pdf_text(res.content)[1]
    assert (await detail(db_client, ref, token))["pack"]["readAt"] is None

    # Part paid: locked even inside the 7 days, and it says so.
    await _open_soon(db, departure.id)
    await db.execute(
        update(Booking).where(Booking.ref == ref).values(status=BookingStatus.PARTIALLY_PAID)
    )
    await db.commit()
    b = await detail(db_client, ref, token)
    assert b["pack"]["state"] == "locked" and b["pack"]["needsPayment"] is True
    note = next(p["note"] for p in b["readiness"]["parts"] if p["key"] == "pack")
    assert note.endswith(", once fully paid")


@pytest.mark.db
async def test_the_open_pack_has_the_dates_meeting_point_leader_phone_and_hotels(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    day = await _open_soon(db, departure.id)
    await _furnish(db, departure)
    b = await detail(db_client, ref, token)
    pack = b["pack"]
    assert pack["state"] == "open" and pack["readAt"] is None
    c = pack["content"]
    assert c["meeting"] == {  # the date's own set wins over the package's, as a whole
        "place": "Madgaon railway station, main exit",
        "time": "13:30:00",
        "mapsUrl": "https://www.google.com/maps/search/?api=1&query=Madgaon",
        "note": "Look for the blue board",
    }
    assert c["leader"] == {
        "name": "Kavya Rawat",
        "slug": "kavya-rawat",
        "languages": ["Hindi", "English"],
        "photoUrl": None,
        "phone": "+91 98450 12345",
    }
    assert c["hotels"][0]["address"] == "Ourem Road, Palolem"
    assert (
        c["days"][0]["date"] == day.isoformat()
        and c["days"][1]["date"] == (day + dt.timedelta(days=1)).isoformat()
    )
    assert [n["key"] for n in c["knowBefore"]] == ["weather", "packing"]  # blank cash hidden
    assert c["emergencyPhone"] == "+91 98450 12345"
    assert b["calendar"]["location"] == "Madgaon railway station, main exit"
    note = next(p["note"] for p in b["readiness"]["parts"] if p["key"] == "pack")
    assert note == "Open now — read it before you go"

    # Reading it is recorded once, with one history entry the customer sees.
    cookie = with_cookie(token)
    for _ in range(2):
        res = await db_client.put(f"/account/bookings/{ref}/pack/read", headers=cookie)
        assert res.status_code == 204
    assert await _events(db, "pack.read") == ["Customer opened the trip pack"]
    b = await detail(db_client, ref, token)
    assert b["pack"]["readAt"] and b["readiness"]["percent"] == 50
    assert "You opened the trip pack" in [a["text"] for a in b["activity"]]

    # The PDF carries what the page does; the customer's download is a read too.
    res = await db_client.get(f"/account/bookings/{ref}/trip-pack.pdf", headers=cookie)
    assert res.status_code == 200 and res.headers["cache-control"] == "private, no-store"
    assert res.headers["content-disposition"].endswith(f'Tripsmith-{ref}-trip-pack.pdf"')
    text = pdf_text(res.content)[1]
    for words in ("Madgaon railway station", "Kavya Rawat", "+91 98450 12345", "Know before"):
        assert words in text
    assert "Owner preview" not in text

    # Someone else's booking: no pack.
    other = await db_client.get(f"/account/bookings/{ref}/trip-pack.pdf")
    assert other.status_code == 401


@pytest.mark.db
async def test_the_pdf_download_alone_marks_the_pack_read(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    await _open_soon(db, departure.id)
    res = await db_client.get(f"/account/bookings/{ref}/trip-pack.pdf", headers=with_cookie(token))
    assert res.status_code == 200
    # No meeting point yet: the pack says it is coming rather than leaving a gap.
    assert "Shared with you soon" in pdf_text(res.content)[1]
    assert (await detail(db_client, ref, token))["pack"]["readAt"]


@pytest.mark.db
async def test_the_calendar_buttons_record_the_click_and_send_the_event(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, departure = await booked(db, db_app, db_client)
    cal = (await detail(db_client, ref, token))["calendar"]
    assert cal["addedAt"] is None and cal["via"] is None and cal["stale"] is False
    assert cal["starts"] == departure.date.isoformat()
    assert cal["location"] == "Goa"  # no meeting point yet: the destination

    res = await db_client.get(cal["icsUrl"])
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/calendar")
    assert res.headers["content-disposition"].endswith(f'Tripsmith-{ref}.ics"')
    [ev] = Calendar.from_ical(res.text).walk("VEVENT")
    assert ev["UID"] == f"{ref}@tripsmith.virajdomadia.com"
    assert ev.decoded("DTSTART") == departure.date

    res = await db_client.get(cal["googleUrl"], follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"].startswith("https://calendar.google.com/calendar/render?")
    assert await _events(db, "calendar.added") == [
        "Customer added the trip to a calendar file (.ics)"
    ]  # once, though clicked twice

    b = await detail(db_client, ref, token)
    assert b["calendar"]["via"] == "google" and b["calendar"]["addedAt"]
    part = next(p for p in b["readiness"]["parts"] if p["key"] == "calendar")
    assert part["done"] is True and part["note"].startswith("Google Calendar · ")

    # A forged or expired signature is refused before anything is recorded.
    bad = cal["icsUrl"].replace("sig=", "sig=0")
    assert (await db_client.get(bad)).status_code == 403
    path = calendar.calendar_path(ref, "ics", "wrong-secret", exp=calendar.short_link_exp())
    assert path and (await db_client.get(path)).status_code == 403


@pytest.mark.db
async def test_a_pending_booking_has_no_calendar_event(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, token, _ = await booked(db, db_app, db_client, pay=False)
    b = await detail(db_client, ref, token)
    assert b["pack"] is None and b["calendar"] is None
    secret = db_app.state.settings.session_secret.get_secret_value()
    path = calendar.calendar_path(ref, "ics", secret, exp=calendar.short_link_exp())
    assert path and (await db_client.get(path)).status_code == 404


@pytest.mark.db
async def test_a_date_change_unticks_the_calendar_and_asks_for_the_new_file(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (_, low), ref, cookie, sender = await setup(
        db, db_app, db_client, (47, 12, 25_000_00), (40, 8, 20_000_00)
    )
    cal = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()["calendar"]
    assert (await db_client.get(cal["icsUrl"])).status_code == 200
    hour_ago = dt.datetime.now(dt.UTC) - dt.timedelta(hours=1)  # the file was fetched earlier
    await db.execute(update(Booking).where(Booking.ref == ref).values(updated_at=hour_ago))
    await db.commit()
    before = await fresh(db, ref)
    sequence = calendar.event_of(
        before, Package(name="x", days=1), Departure(date=dt.date(2026, 1, 1)), "x", "https://x"
    ).sequence

    assert (await move(db_client, ref, cookie, low, -UP)).status_code == 201
    moved = await fresh(db, ref)
    assert moved.calendar_added_at is None and moved.calendar_via == "ics"
    b = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert b["calendar"]["stale"] is True and b["calendar"]["addedAt"] is None
    part = next(p for p in b["readiness"]["parts"] if p["key"] == "calendar")
    assert part["done"] is False and part["note"] == "Date changed — update your calendar"

    # The change email carries the replacing .ics; the new file keeps the UID, newer sequence.
    mail = next(m for m in sender.sent if "Your trip has moved" in m.subject)
    assert "/api/calendar/" in mail.text and ".ics?exp=" in mail.text
    res = await db_client.get(b["calendar"]["icsUrl"])
    [ev] = Calendar.from_ical(res.text).walk("VEVENT")
    assert ev["UID"] == f"{ref}@tripsmith.virajdomadia.com"
    assert ev.decoded("SEQUENCE") > sequence


@pytest.mark.db
async def test_the_confirmation_email_carries_the_calendar_links_and_the_pack_date(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, departure = await booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    mail = next(m for m in sender.sent if f"Booking {ref} confirmed" in m.subject)
    opens = departure.date - dt.timedelta(days=7)
    for body in (mail.text, mail.html):
        assert f"https://tripsmith.vercel.app/api/calendar/{ref}/google?exp=" in body
        assert f"https://tripsmith.vercel.app/api/calendar/{ref}.ics?exp=" in body
        assert "opens in" in body and f"{opens.day} " in body
    assert "WhatsApp you a week before" not in mail.text


# --- seed ---------------------------------------------------------------------------------------


def test_the_trip_pack_content_covers_every_package_and_hotel() -> None:
    content = load_content()
    assert set(content.trip_packs) == {p.slug for p in content.packages}
    for p in content.packages:
        pack = content.trip_packs[p.slug]
        assert set(pack.hotels) == {h.name for h in p.hotels}, p.slug
        assert pack.meeting.maps_url.startswith("https://www.google.com/maps/search/?api=1")
        assert all(pack.know_before.model_dump().values()), p.slug


@pytest.mark.db
async def test_the_pack_seed_fills_only_what_is_empty(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, _, departure = await booked(db, db_app, db_client)
    pkg_id = departure.package_id  # a commit expires loaded rows: keep the id
    pkg = await db.get(Package, pkg_id)
    assert pkg is not None
    slug, hotel = pkg.slug, "Art Resort Goa"
    pkg.hotels = [{"name": hotel, "city": "Palolem", "stars": 4, "nights": 3}]
    pkg.know_before = {"cash": "The owner's own words."}
    await db.commit()
    content = load_content("tests.fixture_content")
    content.trip_packs = {
        slug: TripPackContent(
            meeting=MeetingContent(place="Thivim station", time=dt.time(9)),
            know_before=KnowBeforeContent(weather="Hot.", cash="Seed words."),
            hotels={hotel: "Anjuna, Goa"},
        ),
        "not-in-this-db": TripPackContent(
            meeting=MeetingContent(place="Nowhere"), know_before=KnowBeforeContent(), hotels={}
        ),
    }
    result = await seed_trip_packs(db, content)
    assert result.counts == {"pack_meetings": 1, "pack_notes": 1, "pack_hotels": 1}
    assert result.warnings == ["not-in-this-db: not in this database — skipped"]
    db.expire_all()
    pkg = await db.get(Package, pkg_id)
    assert pkg is not None
    assert (pkg.meet_place, pkg.meet_time) == ("Thivim station", dt.time(9))
    assert pkg.meet_maps_url and "Thivim" in pkg.meet_maps_url
    assert pkg.know_before == {"weather": "Hot.", "cash": "The owner's own words."}
    assert pkg.hotels[0]["address"] == "Anjuna, Goa" and pkg.hotels[0]["phone"]

    pkg.meet_place = "The owner's pick"
    await db.commit()
    again = await seed_trip_packs(db, content)
    assert again.counts == {"pack_meetings": 0, "pack_notes": 0, "pack_hotels": 0}
    db.expire_all()
    assert (await db.get(Package, pkg_id)).meet_place == "The owner's pick"  # type: ignore[union-attr]
