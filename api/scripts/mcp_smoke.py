"""v4 4.0.5: drive a running Tripsmith MCP server with the SDK's own client, over real HTTP.

The pytest suite talks to the app in-process; this talks to a real server the way Claude Desktop
or a connector does, so it catches what in-process tests can't: the ASGI server, real sockets,
the SDK's transport and client changing under a version bump. CI runs it against uvicorn on a
seeded database (.github/workflows/ci.yml); 4.0.6 runs it against a preview and production.

    uv run python scripts/mcp_smoke.py http://127.0.0.1:8000/mcp
    uv run python scripts/mcp_smoke.py https://api.example/mcp

Each mode (`legacy`: the `initialize` handshake; `auto`: the 2026-07-28 flow when the server
offers it) lists the tools and the prompt, gets the prompt, and calls the two read-only tools.
Four calls a mode, so eight against the 60-an-hour limit; each is logged in `mcp_requests`.
Nothing books, holds or sends. Exits 1 on the first failed check.
"""

import argparse
import asyncio
import json
import sys
from typing import Any

from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client

TOOLS = {"searchPackages", "checkAvailability", "startBooking", "startEnquiry"}
PROMPT = "plan-a-trip"


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


async def run_mode(url: str, mode: str) -> None:
    print(f"{mode}:")
    async with Client(streamable_http_client(url), mode=mode) as client:  # type: ignore[arg-type]
        info = client.server_info
        check(info is not None and info.name == "tripsmith", "server is tripsmith", info)

        tools = {t.name for t in (await client.list_tools()).tools}
        check(tools == TOOLS, "exactly the four tools", sorted(tools))

        prompts = [p.name for p in (await client.list_prompts()).prompts]
        check(prompts == [PROMPT], "the plan-a-trip prompt is listed", prompts)
        got = await client.get_prompt(PROMPT, {"destination": "Goa"})
        text = getattr(got.messages[0].content, "text", "") if got.messages else ""
        check("searchPackages" in text and "Goa" in text, "the prompt renders", text[:80])

        search = await client.call_tool("searchPackages", {})
        found = payload(search)
        packages = found.get("packages") or []
        check(not search.is_error and bool(packages), "searchPackages finds packages", found)

        slug = packages[0]["slug"]
        dates = await client.call_tool("checkAvailability", {"packageSlug": slug})
        check(not dates.is_error, f"checkAvailability answers for {slug}", payload(dates))


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
