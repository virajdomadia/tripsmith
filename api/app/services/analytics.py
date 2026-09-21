"""recordView (06 C3, A5): one counter row per live package per IST day.

Bots are dropped by user agent before touching the database; unknown or draft slugs are a
silent no-op — the route always answers 204, so a beacon can never be used to probe the catalog.
"""

import datetime as dt
import re

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package, PackageView
from app.models.enums import PackageStatus
from app.services.email.render import IST

# Crawlers, link-preview fetchers (the OG card, F13, is fetched by these on every share) and
# scripted clients. Real phones and desktops never carry these tokens: crawlers write
# `Googlebot/2.1`, `bingbot/2.0`, `PetalBot;` — a bare `bot` would also drop Cubot phones
# (`CUBOT KINGKONG 5 Pro`).
BOT_UA = re.compile(
    r"bot[/;)]|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit"
    r"|whatsapp|telegram|twitterbot|linkedinbot|slackbot|discordbot|skypeuripreview"
    r"|curl|wget|python-requests|httpx|go-http-client|java/|okhttp|axios|node-fetch|undici",
    re.IGNORECASE,
)


def is_bot(user_agent: str | None) -> bool:
    """A missing UA counts as a bot: every browser sends one."""
    return not user_agent or bool(BOT_UA.search(user_agent))


def ist_today(now: dt.datetime | None = None) -> dt.date:
    """The business day: the owner reads the dashboard in India, so a view at 11 pm IST is today."""
    return (now or dt.datetime.now(dt.UTC)).astimezone(IST).date()


async def record_view(
    db: AsyncSession, slug: str, *, user_agent: str | None, today: dt.date | None = None
) -> bool:
    """Upsert `package_views(package_id, day)` += 1. Returns whether a view was counted."""
    if is_bot(user_agent):
        return False
    package_id = (
        await db.execute(
            select(Package.id).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if package_id is None:
        return False
    stmt = insert(PackageView).values(package_id=package_id, day=today or ist_today(), count=1)
    stmt = stmt.on_conflict_do_update(
        index_elements=[PackageView.package_id, PackageView.day],
        set_={"count": PackageView.count + 1},
    )
    await db.execute(stmt)
    await db.commit()
    return True
