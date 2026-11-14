"""v3 C1 — the concierge engine against a scripted model (03 R33: no real AI call in CI).

Covers the tool loop (≤ 5 calls, fallback on 429/5xx), the tools, the SSE stream, persistence
and every limit: 500 chars, 30 messages / conversation, 20 / IP / day, the site-wide day and
month caps (row-locked), plus CORS on /chat only and the Gemini history conversion.
"""

import asyncio
import datetime as dt
import json
from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.infra.ratelimit import RateLimitResult
from app.models import ChatBudget, Conversation, Message
from app.services.ai import gemini
from app.services.ai.budget import CapReason, take_turn
from app.services.ai.loop import EMPTY_REPLY, MAX_MODEL_CALLS
from app.services.ai.model import (
    FunctionCall,
    ModelEvent,
    ModelUnavailable,
    TextChunk,
    ToolSpec,
    Usage,
)
from app.services.ai.tools import TOOL_SPECS, ToolContext, match_destination, run_tool
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

NGB, GQE = "north-goa-beaches", "goa-quiet-escape"
SITE = "http://localhost:3000"
TODAY = dt.date(2026, 11, 12)  # the fixture's departures start 2026-11-20
NOW = dt.datetime(2026, 11, 12, 6, 30, tzinfo=dt.UTC)

Step = list[ModelEvent] | Exception


class ScriptedModel:
    """A stand-in for `GeminiModel`: each call plays the next scripted step and records what the
    loop sent it."""

    def __init__(self, name: str, steps: list[Step]) -> None:
        self.name = name
        self.steps = list(steps)
        self.calls: list[dict[str, Any]] = []

    async def stream(
        self,
        system: str,
        history: list[dict[str, Any]],
        tools: list[ToolSpec],
        *,
        allow_tools: bool,
    ) -> AsyncIterator[ModelEvent]:
        self.calls.append({"history": json.loads(json.dumps(history)), "allow_tools": allow_tools})
        step = self.steps.pop(0)
        if isinstance(step, Exception):
            raise step
        for event in step:
            yield event


def search_then_answer(**args: Any) -> list[Step]:
    return [
        [FunctionCall("searchPackages", args, signature="c2ln"), Usage(100, 10)],
        [TextChunk("Here are "), TextChunk("two Goa trips."), Usage(300, 20)],
    ]


class DenyLimiter:
    def __init__(self) -> None:
        self.keys: list[str] = []

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        self.keys.append(key)
        return RateLimitResult(allowed=False, retry_after=3600)


def parse(body: str) -> list[tuple[str, dict[str, Any]]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


async def say(client: AsyncClient, message: str, conversation_id: str | None = None) -> Any:
    body: dict[str, Any] = {"message": message}
    if conversation_id:
        body["conversationId"] = conversation_id
    return await client.post("/chat", json=body)


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


def use(app: FastAPI, *models: ScriptedModel) -> None:
    app.state.chat_models = list(models)


# --- the stream, the loop, persistence ---------------------------------------------------------


@pytest.mark.db
async def test_a_turn_streams_tool_cards_then_text_and_is_stored(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    model = ScriptedModel("primary", search_then_answer(destination="Goa", maxBudget=15000))
    use(db_app, model)

    res = await say(db_client, "3 days in Goa under ₹15k for 2")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = parse(res.text)
    names = [name for name, _ in events]
    # C4: the guardrail holds back the word being written, so deltas break at word boundaries.
    assert names == ["tool-call", "tool-result", "text-delta", "text-delta", "text-delta", "done"]
    assert "".join(d["text"] for n, d in events if n == "text-delta") == "Here are two Goa trips."
    call, result, done = events[0][1], events[1][1], events[-1][1]
    assert call["name"] == "searchPackages" and call["args"] == {
        "destination": "Goa",
        "maxBudget": 15000,
    }
    assert result["id"] == call["id"]
    assert [p["slug"] for p in result["result"]["packages"]] == [NGB]  # ₹14,499 ≤ 15k; GQE isn't
    assert result["result"]["packages"][0]["fromPrice"] == "₹14,499 per person"
    assert done["conversationId"] == res.headers["x-conversation-id"]
    assert (done["model"], done["tokensIn"], done["tokensOut"]) == ("primary", 400, 30)

    # The model saw the visitor's message, then (second call) its own call + the result.
    assert model.calls[0]["history"] == [
        {"role": "user", "parts": [{"type": "text", "text": "3 days in Goa under ₹15k for 2"}]}
    ]
    assert [p["type"] for p in model.calls[1]["history"][-1]["parts"]] == [
        "tool-call",
        "tool-result",
    ]

    conversation = await db.get(Conversation, done["conversationId"])
    assert conversation is not None
    assert conversation.first_user_message == "3 days in Goa under ₹15k for 2"
    assert (conversation.message_count, conversation.tokens_in, conversation.tokens_out) == (
        1,
        400,
        30,
    )
    assert (conversation.model, conversation.last_error, conversation.ip_hash) == (
        "primary",
        None,
        conversation.ip_hash,
    )
    assert conversation.ip_hash and "127.0.0.1" not in conversation.ip_hash
    rows = (
        (
            await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.created_at)
            )
        )
        .scalars()
        .all()
    )
    assert [str(m.role) for m in rows] == ["user", "assistant"]
    parts = rows[1].parts
    assert [p["type"] for p in parts] == ["tool-call", "tool-result", "text"]
    assert parts[0]["signature"] == "c2ln" and parts[0]["model"] == "primary"
    assert parts[2]["text"] == "Here are two Goa trips."


