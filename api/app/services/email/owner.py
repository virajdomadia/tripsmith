"""The owner's side of the automatic emails (R53, P15b): the settings list, a preview rendered
with a real booking as of the day it would go, a test sent to the owner's own inbox (never logged,
never in the ledger), and a booking's "Coming up" list. The rules are automatic.py's — this module
only asks them.
"""

import datetime as dt
from dataclasses import replace

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.email import EmailAttachment, EmailMessage, EmailSender, EmailSendError
from app.models import Booking, Departure, EmailSend, EmailSuppression, Package, Refund, Review
from app.models.enums import BookingStatus, EmailType, RefundStatus
from app.schemas.admin_emails import (
    EmailPreview,
    EmailSample,
    EmailSettings,
    EmailTypeSetting,
    UpcomingEmail,
)
from app.services.booking import deposit, details
from app.services.booking.balance import _open_request
from app.services.email import automatic, unsubscribe
from app.services.email.automatic import (
    DETAILS_STAGES,
    PACK_DAYS,
    REVIEW_AFTER,
    SWITCHABLE,
    Due,
    key_of,
    refund_key,
    still_thinking_key,
)
from app.services.email.unsubscribe import UNSUBSCRIBABLE
from app.services.format import long_date
from app.services.pdf.trip_pack import trip_pack_filename

SENDS_AT = "09:00 IST"
LABEL = {
    EmailType.BALANCE_REMINDER: "Balance reminder",
    EmailType.DETAILS_REMINDER: "Traveller details reminder",
    EmailType.TRIP_PACK: "Trip pack",
    EmailType.REVIEW_REQUEST: "Review request",
    EmailType.STILL_THINKING: "Still thinking?",
    EmailType.REFUND: "Refund on its way",
}
TRIGGER = {
    EmailType.BALANCE_REMINDER: "7 and 3 days before the balance is due, and on the day",
    EmailType.DETAILS_REMINDER: "14 and 5 days before departure, while someone's details are "
    "missing",
    EmailType.TRIP_PACK: "3 days before departure, with the PDF attached — once paid in full",
    EmailType.REVIEW_REQUEST: "2 days after the trip ends, until they review",
    EmailType.STILL_THINKING: "The morning after a hold lapses unpaid — once per email per trip",
    EmailType.REFUND: "As soon as Razorpay reports a refund processed",
}
ORDER = (*SWITCHABLE, EmailType.REFUND)
NOT_FITTING = "This booking doesn't fit this email any more — pick another"


async def settings_out(db: AsyncSession, settings: Settings) -> EmailSettings:
    on = await automatic.switches(db)
    counts = await automatic.sent_counts(db)
    await db.rollback()
    return EmailSettings(
        types=[
            EmailTypeSetting(
                type=t,
                label=LABEL[t],
                trigger=TRIGGER[t],
                switchable=t in SWITCHABLE,
                on=on.get(t, True),
                unsubscribable=t in UNSUBSCRIBABLE,
                recent_sent=counts.get(t, 0),
            )
            for t in ORDER
        ],
        owner_email=settings.owner_notify_email,
        sends_at=SENDS_AT,
    )


def setting_of(out: EmailSettings, kind: EmailType) -> EmailTypeSetting:
    return next(t for t in out.types if t.type == kind)


# --- samples: bookings an email fits ------------------------------------------------------------


async def samples(
    db: AsyncSession, kind: EmailType, *, today: dt.date, limit: int = 12
) -> list[EmailSample]:
    q = (
        select(Booking.ref, Booking.contact_name, Package.name, Departure.date)
        .join(Package, Package.id == Booking.package_id)
        .join(Departure, Departure.id == Booking.departure_id)
    )
    if kind == EmailType.BALANCE_REMINDER:
        q = q.where(
            Booking.status == BookingStatus.PARTIALLY_PAID, Booking.balance_due_on.is_not(None)
        )
    elif kind == EmailType.DETAILS_REMINDER:
        q = q.where(
            Booking.status.in_(details.OPEN_STATUSES),
            Departure.date > today + dt.timedelta(days=details.LOCK_DAYS),
            details.missing_travellers() > 0,
        )
    elif kind == EmailType.TRIP_PACK:
        q = q.where(Booking.status == BookingStatus.CONFIRMED, Departure.date > today)
    elif kind == EmailType.REVIEW_REQUEST:
        q = q.where(
            Booking.status == BookingStatus.COMPLETED,
            ~exists().where(Review.booking_id == Booking.id),
        )
    elif kind == EmailType.STILL_THINKING:
        q = q.where(automatic._lapsed_hold())
    else:  # refund
        q = q.where(
            exists().where(
                Refund.booking_id == Booking.id,
                Refund.status == RefundStatus.PROCESSED,
                Refund.razorpay_refund_id.is_not(None),
            )
        )
    rows = (await db.execute(q.order_by(Booking.created_at.desc()).limit(limit))).all()
    await db.rollback()
    return [
        EmailSample(ref=ref, label=f"{ref} · {name} · {pkg} · {long_date(day)}")
        for ref, name, pkg, day in rows
    ]


