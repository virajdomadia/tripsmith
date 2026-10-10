"""Automatic trip emails (R53, P15): `/cron/emails` (09:00 IST, and the 15-minute tick between
09:00 and 21:00 IST) sends what each booking is owed today, each at most once.

The ledger (`email_sends`, models/emails.py) is the "once": a row is inserted under its key and
COMMITTED before the send, so a re-run, an overlapping tick or a crash mid-send never sends
twice. The key names the anchor day — the departure, or the balance's due day — so a date
change or an extended due day re-arms every stage, and a move that keeps the date sends nothing
again. A failed send is retried by later runs, up to `MAX_ATTEMPTS`; one stuck in `sending` (the
process died mid-send) is never retried, since it may have gone.

What is due (IST), each skipped while a cancellation request is open:
- balance reminder — 7 and 3 days before the due day, and on it (P5's stages; `partially_paid`);
- details reminder — 14 and 5 days before departure, while the details are open and someone
  still owes a required field;
- trip pack — 3 days before departure, the PDF attached; `confirmed` with the pack open (a
  part-paid booking gets it on the first run after it is paid, until the day before departure);
- review request — 2 days after return, `completed` with no review yet;
- still thinking — the morning after a web hold lapsed, when that address booked nothing
  since; once per address per package, ever;
- refund — a Razorpay refund processed (always on; also sent at once from the webhook).

A missed run catches up with the latest stage that is due, never two stages of one type in one
run; a stage whose day fell before the booking was made is not sent at all. Each run sends at
most `LIMIT` emails within `BUDGET_SECONDS` (Vercel's 30 s limit, Gmail SMTP's ~1–2 s a send);
the rest wait for the next tick. Every send lands in the booking's history (`deliver`).
"""

import asyncio
import datetime as dt
import logging
import time
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace

import sentry_sdk
from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.config import Settings
from app.infra.email import EmailAttachment, EmailMessage
from app.models import (
    Booking,
    BookingTraveller,
    Departure,
    EmailSend,
    EmailSuppression,
    EmailSwitch,
    Package,
    Refund,
    Review,
    WaitlistEntry,
)
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingActor,
    BookingChannel,
    BookingStatus,
    CancelReason,
    EmailSendState,
    EmailType,
    Occupancy,
    PackageStatus,
    RefundStatus,
)
from app.services.analytics import ist_today
from app.services.booking import deposit, details, history, trip_pack
from app.services.booking.after_capture import Notify
from app.services.booking.balance import REMINDER, _open_request
from app.services.booking.history import EmailLine, money
from app.services.booking.pricing import MIN_DAYS_AHEAD
from app.services.booking.voucher import BookingFacts, load_booking_facts
from app.services.email import unsubscribe
from app.services.email.balance import render_balance_reminder
from app.services.email.bookings import _message, _vars, deliver
from app.services.email.details import render_details_link, still_owed
from app.services.email.render import IST
from app.services.format import inr, long_date
from app.services.pdf.trip_pack import render_trip_pack, trip_pack_filename

log = logging.getLogger(__name__)

LIMIT = 25
BUDGET_SECONDS = 20.0
MAX_ATTEMPTS = 3
RETRY_WITHIN = dt.timedelta(days=2)

SWITCHABLE = (
    EmailType.BALANCE_REMINDER,
    EmailType.DETAILS_REMINDER,
    EmailType.TRIP_PACK,
    EmailType.REVIEW_REQUEST,
    EmailType.STILL_THINKING,
)
DETAILS_STAGES = (14, 5)
PACK_DAYS = 3
REVIEW_AFTER = 2
REVIEW_UNTIL = 14  # days after return a missed review request still goes
LAPSE_LOOKBACK = 2  # IST days of lapsed holds a run looks at (yesterday, and a missed run's)

UNSUBSCRIBE_WHY = {
    EmailType.REVIEW_REQUEST: "You got this because you travelled with us.",
    EmailType.STILL_THINKING: "You got this because you started a booking.",
}
# Nothing was paid for these two: the booking emails' "test payment" note would be wrong.
DEMO_NOTE_UNPAID = "Demo site: no real trip is booked."

