"""v3 C6 — the concierge's security pass (docs/12 "v3 close"), pinned by tests.

- every tool refuses keys it doesn't declare (pydantic `extra="forbid"`), so the model can't
  smuggle an argument past validation;
- the site-wide cap holds when Upstash fails open (the per-IP limit then allows everything);
- a phone number or email typed into the chat never reaches the model, `messages`,
  `conversations.first_user_message` or the owner's log; the model's enquiry summary neither.
"""

from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.ratelimit import UpstashRateLimiter
from app.models import Conversation, Message
from app.services.ai.model import FunctionCall, TextChunk
from app.services.ai.pii import EMAIL_GONE, PHONE_GONE, redact
from app.services.ai.tools import TOOLS, ToolContext, run_tool
from tests.settings import make_settings
from tests.test_chat import NOW, TODAY, ScriptedModel, catalog, parse, say, use

__all__ = ["catalog"]  # the fixture, imported for the tests below

# --- contact details ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("call me on 98450 22110 please", f"call me on {PHONE_GONE} please"),
        ("+91 98450-22110", PHONE_GONE),
        ("phone 9845022110.", f"phone {PHONE_GONE}."),
        ("landline 080 2345 6789", f"landline {PHONE_GONE}"),
        ("aadhaar 1234 5678 9012", f"aadhaar {PHONE_GONE}"),
        ("mail rahul.k+trips@mail.co.in ok", f"mail {EMAIL_GONE} ok"),
        # a travel chat's own numbers stay
        ("3 days in Goa under ₹15k for 2", "3 days in Goa under ₹15k for 2"),
        ("budget ₹1,20,000 for 2", "budget ₹1,20,000 for 2"),
        ("₹1500000 is my limit", "₹1500000 is my limit"),
        ("14999 x 2 = 29998", "14999 x 2 = 29998"),
        ("2026-11-20 2026-11-27", "2026-11-20 2026-11-27"),
        ("20-11-2026 or 27-11-2026", "20-11-2026 or 27-11-2026"),
        ("Goa in 2026-12 for 4", "Goa in 2026-12 for 4"),
    ],
)
def test_redact_removes_phones_and_emails_only(text: str, expected: str) -> None:
    assert redact(text) == expected


@pytest.mark.db
async def test_a_phone_and_email_typed_into_the_chat_never_reach_the_model_or_the_log(
    catalog: None, db_app: FastAPI, db_client: AsyncClient, db: AsyncSession
) -> None:
    model = ScriptedModel("primary", [[TextChunk("Happy to help with Goa.")]])
    use(db_app, model)

    res = await say(db_client, "Goa for 2, I'm on 9845022110 or rahul@example.com")

    assert res.status_code == 200
    sent = model.calls[0]["history"][0]["parts"][0]["text"]
    assert sent == f"Goa for 2, I'm on {PHONE_GONE} or {EMAIL_GONE}"
    conversation = (await db.execute(select(Conversation))).scalar_one()
    assert conversation.first_user_message == sent
    stored = (await db.execute(select(Message.parts))).scalars().all()
    assert "9845022110" not in str(stored) and "rahul@" not in str(stored)


@pytest.mark.db
async def test_the_enquiry_summary_the_model_writes_carries_no_contact_details(
    catalog: None, db_app: FastAPI, db_client: AsyncClient
) -> None:
    summary = "Family of 4 wants Goa in December; call 9845022110 or mail a@b.in."
    use(
        db_app,
        ScriptedModel(
            "primary",
            [[FunctionCall("createEnquiry", {"summary": summary})], [TextChunk("Form is open.")]],
        ),
    )

    events = parse((await say(db_client, "talk to a person please")).text)

    result = next(d for n, d in events if n == "tool-result")["result"]
    assert (
        result["summary"]
        == f"Family of 4 wants Goa in December; call {PHONE_GONE} or mail {EMAIL_GONE}."
    )


# --- tool arguments ----------------------------------------------------------------------------

VALID: dict[str, dict[str, Any]] = {
    "searchPackages": {"destination": "Goa"},
    "checkAvailability": {"packageSlug": "north-goa-beaches"},
    "startBooking": {"departureId": "d1", "adults": 2},
    "createEnquiry": {"summary": "Two people, Goa, December."},
}


def test_every_tool_is_covered() -> None:
    assert set(VALID) == set(TOOLS)


@pytest.mark.parametrize("name", sorted(VALID))
async def test_every_tool_refuses_an_argument_it_does_not_declare(name: str) -> None:
    # Validation runs before the tool touches the database, so no session is needed.
    ctx = ToolContext(db=None, today=TODAY, now=NOW)  # type: ignore[arg-type]

    result, error = await run_tool(ctx, name, {**VALID[name], "discountPercent": 90})

    assert (
        "discountPercent" in result["error"] and "Extra inputs are not permitted" in result["error"]
    )
    assert error is not None and error.startswith(f"{name}:")


# --- caps without Upstash ----------------------------------------------------------------------


@pytest.mark.db
async def test_the_site_wide_cap_holds_when_upstash_fails_open(
    catalog: None, db_app: FastAPI, db_client: AsyncClient
) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("upstash is down", request=request)

    db_app.state.rate_limiter = UpstashRateLimiter(
        "https://upstash.invalid",
        "token",
        client=httpx.AsyncClient(transport=httpx.MockTransport(down)),
    )
    db_app.state.settings = make_settings(chat_daily_limit=1)
    use(db_app, ScriptedModel("primary", [[TextChunk("a")]]))

    assert (await say(db_client, "one")).status_code == 200  # the limiter failed open
    res = await say(db_client, "two")

    assert res.status_code == 429
    assert res.json()["error"]["reason"] == "daily_cap"
