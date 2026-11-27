"""v4 4.0.5: drive a running Tripsmith MCP server with the SDK's own client, over real HTTP.

The pytest suite talks to the app in-process; this talks to a real server the way Claude Desktop
or a connector does, so it catches what in-process tests can't: the ASGI server, real sockets,
the SDK's transport and client changing under a version bump. CI runs it against uvicorn on a
seeded database (.github/workflows/ci.yml); 4.0.6 runs it against a preview and production.

    uv run python scripts/mcp_smoke.py http://127.0.0.1:8000/mcp
    uv run python scripts/mcp_smoke.py https://api.example/mcp

Each mode (`legacy`: the `initialize` handshake; `auto`: the 2026-07-28 flow when the server
offers it) lists the tools and the prompt, gets the prompt, and calls read-only tools on a
package it finds at runtime (so it works on production data too): searchPackages, then
checkAvailability per package until one has an open date, getPackageDetails and quotePrice. At
least four calls a mode (more when it tries further packages), so eight or more against the
300-an-hour limit; each is logged in `mcp_requests` with the User-Agent `tripsmith-mcp-smoke`, so
reports can leave the smoke runs out.
Nothing books, holds or sends. Exits 1 on the first failed check.
"""

import argparse
import asyncio
import json
import sys
from typing import Any

import httpx2
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client

TOOLS = [
    "listDestinations",
    "searchPackages",
    "getPackageDetails",
    "getReviews",
    "comparePackages",
    "checkAvailability",
    "quotePrice",
    "startBooking",
    "startEnquiry",
    "notifyMe",
]
PROMPT = "plan-a-trip"
USER_AGENT = "tripsmith-mcp-smoke/1"


class SmokeFailed(Exception):
    pass


def check(ok: bool, what: str, detail: Any = "") -> None:
    if not ok:
        raise SmokeFailed(f"{what}: {detail}")
    print(f"  ok  {what}")


def leaves(group: BaseException) -> list[BaseException]:
    """The exceptions inside (nested) groups: the client's task groups wrap ours twice."""
    if isinstance(group, BaseExceptionGroup):
        return [leaf for exc in group.exceptions for leaf in leaves(exc)]
    return [group]


def payload(result: Any) -> dict[str, Any]:
    if result.structured_content is not None:
        return dict(result.structured_content)
    return json.loads(result.content[0].text)


def first_open_date(availability: dict[str, Any]) -> dict[str, Any] | None:
    """The latest listed departure with seats for two, or None. The latest, because the nearest
    ones can be too close to book online, which quotePrice rightly refuses."""
    for departure in reversed(availability.get("departures") or []):
        if departure["seatsLeft"] >= 2 and departure.get("pricePerPersonPaise") != 0:
            return departure
    return None


async def run_mode(url: str, mode: str) -> None:
    print(f"{mode}:")
    http = httpx2.AsyncClient(headers={"user-agent": USER_AGENT}, timeout=30.0)
    transport = streamable_http_client(url, http_client=http)
    async with http, Client(transport, mode=mode) as client:  # type: ignore[arg-type]
        info = client.server_info
        check(info is not None and info.name == "tripsmith", "server is tripsmith", info)

        listed = (await client.list_tools()).tools
        check(
            [t.name for t in listed] == TOOLS,
            "exactly the ten tools, in order",
            [t.name for t in listed],
        )
        check(
            all(t.annotations is not None and t.annotations.read_only_hint for t in listed),
            "every tool is marked read-only",
        )

        prompts = [p.name for p in (await client.list_prompts()).prompts]
        check(prompts == [PROMPT], "the plan-a-trip prompt is listed", prompts)
        got = await client.get_prompt(PROMPT, {"destination": "Goa"})
        text = getattr(got.messages[0].content, "text", "") if got.messages else ""
        check("searchPackages" in text and "Goa" in text, "the prompt renders", text[:80])

        search = await client.call_tool("searchPackages", {})
        found = payload(search)
        packages = found.get("packages") or []
        check(not search.is_error and bool(packages), "searchPackages finds packages", found)

        # A package may have no open date, or one quotePrice refuses (production data): try each
        # package until one quotes. The details call is made on the one that does (else the first).
        slug = packages[0]["slug"]
        quoted = False
        for package in packages:
            candidate = package["slug"]
            dates = await client.call_tool("checkAvailability", {"packageSlug": candidate})
            check(not dates.is_error, f"checkAvailability answers for {candidate}", payload(dates))
            open_date = first_open_date(payload(dates))
            if open_date is None:
                continue
            quote = await client.call_tool(
                "quotePrice", {"departureId": open_date["departureId"], "adults": 2}
            )
            if not quote.is_error:
                slug, quoted = candidate, True
                break

        details = await client.call_tool("getPackageDetails", {"packageSlug": slug})
        check(not details.is_error, f"getPackageDetails answers for {slug}", payload(details))
        page_url = payload(details).get("pageUrl")
        check(
            isinstance(page_url, str) and page_url.startswith(("http://", "https://")),
            "getPackageDetails links are absolute",
            page_url,
        )
        if not quoted:
            print("  note  no package has a date quotePrice accepts: quotePrice not checked")


async def main(url: str) -> int:
    failures: list[BaseException] = []
    try:
        for mode in ("legacy", "auto"):
            await run_mode(url, mode)
    except* SmokeFailed as failed:  # raised inside the client's task group, so it arrives grouped
        failures.extend(leaves(failed))
    for exc in failures:
        print(f"FAIL {exc}", file=sys.stderr)
    if failures:
        return 1
    print("MCP smoke test passed")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smoke-test a Tripsmith MCP server.")
    parser.add_argument("url", help="the server's MCP endpoint, e.g. http://127.0.0.1:8000/mcp")
    sys.exit(asyncio.run(main(parser.parse_args().url)))
