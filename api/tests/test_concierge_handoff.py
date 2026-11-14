"""v3 C3 — book, hand off, notify (R27, R29, R30) against a scripted model (no AI call in CI).

- `startBooking` (tool) and `POST /chat/booking` (a departure list's "Book"): the v2 quote as the
  bookability check, the Book-now sheet's pre-filled URL, outcome `booking_started`.
- `createEnquiry` (tool) opens the form; `POST /enquiries` with `chat-handoff` links the chat,
  marks it `enquiry_created`, and the owner's enquiry detail reads the transcript.
- `POST /alerts`, and the admin saves that email each matching open alert exactly once.
"""

import datetime as dt
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation, Departure, DepartureAlert, Enquiry, Message, Package
from app.models.enums import ConversationOutcome, MessageRole, PackageStatus
from app.services.ai.handoff import Rooms, booking_url, rooms_for
from app.services.ai.model import FunctionCall, TextChunk, Usage
from app.services.ai.tools import CreateEnquiryArgs, StartBookingArgs
from app.services.ai.transcript import describe, readable
from tests.settings import make_settings
from tests.test_admin_packages import as_payload
from tests.test_booking_orders import SOON, seeded
from tests.test_bookings_desk import owner_cookie
from tests.test_calendar_admin import new_date
from tests.test_chat import NGB, ScriptedModel, catalog, parse, say, use
from tests.test_email_send import FakeSender

__all__ = ["catalog"]

NOW = dt.datetime(2026, 11, 13, 6, 0, tzinfo=dt.UTC)


def query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}


# --- pure pieces --------------------------------------------------------------------------------


def test_rooms_twin_up_a_party_with_a_triple_for_an_odd_one() -> None:
    assert rooms_for(1) == Rooms(single=1)
    assert rooms_for(2) == Rooms(double=1)
    assert rooms_for(3) == Rooms(triple=1)
    assert rooms_for(5) == Rooms(double=1, triple=1)
    assert rooms_for(6) == Rooms(double=3)
    assert all(rooms_for(n).adults == n for n in range(1, 13))


def test_the_booking_url_is_the_sheets_prefill() -> None:
    url = booking_url("goa-x", dt.date(2026, 12, 18), Rooms(double=1, triple=1), 2)
    assert url.startswith("/packages/goa-x?") and url.endswith("#book")
    assert query(url) == {
        "date": "2026-12-18",
        "double": "1",
        "triple": "1",
        "single": "0",
        "children": "2",
    }


def test_tool_arguments_are_validated_and_take_no_contact_details() -> None:
    with pytest.raises(ValueError):
        StartBookingArgs.model_validate({"departureId": "d", "adults": 10, "children": 5})
    with pytest.raises(ValueError):
        StartBookingArgs.model_validate({"departureId": "d", "adults": 0})
    with pytest.raises(ValueError):  # extra keys are refused: the model cannot pass a phone
        CreateEnquiryArgs.model_validate({"summary": "Goa for two in May", "phone": "9876543210"})
    with pytest.raises(ValueError):
        CreateEnquiryArgs.model_validate({"summary": "hi"})  # too short to help the team


def test_the_transcript_reads_as_lines_with_one_sentence_per_lookup() -> None:
    at = dt.datetime(2026, 11, 13, 5, 0, tzinfo=dt.UTC)
    rows: list[Any] = [
        (MessageRole.USER, [{"type": "text", "text": "Goa under 15k"}], at),
        (
            MessageRole.ASSISTANT,
            [
                {"type": "tool-call", "id": "t1", "name": "searchPackages",
                 "args": {"destination": "Goa", "maxBudget": 15000}},
                {"type": "tool-result", "id": "t1", "name": "searchPackages",
                 "result": {"packages": [{"name": "North Goa Beaches"}], "totalMatches": 1}},
                {"type": "text", "text": "Here is "},
                {"type": "text", "text": "one trip."},
            ],
            at,
        ),
    ]  # fmt: skip
    lines = readable(rows)
    assert [(line.role, line.text) for line in lines] == [
        ("visitor", "Goa under 15k"),
        ("lookup", "Searched Goa · up to ₹15,000 a person → 1 package: North Goa Beaches"),
        ("concierge", "Here is one trip."),
    ]
    assert describe("checkAvailability", {"packageSlug": "x"}, {"error": "boom"}) == (
        "checkAvailability failed: boom"
    )
    assert "no open dates" in describe(
        "checkAvailability", {"packageSlug": "x"}, {"packageName": "X", "departures": []}
    )