# --- preview and test ---------------------------------------------------------------------------


def _first_from(days: list[dt.date], today: dt.date) -> dt.date:
    """The first of the email's days still to come — or today, when they have all passed."""
    return next((d for d in sorted(days) if d >= today), today)


async def _due_for(
    db: AsyncSession, kind: EmailType, ref: str, today: dt.date
) -> tuple[Due, dt.date]:
    """The ledger row this booking would get, and the day it would go."""
    found = (
        await db.execute(
            select(Booking, Departure.date, Package.nights)
            .join(Departure, Departure.id == Booking.departure_id)
            .join(Package, Package.id == Booking.package_id)
            .where(Booking.ref == ref)
        )
    ).first()
    if found is None:
        raise ApiError("not_found", "Booking not found")
    b, departs, nights = found
    email = b.contact_email.lower()
    if kind == EmailType.BALANCE_REMINDER:
        due_on = b.balance_due_on
        if due_on is None:
            raise ApiError("conflict", NOT_FITTING, reason="not_fitting")
        day = _first_from([due_on - dt.timedelta(days=s) for s in deposit.REMINDER_DAYS], today)
        stage = deposit.reminder_stage(due_on, day) or 0
        anchor = due_on
    elif kind == EmailType.DETAILS_REMINDER:
        day = _first_from([departs - dt.timedelta(days=s) for s in DETAILS_STAGES], today)
        stage = automatic.latest_stage((departs - day).days, DETAILS_STAGES) or DETAILS_STAGES[-1]
        anchor = departs
    elif kind == EmailType.TRIP_PACK:
        day, stage, anchor = (
            _first_from([departs - dt.timedelta(days=PACK_DAYS)], today),
            3,
            departs,
        )
    elif kind == EmailType.REVIEW_REQUEST:
        back = departs + dt.timedelta(days=nights + REVIEW_AFTER)
        day, stage, anchor = _first_from([back], today), REVIEW_AFTER, departs
    elif kind == EmailType.STILL_THINKING:
        return Due(kind, still_thinking_key(email, b.package_id), email, b.id, b.ref,
                   b.package_id), today  # fmt: skip
    else:
        refund_id = (
            await db.execute(
                select(Refund.id)
                .where(
                    Refund.booking_id == b.id,
                    Refund.status == RefundStatus.PROCESSED,
                    Refund.razorpay_refund_id.is_not(None),
                )
                .order_by(Refund.processed_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if refund_id is None:
            raise ApiError("conflict", NOT_FITTING, reason="not_fitting")
        due = Due(kind, refund_key(refund_id), email, b.id, b.ref, b.package_id,
                  refund_id=refund_id)  # fmt: skip
        return due, today
    return Due(kind, key_of(kind, b.id, stage, anchor), email, b.id, b.ref, b.package_id, stage,
               anchor), day  # fmt: skip


async def render_for(
    db: AsyncSession, kind: EmailType, ref: str, settings: Settings, *, today: dt.date
) -> tuple[EmailMessage, dt.date]:
    """The customer's email for this booking, as of the day it would go. No PDF is rendered —
    the attachment's name is enough for a preview; the test send attaches the real one."""
    try:
        due, day = await _due_for(db, kind, ref, today)
        labelled, sheet = await automatic.RENDER[kind](db, due, settings, day)
    finally:
        await db.rollback()
    message = next((m for role, m in labelled or [] if role == "customer"), None)
    if message is None:
        raise ApiError("conflict", NOT_FITTING, reason="not_fitting")
    if sheet is not None:
        message = replace(message, attachments=(EmailAttachment(trip_pack_filename(ref), b""),))
    return message, day


async def preview(
    db: AsyncSession, kind: EmailType, ref: str, settings: Settings, *, today: dt.date
) -> EmailPreview:
    message, day = await render_for(db, kind, ref, settings, today=today)
    return EmailPreview(
        type=kind,
        ref=ref,
        to=message.to,
        subject=message.subject,
        html=message.html,
        text=message.text,
        attachments=[a.filename for a in message.attachments],
        as_of=day,
    )


async def send_test(
    db: AsyncSession,
    sender: EmailSender,
    kind: EmailType,
    ref: str,
    settings: Settings,
    *,
    today: dt.date,
) -> EmailMessage:
    """The same email to the owner's inbox, `[Test]` in the subject: not logged in the booking's
    history, not in the ledger, so the real one still goes on its day."""
    if not settings.owner_notify_email:
        raise ApiError("conflict", "Set OWNER_NOTIFY_EMAIL to send tests", reason="no_owner_email")
    if kind == EmailType.TRIP_PACK:
        due, day = await _due_for(db, kind, ref, today)
        await db.rollback()
        labelled = await automatic.render(db, due, settings, today=day)
        message = next((m for role, m in labelled or [] if role == "customer"), None)
        if message is None:
            raise ApiError("conflict", NOT_FITTING, reason="not_fitting")
    else:
        message, _ = await render_for(db, kind, ref, settings, today=today)
    secret = settings.session_secret.get_secret_value() if settings.session_secret else None
    token = unsubscribe.token_for(message.to, kind, secret)
    if token:  # a click on the test's footer must not unsubscribe the customer
        real = unsubscribe.page_url(settings.site_url, token)
        dud = unsubscribe.page_url(settings.site_url, "test-copy")
        message = replace(
            message, html=message.html.replace(real, dud), text=message.text.replace(real, dud)
        )
    test = replace(
        message,
        to=settings.owner_notify_email,
        subject=f"[Test] {message.subject}",
        headers=(),  # a test must not unsubscribe the customer if clicked
    )
    try:
        await sender.send(test)
    except EmailSendError as exc:
        raise ApiError(
            "conflict", "The test email couldn't be sent — try again", reason="send_failed"
        ) from exc
    return test


# --- a booking's "Coming up" --------------------------------------------------------------------


async def upcoming(db: AsyncSession, booking: Booking, *, today: dt.date) -> list[UpcomingEmail]:
    """The automatic emails still to come for this booking, as the rules stand today. Read in
    the caller's transaction."""
    dep = await db.get(Departure, booking.departure_id)
    pkg = await db.get(Package, booking.package_id)
    if dep is None or pkg is None:
        return []
    asked = (await db.execute(select(_open_request()).where(Booking.id == booking.id))).scalar()
    if asked or booking.status in (BookingStatus.PENDING, BookingStatus.CANCELLED):
        return []
    on = await automatic.switches(db)
    taken = set(
        (await db.execute(select(EmailSend.key).where(EmailSend.booking_id == booking.id)))
        .scalars()
        .all()
    )
    made = booking.created_at.astimezone(automatic.IST).date()
    out: list[UpcomingEmail] = []

    def plan(
        kind: EmailType,
        stages: list[tuple[int, dt.date]],
        anchor: dt.date,
        *,
        note: str | None = None,
        made_rule: bool = True,
    ) -> None:
        """Every stage still to come, plus — like the engine's catch-up — the latest one whose
        day has passed unsent, which the next run sends."""
        if made_rule:
            stages = [(st, day) for st, day in stages if day >= made]
        passed = [(st, day) for st, day in stages if day < today]
        if passed:
            stages = [max(passed, key=lambda x: x[1])] + [x for x in stages if x[1] >= today]
        for st, day in stages:
            if key_of(kind, booking.id, st, anchor) not in taken:
                out.append(
                    UpcomingEmail(
                        type=kind,
                        label=LABEL[kind],
                        on=max(day, today),
                        switch_on=on[kind],
                        note=note,
                    )
                )

    due_on = booking.balance_due_on
    if (
        booking.status == BookingStatus.PARTIALLY_PAID
        and due_on
        and today <= deposit.overdue_after(due_on)
    ):
        plan(
            EmailType.BALANCE_REMINDER,
            [(st, due_on - dt.timedelta(days=st)) for st in deposit.REMINDER_DAYS],
            due_on,
            made_rule=False,
        )
    missing = (
        await db.execute(
            select(details.missing_travellers())
            .select_from(Booking)
            .where(Booking.id == booking.id)
        )
    ).scalar() or 0
    if (
        booking.status in details.OPEN_STATUSES
        and missing
        and today < dep.date - dt.timedelta(days=details.LOCK_DAYS)
    ):
        plan(
            EmailType.DETAILS_REMINDER,
            [(st, dep.date - dt.timedelta(days=st)) for st in DETAILS_STAGES],
            dep.date,
            note=f"{missing} still to fill in",
        )
    if (
        booking.status in (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID)
        and today < dep.date
    ):
        plan(
            EmailType.TRIP_PACK,
            [(PACK_DAYS, dep.date - dt.timedelta(days=PACK_DAYS))],
            dep.date,
            note=None if booking.status == BookingStatus.CONFIRMED else "only once paid in full",
        )
    reviewed = (
        await db.execute(select(Review.id).where(Review.booking_id == booking.id))
    ).first() is not None
    suppressed = (
        await db.execute(
            select(EmailSuppression.email).where(
                EmailSuppression.email == func.lower(booking.contact_email),
                EmailSuppression.type == EmailType.REVIEW_REQUEST,
            )
        )
    ).first() is not None
    back = dep.date + dt.timedelta(days=pkg.nights + REVIEW_AFTER)
    # Confirmed today, completed by the 01:00 tidy the day after departure.
    if (
        booking.status in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED)
        and not (reviewed or suppressed)
        and today <= back + dt.timedelta(days=automatic.REVIEW_UNTIL - REVIEW_AFTER)
    ):
        plan(EmailType.REVIEW_REQUEST, [(REVIEW_AFTER, back)], dep.date, made_rule=False)
    return sorted(out, key=lambda u: u.on)