REFUND_WHY = {
    "cancellation": "It’s the refund for your cancellation.",
    "seats_gone": "Your payment arrived after the last seats had gone, so it all comes back.",
    "surplus": "You’d paid more than the booking needed.",
    "addon": "It’s for the extra you removed.",
    "date_change": "It’s the difference for your new, cheaper date.",
    "balance": "The booking was cancelled for an unpaid balance; this is what the policy returns.",
}


@dataclass(frozen=True)
class Due:
    type: EmailType
    key: str
    email: str
    booking_id: str | None
    ref: str | None
    package_id: str | None
    stage: int = 0
    anchor: dt.date | None = None
    refund_id: str | None = None


@dataclass
class Run:
    sent: Counter[str]
    failed: int = 0
    skipped: int = 0
    retried: int = 0
    more: bool = False  # stopped at the limit or the time budget with emails still due


def key_of(kind: EmailType, booking_id: str, stage: int, anchor: dt.date | None) -> str:
    return f"{kind.value}:{booking_id}:{stage}:{anchor.isoformat() if anchor else '-'}"


def refund_key(refund_id: str) -> str:
    return f"{EmailType.REFUND.value}:{refund_id}"


def still_thinking_key(email: str, package_id: str) -> str:
    return f"{EmailType.STILL_THINKING.value}:{email.strip().lower()}:{package_id}"


def latest_stage(left: int, stages: tuple[int, ...]) -> int | None:
    """The stage whose day has come most recently (stages run from far to near), or None while
    `left` days is still before the first."""
    reached = [s for s in stages if left <= s]
    return min(reached) if reached else None


# --- switches -----------------------------------------------------------------------------------


async def switches(db: AsyncSession) -> dict[EmailType, bool]:
    rows = (await db.execute(select(EmailSwitch.type, EmailSwitch.on))).all()
    saved = {t: on for t, on in rows}
    return {t: saved.get(t, True) for t in SWITCHABLE}


async def set_switch(db: AsyncSession, kind: EmailType, on: bool, *, by: str | None) -> None:
    if kind not in SWITCHABLE:
        raise ValueError(f"{kind} has no switch")
    stmt = insert(EmailSwitch).values(type=kind, on=on, updated_by=by)
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=[EmailSwitch.type],
            set_={"on": on, "updated_by": by, "updated_at": func.now()},
        )
    )
    await db.commit()


# --- what is due --------------------------------------------------------------------------------


async def _unclaimed(db: AsyncSession, dues: list[Due]) -> list[Due]:
    if not dues:
        return []
    taken = set(
        (await db.execute(select(EmailSend.key).where(EmailSend.key.in_([d.key for d in dues]))))
        .scalars()
        .all()
    )
    return [d for d in dues if d.key not in taken]


async def due_balance(db: AsyncSession, today: dt.date) -> list[Due]:
    rows = (
        await db.execute(
            select(
                Booking.id,
                Booking.ref,
                Booking.contact_email,
                Booking.package_id,
                Booking.balance_due_on,
            ).where(
                Booking.status == BookingStatus.PARTIALLY_PAID,
                Booking.balance_due_on.is_not(None),
                Booking.balance_due_on >= today - dt.timedelta(days=deposit.GRACE_DAYS),
                Booking.balance_due_on <= today + dt.timedelta(days=deposit.REMINDER_DAYS[0]),
                ~_open_request(),
            )
        )
    ).all()
    out = []
    for bid, ref, email, pkg, due in rows:
        stage = deposit.reminder_stage(due, today)
        if stage is None:
            continue
        out.append(
            Due(
                EmailType.BALANCE_REMINDER,
                key_of(EmailType.BALANCE_REMINDER, bid, stage, due),
                email.lower(),
                bid,
                ref,
                pkg,
                stage,
                due,
            )
        )
    return await _unclaimed(db, out)


