"""v3 C5 — the owner's concierge log (R31): list + outcome filter, transcript with raw tool calls,
the hand-off enquiry, and the dashboard's concierge tile."""

import datetime as dt
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatBudget, Conversation, Message
from app.models.enums import ConversationOutcome, EnquiryType, MessageRole
from app.services.admin_conversations import concierge_week
from app.services.ai.transcript import readable
from app.services.analytics import ist_today
from app.services.dashboard import week_start
from tests.test_admin_enquiries import make_enquiry
from tests.test_bookings_desk import owner_cookie

SEARCH_CALL = {
    "type": "tool-call",
    "id": "t1",
    "name": "searchPackages",
    "args": {"destination": "Goa", "maxBudget": 15000},
}
SEARCH_RESULT = {
    "type": "tool-result",
    "id": "t1",
    "name": "searchPackages",
    "result": {"packages": [{"name": "North Goa Beaches"}], "totalMatches": 1},
}
FAILED_CALL = {"type": "tool-call", "id": "t2", "name": "checkAvailability", "args": {}}
FAILED_RESULT = {
    "type": "tool-result",
    "id": "t2",
    "name": "checkAvailability",
    "result": {"error": "packageSlug is required"},
}


async def chat(
    db: AsyncSession,
    first: str,
    outcome: ConversationOutcome = ConversationOutcome.OPEN,
    *,
    parts: list[dict[str, Any]] | None = None,
    last_error: str | None = None,
    created_at: dt.datetime | None = None,
) -> Conversation:
    c = Conversation(
        first_user_message=first,
        outcome=outcome,
        message_count=2,
        tokens_in=120,
        tokens_out=30,
        model="gemini-3.5-flash-lite",
        last_error=last_error,
    )
    if created_at is not None:
        c.created_at = created_at
    db.add(c)
    await db.flush()
    db.add(
        Message(
            conversation_id=c.id, role=MessageRole.USER, parts=[{"type": "text", "text": first}]
        )
    )
    db.add(
        Message(
            conversation_id=c.id,
            role=MessageRole.ASSISTANT,
            parts=parts or [{"type": "text", "text": "Happy to help."}],
            tokens_in=120,
            tokens_out=30,
            # One transaction gives both rows the same now(); the api commits them apart.
            created_at=dt.datetime.now(dt.UTC) + dt.timedelta(seconds=1),
        )
    )
    await db.commit()
    return c


def test_raw_lookup_fields_only_when_asked() -> None:
    at = dt.datetime(2026, 11, 14, 5, 0, tzinfo=dt.UTC)
    rows: list[Any] = [
        (MessageRole.ASSISTANT, [SEARCH_CALL, SEARCH_RESULT, FAILED_CALL, FAILED_RESULT], at)
    ]
    plain = readable(rows)
    assert [(line.tool, line.args, line.failed) for line in plain] == [
        ("searchPackages", None, False),
        ("checkAvailability", None, True),
    ]
    raw = readable(rows, raw=True)
    assert raw[0].args == {"destination": "Goa", "maxBudget": 15000}
    assert raw[0].result == {"packages": [{"name": "North Goa Beaches"}], "totalMatches": 1}
    assert raw[1].failed and raw[1].result == {"error": "packageSlug is required"}


@pytest.mark.db
async def test_the_log_is_owner_only(db_client: AsyncClient) -> None:
    assert (await db_client.get("/admin/conversations")).status_code == 401
    assert (await db_client.get("/admin/conversations/x")).status_code == 401


@pytest.mark.db
async def test_the_list_filters_by_outcome_and_counts_each_tab(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    headers = await owner_cookie(db)
    await chat(db, "Goa under 15k")
    await chat(db, "Kasol in March", ConversationOutcome.BOOKING_STARTED, last_error="guardrail: x")
    await chat(db, "Honeymoon ideas", ConversationOutcome.ENQUIRY_CREATED)
    await chat(db, "old one", ConversationOutcome.DROPPED)

    res = await db_client.get("/admin/conversations", headers=headers)
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"].startswith("no-store")
    body = res.json()
    assert body["counts"] == {"all": 4, "open": 2, "bookingStarted": 1, "enquiryCreated": 1}
    assert body["total"] == 4 and body["totalPages"] == 1
    row = next(r for r in body["items"] if r["firstMessage"] == "Kasol in March")
    assert row["hasError"] is True and row["tokensIn"] == 120 and row["messageCount"] == 2

    open_ = await db_client.get("/admin/conversations?outcome=open", headers=headers)
    assert {r["firstMessage"] for r in open_.json()["items"]} == {"Goa under 15k", "old one"}
    booked = await db_client.get("/admin/conversations?outcome=booking_started", headers=headers)
    assert [r["firstMessage"] for r in booked.json()["items"]] == ["Kasol in March"]
    assert (
        await db_client.get("/admin/conversations?outcome=nope", headers=headers)
    ).status_code == 400


@pytest.mark.db
async def test_the_detail_shows_raw_tool_calls_errors_and_the_handoff(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    headers = await owner_cookie(db)
    c = await chat(
        db,
        "Goa under 15k",
        ConversationOutcome.ENQUIRY_CREATED,
        parts=[
            SEARCH_CALL,
            SEARCH_RESULT,
            FAILED_CALL,
            FAILED_RESULT,
            {"type": "text", "text": "One trip."},
        ],
        last_error="guardrail: invented price",
    )
    enquiry = await make_enquiry(
        db, ref="TS-CHAT01", type=EnquiryType.CHAT_HANDOFF, name="Asha Rao", conversation_id=c.id
    )
    await db.commit()

    res = await db_client.get(f"/admin/conversations/{c.id}", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["outcome"] == "enquiry_created"
    assert body["lastError"] == "guardrail: invented price"
    assert body["model"] == "gemini-3.5-flash-lite"
    assert body["enquiry"]["id"] == enquiry.id and body["enquiry"]["name"] == "Asha Rao"
    assert "ipHash" not in body
    roles = [line["role"] for line in body["transcript"]]
    assert roles == ["visitor", "lookup", "lookup", "concierge"]
    search, failed = body["transcript"][1], body["transcript"][2]
    assert search["tool"] == "searchPackages" and search["args"]["maxBudget"] == 15000
    assert failed["failed"] is True and failed["result"] == {"error": "packageSlug is required"}

    assert (await db_client.get("/admin/conversations/nope", headers=headers)).status_code == 404


@pytest.mark.db
async def test_the_dashboard_tile_counts_this_week_and_cap_days(
    db_client: AsyncClient, db: AsyncSession
) -> None:
    today = ist_today()
    monday = week_start(today)
    await chat(db, "a")
    await chat(db, "b", ConversationOutcome.BOOKING_STARTED)
    await chat(db, "c", ConversationOutcome.ENQUIRY_CREATED)
    # Last week's chat stays out of the tile.
    await chat(
        db,
        "old",
        created_at=dt.datetime.combine(monday, dt.time(), tzinfo=dt.UTC) - dt.timedelta(days=3),
    )
    db.add(ChatBudget(day=today, turns=7, cap_hit_at=dt.datetime.now(dt.UTC)))
    if today.day > 1:
        db.add(ChatBudget(day=today.replace(day=1), turns=100))  # no cap hit that day
    await db.commit()

    week = await concierge_week(db, monday=monday, today=today)
    assert week.conversations == 3
    assert week.booking_started == 1 and week.enquiry_created == 1
    assert week.tokens == 3 * 150
    assert week.turns_today == 7 and week.cap_hit_days == 1

    headers = await owner_cookie(db)
    res = await db_client.get("/admin/dashboard", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["concierge"]["conversations"] == 3
