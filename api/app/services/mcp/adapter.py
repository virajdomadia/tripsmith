"""v4 4.0.2: the four MCP tools, a thin adapter over the v3 tool registry (services/ai/tools.py).

Every call goes through the chat's own `run_tool`, so validation, catalogue rules and errors are
the chat's. This module only does what a remote client needs and the chat doesn't:

- `startBooking` returns the chat handoff with its link made absolute (the chat opens a relative
  path on the site it is already on).
- `startEnquiry` runs the chat's `createEnquiry` (live-package check, the summary with contact
  details redacted) and turns its form instruction into a link to the site's own enquiry form
  (`/packages/<slug>/enquire`, else `/contact#enquire`) with the trip choices the site already
  pre-fills from a URL (web `formStateFrom`, PUBLIC_FIELDS). The summary goes back to the
  assistant to suggest, never into the link: what a person writes stays out of URLs, the site's
  rule. It creates nothing: the lead is made only when the customer sends that form
  (`POST /enquiries`, with its own limits and emails).

Nothing here pays, holds seats or writes to the database (03-requirements-v4, the boundary).
"""

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

from app.services.ai.tools import TOOLS, ToolContext, run_tool

SEARCH, AVAILABILITY, BOOKING, ENQUIRY = (
    "searchPackages",
    "checkAvailability",
    "startBooking",
    "startEnquiry",
)

MCP_TOOL_NAMES: tuple[str, ...] = (SEARCH, AVAILABILITY, BOOKING, ENQUIRY)  # the listing order

BOOKING_NEXT = (
    "Give the customer this link: Tripsmith's booking sheet opens with the date and party "
    "filled in, and they pay there. Nothing is booked or held until they do."
)
ENQUIRY_NEXT = (
    "Give the customer this link: Tripsmith's enquiry form opens with the month and party filled "
    "in, and they add their name, phone and a message there (suggest `summary` as the message). "
    "Nothing has been sent yet."
)
# Query fields the site's enquiry form already pre-fills (web enquiry-form-state PUBLIC_FIELDS),
# from the chat handoff's keys. Choices only: nothing a person typed.
_PREFILL = (("month", "travelMonth"), ("adults", "adults"), ("children", "children"))


# MCP names whose registry tool is named differently: `startEnquiry` wraps `createEnquiry`.
_WRAPPED = {ENQUIRY: "createEnquiry"}
# Descriptions written for a remote client (a link, not a panel), replacing the chat's.
_MCP_DESCRIPTIONS = {
    BOOKING: (
        "When the customer wants to book a specific date: checks it can be booked for the "
        "party and returns a link to Tripsmith's booking sheet with the date and party filled "
        "in. Payment happens on the site, never here, and nothing is held until they pay. Ask "
        "how many adults and children first if you do not know. Use a departureId from "
        "checkAvailability."
    ),
    ENQUIRY: (
        "Hand the customer to a person: returns a link to Tripsmith's enquiry form with the "
        "month and party filled in, where the customer adds their name, phone and a message "
        "and sends it; your summary comes back for them to use as the message. Nothing is "
        "sent by this tool. Use when they want to talk to someone, want something that "
        "cannot be booked online, or you cannot help. Never put names, "
        "phone numbers or emails in the summary."
    ),
}


@dataclass(frozen=True)
class McpTool:
    name: str
    description: str
    input_schema: dict[str, Any]


def tool_list() -> list[McpTool]:
    """The MCP tools in `MCP_TOOL_NAMES` order, with the registry's input schemas. A registry tool
    is listed only if it carries the "mcp" surface; a wrapped one (`startEnquiry`) is listed
    because the adapter itself wraps its chat-only tool."""
    listed: list[McpTool] = []
    for name in MCP_TOOL_NAMES:
        tool = TOOLS[_WRAPPED.get(name, name)]
        if name not in _WRAPPED and "mcp" not in tool.surfaces:
            continue
        description = _MCP_DESCRIPTIONS.get(name, tool.spec.description)
        listed.append(McpTool(name, description, tool.spec.parameters))
    return listed


def absolute_url(site_url: str, path: str) -> str:
    return site_url.rstrip("/") + path


def enquiry_url(site_url: str, handoff: dict[str, Any]) -> str:
    """The site's enquiry form for the chat's `createEnquiry` result: the package's own enquiry
    page when a live package was named, else the contact page's form. Trip choices only (R34a)."""
    package = handoff.get("package")
    params = {field: str(handoff[key]) for key, field in _PREFILL if handoff.get(key) is not None}
    query = f"?{urlencode(params)}" if params else ""
    if package:
        return absolute_url(site_url, f"/packages/{package['slug']}/enquire{query}")
    return absolute_url(site_url, f"/contact{query}#enquire")


async def call(ctx: ToolContext, site_url: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
    """One MCP tool call → its result. A result with `error` is reported as an MCP tool error."""
    if name in (SEARCH, AVAILABILITY):
        result, _ = await run_tool(ctx, name, args)
        return result
    if name == BOOKING:
        result, _ = await run_tool(ctx, BOOKING, args)
        if "error" in result:
            return result
        return {**result, "url": absolute_url(site_url, result["url"]), "next": BOOKING_NEXT}
    if name == ENQUIRY:
        handoff, _ = await run_tool(ctx, "createEnquiry", args)
        if "error" in handoff:
            return handoff
        return {
            "url": enquiry_url(site_url, handoff),
            "package": handoff.get("package"),
            "summary": handoff.get("summary"),
            "next": ENQUIRY_NEXT,
        }
    return {"error": f"There is no tool called {name!r}."}