async def due_details(db: AsyncSession, today: dt.date) -> list[Due]:
    first, last = DETAILS_STAGES[0], details.LOCK_DAYS + 1
    rows = (
        await db.execute(
            select(
                Booking.id, Booking.ref, Booking.contact_email, Booking.package_id, Departure.date
            )
            .join(Departure, Departure.id == Booking.departure_id)
            .where(
                Booking.status.in_(details.OPEN_STATUSES),
                Departure.date <= today + dt.timedelta(days=first),
                Departure.date >= today + dt.timedelta(days=last),
                details.missing_travellers() > 0,
                ~_open_request(),
            )
        )
    ).all()
    out = []
    for bid, ref, email, pkg, departs in rows:
        stage = latest_stage((departs - today).days, DETAILS_STAGES)
        if stage is None:
            continue
        out.append(
            Due(
                EmailType.DETAILS_REMINDER,
                key_of(EmailType.DETAILS_REMINDER, bid, stage, departs),
                email.lower(),
                bid,
                ref,
                pkg,
                stage,
                departs,
            )
        )
    return await _created_by(db, await _unclaimed(db, out))


async def due_pack(db: AsyncSession, today: dt.date) -> list[Due]:
    rows = (
        await db.execute(
            select(
                Booking.id, Booking.ref, Booking.contact_email, Booking.package_id, Departure.date
            )
            .join(Departure, Departure.id == Booking.departure_id)
            .where(
                Booking.status == BookingStatus.CONFIRMED,
                Departure.date <= today + dt.timedelta(days=PACK_DAYS),
                Departure.date > today,
                ~_open_request(),
            )
        )
    ).all()
    out = [
        Due(
            EmailType.TRIP_PACK,
            key_of(EmailType.TRIP_PACK, bid, PACK_DAYS, departs),
            email.lower(),
            bid,
            ref,
            pkg,
            PACK_DAYS,
            departs,
        )
        for bid, ref, email, pkg, departs in rows
    ]
    return await _created_by(db, await _unclaimed(db, out))


async def _created_by(db: AsyncSession, dues: list[Due]) -> list[Due]:
    """Drop the stages whose day came before the booking was made (booked 10 days out → no
    "14 days" reminder; booked 2 days out → no "3 days" pack email — the confirmation says it)."""
    if not dues:
        return []
    rows = await db.execute(
        select(Booking.id, func.date(func.timezone("Asia/Kolkata", Booking.created_at))).where(
            Booking.id.in_({d.booking_id for d in dues if d.booking_id})
        )
    )
    made: dict[str, dt.date] = {bid: day for bid, day in rows.all()}
    return [
        d
        for d in dues
        if d.anchor is not None
        and d.booking_id in made
        and made[d.booking_id] <= d.anchor - dt.timedelta(days=d.stage)
    ]


async def due_review(db: AsyncSession, today: dt.date) -> list[Due]:
    returns = Departure.date + Package.nights
    rows = (
        await db.execute(
            select(
                Booking.id, Booking.ref, Booking.contact_email, Booking.package_id, Departure.date
            )
            .join(Departure, Departure.id == Booking.departure_id)
            .join(Package, Package.id == Booking.package_id)
            .where(
                Booking.status == BookingStatus.COMPLETED,
                returns <= today - dt.timedelta(days=REVIEW_AFTER),
                returns >= today - dt.timedelta(days=REVIEW_UNTIL),
                ~exists().where(Review.booking_id == Booking.id),
                ~_open_request(),
                ~exists().where(
                    EmailSuppression.email == func.lower(Booking.contact_email),
                    EmailSuppression.type == EmailType.REVIEW_REQUEST,
                ),
            )
        )
    ).all()
    out = [
        Due(
            EmailType.REVIEW_REQUEST,
            key_of(EmailType.REVIEW_REQUEST, bid, REVIEW_AFTER, departs),
            email.lower(),
            bid,
            ref,
            pkg,
            REVIEW_AFTER,
            departs,
        )
        for bid, ref, email, pkg, departs in rows
    ]
    return await _unclaimed(db, out)


