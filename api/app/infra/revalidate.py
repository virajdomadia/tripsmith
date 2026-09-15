"""Tell the web deployment to drop cached pages: `POST {WEB_URL}/revalidate` (04 §1).

Called by admin services after every mutation with the affected cache tags (`packages`,
`package:<slug>`, `destination:<slug>`). Never raises — a stale page is better than a failed
save — but every failure is logged (S8 forwards errors to Sentry).
"""

import logging
from collections.abc import Sequence

import httpx

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 5.0


async def revalidate(
    tags: Sequence[str],
    *,
    settings: Settings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> bool:
    """Returns True when the web confirmed the revalidation (or there was nothing to do)."""
    if not tags:
        return True
    settings = settings or get_settings()
    if settings.revalidate_secret is None:
        log.warning("REVALIDATE_SECRET not set; skipping revalidation of %s", list(tags))
        return False

    url = settings.web_url.rstrip("/") + "/revalidate"
    body = {"secret": settings.revalidate_secret.get_secret_value(), "tags": list(tags)}
    try:
        async with httpx.AsyncClient(transport=transport, timeout=TIMEOUT_SECONDS) as client:
            res = await client.post(url, json=body)
    except httpx.HTTPError as exc:
        log.error("Revalidation of %s failed: %s", list(tags), exc)
        return False
    if res.is_success:
        return True
    log.error(
        "Revalidation of %s rejected by web: HTTP %s %s", list(tags), res.status_code, res.text
    )
    return False