# --- startBooking --------------------------------------------------------------------------------


@pytest.mark.db
async def test_start_booking_hands_over_to_the_sheet_and_marks_the_chat(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, departure = await seeded(db, seats=10)
    model = ScriptedModel(
        "primary",
        [
            [FunctionCall("startBooking", {"departureId": departure.id, "adults": 3}), Usage(1, 1)],
            [TextChunk("Opening the booking sheet."), Usage(1, 1)],
        ],
    )
    use(db_app, model)

    res = await say(db_client, "Book the first date for 3 of us")

    events = parse(res.text)
    result = next(data for name, data in events if name == "tool-result")["result"]
    assert result["packageSlug"] == pkg.slug and result["date"] == SOON.isoformat()
    assert result["totalPaise"] > 0 and (result["adults"], result["children"]) == (3, 0)
    assert query(result["url"]) == {
        "date": SOON.isoformat(),
        "double": "0",
        "triple": "1",
        "single": "0",
        "children": "0",
    }
    conversation = await db.get(Conversation, res.headers["x-conversation-id"])
    assert conversation is not None
    await db.refresh(conversation)
    assert conversation.outcome == ConversationOutcome.BOOKING_STARTED


@pytest.mark.db
async def test_an_unbookable_party_comes_back_as_a_reason_and_leaves_the_chat_open(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    _, departure = await seeded(db, seats=2)
    model = ScriptedModel(
        "primary",
        [
            [FunctionCall("startBooking", {"departureId": departure.id, "adults": 4}), Usage(1, 1)],
            [TextChunk("That date is too full."), Usage(1, 1)],
        ],
    )
    use(db_app, model)
    res = await say(db_client, "Book it for 4")
    result = next(data for name, data in parse(res.text) if name == "tool-result")["result"]
    assert result == {"error": "Not enough seats left on this date for your party"}
    conversation = await db.get(Conversation, res.headers["x-conversation-id"])
    assert conversation is not None
    await db.refresh(conversation)
    assert conversation.outcome == ConversationOutcome.OPEN
    assert "startBooking" in (conversation.last_error or "")


async def chat_with(db: AsyncSession, *parts: list[dict[str, Any]]) -> Conversation:
    conversation = Conversation(first_user_message="Goa in December", ip_hash="x")
    db.add(conversation)
    await db.flush()
    for i, p in enumerate(parts):
        role = MessageRole.USER if i % 2 == 0 else MessageRole.ASSISTANT
        db.add(Message(conversation_id=conversation.id, role=role, parts=p))
        await db.commit()  # one turn per transaction, as POST /chat stores them (created_at)
    return conversation


@pytest.mark.db
async def test_a_departure_lists_book_button_uses_the_same_hand_off_without_a_turn(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, departure = await seeded(db, seats=10)
    chat = await chat_with(db, [{"type": "text", "text": "Goa in December"}])

    res = await db_client.post(
        "/chat/booking", json={"conversationId": chat.id, "departureId": departure.id}
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["packageName"] == pkg.name and body["adults"] == 2  # the sheet's own default
    assert query(body["url"])["double"] == "1"
    await db.refresh(chat)
    assert chat.outcome == ConversationOutcome.BOOKING_STARTED
    gone = await db_client.post(
        "/chat/booking", json={"conversationId": "nope", "departureId": departure.id}
    )
    assert gone.status_code == 404
    full = await db_client.post(
        "/chat/booking",
        json={"conversationId": chat.id, "departureId": departure.id, "adults": 11},
    )
    assert full.status_code == 409


# --- createEnquiry + the handoff ----------------------------------------------------------------


@pytest.mark.db
async def test_create_enquiry_opens_the_form_prefilled_from_the_conversation(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, _ = await seeded(db, seats=10)
    args = {"summary": "Two adults want Goa in May, quiet beaches", "packageSlug": pkg.slug,
            "adults": 2, "month": "2027-05"}  # fmt: skip
    model = ScriptedModel(
        "primary",
        [[FunctionCall("createEnquiry", args), Usage(1, 1)], [TextChunk("Form's open.")]],
    )
    use(db_app, model)
    res = await say(db_client, "Can a person help me?")
    result = next(data for name, data in parse(res.text) if name == "tool-result")["result"]
    assert result["form"] == "enquiry" and result["summary"] == args["summary"]
    assert result["package"] == {"slug": pkg.slug, "name": pkg.name}
    assert (result["adults"], result["month"]) == (2, "2027-05")
    # Opening the form is not a handoff yet: the visitor has not sent it.
    conversation = await db.get(Conversation, res.headers["x-conversation-id"])
    assert conversation is not None
    await db.refresh(conversation)
    assert conversation.outcome == ConversationOutcome.OPEN


def handoff(conversation_id: str | None, **over: object) -> dict[str, object]:
    return {
        "type": "chat-handoff",
        "name": "Asha Rao",
        "phone": "9876543210",
        "email": "asha@customer.in",
        "adults": 2,
        "message": "Two adults want Goa in May, quiet beaches",
        **({"conversationId": conversation_id} if conversation_id else {}),
        **over,
    }


@pytest.mark.db
async def test_a_handoff_links_the_chat_and_the_owner_reads_the_transcript(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    chat = await chat_with(
        db,
        [{"type": "text", "text": "Goa in May for 2, quiet"}],
        [
            {"type": "tool-call", "id": "t1", "name": "searchPackages",
             "args": {"destination": "Goa", "month": "2027-05"}},
            {"type": "tool-result", "id": "t1", "name": "searchPackages",
             "result": {"packages": [], "totalMatches": 0}},
            {"type": "text", "text": "Nothing in May yet — a person can help."},
        ],
    )  # fmt: skip

    res = await db_client.post("/enquiries", json=handoff(chat.id))

    assert res.status_code == 201, res.text
    enquiry = (await db.execute(select(Enquiry))).scalar_one()
    assert enquiry.conversation_id == chat.id and enquiry.type == "chat-handoff"
    await db.refresh(chat)
    assert chat.outcome == ConversationOutcome.ENQUIRY_CREATED

    owner = await owner_cookie(db)
    detail = (await db_client.get(f"/admin/enquiries/{enquiry.id}", headers=owner)).json()
    assert detail["type"] == "chat-handoff"
    assert [(line["role"], line["text"]) for line in detail["transcript"]] == [
        ("visitor", "Goa in May for 2, quiet"),
        ("lookup", "Searched Goa · May 2027 → nothing matched"),
        ("concierge", "Nothing in May yet — a person can help."),
    ]


@pytest.mark.db
async def test_a_handoff_needs_a_real_chat_but_talk_to_a_person_works_without_one(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    bad = await db_client.post("/enquiries", json=handoff("nope"))
    assert bad.status_code == 400
    assert "conversationId" in bad.json()["error"]["fieldErrors"]
    # "Talk to a person" before the first message: a handoff with no chat behind it.
    res = await db_client.post("/enquiries", json=handoff(None))
    assert res.status_code == 201, res.text
    enquiry = (await db.execute(select(Enquiry))).scalar_one()
    assert enquiry.conversation_id is None
    owner = await owner_cookie(db)
    detail = (await db_client.get(f"/admin/enquiries/{enquiry.id}", headers=owner)).json()
    assert detail["transcript"] == []


# --- notify me ----------------------------------------------------------------------------------


@pytest.mark.db
async def test_alerts_are_for_one_live_target_and_reused_when_repeated(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, _ = await seeded(db, seats=10)
    body = {"email": " Asha@Customer.in ", "packageSlug": pkg.slug}
    first = await db_client.post("/alerts", json=body)
    again = await db_client.post("/alerts", json=body)
    assert first.status_code == again.status_code == 201
    assert first.json() == {"target": "package", "slug": pkg.slug, "name": pkg.name}
    [alert] = (await db.execute(select(DepartureAlert))).scalars()
    assert alert.email == "asha@customer.in" and alert.sent_at is None

    both = await db_client.post("/alerts", json={**body, "destinationSlug": "goa"})
    assert both.status_code == 400
    assert (await db_client.post("/alerts", json={"email": "a@b.in"})).status_code == 400
    gone = await db_client.post("/alerts", json={"email": "a@b.in", "packageSlug": "nope"})
    assert gone.status_code == 404
    destination = await db_client.post(
        "/alerts", json={"email": "a@b.in", "destinationSlug": pkg.destination.slug}
    )
    assert destination.status_code == 201 and destination.json()["target"] == "destination"


async def alerts_for(db: AsyncSession, db_client: AsyncClient, pkg: Package) -> None:
    for body in [
        {"email": "pkg@customer.in", "packageSlug": pkg.slug},
        {"email": "dest@customer.in", "destinationSlug": pkg.destination.slug},
    ]:
        assert (await db_client.post("/alerts", json=body)).status_code == 201


def mailing(db_app: FastAPI) -> FakeSender:
    sender = FakeSender()
    db_app.state.email_sender = sender
    db_app.state.settings = make_settings(
        email_from="Tripsmith <hello@tripsmith.in>",
        owner_notify_email="owner@example.com",
        site_url="https://tripsmith.vercel.app",
    )
    return sender


@pytest.mark.db
async def test_a_new_date_emails_each_open_alert_once_and_a_second_date_sends_nothing(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, _ = await seeded(db, seats=10)
    await alerts_for(db, db_client, pkg)
    sender = mailing(db_app)
    owner = await owner_cookie(db)
    url = f"/admin/packages/{pkg.id}/departures"
    day = SOON + dt.timedelta(days=3)

    res = await db_client.post(url, json=new_date(day), headers=owner)

    assert res.status_code == 201, res.text
    assert sorted(m.to for m in sender.sent) == ["dest@customer.in", "pkg@customer.in"]
    mail = next(m for m in sender.sent if m.to == "pkg@customer.in")
    assert mail.subject.startswith(f"New dates for {pkg.name}")
    assert "one-time alert" in mail.text and "₹21,000 per person" in mail.text
    assert f"https://tripsmith.vercel.app/packages/{pkg.slug}#dates" in mail.text
    assert all(a.sent_at for a in (await db.execute(select(DepartureAlert))).scalars())

    sender.sent.clear()
    second = await db_client.post(url, json=new_date(day + dt.timedelta(days=1)), headers=owner)
    assert second.status_code == 201 and sender.sent == []


async def editor_body(db: AsyncSession, id: str, **over: object) -> dict[str, Any]:
    return (await as_payload(db, id, **over)).model_dump(by_alias=True, mode="json")


def free_day(body: dict[str, Any], day: dt.date) -> dt.date:
    """`day`, or the first later day the package has no departure on: the seed's dates are fixed,
    so a date counted from today can land on one of them (the editor rejects a duplicate)."""
    taken = {d["date"] for d in body["departures"]}
    while day.isoformat() in taken:
        day += dt.timedelta(days=1)
    return day


@pytest.mark.db
async def test_editor_saves_send_only_for_new_rows_of_a_live_package(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg = (await db.execute(select(Package).where(Package.slug == NGB))).scalar_one()
    db.add(DepartureAlert(email="pkg@customer.in", package_id=pkg.id))
    db.add(DepartureAlert(email="dest@customer.in", destination_id=pkg.destination_id))
    await db.commit()
    sender = mailing(db_app)
    owner = await owner_cookie(db)
    path = f"/admin/packages/{pkg.id}"

    # A save that changes no dates sends nothing.
    same = await db_client.put(path, json=await editor_body(db, pkg.id), headers=owner)
    assert same.status_code == 200, same.text
    assert sender.sent == []

    # A new row in the editor does.
    body = await editor_body(db, pkg.id)
    body["departures"].append(new_date(free_day(body, SOON + dt.timedelta(days=21))))
    added = await db_client.put(path, json=body, headers=owner)
    assert added.status_code == 200, added.text
    assert sorted(m.to for m in sender.sent) == ["dest@customer.in", "pkg@customer.in"]


@pytest.mark.db
async def test_a_draft_sends_nothing_until_it_goes_live_with_dates(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg = (await db.execute(select(Package).where(Package.slug == NGB))).scalar_one()
    await db.execute(update(Package).where(Package.id == pkg.id).values(status=PackageStatus.DRAFT))
    db.add(DepartureAlert(email="pkg@customer.in", package_id=pkg.id))
    db.add(DepartureAlert(email="dest@customer.in", destination_id=pkg.destination_id))
    await db.commit()
    sender = mailing(db_app)
    owner = await owner_cookie(db)
    path = f"/admin/packages/{pkg.id}"

    body = await editor_body(db, pkg.id)
    body["departures"].append(new_date(free_day(body, SOON + dt.timedelta(days=60))))
    draft = await db_client.put(path, json=body, headers=owner)
    assert draft.status_code == 200, draft.text
    assert sender.sent == []

    # Publishing a package with upcoming dates is new dates for its destination: both go, once.
    live = await db_client.post(f"{path}/status", json={"status": "live"}, headers=owner)
    assert live.status_code == 200, live.text
    assert sorted(m.to for m in sender.sent) == ["dest@customer.in", "pkg@customer.in"]
    sender.sent.clear()
    await db_client.post(f"{path}/status", json={"status": "draft"}, headers=owner)
    await db_client.post(f"{path}/status", json={"status": "live"}, headers=owner)
    assert sender.sent == []


@pytest.mark.db
async def test_a_failed_send_reopens_its_alert_for_the_next_date(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, _ = await seeded(db, seats=10)
    await alerts_for(db, db_client, pkg)
    sender = mailing(db_app)
    sender.fail_for = frozenset({"pkg@customer.in"})
    owner = await owner_cookie(db)
    res = await db_client.post(
        f"/admin/packages/{pkg.id}/departures",
        json=new_date(SOON + dt.timedelta(days=3)),
        headers=owner,
    )
    assert res.status_code == 201
    alerts = {a.email: a.sent_at for a in (await db.execute(select(DepartureAlert))).scalars()}
    assert alerts["pkg@customer.in"] is None and alerts["dest@customer.in"] is not None


# --- tool results carry the alert offer ---------------------------------------------------------


@pytest.mark.db
async def test_a_package_with_no_upcoming_date_offers_its_alert(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    pkg, _ = await seeded(db, seats=10)
    for i, d in enumerate(pkg.departures):
        await db.execute(
            update(Departure).where(Departure.id == d.id).values(date=dt.date(2025, 1, 1 + i))
        )

    await db.commit()
    model = ScriptedModel(
        "primary",
        [
            [FunctionCall("checkAvailability", {"packageSlug": pkg.slug}), Usage(1, 1)],
            [TextChunk("No dates yet.")],
        ],
    )
    use(db_app, model)
    res = await say(db_client, "When does it run?")
    result = next(data for name, data in parse(res.text) if name == "tool-result")["result"]
    assert result["departures"] == []
    assert result["alertFor"] == {"packageSlug": pkg.slug, "name": pkg.name}


def test_every_public_enquiry_type_has_an_email_label() -> None:
    from app.schemas.meta import EnquiryType as PublicType
    from app.services.email.render import TYPE_LABEL

    assert {t.value for t in TYPE_LABEL} >= {t.value for t in PublicType}


@pytest.mark.db
async def test_a_handoff_sends_the_standard_confirmation_and_the_owner_email(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    sender = mailing(db_app)
    chat = await chat_with(db, [{"type": "text", "text": "Goa in May for 2"}])
    res = await db_client.post("/enquiries", json=handoff(chat.id))
    assert res.status_code == 201, res.text
    assert res.json()["emailed"] is True
    owner = next(m for m in sender.sent if m.to == "owner@example.com")
    assert "From the concierge" in owner.text
    assert any(m.to == "asha@customer.in" for m in sender.sent)
