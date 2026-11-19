"""v4 4.0.2: the four MCP tools, an adapter over the v3 registry (docs/04-technical-design-v2-v3.md
§v4.2; 03-requirements-v4 R34).

Two read the catalogue (`searchPackages`, `checkAvailability`); two hand the customer over to the
site with a link (`startBooking`, `startEnquiry`). Nothing pays, reserves or creates a lead. The
parity tests pin that every tool runs the chat's own `run_tool`, so MCP holds no business logic.
"""

import datetime as dt
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import Enquiry
from app.services.ai.tools import TOOLS, ToolContext, run_tool
from app.services.analytics import ist_today
from app.services.mcp.adapter import NOTE_MAX, absolute_url, enquiry_url
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_mcp_server import BASE, booted, mcp_app

SITE = "https://tripsmith.example"
NAMES = {"searchPackages", "checkAvailability", "startBooking", "startEnquiry"}


def client_for(http: object) -> Client:
    return Client(streamable_http_client(f"{BASE}/mcp", http_client=http))  # type: ignore[arg-type]


# --- without a database ---------------------------------------------------------------------------


async def test_exactly_the_four_tools_are_listed_with_the_chat_tools_schemas() -> None:
    async with booted(mcp_app()) as http, client_for(http) as client:
        tools = {t.name: t for t in (await client.list_tools()).tools}
    assert set(tools) == NAMES  # nothing pays, reserves, creates a lead or needs a login
    for name in ("searchPackages", "checkAvailability", "startBooking"):
        assert tools[name].input_schema == TOOLS[name].spec.parameters
    # startEnquiry takes what the chat's enquiry handoff takes: trip details, never contacts.
    assert tools["startEnquiry"].input_schema == TOOLS["createEnquiry"].spec.parameters
    assert all(tools[n].description for n in NAMES)
    assert "link" in (tools["startBooking"].description or "")
    assert "link" in (tools["startEnquiry"].description or "")


async def test_a_tool_with_no_database_is_an_mcp_tool_error_not_a_crash() -> None:
    async with booted(mcp_app()) as http, client_for(http) as client:  # no DATABASE_URL
        result = await client.call_tool("searchPackages", {"destination": "Goa"})
    assert result.is_error
    assert "unavailable" in result.content[0].text.lower()  # type: ignore[union-attr]


def test_a_booking_path_becomes_an_absolute_site_link() -> None:
    path = "/packages/north-goa-beaches?date=2026-12-18&double=1&triple=0&single=0#book"
    assert absolute_url(f"{SITE}/", path) == f"{SITE}{path}"
    assert absolute_url(SITE, path) == f"{SITE}{path}"


def test_the_enquiry_link_carries_trip_details_only_and_a_bounded_note() -> None:
    handoff = {
        "form": "enquiry",
        "summary": "Two adults, a quiet beach week in December. " * 20,
        "package": {"slug": "north-goa-beaches", "name": "North Goa"},
        "adults": 2,
        "children": None,
        "month": "2026-12",
    }
    url = enquiry_url(SITE, handoff)
    parts = urlsplit(url)
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == f"{SITE}/packages/north-goa-beaches"
    query = parse_qs(parts.query)
    assert set(query) == {"enquire", "month", "adults", "note"}  # no children: none given
    assert query["enquire"] == ["1"] and query["month"] == ["2026-12"] and query["adults"] == ["2"]
    assert len(query["note"][0]) <= NOTE_MAX

    general = urlsplit(enquiry_url(SITE, {**handoff, "package": None, "summary": "Hills in May"}))
    assert general.path == "/contact"
    assert not {"name", "phone", "email"} & set(parse_qs(general.query))


# --- with the catalogue: parity with the chat's tools ---------------------------------------------


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


@pytest.fixture
def mcp_db_app(db_engine: AsyncEngine) -> FastAPI:
    app = mcp_app()
    app.state.mcp_sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    app.state.settings = app.state.settings.model_copy(update={"site_url": SITE})
    return app


async def chat_result(db: AsyncSession, name: str, args: dict[str, object]) -> dict[str, object]:
    now = dt.datetime.now(dt.UTC)
    result, _ = await run_tool(ToolContext(db, ist_today(now), now), name, args)
    return result


async def mcp_result(app: FastAPI, name: str, args: dict[str, object]) -> tuple[dict, bool]:
    async with booted(app) as http, client_for(http) as client:
        result = await client.call_tool(name, args)
    return result.structured_content or {}, bool(result.is_error)


@pytest.mark.db
@pytest.mark.parametrize(
    ("name", "args"),
    [
        ("searchPackages", {"destination": "Goa"}),
        ("searchPackages", {"destination": "Maldives"}),
        ("checkAvailability", {"packageSlug": "north-goa-beaches"}),
    ],
)
async def test_the_catalogue_tools_return_exactly_what_the_chat_tools_return(
    catalog: None, db: AsyncSession, mcp_db_app: FastAPI, name: str, args: dict[str, object]
) -> None:
    got, is_error = await mcp_result(mcp_db_app, name, args)
    assert not is_error
    assert got == await chat_result(db, name, args)


@pytest.mark.db
async def test_start_booking_is_the_chat_handoff_with_an_absolute_link(
    catalog: None, db: AsyncSession, mcp_db_app: FastAPI
) -> None:
    dates = await chat_result(db, "checkAvailability", {"packageSlug": "north-goa-beaches"})
    # The last date: the first ones fall inside the booking cut-off (MIN_DAYS_AHEAD) as the real
    # clock nears the fixture's November departures.
    departure_id = dates["departures"][-1]["departureId"]  # type: ignore[index]
    args = {"departureId": departure_id, "adults": 2}

    got, is_error = await mcp_result(mcp_db_app, "startBooking", args)
    chat = await chat_result(db, "startBooking", args)

    assert "error" not in chat, chat  # the date itself is bookable
    assert not is_error, got
    assert got["url"] == f"{SITE}{chat['url']}"
    assert {k: v for k, v in got.items() if k not in ("url", "next")} == {
        k: v for k, v in chat.items() if k not in ("url", "next")
    }


@pytest.mark.db
async def test_start_enquiry_returns_a_form_link_and_creates_no_enquiry(
    catalog: None, db: AsyncSession, mcp_db_app: FastAPI
) -> None:
    args = {
        "summary": "Two adults want a quiet beach week in December, around ₹40k each.",
        "packageSlug": "north-goa-beaches",
        "adults": 2,
        "month": "2026-12",
    }
    got, is_error = await mcp_result(mcp_db_app, "startEnquiry", args)

    assert not is_error
    assert got["url"] == enquiry_url(SITE, await chat_result(db, "createEnquiry", args))
    assert urlsplit(str(got["url"])).path == "/packages/north-goa-beaches"
    assert (await db.execute(select(func.count()).select_from(Enquiry))).scalar_one() == 0


@pytest.mark.db
async def test_bad_arguments_come_back_as_a_tool_error(catalog: None, mcp_db_app: FastAPI) -> None:
    got, is_error = await mcp_result(mcp_db_app, "startBooking", {"departureId": "x", "adults": 0})
    assert is_error
    assert "Invalid arguments" in str(got.get("error"))
