"""The concierge's tools (03 R27, 06 C6): plain typed functions over the same services the site
uses, so a card in chat is exactly what the listing would show.

Every tool validates its arguments with pydantic (R33) — the model's JSON is untrusted input —
and returns a JSON-able dict. A bad argument or a failing lookup comes back as `{"error": ...}`
for the model to recover from, and is recorded on the conversation (`last_error`).

C1 ships `searchPackages` and `checkAvailability`; `startBooking` and `createEnquiry` join in C3.
"""

import datetime as dt
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Destination, Package
from app.models.enums import PackageStatus, Theme
from app.schemas.catalog import MONTH_PATTERN, PackageCard, SearchParams
from app.services.ai.model import ToolSpec
from app.services.catalog.reads import get_departures_for_month
from app.services.catalog.search import search_packages
from app.services.format import inr

log = logging.getLogger(__name__)

MAX_PACKAGES = 5  # R27
MAX_DEPARTURES = 8
NIGHTS_SLACK = 1  # "3 days in Goa" may arrive as nights=3 or 2: match a night either side


@dataclass(frozen=True)
class ToolContext:
    db: AsyncSession
    today: dt.date
    now: dt.datetime


class ToolArgs(BaseModel):
    """camelCase for the model (the names in 06 C6), strict about unknown keys."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class SearchPackagesArgs(ToolArgs):
    destination: str | None = Field(
        default=None,
        max_length=60,
        description="A destination name or slug, e.g. 'Goa'. Omit to search every destination.",
    )
    max_budget: int | None = Field(
        default=None,
        gt=0,
        le=10_000_000,
        description="Maximum price per person in whole rupees, e.g. 15000.",
    )
    nights: int | None = Field(
        default=None,
        ge=1,
        le=30,
        description="Trip length in nights (a night either side matches).",
    )
    theme: Theme | None = Field(default=None, description="One trip theme.")
    month: str | None = Field(
        default=None,
        pattern=MONTH_PATTERN,
        description="YYYY-MM: only packages with a departure that month that still has seats.",
    )


class CheckAvailabilityArgs(ToolArgs):
    package_slug: str = Field(
        min_length=1, max_length=120, description="The package's slug, from searchPackages."
    )
    month: str | None = Field(
        default=None, pattern=MONTH_PATTERN, description="YYYY-MM to show one month only."
    )


def _rupees(paise: int) -> str:
    return inr(paise // 100) if paise else "on request"


def card(c: PackageCard) -> dict[str, Any]:
    """What chat shows and the model reads: the listing card, trimmed to R26's fields."""
    price = c.deal.price_paise if c.deal else c.starting_price_paise
    return {
        "slug": c.slug,
        "name": c.name,
        "destination": c.destination,
        "nights": c.nights,
        "days": c.days,
        "fromPricePaise": price,
        "fromPrice": _rupees(price) + (" per person" if price else ""),
        "wasPricePaise": c.starting_price_paise if c.deal else None,
        "themes": [str(t) for t in c.themes],
        "highlights": c.highlights[:3],
        "coverUrl": c.cover_url,
        "badge": str(c.badge) if c.badge else None,
        "seatsLeft": c.seats_left,
        "url": f"/packages/{c.slug}",
    }


async def _live_destinations(db: AsyncSession) -> list[tuple[str, str]]:
    rows = await db.execute(
        select(Destination.slug, Destination.name)
        .join(Package, Package.destination_id == Destination.id)
        .where(Package.status == PackageStatus.LIVE)
        .group_by(Destination.id)
        .order_by(Destination.position, Destination.name)
    )
    return [(slug, name) for slug, name in rows]


def match_destination(query: str, destinations: list[tuple[str, str]]) -> list[str]:
    """Slugs whose slug or name matches what the visitor typed ("Goa", "north goa", "kerala")."""
    q = query.strip().lower()
    exact = [slug for slug, name in destinations if q in (slug, name.lower())]
    if exact:
        return exact
    return [
        slug
        for slug, name in destinations
        if q in name.lower() or name.lower() in q or q in slug or slug in q.replace(" ", "-")
    ]