def _lapsed_hold() -> ColumnElement[bool]:
    """A web hold that ran out unpaid: swept by the tidy, or still pending past its hold."""
    return and_(
        Booking.channel == BookingChannel.WEB,
        or_(
            and_(
                Booking.status == BookingStatus.CANCELLED,
                Booking.cancel_reason == CancelReason.HOLD_EXPIRED,
            ),
            and_(Booking.status == BookingStatus.PENDING, Booking.hold_expires_at < func.now()),
        ),
        ~exists().where(WaitlistEntry.booking_id == Booking.id),  # a claim has its own emails
    )


async def due_still_thinking(db: AsyncSession, today: dt.date) -> list[Due]:
    later = aliased(Booking)
    since = dt.datetime.combine(today - dt.timedelta(days=LAPSE_LOOKBACK), dt.time(), IST)
    until = dt.datetime.combine(today, dt.time(), IST)
    rows = (
        await db.execute(
            select(
                Booking.id,
                Booking.ref,
                Booking.contact_email,
                Booking.package_id,
                Booking.hold_expires_at,
            )
            .join(Package, Package.id == Booking.package_id)
            .where(
                _lapsed_hold(),
                Booking.hold_expires_at >= since,
                Booking.hold_expires_at < until,
                Package.status == PackageStatus.LIVE,
                # Booked nothing since — a later hold that lapsed too doesn't count.
                ~exists().where(
                    func.lower(later.contact_email) == func.lower(Booking.contact_email),
                    later.created_at > Booking.created_at,
                    ~and_(
                        later.status == BookingStatus.CANCELLED,
                        later.cancel_reason == CancelReason.HOLD_EXPIRED,
                    ),
                ),
                ~exists().where(
                    EmailSuppression.email == func.lower(Booking.contact_email),
                    EmailSuppression.type == EmailType.STILL_THINKING,
                ),
                exists().where(
                    Departure.package_id == Booking.package_id,
                    Departure.date >= today + dt.timedelta(days=MIN_DAYS_AHEAD),
                ),
            )
            .order_by(Booking.hold_expires_at.desc())
        )
    ).all()
    out: list[Due] = []
    seen: set[str] = set()
    for bid, ref, email, pkg, _ in rows:
        address = email.lower()
        if address in seen:  # one a morning per address: the trip they held last
            continue
        seen.add(address)
        out.append(
            Due(
                EmailType.STILL_THINKING,
                still_thinking_key(address, pkg),
                address,
                bid,
                ref,
                pkg,
                0,
                None,
            )
        )
    return await _unclaimed(db, out)


async def due_refunds(db: AsyncSession, *, booking_id: str | None = None) -> list[Due]:
    rows = (
        await db.execute(
            select(Refund.id, Booking.id, Booking.ref, Booking.contact_email, Booking.package_id)
            .join(Booking, Booking.id == Refund.booking_id)
            .where(
                Refund.status == RefundStatus.PROCESSED,
                Refund.by_hand.is_(False),
                Refund.razorpay_refund_id.is_not(None),
                Refund.processed_at >= func.now() - RETRY_WITHIN,
                *([Refund.booking_id == booking_id] if booking_id else []),
            )
        )
    ).all()
    out = [
        Due(EmailType.REFUND, refund_key(rid), email.lower(), bid, ref, pkg, refund_id=rid)
        for rid, bid, ref, email, pkg in rows
    ]
    return await _unclaimed(db, out)


FINDERS: dict[EmailType, Callable[[AsyncSession, dt.date], Awaitable[list[Due]]]] = {
    EmailType.BALANCE_REMINDER: due_balance,
    EmailType.DETAILS_REMINDER: due_details,
    EmailType.TRIP_PACK: due_pack,
    EmailType.REVIEW_REQUEST: due_review,
    EmailType.STILL_THINKING: due_still_thinking,
}


# --- claim and finish ---------------------------------------------------------------------------


