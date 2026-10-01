"""The waitlist (R44, P6): joining a sold-out date, walking the list when seats free, the offer
that holds them for 24 h, and the signed link that claims it.

**One walk.** `walk` is the only thing that makes an offer on its own. It runs under the
departure's row lock — the lock every seat change takes — so two walks, or a walk and a new
hold, serialise, and the second sees the first's offers in `departure_availability`. That is
what keeps two offers from ever promising the same freed seat. It is called:

- inside every transaction that frees seats (an approved cancellation, a `balance_unpaid`
  cancel, the desk's release hold / cancel link), after the change and before the commit;
- before any new hold on the departure (`create_booking_order`, the counter), so the list gets
  first call on seats a lapsed 10-minute hold gave back — a lapse fires no event, and this is
  where it's noticed;
- on every waitlist read (join, a claim link, My trips) and from `/cron/waitlist` every 15
  minutes and `/cron/daily`, each in its own short transaction (`walk_departures`).

**Walking.** First the lapses: an offer past its end, or a claim whose booking is no longer
holding or paid, goes to the back of the list (still waiting — keeping its place would re-offer
the same seats to the same person) and owes a "your offer expired" email. Then the free seats
(the view, which already subtracts live holds and live offers) are offered down the list in
order: the first party that fits gets them, a bigger party is skipped and keeps its place.

**Offers** end at `min(now + 24 h, 00:00 IST on departure − 1 day)` — the last moment the web
still books a date — and none goes out with under 6 hours left. Once that moment passes, the
entries still waiting are closed.

**Claiming** turns the offer into an ordinary pending web booking whose hold ends when the offer
would have (`orders.create_booking_order` with `claim`); the entry becomes `claimed`. Money on
any booking for the same email and date marks the entry `booked` (`mark_booked`).

**Emails** are owed on the row (`mail_due`) and sent after the commit by
`services/email/waitlist.send_due`, which claims each with one guarded UPDATE.
"""

import datetime as dt
import hashlib
import hmac
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import constraint_name
from app.models import Booking, BookingTraveller, Departure, Package, WaitlistEntry
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingStatus,
    PackageStatus,
    WaitlistMail,
    WaitlistState,
)
from app.schemas.waitlist import (
    AccountWaitlistEntry,
    AdminWaitlistEntry,
    DepartureWaitlist,
    WaitlistClaim,
)
from app.services.analytics import ist_today
from app.services.email.render import IST

OFFER_FOR = dt.timedelta(hours=24)
MIN_OFFER = dt.timedelta(hours=6)
# A party that lets this many offers run out stays on the list, but only the owner offers
# it seats again (P6b): no one is emailed a hold every day until departure.
MAX_AUTO_OFFERS = 3
CLOSES_DAYS = 3  # joining closes after departure − 3 days (IST)
LIVE = (WaitlistState.WAITING, WaitlistState.OFFERED, WaitlistState.CLAIMED)
HOLDS_SEATS = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID, BookingStatus.COMPLETED)
UNIQUE_INDEX = "uq_waitlist_entries_departure_email"

GONE = "That date is no longer on sale"
CLOSED = "The waitlist for this date has closed — it departs in 3 days or less"
SEATS_FREE = "There are seats for your party on this date — book them now"
ALREADY = "You're already on the waitlist for this date"
BAD_LINK = "This claim link isn't valid — use the newest link we emailed you"


# --- dates -------------------------------------------------------------------------------------


def cutoff(departs: dt.date) -> dt.datetime:
    """00:00 IST on the day before departure: the web books a date up to 2 days out, so this is
    the last moment an offer can still be claimed."""
    return dt.datetime.combine(departs - dt.timedelta(days=1), dt.time(0), IST)


def offer_ends(departs: dt.date, now: dt.datetime) -> dt.datetime | None:
    """When an offer made now ends, or None when under `MIN_OFFER` would be left."""
    ends = min(now + OFFER_FOR, cutoff(departs))
    return ends if ends - now >= MIN_OFFER else None


