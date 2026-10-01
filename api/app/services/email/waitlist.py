"""The waitlist's emails (R44, P6): "seats are free — claim them by <time>" and, once, "your
offer ended — you're back on the list at #N".

What an entry owes sits on the row (`mail_due`, set by `booking/waitlist.walk`). `send_due`
claims one at a time with a guarded UPDATE in a short transaction and sends after it commits,
so two callers (a route and the 15-minute tick) never send one email twice; a send that fails
is logged and reported, not retried. It runs after any commit that may have made offers, and
`/cron/waitlist` sweeps whatever a caller left. Demo mode follows the booking emails
(`deliver`): an @example.com address, or Resend's test sender, redirects to the owner. Each
send lands in the entry's own log. Never raises.
"""

import datetime as dt
import logging
from dataclasses import dataclass

import sentry_sdk
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import BUSINESS
from app.config import Settings
from app.infra.email import EmailMessage
from app.models import Departure, Package, WaitlistEntry
from app.models.enums import WaitlistMail, WaitlistState
from app.services.booking import waitlist
from app.services.booking.after_capture import Notify
from app.services.email.bookings import _message, deliver
from app.services.email.links import ist_moment
from app.services.format import long_date

log = logging.getLogger(__name__)

BATCH = 50
DEMO_NOTE = "Demo site: nothing is charged until you pay, and payments are Razorpay test mode."


@dataclass(frozen=True)
class WaitlistFacts:
    entry_id: str
    name: str
    email: str
    party: int
    package_name: str
    package_slug: str
    departs: dt.date
    offer_no: int
    offer_expires_at: dt.datetime | None
    rank: int


def _vars(f: WaitlistFacts, settings: Settings) -> dict[str, object]:
    site = settings.site_url.rstrip("/")
    return {
        "f": f,
        "business": BUSINESS,
        "site_url": site,
        "first_name": f.name.split()[0] if f.name.split() else f.name,
        "departs": long_date(f.departs),
        "seats": f"{f.party} seat" + ("s" if f.party > 1 else ""),
        "package_url": f"{site}/packages/{f.package_slug}",
        "demo_note": DEMO_NOTE,
    }


def render_offer(f: WaitlistFacts, settings: Settings, *, url: str) -> EmailMessage:
    assert f.offer_expires_at is not None
    vars = {**_vars(f, settings), "url": url, "expires": ist_moment(f.offer_expires_at)}
    subject = (
        f"Seats are free on {f.package_name}, {long_date(f.departs)} — "
        f"claim them by {vars['expires']}"
    )
    return _message(f.email, subject, "waitlist_offer", vars)


def render_lapsed(f: WaitlistFacts, settings: Settings) -> EmailMessage:
    vars = {**_vars(f, settings), "rank": f.rank}
    subject = f"Your waitlist offer ended — you're #{f.rank} on the list for {f.package_name}"
    return _message(f.email, subject, "waitlist_lapsed", vars)


async def _claim_one(db: AsyncSession) -> tuple[WaitlistFacts, WaitlistMail] | None:
    """Take the next owed email off its row (committed), with what it needs."""
    try:
        picked = (
            await db.execute(
                select(WaitlistEntry.id, WaitlistEntry.mail_due)
                .where(WaitlistEntry.mail_due.is_not(None))
                .order_by(WaitlistEntry.updated_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
        ).one_or_none()
        if picked is None:
            await db.rollback()
            return None
        entry_id, due = picked
        await db.execute(
            update(WaitlistEntry)
            .where(WaitlistEntry.id == entry_id)
            .values(mail_due=None)
            .execution_options(synchronize_session=False)
        )
        entry, pkg_name, slug, departs = (
            await db.execute(
                select(WaitlistEntry, Package.name, Package.slug, Departure.date)
                .join(Departure, Departure.id == WaitlistEntry.departure_id)
                .join(Package, Package.id == Departure.package_id)
                .where(WaitlistEntry.id == entry_id)
                .execution_options(populate_existing=True)
            )
        ).one()
        facts = WaitlistFacts(
            entry_id=entry.id,
            name=entry.name,
            email=entry.email,
            party=entry.party,
            package_name=pkg_name,
            package_slug=slug,
            departs=departs,
            offer_no=entry.offer_no,
            offer_expires_at=entry.offer_expires_at,
            rank=await waitlist.rank(db, entry),
        )
        live_offer = entry.state == WaitlistState.OFFERED
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if due == WaitlistMail.OFFER and not live_offer:
        return None  # moved on before the email went: nothing to say
    return facts, due


async def _log(db: AsyncSession, entry_id: str, text: str) -> None:
    try:
        entry = await db.get(WaitlistEntry, entry_id, with_for_update=True)
        if entry is not None:
            waitlist.event(entry, "email", text)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        log.exception("Couldn't log a waitlist email on %s", entry_id)
        sentry_sdk.capture_exception(exc)


async def send_due(db: AsyncSession, notify: Notify | None, *, limit: int = BATCH) -> int:
    """Send up to `limit` owed emails; returns how many were taken. Never raises."""
    if notify is None:
        return 0
    secret = notify.settings.session_secret
    key = secret.get_secret_value() if secret else None
    sent = 0
    try:
        for _ in range(limit):
            claimed = await _claim_one(db)
            if claimed is None:
                # An offer that moved on was taken too: look again unless nothing is owed.
                owed = (
                    await db.execute(
                        select(WaitlistEntry.id).where(WaitlistEntry.mail_due.is_not(None)).limit(1)
                    )
                ).first()
                await db.rollback()
                if owed is None:
                    break
                continue
            facts, due = claimed
            if due == WaitlistMail.OFFER:
                token = waitlist.claim_token(facts.entry_id, facts.offer_no, key)
                if token is None:
                    log.error("No SESSION_SECRET: waitlist offer %s not emailed", facts.entry_id)
                    continue
                url = notify.settings.site_url.rstrip("/") + waitlist.claim_path(
                    facts.package_slug, token
                )
                message = render_offer(facts, notify.settings, url=url)
                what = "Offer emailed"
            else:
                message = render_lapsed(facts, notify.settings)
                what = "Offer-ended email sent"
            await deliver(
                notify.sender,
                notify.settings,
                [("customer", message)],
                ref=f"waitlist {facts.entry_id}",
                what=f"waitlist {due.value}",
            )
            await _log(db, facts.entry_id, f"{what} — “{message.subject}”")
            sent += 1
    except Exception as exc:
        await db.rollback()
        log.exception("Waitlist emails stopped early")
        sentry_sdk.capture_exception(exc)
    return sent


async def walk_and_send(
    db: AsyncSession, departure_ids: list[str] | None, notify: Notify | None
) -> tuple[waitlist.Walked, int]:
    """Walk these departures (None = every one with a list), each in its own transaction, then
    send what that owes. For callers outside a seat change's transaction: a package save, the
    tick, the daily tidy, a read."""
    ids = departure_ids if departure_ids is not None else await waitlist.departures_with_list(db)
    await db.rollback()
    walked = await waitlist.walk_departures(db, ids)
    return walked, await send_due(db, notify)