@pytest.mark.db
async def test_the_next_turn_replays_the_stored_history(
    catalog: None, db_app: FastAPI, db_client: AsyncClient
) -> None:
    model = ScriptedModel(
        "primary",
        [*search_then_answer(destination="goa"), [TextChunk("The cheaper one.")]],
    )
    use(db_app, model)
    first = parse((await say(db_client, "Goa trips?")).text)[-1][1]["conversationId"]

    res = await say(db_client, "Which is cheaper?", first)

    assert parse(res.text)[-1][1]["conversationId"] == first
    history = model.calls[2]["history"]
    assert [m["role"] for m in history] == ["user", "assistant", "user"]
    assert history[1]["parts"][0]["signature"] == "c2ln"  # replayed for the model's context


@pytest.mark.db
async def test_the_loop_stops_at_five_model_calls_and_the_last_may_not_call_tools(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    loop: list[Step] = [[FunctionCall("searchPackages", {"destination": "goa"})]] * MAX_MODEL_CALLS
    model = ScriptedModel("primary", loop)
    use(db_app, model)

    events = parse((await say(db_client, "anything in goa")).text)

    assert len(model.calls) == MAX_MODEL_CALLS
    assert [c["allow_tools"] for c in model.calls] == [True] * 4 + [False]
    # The 5th call still asked for a tool: it isn't run, and the turn ends in words anyway.
    assert sum(1 for name, _ in events if name == "tool-result") == 4
    assert events[-2] == ("text-delta", {"text": EMPTY_REPLY})
    assert events[-1][0] == "done"


@pytest.mark.db
async def test_a_429_switches_to_the_fallback_model_for_the_rest_of_the_turn(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    primary = ScriptedModel("primary", [ModelUnavailable("primary: 429 RESOURCE_EXHAUSTED")])
    fallback = ScriptedModel("fallback", search_then_answer(destination="goa"))
    use(db_app, primary, fallback)

    events = parse((await say(db_client, "goa")).text)

    done = events[-1][1]
    assert events[-1][0] == "done" and done["model"] == "fallback"
    assert len(primary.calls) == 1 and len(fallback.calls) == 2
    conversation = await db.get(Conversation, done["conversationId"])
    assert conversation is not None and conversation.model == "fallback"
    assert conversation.last_error == "primary: 429 RESOURCE_EXHAUSTED"


@pytest.mark.db
async def test_with_every_model_down_the_stream_ends_in_an_error_event_and_is_kept(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    use(
        db_app,
        ScriptedModel("primary", [ModelUnavailable("primary: 503"), ModelUnavailable("again")]),
        ScriptedModel("fallback", [ModelUnavailable("fallback: 429")]),
    )

    res = await say(db_client, "goa")

    assert res.status_code == 200
    ((name, data),) = parse(res.text)
    assert name == "error" and data["reason"] == "busy"
    conversation = (await db.execute(select(Conversation))).scalar_one()
    assert conversation.last_error == "primary: 503; fallback: 429; again"  # 3 tries
    assert conversation.message_count == 1


@pytest.mark.db
async def test_the_primary_gets_a_second_try_when_the_fallback_is_down_too(
    catalog: None, db_app: FastAPI, db_client: AsyncClient
) -> None:
    primary = ScriptedModel("primary", [ModelUnavailable("timeout"), [TextChunk("Hello!")]])
    fallback = ScriptedModel("fallback", [ModelUnavailable("503")])
    use(db_app, primary, fallback)

    events = parse((await say(db_client, "hi")).text)

    assert events[-1][0] == "done" and events[-1][1]["model"] == "primary"


@pytest.mark.db
async def test_a_failure_after_text_streamed_does_not_retry_on_the_fallback(
    catalog: None, db_app: FastAPI, db_client: AsyncClient
) -> None:
    class Flaky(ScriptedModel):
        async def stream(self, *a: Any, **k: Any) -> AsyncIterator[ModelEvent]:
            yield TextChunk("Let me ")
            raise ModelUnavailable("primary: 500")

    fallback = ScriptedModel("fallback", [[TextChunk("never")]])
    use(db_app, Flaky("primary", []), fallback)

    events = parse((await say(db_client, "goa")).text)

    assert [n for n, _ in events] == ["text-delta", "error"]
    assert fallback.calls == []


@pytest.mark.db
async def test_bad_tool_arguments_go_back_to_the_model_and_are_recorded(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    model = ScriptedModel(
        "primary",
        [
            [FunctionCall("searchPackages", {"maxBudget": -5, "planet": "Mars"})],
            [TextChunk("Sorry, let me try again.")],
        ],
    )
    use(db_app, model)

    events = parse((await say(db_client, "cheap trips")).text)

    result = events[1][1]["result"]
    assert "maxBudget" in result["error"] and "planet" in result["error"]
    conversation = (await db.execute(select(Conversation))).scalar_one()
    assert conversation.last_error and conversation.last_error.startswith("searchPackages:")


# --- the tools ---------------------------------------------------------------------------------


@pytest.mark.db
async def test_search_reports_an_unknown_destination_with_what_we_offer(
    catalog: None, db: AsyncSession
) -> None:
    ctx = ToolContext(db, TODAY, NOW)
    result, error = await run_tool(ctx, "searchPackages", {"destination": "Maldives"})
    assert error is None
    assert result == {"packages": [], "unknownDestination": "Maldives", "weOffer": ["Goa"]}


@pytest.mark.db
async def test_search_filters_by_nights_theme_and_month(catalog: None, db: AsyncSession) -> None:
    ctx = ToolContext(db, TODAY, NOW)

    async def slugs(**args: Any) -> list[str]:
        result, error = await run_tool(ctx, "searchPackages", args)
        assert error is None
        return [p["slug"] for p in result["packages"]]

    assert await slugs() == [NGB, GQE]
    assert await slugs(nights=2) == [NGB]  # 3 nights is within a night of 2
    assert await slugs(theme="honeymoon") == [GQE]
    assert await slugs(destination="north goa beaches") == [NGB, GQE]  # "goa" ⊂ the phrase
    assert await slugs(month="2026-11", maxBudget=20000) == [NGB]
    nothing, _ = await run_tool(ctx, "searchPackages", {"maxBudget": 1000})
    assert nothing["packages"] == [] and nothing["weOffer"] == ["Goa"]


@pytest.mark.db
async def test_check_availability_lists_real_departures(catalog: None, db: AsyncSession) -> None:
    ctx = ToolContext(db, TODAY, NOW)
    result, error = await run_tool(
        ctx, "checkAvailability", {"packageSlug": NGB, "month": "2026-11"}
    )
    assert error is None
    (only,) = result["departures"]
    assert only["date"] == "2026-11-20" and only["seatsLeft"] == 16
    assert only["pricePerPerson"].startswith("₹") and only["departureId"]

    missing, error = await run_tool(ctx, "checkAvailability", {"packageSlug": "maldives-luxe"})
    assert "maldives-luxe" in missing["error"] and error


def test_destination_matching() -> None:
    offered = [("goa", "Goa"), ("kerala", "Kerala")]
    assert match_destination("GOA", offered) == ["goa"]
    assert match_destination("south goa", offered) == ["goa"]
    assert match_destination("Maldives", offered) == []


def test_tool_schemas_are_flat_for_the_model() -> None:
    by_name = {t.name: t for t in TOOL_SPECS}
    assert set(by_name) == {"searchPackages", "checkAvailability", "startBooking", "createEnquiry"}
    search = by_name["searchPackages"].parameters
    assert set(search["properties"]) == {"destination", "maxBudget", "nights", "theme", "month"}
    assert "required" not in search
    assert search["properties"]["theme"]["enum"][0] == "beach"
    assert "anyOf" not in json.dumps(search) and "null" not in json.dumps(search)
    assert by_name["checkAvailability"].parameters["required"] == ["packageSlug"]
    assert by_name["startBooking"].parameters["required"] == ["departureId", "adults"]
    assert by_name["createEnquiry"].parameters["required"] == ["summary"]
    for spec in TOOL_SPECS:
        assert "anyOf" not in json.dumps(spec.parameters), spec.name


# --- limits ------------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_message_over_500_characters_is_refused(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    use(db_app, ScriptedModel("primary", []))
    res = await say(db_client, "x" * 501)
    assert res.status_code == 400
    assert "message" in res.json()["error"]["fieldErrors"]
    assert (await say(db_client, "   ")).status_code == 400
    assert (await db.execute(select(ChatBudget))).first() is None


async def test_without_a_key_the_concierge_is_off(app: FastAPI, client: AsyncClient) -> None:
    assert app.state.chat_models is None  # tests run with no GEMINI_API_KEY
    res = await say(client, "hello")
    assert res.status_code == 503
    assert res.json()["error"]["reason"] == "ai_off"


@pytest.mark.db
async def test_thirty_messages_fill_a_conversation(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    use(db_app, ScriptedModel("primary", [[TextChunk("Hi!")]]))
    cid = parse((await say(db_client, "hi")).text)[-1][1]["conversationId"]
    conversation = await db.get(Conversation, cid)
    assert conversation is not None
    conversation.message_count = 30
    await db.commit()

    res = await say(db_client, "one more", cid)

    assert res.status_code == 429
    assert res.json()["error"]["reason"] == "conversation_full"
    budget = (await db.execute(select(ChatBudget))).scalar_one()
    assert budget.turns == 1  # the refused message spent nothing


@pytest.mark.db
async def test_an_unknown_conversation_is_a_404(db_app: FastAPI, db_client: AsyncClient) -> None:
    use(db_app, ScriptedModel("primary", []))
    res = await say(db_client, "hi", "nope")
    assert res.status_code == 404


@pytest.mark.db
async def test_the_per_ip_limit_is_per_ist_day_and_spends_no_budget(
    db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    limiter = DenyLimiter()
    db_app.state.rate_limiter = limiter
    use(db_app, ScriptedModel("primary", []))

    res = await say(db_client, "hi")

    assert res.status_code == 429
    assert res.json()["error"]["reason"] == "ip_limit"
    assert res.headers["retry-after"] == "3600"
    (key,) = limiter.keys
    assert key.startswith("chat:127.0.0.1:20")  # chat:{ip}:{IST date}
    assert (await db.execute(select(ChatBudget))).first() is None
    assert (await db.execute(select(Conversation))).first() is None


@pytest.mark.db
async def test_the_site_wide_daily_cap_refuses_and_marks_the_day(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    db_app.state.settings = make_settings(chat_daily_limit=2)
    use(db_app, ScriptedModel("primary", [[TextChunk("a")], [TextChunk("b")]]))

    assert (await say(db_client, "one")).status_code == 200
    assert (await say(db_client, "two")).status_code == 200
    res = await say(db_client, "three")

    assert res.status_code == 429
    assert res.json()["error"]["reason"] == "daily_cap"
    budget = (await db.execute(select(ChatBudget))).scalar_one()
    assert budget.turns == 2 and budget.cap_hit_at is not None


@pytest.mark.db
async def test_the_monthly_cap_sums_this_months_days(db: AsyncSession) -> None:
    db.add_all(
        [
            ChatBudget(day=dt.date(2026, 10, 31), turns=900),  # last month: doesn't count
            ChatBudget(day=dt.date(2026, 11, 1), turns=80),
            ChatBudget(day=dt.date(2026, 11, 2), turns=19),
        ]
    )
    await db.commit()

    async def turn(today: dt.date) -> CapReason | None:
        return await take_turn(db, today=today, now=NOW, daily=100, monthly=100)

    assert await turn(dt.date(2026, 11, 3)) is None  # 99 earlier + 0 today → the 100th turn
    assert await turn(dt.date(2026, 11, 3)) is CapReason.MONTH
    assert await turn(dt.date(2026, 12, 1)) is None  # a new month starts from zero


@pytest.mark.db
async def test_concurrent_turns_never_overshoot_the_cap(db_engine: AsyncEngine) -> None:
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def one() -> CapReason | None:
        async with factory() as session:
            return await take_turn(session, today=TODAY, now=NOW, daily=3, monthly=1500)

    results = await asyncio.gather(*(one() for _ in range(8)))

    assert results.count(None) == 3
    async with factory() as session:
        assert (await session.get(ChatBudget, TODAY)).turns == 3  # type: ignore[union-attr]


# --- CORS --------------------------------------------------------------------------------------


async def test_chat_allows_the_web_origin_only(client: AsyncClient) -> None:
    preflight = {"origin": SITE, "access-control-request-method": "POST"}
    ok = await client.options(
        "/chat", headers={**preflight, "access-control-request-headers": "content-type"}
    )
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == SITE

    evil = await client.options("/chat", headers={**preflight, "origin": "https://evil.example"})
    assert "access-control-allow-origin" not in evil.headers

    # Every other route stays same-origin: no CORS headers at all.
    other = await client.get("/health", headers={"origin": SITE})
    assert "access-control-allow-origin" not in other.headers


async def test_refusals_carry_cors_headers_so_the_panel_can_read_the_reason(
    client: AsyncClient,
) -> None:
    res = await client.post("/chat", json={"message": "hi"}, headers={"origin": SITE})
    assert res.status_code == 503
    assert res.headers["access-control-allow-origin"] == SITE


# --- Gemini history conversion (no network) ----------------------------------------------------


def test_history_converts_to_gemini_contents_with_signatures_per_model() -> None:
    history = [
        {"role": "user", "parts": [{"type": "text", "text": "goa?"}]},
        {
            "role": "assistant",
            "parts": [
                {
                    "type": "tool-call",
                    "id": "call_1",
                    "name": "searchPackages",
                    "args": {"destination": "goa"},
                    "model": "gemini-a",
                    "signature": "c2ln",
                },
                {
                    "type": "tool-result",
                    "id": "call_1",
                    "name": "searchPackages",
                    "result": {"packages": []},
                },
                {"type": "text", "text": "None yet.", "model": "gemini-a", "signature": "dHh0"},
            ],
        },
        {"role": "user", "parts": [{"type": "text", "text": "ok"}]},
    ]

    own = gemini.to_contents(history, "gemini-a")
    assert [c.role for c in own] == ["user", "model", "user", "model", "user"]
    assert own[1].parts[0].function_call.name == "searchPackages"  # type: ignore[index,union-attr]
    assert own[1].parts[0].thought_signature == b"sig"  # type: ignore[index]
    assert own[2].parts[0].function_response.response == {"packages": []}  # type: ignore[index,union-attr]
    assert own[3].parts[0].thought_signature == b"txt"  # type: ignore[index]

    other = gemini.to_contents(history, "gemini-b")  # the fallback replaying the primary's turn
    assert other[1].parts[0].thought_signature == gemini.FOREIGN_SIGNATURE  # type: ignore[index]
    assert other[3].parts[0].thought_signature is None  # type: ignore[index]


def test_models_come_from_settings() -> None:
    assert gemini.models_from_settings(make_settings()) is None
    models = gemini.models_from_settings(
        make_settings(gemini_api_key="k", ai_model="m1", ai_model_fallback="m2")
    )
    assert [m.name for m in models or []] == ["m1", "m2"]
