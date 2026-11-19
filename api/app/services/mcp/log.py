"""v4 4.0.4: the `mcp_requests` row for each MCP call served (03-requirements-v4 R36).

Written after the result is built, in its own short session (the tool's own session is never
committed). Logging never fails a call: a write error is reported to the function log and the
customer still gets their answer.

What is stored is bounded and sanitised: every string in the args goes through `pii.redact()`
(the summary is the free-text field, but a caller can send anything) and is cut to `MAX_TEXT`;
dicts and lists keep their first `MAX_ITEMS` entries, to `MAX_DEPTH` levels.
"""

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import McpRequest
from app.services.ai.pii import redact

log = logging.getLogger(__name__)

MAX_TEXT = 300
MAX_ITEMS = 20
MAX_DEPTH = 4
MAX_LABEL = 200  # tool names, client name/version, User-Agent, error text


def clean_args(value: dict[str, Any]) -> dict[str, Any]:
    """`value` as it may be stored: contact details redacted, every part bounded."""
    cleaned = _clean(value, 0)
    return cleaned if isinstance(cleaned, dict) else {}


def _clean(value: Any, depth: int) -> Any:
    if isinstance(value, str):
        return redact(value)[:MAX_TEXT]
    if value is None or isinstance(value, bool | int | float):
        return value
    if depth >= MAX_DEPTH:
        return "…"
    if isinstance(value, dict):
        items = list(value.items())[:MAX_ITEMS]
        return {redact(str(k))[:MAX_LABEL]: _clean(v, depth + 1) for k, v in items}
    if isinstance(value, list | tuple):
        return [_clean(v, depth + 1) for v in value[:MAX_ITEMS]]
    return redact(str(value))[:MAX_TEXT]


def label(value: str | None) -> str | None:
    return redact(value)[:MAX_LABEL] if value else None


async def record(
    sessions: async_sessionmaker[AsyncSession],
    *,
    method: str,
    name: str,
    args: dict[str, Any],
    latency_ms: int,
    error: str | None,
    ip_hash: str,
    client_name: str | None,
    client_version: str | None,
    user_agent: str | None,
) -> None:
    row = McpRequest(
        method=method,
        name=label(name) or "",
        args=clean_args(args),
        latency_ms=max(0, latency_ms),
        ok=error is None,
        error=label(error),
        ip_hash=ip_hash,
        client_name=label(client_name),
        client_version=label(client_version),
        user_agent=label(user_agent),
    )
    try:
        async with sessions() as db:
            db.add(row)
            await db.commit()
    except Exception:  # noqa: BLE001 — the log must never cost the customer their answer
        log.exception("Could not write the mcp_requests row for %s", row.name)