def join_open(departs: dt.date, today: dt.date) -> bool:
    return today <= departs - dt.timedelta(days=CLOSES_DAYS)


# --- the claim link ----------------------------------------------------------------------------


def _signature(entry_id: str, offer_no: int, secret: str) -> str:
    msg = f"waitlist:{entry_id}:{offer_no}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


def claim_token(entry_id: str, offer_no: int, secret: str | None) -> str | None:
    """`<entry>.<offer no>.<sig>`: names one offer, so an older link stops working once the
    entry is offered again. None without a `SESSION_SECRET` (local dev)."""
    if not secret:
        return None
    return f"{entry_id}.{offer_no}.{_signature(entry_id, offer_no, secret)}"


def read_token(token: str, secret: str | None) -> tuple[str, int] | None:
    """(entry id, offer no) when the signature holds, else None."""
    parts = token.split(".")
    if not secret or len(parts) != 3 or not parts[1].isdigit():
        return None
    entry_id, offer_no, sig = parts[0], int(parts[1]), parts[2]
    if not hmac.compare_digest(sig.encode(), _signature(entry_id, offer_no, secret).encode()):
        return None
    return entry_id, offer_no


def claim_path(slug: str, token: str) -> str:
    return f"/packages/{slug}?claim={token}#book"


# --- helpers -----------------------------------------------------------------------------------


def event(entry: WaitlistEntry, kind: str, text: str, **extra: Any) -> None:
    """Append to the entry's own log (the owner's list shows it)."""
    at = dt.datetime.now(dt.UTC).isoformat()
    entry.events = [*(entry.events or []), {"at": at, "kind": kind, "text": text, **extra}]


async def lock_departure(db: AsyncSession, departure_id: str) -> Departure | None:
    return (
        await db.execute(select(Departure).where(Departure.id == departure_id).with_for_update())
    ).scalar_one_or_none()


async def _db_now(db: AsyncSession) -> dt.datetime:
    return (await db.execute(select(func.now()))).scalar_one()


async def seats_left(db: AsyncSession, departure_id: str) -> int:
    return int(
        (
            await db.execute(
                select(departure_availability.c.seats_left).where(
                    departure_availability.c.departure_id == departure_id
                )
            )
        ).scalar_one()
    )


async def _next_position(db: AsyncSession, departure_id: str) -> int:
    top = (
        await db.execute(
            select(func.max(WaitlistEntry.position)).where(
                WaitlistEntry.departure_id == departure_id
            )
        )
    ).scalar_one_or_none()
    return int(top or 0) + 1


async def rank(db: AsyncSession, entry: WaitlistEntry) -> int:
    """Where a waiting entry stands: 1 = next in line."""
    ahead = (
        await db.execute(
            select(func.count())
            .select_from(WaitlistEntry)
            .where(
                WaitlistEntry.departure_id == entry.departure_id,
                WaitlistEntry.state.in_(LIVE),
                WaitlistEntry.position < entry.position,
            )
        )
    ).scalar_one()
    return int(ahead) + 1


async def waiting_counts(db: AsyncSession, departure_ids: Iterable[str]) -> dict[str, int]:
    """Live entries per departure (waiting, offered or claiming) — the public "N waiting"."""
    ids = list(departure_ids)
    if not ids:
        return {}
    rows = await db.execute(
        select(WaitlistEntry.departure_id, func.count())
        .where(WaitlistEntry.departure_id.in_(ids), WaitlistEntry.state.in_(LIVE))
        .group_by(WaitlistEntry.departure_id)
    )
    return {d: int(n) for d, n in rows}


def _to_back(entry: WaitlistEntry, position: int, text: str) -> None:
    # An offer email not sent yet needs no "expired" one after it.
    entry.mail_due = None if entry.mail_due == WaitlistMail.OFFER else WaitlistMail.LAPSE
    entry.state = WaitlistState.WAITING
    entry.position = position
    entry.offer_expires_at = None
    entry.booking_id = None
    event(entry, "lapsed", text)


