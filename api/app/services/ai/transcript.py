"""A concierge chat as the owner reads it (R29: "the enquiry detail shows the transcript
readably"; C5's conversation log reuses it).

Stored messages hold the stream's parts (text, tool-call, tool-result, thought signatures). The
owner needs three kinds of line: what the visitor wrote, what the concierge said, and one plain
sentence per lookup ("Searched Goa · up to ₹15,000 → 2 packages: …") instead of raw JSON.
"""

import datetime as dt
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message
from app.models.enums import MessageRole
from app.schemas.chat import TranscriptLine, TranscriptRole
from app.services.format import inr, long_date

NAMES_SHOWN = 3


def _month(value: object) -> str | None:
    if not isinstance(value, str) or len(value) != 7:
        return None
    try:
        return dt.date.fromisoformat(f"{value}-01").strftime("%B %Y")
    except ValueError:
        return None


def _day(value: object) -> str:
    try:
        return long_date(dt.date.fromisoformat(str(value)))
    except ValueError:
        return str(value)


def _names(items: list[Any], key: str) -> str:
    names = [str(i.get(key)) for i in items if isinstance(i, dict) and i.get(key)]
    more = len(names) - NAMES_SHOWN
    return ", ".join(names[:NAMES_SHOWN]) + (f" and {more} more" if more > 0 else "")


def _search(args: dict[str, Any], result: dict[str, Any]) -> str:
    bits = [str(args.get("destination") or "every destination")]
    if args.get("nights"):
        bits.append(f"{args['nights']} nights")
    if month := _month(args.get("month")):
        bits.append(month)
    if args.get("theme"):
        bits.append(str(args["theme"]))
    if isinstance(args.get("maxBudget"), int):
        bits.append(f"up to {inr(args['maxBudget'])} a person")
    what = "Searched " + " · ".join(bits)
    if result.get("unknownDestination"):
        return f"{what} → not a destination we offer"
    packages = result.get("packages") or []
    if not packages:
        return f"{what} → nothing matched"
    count = result.get("totalMatches", len(packages))
    noun = "package" if count == 1 else "packages"
    return f"{what} → {count} {noun}: {_names(packages, 'name')}"


def _availability(args: dict[str, Any], result: dict[str, Any]) -> str:
    trip = result.get("packageName") or args.get("packageSlug") or "a trip"
    month = _month(args.get("month"))
    what = f"Checked dates for {trip}" + (f" in {month}" if month else "")
    departures = result.get("departures") or []
    if not departures:
        return f"{what} → no open dates"
    total = len(departures) + int(result.get("more") or 0)
    first = _day(departures[0].get("date")) if isinstance(departures[0], dict) else ""
    return f"{what} → {total} open {'date' if total == 1 else 'dates'}, first {first}"


def _booking(result: dict[str, Any]) -> str:
    party = f"{result.get('adults')} adult" + ("s" if result.get("adults") != 1 else "")
    if result.get("children"):
        party += f", {result['children']} child" + ("ren" if result["children"] != 1 else "")
    total = result.get("totalPaise")
    price = f" · {inr(total // 100)}" if isinstance(total, int) and total else ""
    return (
        f"Opened the booking sheet: {result.get('packageName')}, {_day(result.get('date'))}, "
        f"{party}{price}"
    )


def _enquiry(result: dict[str, Any]) -> str:
    package = result.get("package")
    about = f" about {package['name']}" if isinstance(package, dict) and package.get("name") else ""
    return f"Opened the enquiry form{about}: “{result.get('summary', '')}”"


def describe(name: str, args: dict[str, Any], result: dict[str, Any]) -> str:
    """One sentence for a lookup and what it found."""
    if isinstance(result.get("error"), str):
        return f"{name} failed: {result['error']}"
    match name:
        case "searchPackages":
            return _search(args, result)
        case "checkAvailability":
            return _availability(args, result)
        case "startBooking":
            return _booking(result)
        case "createEnquiry":
            return _enquiry(result)
    return f"Used {name}"


Row = tuple[MessageRole, list[dict[str, Any]], dt.datetime]


def _turn_lines(
    role: MessageRole, parts: list[dict[str, Any]], at: dt.datetime
) -> list[TranscriptLine]:
    speaker = TranscriptRole.VISITOR if role == MessageRole.USER else TranscriptRole.CONCIERGE
    calls = {p.get("id"): p for p in parts if p.get("type") == "tool-call"}
    lines: list[TranscriptLine] = []
    text: list[str] = []
    for part in [*parts, {"type": "end"}]:
        kind = part.get("type")
        if kind == "text":
            text.append(str(part.get("text", "")))
            continue
        if kind not in ("tool-result", "end"):
            continue
        if joined := "".join(text).strip():
            lines.append(TranscriptLine(role=speaker, text=joined, at=at))
        text = []
        if kind == "tool-result":
            call = calls.get(part.get("id"), {})
            raw_args, raw_result = call.get("args"), part.get("result")
            args: dict[str, Any] = raw_args if isinstance(raw_args, dict) else {}
            result: dict[str, Any] = raw_result if isinstance(raw_result, dict) else {}
            line = describe(str(part.get("name")), args, result)
            lines.append(TranscriptLine(role=TranscriptRole.LOOKUP, text=line, at=at))
    return lines


def readable(rows: list[Row]) -> list[TranscriptLine]:
    """Stored messages (oldest first) → lines. A turn's text pieces join into one line."""
    return [line for role, parts, at in rows for line in _turn_lines(role, parts, at)]


async def transcript_for(db: AsyncSession, conversation_id: str) -> list[TranscriptLine]:
    rows = (
        await db.execute(
            select(Message.role, Message.parts, Message.created_at)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at, Message.id)
        )
    ).all()
    return readable([(role, parts, at) for role, parts, at in rows])
