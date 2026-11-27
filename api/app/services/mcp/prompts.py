"""v4 4.0.5: the `plan-a-trip` prompt (03-requirements-v4 R35).

A prompt is a message the customer picks in their own assistant (Claude Desktop's "+" menu, for
one) to start planning: what they know so far, then how to use Tripsmith's tools. It reads
nothing and writes nothing. The assistant does the work through the tools, which carry the rules.

MCP prompt arguments are strings. Each is trimmed, has contact details redacted (the customer
types them into a form field, so a phone can slip in) and is cut to `MAX_ARG`; an unknown one
is refused, like the tools' `extra="forbid"`.
"""

from dataclasses import dataclass

from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS

from app.services.ai.pii import redact

PLAN_A_TRIP = "plan-a-trip"
TITLE = "Plan a trip with Tripsmith"
DESCRIPTION = (
    "Start planning a short holiday in India with Tripsmith: real packages, dates and seats, "
    "and a link to book on Tripsmith's site."
)
MAX_ARG = 120


@dataclass(frozen=True)
class Arg:
    name: str
    description: str
    label: str  # how the message lists it


ARGS = (
    Arg("destination", "Where you'd like to go, e.g. Goa or Kerala", "Destination"),
    Arg("month", "When, e.g. December 2026", "When"),
    Arg("budget", "Budget, e.g. ₹40,000 per person", "Budget"),
    Arg("party", "Who's going, e.g. 2 adults and a child", "Who's going"),
)
_NAMES = {a.name for a in ARGS}

STEPS = """\
How to help me:
1. Use searchPackages to find Tripsmith packages that fit. If nothing fits, say so and show me \
the nearest options it returns.
2. Before suggesting dates, use checkAvailability on the package I like.
3. If you don't know how many adults and children are going, ask me.
4. When I pick a date, use startBooking and give me its link: I book and pay on Tripsmith's \
site. Nothing is held until I do.
5. If I'd rather talk to someone, or nothing online fits, use startEnquiry and give me its link.

Only quote prices, dates and seats the tools return. Don't ask for my name, phone or email: \
I'll type those on Tripsmith's site."""


def unknown(name: str) -> MCPError:
    return MCPError(INVALID_PARAMS, f"There is no prompt called {name[:60]!r}.")


def render(arguments: dict[str, str]) -> str:
    """The one user message `plan-a-trip` returns."""
    extra = sorted(set(arguments) - _NAMES)
    if extra:
        raise MCPError(
            INVALID_PARAMS, f"Unknown argument {extra[0][:60]!r}. Use: {', '.join(sorted(_NAMES))}."
        )
    known = []
    for arg in ARGS:
        value = redact(str(arguments.get(arg.name) or "").strip())[:MAX_ARG].strip()
        if value:
            known.append(f"- {arg.label}: {value}")
    opening = "I'd like to plan a trip with Tripsmith."
    if not known:
        return f"{opening}\n\n{STEPS}"
    return f"{opening}\n\nWhat I know so far:\n" + "\n".join(known) + f"\n\n{STEPS}"