async def search_packages_tool(ctx: ToolContext, args: SearchPackagesArgs) -> dict[str, Any]:
    """Search the live catalog. Returns up to 5 packages, cheapest first."""
    destinations = await _live_destinations(ctx.db)
    offered = [name for _, name in destinations]
    slugs: list[str] = []
    if args.destination:
        slugs = match_destination(args.destination, destinations)
        if not slugs:
            return {"packages": [], "unknownDestination": args.destination, "weOffer": offered}
    params = SearchParams(
        destination=slugs,
        max_budget=args.max_budget,
        nights_min=max(1, args.nights - NIGHTS_SLACK) if args.nights else None,
        nights_max=args.nights + NIGHTS_SLACK if args.nights else None,
        themes=[args.theme] if args.theme else [],
        month=args.month,
    )
    found = await search_packages(ctx.db, params, today=ctx.today, now=ctx.now)
    result: dict[str, Any] = {
        "packages": [card(c) for c in found.items[:MAX_PACKAGES]],
        "totalMatches": found.total,
    }
    if not found.items:
        result["weOffer"] = offered
    return result


async def check_availability_tool(ctx: ToolContext, args: CheckAvailabilityArgs) -> dict[str, Any]:
    """Upcoming departures of one package: dates, seats left and the per-person price."""
    departures = await get_departures_for_month(
        ctx.db, args.package_slug, args.month, today=ctx.today
    )
    if departures is None:
        return {"error": f"No live package has the slug {args.package_slug!r}."}
    shown = departures[:MAX_DEPARTURES]
    return {
        "packageSlug": args.package_slug,
        "departures": [
            {
                "departureId": d.id,
                "date": d.date.isoformat(),
                "seatsLeft": d.seats_left,
                "pricePerPersonPaise": d.price_double_paise,
                "pricePerPerson": _rupees(d.price_double_paise),
                "childPricePaise": d.price_child_paise,
                "guaranteed": d.guaranteed,
                "badge": str(d.badge) if d.badge else None,
            }
            for d in shown
        ],
        "more": len(departures) - len(shown),
        "pricesAre": "per adult, twin sharing",
    }


@dataclass(frozen=True)
class Tool:
    spec: ToolSpec
    args: type[ToolArgs]
    run: Callable[[ToolContext, Any], Awaitable[dict[str, Any]]]


def _schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic's JSON Schema, flattened for a model API: `X | None` becomes plain `X` (optional
    = not required), enums inline, no titles."""
    schema = model.model_json_schema(by_alias=True)
    defs = schema.pop("$defs", {})

    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return clean(defs[node["$ref"].rsplit("/", 1)[-1]])
            options = node.get("anyOf")
            if options and any(o.get("type") == "null" for o in options):
                rest = [o for o in options if o.get("type") != "null"]
                merged = {k: v for k, v in node.items() if k not in ("anyOf", "default")}
                return clean({**(rest[0] if len(rest) == 1 else {"anyOf": rest}), **merged})
            return {k: clean(v) for k, v in node.items() if k not in ("title", "default")}
        if isinstance(node, list):
            return [clean(v) for v in node]
        return node

    cleaned = clean(schema)
    cleaned.pop("additionalProperties", None)
    return cleaned


def _tool(name: str, args: type[ToolArgs], run: Any, description: str) -> Tool:
    return Tool(ToolSpec(name, description, _schema(args)), args, run)


TOOLS: dict[str, Tool] = {
    t.spec.name: t
    for t in (
        _tool(
            "searchPackages",
            SearchPackagesArgs,
            search_packages_tool,
            "Search Tripsmith's live tour packages. Returns at most 5 packages (cheapest first) "
            "with prices per person. If the destination is not offered, returns "
            "`unknownDestination` and `weOffer` (the destinations we do offer).",
        ),
        _tool(
            "checkAvailability",
            CheckAvailabilityArgs,
            check_availability_tool,
            "Upcoming departure dates of one package with seats left and the price per person "
            "(adult, twin sharing). Use the slug from searchPackages.",
        ),
    )
}
TOOL_SPECS: list[ToolSpec] = [t.spec for t in TOOLS.values()]


async def run_tool(
    ctx: ToolContext, name: str, raw: dict[str, Any]
) -> tuple[dict[str, Any], str | None]:
    """→ (result for the model, error to record or None). Never raises."""
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"There is no tool called {name!r}."}, f"unknown tool {name}"
    try:
        args = tool.args.model_validate(raw)
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'args'}: {e['msg']}" for e in exc.errors()
        )
        return {"error": f"Invalid arguments — {problems}"}, f"{name}: {problems}"
    try:
        # A savepoint: a failed statement must not poison the turn's session for what follows.
        async with ctx.db.begin_nested():
            result = await tool.run(ctx, args)
    except Exception as exc:  # noqa: BLE001 — the model gets an error, the turn goes on
        log.exception("Concierge tool %s failed", name)
        return {"error": "That lookup failed. Try again or offer the enquiry form."}, (
            f"{name}: {type(exc).__name__}"
        )
    return result, (f"{name}: {result['error']}" if "error" in result else None)