def make_offer(
    entry: WaitlistEntry, ends: dt.datetime, *, by: str | None = None, name: str | None = None
) -> None:
    entry.state = WaitlistState.OFFERED
    entry.offer_no += 1
    entry.offer_expires_at = ends
    entry.offered_by_user_id = by
    entry.mail_due = WaitlistMail.OFFER
    who = f"Offered by {name}" if name else "Offered"
    event(entry, "offered", f"{who} · {entry.party} seat{'s' if entry.party > 1 else ''} held")


# --- the walk ----------------------------------------------------------------------------------


@dataclass
class Walked:
    offered: int = 0
    lapsed: int = 0
    closed: int = 0


async def walk(db: AsyncSession, departure: Departure) -> Walked:
    """Lapse, then offer — see the module doc. The caller holds the departure's row lock and
    commits."""
    now = await _db_now(db)
    out = Walked()
    lapsed_offers = (
        (
            await db.execute(
                select(WaitlistEntry)
                .where(
                    WaitlistEntry.departure_id == departure.id,
                    WaitlistEntry.state == WaitlistState.OFFERED,
                    WaitlistEntry.offer_expires_at <= now,
                )
                .order_by(WaitlistEntry.offer_expires_at, WaitlistEntry.position)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    claims = (
        await db.execute(
            select(WaitlistEntry, Booking.status, Booking.hold_expires_at > now)
            .outerjoin(Booking, Booking.id == WaitlistEntry.booking_id)
            .where(
                WaitlistEntry.departure_id == departure.id,
                WaitlistEntry.state == WaitlistState.CLAIMED,
            )
            .order_by(WaitlistEntry.position)
            .with_for_update(of=WaitlistEntry)
        )
    ).all()
    position = await _next_position(db, departure.id)
    lapsed: set[str] = set()  # not offered again in the walk that lapsed them
    for entry in lapsed_offers:
        lapsed.add(entry.id)
        _to_back(entry, position, "The offer ran out unclaimed — back of the list")
        position += 1
        out.lapsed += 1
    for entry, status, live in claims:
        if status in HOLDS_SEATS:
            entry.state = WaitlistState.BOOKED
            continue
        if status == BookingStatus.PENDING and live:
            continue
        lapsed.add(entry.id)
        _to_back(entry, position, "The claimed booking wasn't paid in time — back of the list")
        position += 1
        out.lapsed += 1

    if now >= cutoff(departure.date):
        closing = (
            (
                await db.execute(
                    select(WaitlistEntry)
                    .where(
                        WaitlistEntry.departure_id == departure.id,
                        WaitlistEntry.state == WaitlistState.WAITING,
                    )
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        for entry in closing:
            entry.state = WaitlistState.CLOSED
            entry.mail_due = None  # no "you're back on the list" for a list that closed
            event(entry, "closed", "The date stopped taking bookings — the list closed")
            out.closed += 1
        await db.flush()
        return out

    ends = offer_ends(departure.date, now)
    await db.flush()
    if ends is None or not await _bookable(db, departure):
        return out
    free = await seats_left(db, departure.id)
    if free <= 0:
        return out
    waiting = (
        (
            await db.execute(
                select(WaitlistEntry)
                .where(
                    WaitlistEntry.departure_id == departure.id,
                    WaitlistEntry.state == WaitlistState.WAITING,
                )
                .order_by(WaitlistEntry.position)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for entry in waiting:
        if entry.party > free:
            continue  # skipped, keeps its place
        if entry.id in lapsed or entry.offer_no >= MAX_AUTO_OFFERS:
            continue
        make_offer(entry, ends)
        free -= entry.party
        out.offered += 1
        if free <= 0:
            break
    await db.flush()
    return out


async def _bookable(db: AsyncSession, departure: Departure) -> bool:
    """The web could sell this date: its package is live and the date is priced."""
    status = (
        await db.execute(select(Package.status).where(Package.id == departure.package_id))
    ).scalar_one_or_none()
    prices = (
        departure.price_double_paise,
        departure.price_triple_paise,
        departure.price_child_paise,
    )
    return status == PackageStatus.LIVE and min(prices) > 0


async def unclaim(db: AsyncSession, booking_id: str, departure_id: str) -> None:
    """A claim's booking ended before it could be paid for (Razorpay couldn't open the order):
    give the entry its offer back while the offer runs AND its seats are still free — seats the
    claim left may have been offered on meanwhile — else send it to the back of the list. Under
    the departure lock; the caller commits."""
    entries = (
        (
            await db.execute(
                select(WaitlistEntry)
                .where(
                    WaitlistEntry.booking_id == booking_id,
                    WaitlistEntry.state == WaitlistState.CLAIMED,
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    if not entries:
        return
    now = await _db_now(db)
    await db.flush()
    free = await seats_left(db, departure_id)
    for entry in entries:
        ends = entry.offer_expires_at
        if ends is not None and ends > now and free >= entry.party:
            entry.state = WaitlistState.OFFERED
            entry.booking_id = None
            free -= entry.party
            event(entry, "unclaimed", "The booking couldn't start — the offer stands")
        else:
            _to_back(
                entry,
                await _next_position(db, departure_id),
                "The booking couldn't start and the seats had moved on — back of the list",
            )
    await db.flush()


async def walk_departures(db: AsyncSession, departure_ids: Iterable[str]) -> Walked:
    """Walk each departure in its own short transaction (committed)."""
    total = Walked()
    for departure_id in sorted(set(departure_ids)):
        try:
            dep = await lock_departure(db, departure_id)
            if dep is not None:
                got = await walk(db, dep)
                total.offered += got.offered
                total.lapsed += got.lapsed
                total.closed += got.closed
            await db.commit()
        except BaseException:
            await db.rollback()
            raise
    return total


async def departures_with_list(db: AsyncSession, package_id: str | None = None) -> list[str]:
    """Departures with anyone on the list (waiting, offered or claiming)."""
    stmt = select(WaitlistEntry.departure_id).where(WaitlistEntry.state.in_(LIVE)).distinct()
    if package_id is not None:
        stmt = stmt.join(Departure, Departure.id == WaitlistEntry.departure_id).where(
            Departure.package_id == package_id
        )
    return list((await db.execute(stmt)).scalars())


# --- joining -----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Joined:
    entry_id: str
    position: int  # 1 = next in line
    waiting: int  # everyone on the list now, this entry included


async def join(
    db: AsyncSession,
    *,
    departure_id: str,
    name: str,
    email: str,
    party: int,
    ip: str | None,
    now: dt.datetime | None = None,
) -> Joined:
    """Put a party on a sold-out date's list. Refused when the date is gone or closes within 3
    days, when seats for the party are free after the list had its turn, or when this email is
    already on it."""
    now = now or dt.datetime.now(dt.UTC)
    email = email.strip().lower()
    await walk_departures(db, [departure_id])  # committed: a refusal below keeps its offers
    try:
        row = (
            await db.execute(
                select(Departure, Package.status)
                .join(Package, Package.id == Departure.package_id)
                .where(Departure.id == departure_id)
                .with_for_update(of=Departure)
            )
        ).one_or_none()
        if row is None or row[1] != PackageStatus.LIVE:
            raise ApiError("not_found", GONE)
        dep: Departure = row[0]
        if not join_open(dep.date, ist_today(now)):
            raise ApiError("conflict", CLOSED, reason="waitlist_closed")
        if await seats_left(db, dep.id) >= party:
            raise ApiError("conflict", SEATS_FREE, reason="seats_available")
        entry = WaitlistEntry(
            departure_id=dep.id,
            name=name.strip(),
            email=email,
            party=party,
            position=await _next_position(db, dep.id),
            joined_ip=ip,
            events=[],
        )
        event(entry, "joined", f"Joined · party of {party}")
        try:
            async with db.begin_nested():
                db.add(entry)
        except IntegrityError as exc:
            if UNIQUE_INDEX in constraint_name(exc):
                raise ApiError("conflict", ALREADY, reason="already_waiting") from None
            raise
        joined = Joined(
            entry_id=entry.id,
            position=await rank(db, entry),
            waiting=(await waiting_counts(db, [dep.id])).get(dep.id, 0),
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return joined


# --- claiming ----------------------------------------------------------------------------------


async def entry_for_token(
    db: AsyncSession, token: str, secret: str | None, *, lock: bool = False
) -> WaitlistEntry:
    """The entry a valid link names — only while the link's offer is its newest."""
    read = read_token(token, secret)
    if read is None:
        raise ApiError("not_found", BAD_LINK)
    entry_id, offer_no = read
    stmt = select(WaitlistEntry).where(WaitlistEntry.id == entry_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    entry = (await db.execute(stmt)).scalar_one_or_none()
    if entry is None or entry.offer_no != offer_no:
        raise ApiError("not_found", BAD_LINK)
    return entry


async def held_for(db: AsyncSession, entry: WaitlistEntry) -> int:
    """Seats the view is holding for this entry right now, which its own claim may use: the
    offer's party while it runs, or the claimed booking's party while its hold runs."""
    now = await _db_now(db)
    if entry.state == WaitlistState.OFFERED:
        return entry.party if entry.offer_expires_at and entry.offer_expires_at > now else 0
    if entry.state == WaitlistState.CLAIMED and entry.booking_id:
        live = (
            await db.execute(
                select(func.count())
                .select_from(BookingTraveller)
                .join(Booking, Booking.id == BookingTraveller.booking_id)
                .where(
                    Booking.id == entry.booking_id,
                    Booking.status == BookingStatus.PENDING,
                    Booking.hold_expires_at > now,
                )
            )
        ).scalar_one()
        return int(live)
    return 0


def claim_live(entry: WaitlistEntry, now: dt.datetime) -> bool:
    return (
        entry.state in (WaitlistState.OFFERED, WaitlistState.CLAIMED)
        and entry.offer_expires_at is not None
        and entry.offer_expires_at > now
    )


async def claim_for_order(
    db: AsyncSession, token: str, secret: str | None, *, departure_id: str, email: str
) -> WaitlistEntry:
    """The entry a booking order claims, locked — called under the departure lock after the
    walk, so a lapsed offer has already moved on. Refused when the link is stale, for another
    date or another email."""
    entry = await entry_for_token(db, token, secret, lock=True)
    now = await _db_now(db)
    if entry.departure_id != departure_id:
        raise ApiError("conflict", "This claim link is for another date", reason="claim_other")
    if entry.email != email.strip().lower():
        raise ApiError(
            "conflict",
            "Book with the email the offer was sent to",
            reason="claim_email",
            field_errors={"contact.email": "Use the email the offer was sent to"},
        )
    if not claim_live(entry, now):
        raise ApiError(
            "conflict",
            "This offer has ended — you're back on the waitlist, and we'll email you if seats "
            "free up again",
            reason="claim_expired",
        )
    return entry


def claimed(entry: WaitlistEntry, booking: Booking) -> None:
    entry.state = WaitlistState.CLAIMED
    entry.booking_id = booking.id
    entry.mail_due = None if entry.mail_due == WaitlistMail.OFFER else entry.mail_due
    event(entry, "claimed", f"Claimed · booking {booking.ref} started")


async def mark_booked(db: AsyncSession, booking: Booking) -> None:
    """Money made this booking hold its seats: this email's entry on this date is done. Runs in
    the capture's transaction, under its departure lock."""
    rows = (
        (
            await db.execute(
                select(WaitlistEntry)
                .where(
                    WaitlistEntry.departure_id == booking.departure_id,
                    WaitlistEntry.email == booking.contact_email.strip().lower(),
                    WaitlistEntry.state.in_(LIVE),
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for entry in rows:
        entry.state = WaitlistState.BOOKED
        entry.booking_id = booking.id
        entry.offer_expires_at = None
        entry.mail_due = None
        event(entry, "booked", f"Booked · {booking.ref}")


async def entries_for_email(db: AsyncSession, email: str) -> list[WaitlistEntry]:
    return list(
        (
            await db.execute(
                select(WaitlistEntry)
                .where(
                    WaitlistEntry.email == email.strip().lower(),
                    WaitlistEntry.state.in_(LIVE),
                )
                .order_by(WaitlistEntry.created_at)
            )
        ).scalars()
    )


async def remove(db: AsyncSession, entry: WaitlistEntry, text: str) -> None:
    entry.state = WaitlistState.REMOVED
    entry.offer_expires_at = None
    entry.mail_due = None
    event(entry, "removed", text)


async def walk_locked(db: AsyncSession, departure_id: str) -> Walked:
    """`walk` for a caller that already holds the departure's lock (`lock_booking`) and has just
    freed seats on it; the caller commits."""
    dep = await lock_departure(db, departure_id)
    return await walk(db, dep) if dep is not None else Walked()


# --- reads -------------------------------------------------------------------------------------


async def claim_view(db: AsyncSession, token: str, secret: str | None) -> WaitlistClaim:
    """What a claim link holds — after walking its date, so a lapsed offer reads as lapsed."""
    departure_id = (await entry_for_token(db, token, secret)).departure_id
    await db.rollback()  # read the id first: a rollback expires the row
    await walk_departures(db, [departure_id])
    entry = await entry_for_token(db, token, secret, lock=False)
    await db.refresh(entry)
    row = (
        await db.execute(
            select(Departure.date, Package.slug, Package.name)
            .join(Package, Package.id == Departure.package_id)
            .where(Departure.id == entry.departure_id)
        )
    ).one()
    held = await held_for(db, entry)
    live_hold = entry.state in (WaitlistState.OFFERED, WaitlistState.CLAIMED)
    out = WaitlistClaim(
        state=entry.state.value,  # type: ignore[arg-type]
        departure_id=entry.departure_id,
        date=row.date,
        package_slug=row.slug,
        package_name=row.name,
        name=entry.name,
        email=entry.email,
        party=entry.party,
        held_seats=held,
        expires_at=entry.offer_expires_at if live_hold else None,
        position=await rank(db, entry) if entry.state == WaitlistState.WAITING else None,
    )
    await db.rollback()
    return out


async def account_entries(
    db: AsyncSession, email: str, secret: str | None
) -> list[AccountWaitlistEntry]:
    """This email's live entries for My trips — each date walked first."""
    ids = {e.departure_id for e in await entries_for_email(db, email)}
    await db.rollback()
    if ids:
        await walk_departures(db, ids)
    rows = (
        await db.execute(
            select(WaitlistEntry, Departure.date, Package.slug, Package.name)
            .join(Departure, Departure.id == WaitlistEntry.departure_id)
            .join(Package, Package.id == Departure.package_id)
            .where(
                WaitlistEntry.email == email.strip().lower(),
                WaitlistEntry.state.in_(LIVE),
            )
            .order_by(Departure.date)
        )
    ).all()
    out: list[AccountWaitlistEntry] = []
    for entry, date, slug, name in rows:
        token = (
            claim_token(entry.id, entry.offer_no, secret)
            if entry.state != WaitlistState.WAITING
            else None
        )
        out.append(
            AccountWaitlistEntry(
                departure_id=entry.departure_id,
                date=date,
                package_slug=slug,
                package_name=name,
                party=entry.party,
                state=entry.state.value,  # type: ignore[arg-type]
                position=await rank(db, entry),
                offer_expires_at=entry.offer_expires_at,
                claim_path=claim_path(slug, token) if token else None,
            )
        )
    return out


async def package_of(db: AsyncSession, departure_id: str) -> str | None:
    return (
        await db.execute(select(Departure.package_id).where(Departure.id == departure_id))
    ).scalar_one_or_none()


# --- the owner (P6b) ---------------------------------------------------------------------------

DONE_SHOWN = 20
NOT_WAITING = "Only a place that is waiting can be offered seats"
NO_OFFERS = "This date can't take offers any more — it departs too soon, or isn't on sale"


def _admin_entry(entry: WaitlistEntry, position: int | None) -> AdminWaitlistEntry:
    last = (entry.events or [])[-1:] or [{}]
    return AdminWaitlistEntry(
        id=entry.id,
        position=position,
        name=entry.name,
        email=entry.email,
        party=entry.party,
        state=entry.state.value,  # type: ignore[arg-type]
        offer_expires_at=entry.offer_expires_at,
        offer_no=entry.offer_no,
        offered_by_owner=entry.offered_by_user_id is not None,
        auto_offers_done=entry.offer_no >= MAX_AUTO_OFFERS,
        joined_at=entry.created_at,
        last_event=last[0].get("text"),
    )


async def departure_list(db: AsyncSession, departure_id: str) -> DepartureWaitlist | None:
    """The owner's view of one date's list. Read only: callers walk first."""
    dep = await db.get(Departure, departure_id)
    if dep is None:
        return None
    rows = (
        (
            await db.execute(
                select(WaitlistEntry)
                .where(WaitlistEntry.departure_id == departure_id)
                .order_by(WaitlistEntry.position)
            )
        )
        .scalars()
        .all()
    )
    live = [e for e in rows if e.state in LIVE]
    done = sorted(
        (e for e in rows if e.state not in LIVE), key=lambda e: e.updated_at, reverse=True
    )[:DONE_SHOWN]
    now = await _db_now(db)
    ends = offer_ends(dep.date, now) if await _bookable(db, dep) else None
    return DepartureWaitlist(
        departure_id=departure_id,
        seats_left=await seats_left(db, departure_id),
        can_offer=ends is not None,
        offer_ends_at=ends,
        live=[_admin_entry(e, i) for i, e in enumerate(live, start=1)],
        done=[_admin_entry(e, None) for e in done],
    )


async def _owner_entry(db: AsyncSession, entry_id: str) -> tuple[WaitlistEntry, Departure]:
    """Lock the entry's departure (walked), then the entry."""
    departure_id = (
        await db.execute(select(WaitlistEntry.departure_id).where(WaitlistEntry.id == entry_id))
    ).scalar_one_or_none()
    if departure_id is None:
        raise ApiError("not_found", "That waitlist place no longer exists")
    dep = await lock_departure(db, departure_id)
    assert dep is not None  # the entry's foreign key cascades
    await walk(db, dep)
    entry = (
        await db.execute(
            select(WaitlistEntry)
            .where(WaitlistEntry.id == entry_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return entry, dep


async def owner_remove(db: AsyncSession, entry_id: str, *, by_name: str) -> str:
    """Take a place off the list. An offer it held frees its seats, which go down the list at
    once; a claim's started booking is left alone (it holds or lapses like any other).
    Returns the departure id. Committed."""
    try:
        entry, dep = await _owner_entry(db, entry_id)
        if entry.state not in LIVE:
            raise ApiError(
                "conflict", f"This place is already {entry.state.value}", reason="not_live"
            )
        await remove(db, entry, f"Removed by {by_name}")
        await db.flush()
        await walk(db, dep)
        departure_id = dep.id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return departure_id


async def owner_offer(db: AsyncSession, entry_id: str, *, by: str, by_name: str) -> str:
    """Offer seats to a waiting place by hand — out of order, and past the 3 automatic offers —
    when its party fits the free seats and the date can still take an offer. Committed; returns
    the departure id."""
    try:
        entry, dep = await _owner_entry(db, entry_id)
        if entry.state != WaitlistState.WAITING:
            raise ApiError("conflict", NOT_WAITING, reason="not_waiting")
        now = await _db_now(db)
        ends = offer_ends(dep.date, now) if await _bookable(db, dep) else None
        if ends is None:
            raise ApiError("conflict", NO_OFFERS, reason="offers_closed")
        free = await seats_left(db, dep.id)
        if entry.party > free:
            raise ApiError(
                "conflict",
                f"Only {free} seat{'s' if free != 1 else ''} free — this party needs "
                f"{entry.party}. Add seats in the package's departures first.",
                reason="seats_short",
            )
        make_offer(entry, ends, by=by, name=by_name)
        departure_id = dep.id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return departure_id