async def claim(db: AsyncSession, due: Due) -> str | None:
    """Insert the ledger row and commit — or None when another run got there first."""
    try:
        row_id = (
            await db.execute(
                insert(EmailSend)
                .values(
                    key=due.key,
                    type=due.type,
                    booking_id=due.booking_id,
                    email=due.email,
                    package_id=due.package_id,
                    stage=due.stage,
                    anchor=due.anchor,
                )
                .on_conflict_do_nothing(index_elements=[EmailSend.key])
                .returning(EmailSend.id)
            )
        ).scalar_one_or_none()
        if row_id is not None and due.type == EmailType.BALANCE_REMINDER and due.booking_id:
            # P5's history entry, written with the claim as before (kind balance.reminder).
            left = (
                await db.execute(
                    select(Booking.total_paise - Booking.paid_paise).where(
                        Booking.id == due.booking_id
                    )
                )
            ).scalar_one()
            when = "on the due day" if due.stage == 0 else f"{due.stage} days before the due day"
            assert due.anchor is not None
            history.record(
                db,
                due.booking_id,
                REMINDER,
                actor=BookingActor.CRON,
                text=f"Balance reminder ({when}, {history.day(due.anchor)}) · {money(left)} left",
                after={"stage": due.stage, "dueOn": due.anchor.isoformat()},
            )
        await db.commit()
        return row_id
    except BaseException:
        await db.rollback()
        raise


async def _retries(db: AsyncSession, on: dict[EmailType, bool]) -> list[tuple[str, Due]]:
    """Failed rows still worth a try: claimed again (attempts + 1) in one guarded UPDATE."""
    allowed = [t for t in EmailType if on.get(t, True)]
    rows = (
        await db.execute(
            update(EmailSend)
            .where(
                EmailSend.state == EmailSendState.FAILED,
                EmailSend.attempts < MAX_ATTEMPTS,
                EmailSend.created_at >= func.now() - RETRY_WITHIN,
                EmailSend.type.in_(allowed),
            )
            .values(state=EmailSendState.SENDING, attempts=EmailSend.attempts + 1)
            .returning(
                EmailSend.id,
                EmailSend.key,
                EmailSend.type,
                EmailSend.email,
                EmailSend.booking_id,
                EmailSend.package_id,
                EmailSend.stage,
                EmailSend.anchor,
            )
        )
    ).all()
    await db.commit()
    if not rows:
        return []
    found = await db.execute(
        select(Booking.id, Booking.ref).where(
            Booking.id.in_({r.booking_id for r in rows if r.booking_id})
        )
    )
    refs: dict[str, str] = {bid: ref for bid, ref in found.all()}
    await db.rollback()
    out = []
    for r in rows:
        refund_id = r.key.split(":", 1)[1] if r.type == EmailType.REFUND else None
        out.append(
            (
                r.id,
                Due(
                    r.type,
                    r.key,
                    r.email,
                    r.booking_id,
                    refs.get(r.booking_id),
                    r.package_id,
                    r.stage,
                    r.anchor,
                    refund_id,
                ),
            )
        )
    return out


STATE_OF = {
    "sent": EmailSendState.SENT,
    "held": EmailSendState.HELD,
    "failed": EmailSendState.FAILED,
    "skipped": EmailSendState.SKIPPED,
    "off": EmailSendState.SKIPPED,
}


