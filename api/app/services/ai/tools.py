"""The concierge's tools (03 R27, 06 C6): plain typed functions over the same services the site
uses, so a card in chat is exactly what the listing would show.

Every tool validates its arguments with pydantic (R33) — the model's JSON is untrusted input —
and returns a JSON-able dict. A bad argument or a failing lookup comes back as `{"error": ...}`
for the model to recover from, and is recorded on the conversation (`last_error`).

C1 shipped `searchPackages` and `checkAvailability`; C3 adds `startBooking` (the Book-now sheet,
never payment) and `createEnquiry` (opens the enquiry form in the panel — the model never sees a
name or phone; it only writes the summary). When nothing can be booked, a result carries
`alertFor` so the panel can offer "Email me when new dates are added" (R30).
"""

import datetime as dt
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Destination, Package
from app.models.enums import PackageStatus, Theme
from app.schemas.catalog import MONTH_PATTERN, PackageCard, SearchParams
from app.schemas.meta import MAX_TRAVELLERS
from app.services.ai.handoff import start_booking
from app.services.ai.model import ToolSpec
from app.services.ai.pii import redact
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


class StartBookingArgs(ToolArgs):
    departure_id: str = Field(
        min_length=1, max_length=40, description="The departureId from checkAvailability."
    )
    adults: int = Field(ge=1, le=MAX_TRAVELLERS, description="Adults travelling (12+ years).")
    children: int = Field(
        default=0, ge=0, le=MAX_TRAVELLERS - 1, description="Children under 12 travelling."
    )

    @model_validator(mode="after")
    def _party(self) -> "StartBookingArgs":
        if self.adults + self.children > MAX_TRAVELLERS:
            raise ValueError(f"at most {MAX_TRAVELLERS} travellers per booking")
        return self


class CreateEnquiryArgs(ToolArgs):
    summary: str = Field(
        min_length=10,
        max_length=500,
        description="What the customer wants, in a few sentences, for the Tripsmith team: where, "
        "when, how many, budget, anything special. No names, phone numbers or emails.",
    )
    package_slug: str | None = Field(
        default=None,
        max_length=120,
        pattern=r"^[a-z0-9-]+$",
        description="The package they are asking about, if one.",
    )
    adults: int | None = Field(default=None, ge=1, le=MAX_TRAVELLERS)
    children: int | None = Field(default=None, ge=0, le=MAX_TRAVELLERS - 1)
    month: str | None = Field(default=None, pattern=MONTH_PATTERN, description="YYYY-MM")


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


async def package_names(db: AsyncSession) -> list[tuple[str, str]]:
    """Every package we have ever listed (slug, name), live or not: the names a reply may only
    use once a tool returned them (the guardrail)."""
    return [(slug, name) for slug, name in await db.execute(select(Package.slug, Package.name))]


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
        if len(slugs) == 1:  # one known destination, nothing open: offer its new-dates alert
            name = next(n for slug, n in destinations if slug == slugs[0])
            result["alertFor"] = {"destinationSlug": slugs[0], "name": name}
    return result


async def check_availability_tool(ctx: ToolContext, args: CheckAvailabilityArgs) -> dict[str, Any]:
    """Upcoming departures of one package: dates, seats left and the per-person price."""
    departures = await get_departures_for_month(
        ctx.db, args.package_slug, args.month, today=ctx.today
    )
    if departures is None:
        return {"error": f"No live package has the slug {args.package_slug!r}."}
    shown = departures[:MAX_DEPARTURES]
    name = (
        await ctx.db.execute(select(Package.name).where(Package.slug == args.package_slug))
    ).scalar_one()
    alert: dict[str, str] | None = None
    if not departures and (
        args.month is None
        or not await get_departures_for_month(ctx.db, args.package_slug, None, today=ctx.today)
    ):
        # No upcoming date at all (not just none that month): offer the new-dates alert.
        alert = {"packageSlug": args.package_slug, "name": name}
    return {
        "packageSlug": args.package_slug,
        "packageName": name,
        **({"alertFor": alert} if alert else {}),
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


async def start_booking_tool(ctx: ToolContext, args: StartBookingArgs) -> dict[str, Any]:
    """Check the date can be booked for the party and hand over to the Book-now sheet."""
    try:
        started = await start_booking(
            ctx.db, args.departure_id, adults=args.adults, children=args.children, now=ctx.now
        )
    except ApiError as exc:  # gone (404) or unbookable for this party (409): say why
        return {"error": exc.message}
    return {
        "packageSlug": started.package_slug,
        "packageName": started.package_name,
        "departureId": started.departure_id,
        "date": started.date.isoformat(),
        "adults": started.adults,
        "children": started.children,
        "totalPaise": started.total_paise,
        "total": _rupees(started.total_paise),
        "url": started.url,
        "next": "The site now opens the booking sheet; the customer pays there, not in chat.",
    }


async def create_enquiry_tool(ctx: ToolContext, args: CreateEnquiryArgs) -> dict[str, Any]:
    """Open the enquiry form in the panel, pre-filled; the customer types name and phone there."""
    package: dict[str, str] | None = None
    if args.package_slug:
        name = (
            await ctx.db.execute(
                select(Package.name).where(
                    Package.slug == args.package_slug, Package.status == PackageStatus.LIVE
                )
            )
        ).scalar_one_or_none()
        if name:
            package = {"slug": args.package_slug, "name": name}
    return {
        "form": "enquiry",
        "summary": redact(args.summary),  # C6: the model writes it; no contact details
        "package": package,
        "adults": args.adults,
        "children": args.children,
        "month": args.month,
        "next": "The enquiry form is open for the customer to add their name and phone.",
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
            "(adult, twin sharing). Use the slug from searchPackages. When the package has no "
            "upcoming date, returns `alertFor`: the site then offers a new-dates email alert.",
        ),
        _tool(
            "startBooking",
            StartBookingArgs,
            start_booking_tool,
            "When the customer wants to book a specific date: checks it can be booked for the "
            "party and opens the booking sheet on the package page with the date and party filled "
            "in. Payment happens there, never in chat. Ask how many adults and children first if "
            "you do not know. Use a departureId from checkAvailability.",
        ),
        _tool(
            "createEnquiry",
            CreateEnquiryArgs,
            create_enquiry_tool,
            "Hand the customer to a person: opens the enquiry form in the chat, pre-filled with "
            "your summary, for the customer to add their contact details. Use when they ask for a "
            "person, want something we cannot book online, or you cannot help.",
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
