"""v4 4.0.2: the four MCP tools, a thin adapter over the v3 tool registry (services/ai/tools.py).

Every call goes through the chat's own `run_tool`, so validation, catalogue rules and errors are
the chat's. This module only does what a remote client needs and the chat doesn't:

- `startBooking` returns the chat handoff with its link made absolute (the chat opens a relative
  path on the site it is already on).
- `startEnquiry` runs the chat's `createEnquiry` (live-package check, the summary with contact
  details redacted) and turns its form instruction into a link to the site's enquiry form,
  pre-filled with trip details. It creates nothing: the lead is made only when the customer
  submits that form (`POST /enquiries`, with its own limits and emails).

Nothing here pays, holds seats or writes to the database (03-requirements-v4, the boundary).
"""

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

from app.services.ai.tools import TOOLS, ToolContext, run_tool

NOTE_MAX = 300  # the web form's limit for a pre-filled note (R34a)

SEARCH, AVAILABILITY, BOOKING, ENQUIRY = (
    "searchPackages",
    "checkAvailability",
    "startBooking",
    "startEnquiry",
)

BOOKING_NEXT = (
    "Give the customer this link: Tripsmith's booking sheet opens with the date and party "
    "filled in, and they pay there. Nothing is booked or held until they do."
)
ENQUIRY_NEXT = (
    "Give the customer this link: Tripsmith's enquiry form opens with these trip details filled "
    "in, and they add their name and phone there. Nothing has been sent yet."
)


@dataclass(frozen=True)
class McpTool:
    name: str
    description: str
    input_schema: dict[str, Any]


def tool_list() -> list[McpTool]:
    """The four tools, with the chat's own input schemas."""
    return [
        McpTool(SEARCH, TOOLS[SEARCH].spec.description, TOOLS[SEARCH].spec.parameters),
        McpTool(
            AVAILABILITY, TOOLS[AVAILABILITY].spec.description, TOOLS[AVAILABILITY].spec.parameters
        ),
        McpTool(
            BOOKING,
            "When the customer wants to book a specific date: checks it can be booked for the "
            "party and returns a link to Tripsmith's booking sheet with the date and party filled "
            "in. Payment happens on the site, never here, and nothing is held until they pay. Ask "
            "how many adults and children first if you do not know. Use a departureId from "
            "checkAvailability.",
            TOOLS[BOOKING].spec.parameters,
        ),
        McpTool(
            ENQUIRY,
            "Hand the customer to a person: returns a link to Tripsmith's enquiry form, filled in "
            "with your summary and the trip details, where the customer adds their name and phone "
            "and sends it. Nothing is sent by this tool. Use when they want to talk to someone, "
            "want something that cannot be booked online, or you cannot help. Never put names, "
            "phone numbers or emails in the summary.",
            TOOLS["createEnquiry"].spec.parameters,
        ),
    ]


def absolute_url(site_url: str, path: str) -> str:
    return site_url.rstrip("/") + path


def enquiry_url(site_url: str, handoff: dict[str, Any]) -> str:
    """The site's enquiry form for the chat's `createEnquiry` result: the package page's form when
    a live package was named, else /contact. Only trip details travel in the link (R34a)."""
    package = handoff.get("package")
    path = f"/packages/{package['slug']}" if package else "/contact"
    params: dict[str, str] = {"enquire": "1"}
    for key in ("month", "adults", "children"):
        if handoff.get(key) is not None:
            params[key] = str(handoff[key])
    note = str(handoff.get("summary") or "").strip()[:NOTE_MAX].strip()
    if note:
        params["note"] = note
    return absolute_url(site_url, f"{path}?{urlencode(params)}")


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
            "next": ENQUIRY_NEXT,
        }
    return {"error": f"There is no tool called {name!r}."}