async def finish(db: AsyncSession, row_id: str, lines: list[EmailLine] | None) -> EmailSendState:
    """Record what the send did. `None` = no longer due when rendered (skipped)."""
    line = next((x for x in lines or [] if x.role == "customer"), None)
    state = STATE_OF[line.outcome] if line else EmailSendState.SKIPPED
    try:
        await db.execute(
            update(EmailSend)
            .where(EmailSend.id == row_id)
            .values(
                state=state,
                error="send" if state == EmailSendState.FAILED else None,
                sent_at=func.now() if state in (EmailSendState.SENT, EmailSendState.HELD) else None,
            )
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        log.exception("Could not record the email ledger row %s", row_id)
        sentry_sdk.capture_exception(exc)
    return state


# --- render -------------------------------------------------------------------------------------


Rendered = list[tuple[str, EmailMessage]]


def _unsubscribable(
    to: str,
    subject: str,
    template: str,
    vars: dict[str, object],
    kind: EmailType,
    settings: Settings,
) -> EmailMessage:
    """A promotional email (R53: the review request, still-thinking): the footer link and the
    one-click headers. Without a SESSION_SECRET (local dev) it goes without them."""
    secret = settings.session_secret.get_secret_value() if settings.session_secret else None
    token = unsubscribe.token_for(to, kind, secret)
    if token:
        vars = {
            **vars,
            "unsubscribe_url": unsubscribe.page_url(settings.site_url, token),
            "unsubscribe_why": UNSUBSCRIBE_WHY[kind],
        }
    message = _message(to, subject, template, vars)
    return replace(message, headers=unsubscribe.headers(settings.site_url, token))


async def _facts(db: AsyncSession, due: Due) -> BookingFacts | None:
    return await load_booking_facts(db, due.ref) if due.ref else None


async def _render_balance(db: AsyncSession, due: Due, settings: Settings, today: dt.date):
    facts = await _facts(db, due)
    if (
        facts is None
        or facts.status != BookingStatus.PARTIALLY_PAID
        or facts.balance_due_on != due.anchor
    ):
        return None, None
    return render_balance_reminder(facts, settings, today=today), None


async def _render_details(db: AsyncSession, due: Due, settings: Settings, today: dt.date):
    if due.ref is None:
        return None, None
    found = await still_owed(db, due.ref, today=today)
    if found is None or found.facts.departs != due.anchor:
        return None, None
    return render_details_link(
        found.facts, settings, owed=found.owed, locks_on=found.locks_on, reminder=True
    ), None


async def _render_pack(db: AsyncSession, due: Due, settings: Settings, today: dt.date):
    facts = await _facts(db, due)
    if facts is None or facts.status != BookingStatus.CONFIRMED or facts.departs != due.anchor:
        return None, None
    found = await trip_pack.sheet_of(db, facts.ref, today=today)
    if found is None or found[1] != "open":
        return None, None
    sheet, _ = found
    content = sheet.content
    meeting = None
    if content.meeting:
        m = content.meeting
        meeting = {
            "place": m.place,
            "time": m.time.strftime("%H:%M") if m.time else None,
            "maps_url": m.maps_url,
            "note": m.note,
        }
    vars = {
        **_vars(facts, settings),
        "days_to_go": (facts.departs - today).days,
        "meeting": meeting,
        "leader": content.leader,
        "emergency_phone": content.emergency_phone,
        "emergency_e164": content.emergency_e164,
        "pack_url": f"{settings.site_url.rstrip('/')}/account/bookings/{facts.ref}#pack",
    }
    subject = f"Your trip pack for {facts.package_name} — {long_date(facts.departs)}"
    message = _message(facts.lead_email, subject, "trip_pack", vars)
    return [("customer", message)], sheet


async def _render_review(db: AsyncSession, due: Due, settings: Settings, today: dt.date):
    facts = await _facts(db, due)
    if facts is None or facts.status != BookingStatus.COMPLETED or facts.departs != due.anchor:
        return None, None
    if (
        await db.execute(
            select(Review.id)
            .join(Booking, Booking.id == Review.booking_id)
            .where(Booking.ref == facts.ref)
        )
    ).first():
        return None, None
    if await unsubscribe.is_suppressed(db, facts.lead_email, EmailType.REVIEW_REQUEST):
        return None, None
    site = settings.site_url.rstrip("/")
    vars = {
        **_vars(facts, settings),
        "review_url": f"{site}/account/bookings/{facts.ref}#review",
        "demo_note": DEMO_NOTE_UNPAID,
    }
    message = _unsubscribable(
        facts.lead_email,
        f"How was {facts.package_name}, {facts.first_name}?",
        "review_request",
        vars,
        EmailType.REVIEW_REQUEST,
        settings,
    )
    return [("customer", message)], None


@dataclass(frozen=True)
class Prefill:
    date: dt.date | None
    double: int
    triple: int
    single: int
    children: int

    @property
    def party(self) -> int:
        return self.double * 2 + self.triple * 3 + self.single + self.children

    def query(self) -> str:
        parts = [f"date={self.date.isoformat()}"] if self.date else []
        parts += [
            f"double={self.double}",
            f"triple={self.triple}",
            f"single={self.single}",
            f"children={self.children}",
        ]
        return "&".join(parts)


def rooms_of(occupancies: list[Occupancy]) -> tuple[int, int, int, int]:
    """The sheet's rooms from the travellers' occupancies (a double room = 2 travellers)."""
    count = Counter(occupancies)
    return (
        count[Occupancy.DOUBLE] // 2,
        count[Occupancy.TRIPLE] // 3,
        count[Occupancy.SINGLE],
        count[Occupancy.CHILD],
    )


async def prefill_of(db: AsyncSession, booking: Booking, today: dt.date) -> Prefill:
    occupancies = list(
        (
            await db.execute(
                select(BookingTraveller.occupancy).where(BookingTraveller.booking_id == booking.id)
            )
        )
        .scalars()
        .all()
    )
    double, triple, single, children = rooms_of(occupancies)
    party = double * 2 + triple * 3 + single + children
    open_date = (
        await db.execute(
            select(Departure.date)
            .join(
                departure_availability,
                departure_availability.c.departure_id == Departure.id,
            )
            .where(
                Departure.id == booking.departure_id,
                Departure.date >= today + dt.timedelta(days=MIN_DAYS_AHEAD),
                departure_availability.c.seats_left >= party,
                Departure.price_double_paise > 0,
            )
        )
    ).scalar_one_or_none()
    return Prefill(open_date, double, triple, single, children)


async def _render_still_thinking(db: AsyncSession, due: Due, settings: Settings, today: dt.date):
    if due.booking_id is None or await unsubscribe.is_suppressed(
        db, due.email, EmailType.STILL_THINKING
    ):
        return None, None
    booking = await db.get(Booking, due.booking_id)
    facts = await _facts(db, due)
    if booking is None or facts is None:
        return None, None
    prefill = await prefill_of(db, booking, today)
    site = settings.site_url.rstrip("/")
    url = f"{site}/packages/{facts.package_slug}?{prefill.query()}#book"
    vars = {
        **_vars(facts, settings),
        "package_name": facts.package_name,
        "first_name": facts.first_name,
        "party": prefill.party,
        "date_label": long_date(prefill.date) if prefill.date else None,
        "url": url,
        "demo_note": DEMO_NOTE_UNPAID,
    }
    message = _unsubscribable(
        facts.lead_email,
        f"Still thinking about {facts.package_name}?",
        "still_thinking",
        vars,
        EmailType.STILL_THINKING,
        settings,
    )
    return [("customer", message)], None


async def _render_refund(db: AsyncSession, due: Due, settings: Settings, today: dt.date):
    if due.refund_id is None:
        return None, None
    row = await db.get(Refund, due.refund_id)
    facts = await _facts(db, due)
    if row is None or facts is None or row.status != RefundStatus.PROCESSED:
        return None, None
    amount = inr(row.amount_paise // 100)
    vars = {
        **_vars(facts, settings),
        "amount": amount,
        "why": REFUND_WHY.get(row.reason, ""),
        "refund_ref": row.razorpay_refund_id or row.id,
    }
    subject = f"Refund of {amount} on its way — {facts.ref}"
    return [("customer", _message(facts.lead_email, subject, "refund_sent", vars))], None


RENDER = {
    EmailType.BALANCE_REMINDER: _render_balance,
    EmailType.DETAILS_REMINDER: _render_details,
    EmailType.TRIP_PACK: _render_pack,
    EmailType.REVIEW_REQUEST: _render_review,
    EmailType.STILL_THINKING: _render_still_thinking,
    EmailType.REFUND: _render_refund,
}


async def render(
    db: AsyncSession, due: Due, settings: Settings, *, today: dt.date
) -> Rendered | None:
    """The email this due row sends today — None when it is no longer due (paid, moved,
    reviewed, unsubscribed…). Reads in one transaction and ends it; the PDF renders after."""
    try:
        labelled, sheet = await RENDER[due.type](db, due, settings, today)
    finally:
        await db.rollback()
    if labelled is None or sheet is None:
        return labelled
    pdf = await asyncio.to_thread(render_trip_pack, sheet, site_url=settings.site_url)
    attachment = EmailAttachment(trip_pack_filename(sheet.ref), pdf)
    return [(role, replace(m, attachments=(attachment,))) for role, m in labelled]


# --- the run ------------------------------------------------------------------------------------


async def _send(
    db: AsyncSession, notify: Notify, row_id: str, due: Due, *, today: dt.date
) -> EmailSendState:
    try:
        labelled = await render(db, due, notify.settings, today=today)
    except Exception as exc:
        log.exception("Could not render the %s email (%s)", due.type.value, due.key)
        sentry_sdk.capture_exception(exc)
        return await finish(db, row_id, [EmailLine("customer", due.type.value, "failed")])
    if labelled is None:
        return await finish(db, row_id, None)
    lines = await deliver(
        notify.sender,
        notify.settings,
        labelled,
        ref=due.ref or "",
        what=due.type.value.replace("_", " "),
        db=db if due.ref else None,
    )
    return await finish(db, row_id, lines)


def _count(run: Run, due: Due, state: EmailSendState) -> None:
    if state in (EmailSendState.SENT, EmailSendState.HELD):
        run.sent[due.type.value] += 1
    elif state == EmailSendState.FAILED:
        run.failed += 1
    else:
        run.skipped += 1


async def run_due(
    db: AsyncSession,
    notify: Notify,
    *,
    today: dt.date,
    limit: int = LIMIT,
    budget: float = BUDGET_SECONDS,
) -> Run:
    """`/cron/emails`: refunds first (always on), then retries, then each switched-on type in
    order. One email's failure never stops the rest."""
    started = time.monotonic()
    run = Run(sent=Counter())
    on = await switches(db)
    await db.rollback()
    handled = 0

    def spent() -> bool:
        return handled >= limit or time.monotonic() - started >= budget

    queue: list[tuple[str | None, Due]] = []
    try:
        queue += [(None, d) for d in await due_refunds(db)]
        retries = await _retries(db, on)
        run.retried = len(retries)
        queue += [(row_id, d) for row_id, d in retries]
        for kind, finder in FINDERS.items():
            if on[kind]:
                queue += [(None, d) for d in await finder(db, today)]
    finally:
        await db.rollback()

    for row_id, due in queue:
        if spent():
            run.more = True
            break
        try:
            if row_id is None:
                row_id = await claim(db, due)
                if row_id is None:
                    continue
            handled += 1
            _count(run, due, await _send(db, notify, row_id, due, today=today))
        except Exception as exc:
            log.exception("Could not send the %s email (%s)", due.type.value, due.key)
            sentry_sdk.capture_exception(exc)
            run.failed += 1
    return run


async def send_refund_emails(db: AsyncSession, notify: Notify, booking_id: str) -> int:
    """Right after a refund event (the webhook): the refund emails this booking owes. Never
    raises; the cron's run picks up anything missed."""
    sent = 0
    try:
        dues = await due_refunds(db, booking_id=booking_id)
        await db.rollback()
        for due in dues:
            row_id = await claim(db, due)
            if row_id is None:
                continue
            state = await _send(db, notify, row_id, due, today=ist_today())
            sent += state in (EmailSendState.SENT, EmailSendState.HELD)
    except Exception as exc:
        await db.rollback()
        log.exception("Could not send the refund emails for booking %s", booking_id)
        sentry_sdk.capture_exception(exc)
    return sent


# --- for the owner (P15b) and the tests ----------------------------------------------------------


async def sent_counts(db: AsyncSession, *, days: int = 30) -> dict[EmailType, int]:
    rows = (
        await db.execute(
            select(EmailSend.type, func.count())
            .where(
                EmailSend.state.in_([EmailSendState.SENT, EmailSendState.HELD]),
                EmailSend.sent_at >= func.now() - dt.timedelta(days=days),
            )
            .group_by(EmailSend.type)
        )
    ).all()
    return {t: n for t, n in rows}
