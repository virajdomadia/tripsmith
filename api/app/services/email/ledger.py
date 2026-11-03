"""The email ledger (`email_sends`, models/emails.py): the refund email, sent at most once.

Right after Razorpay reports a refund processed (the webhook), `send_refund_emails` finds the
refunds of that booking with no ledger row yet, inserts the row under its key and COMMITS it
before the send — so a webhook replayed by Razorpay, or two arriving at once, never sends twice.
A send that fails stays `failed` in the ledger (and in the booking's history); nothing retries it.

2026-11-04 (lean cleanup): the scheduled emails this ledger also sent — balance and details
reminders, the trip pack, the review request, "still thinking", the balance-cancelled notice —
went with the crons. Their rows stay in the table as history.
"""

import datetime as dt
import logging
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infra.email import EmailMessage
from app.models import Booking, EmailSend, Refund
from app.models.enums import EmailSendState, EmailType, RefundStatus
from app.services.booking.after_capture import Notify
from app.services.booking.history import EmailLine
from app.services.booking.voucher import load_booking_facts
from app.services.email.bookings import _message, _vars, deliver
from app.services.email.send import is_seed_address
from app.services.format import inr

log = logging.getLogger(__name__)

# A refund processed longer ago than this is not emailed by a late webhook replay.
RECENT = dt.timedelta(days=2)

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
    key: str
    email: str
    booking_id: str
    ref: str
    package_id: str | None
    refund_id: str


def refund_key(refund_id: str) -> str:
    return f"{EmailType.REFUND.value}:{refund_id}"


async def due_refunds(db: AsyncSession, *, booking_id: str) -> list[Due]:
    rows = (
        await db.execute(
            select(Refund.id, Booking.id, Booking.ref, Booking.contact_email, Booking.package_id)
            .join(Booking, Booking.id == Refund.booking_id)
            .where(
                Refund.booking_id == booking_id,
                Refund.status == RefundStatus.PROCESSED,
                Refund.by_hand.is_(False),
                Refund.razorpay_refund_id.is_not(None),
                Refund.processed_at >= func.now() - RECENT,
            )
        )
    ).all()
    dues = [
        Due(refund_key(rid), email.lower(), bid, ref, pkg, rid)
        for rid, bid, ref, email, pkg in rows
    ]
    if not dues:
        return []
    taken = set(
        (await db.execute(select(EmailSend.key).where(EmailSend.key.in_([d.key for d in dues]))))
        .scalars()
        .all()
    )
    return [d for d in dues if d.key not in taken and not is_seed_address(d.email)]


async def claim(db: AsyncSession, due: Due) -> str | None:
    """Insert the ledger row and commit — or None when another call got there first."""
    try:
        row_id = (
            await db.execute(
                insert(EmailSend)
                .values(
                    key=due.key,
                    type=EmailType.REFUND,
                    booking_id=due.booking_id,
                    email=due.email,
                    package_id=due.package_id,
                    stage=0,
                    anchor=None,
                )
                .on_conflict_do_nothing(index_elements=[EmailSend.key])
                .returning(EmailSend.id)
            )
        ).scalar_one_or_none()
        await db.commit()
        return row_id
    except BaseException:
        await db.rollback()
        raise


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
    except Exception:
        await db.rollback()
        log.exception("Could not record the email ledger row %s", row_id)
    return state


async def render_refund(
    db: AsyncSession, due: Due, settings: Settings
) -> list[tuple[str, EmailMessage]] | None:
    """The refund email — None when the refund is no longer processed. Ends its transaction."""
    try:
        row = await db.get(Refund, due.refund_id)
        facts = await load_booking_facts(db, due.ref)
        if row is None or facts is None or row.status != RefundStatus.PROCESSED:
            return None
        amount = inr(row.amount_paise // 100)
        vars = {
            **_vars(facts, settings),
            "amount": amount,
            "why": REFUND_WHY.get(row.reason, ""),
            "refund_ref": row.razorpay_refund_id or row.id,
        }
        subject = f"Refund of {amount} on its way — {facts.ref}"
        return [("customer", _message(facts.lead_email, subject, "refund_sent", vars))]
    finally:
        await db.rollback()


async def _send(db: AsyncSession, notify: Notify, row_id: str, due: Due) -> EmailSendState:
    try:
        labelled = await render_refund(db, due, notify.settings)
    except Exception:
        log.exception("Could not render the refund email (%s)", due.key)
        return await finish(db, row_id, [EmailLine("customer", "refund", "failed")])
    if labelled is None:
        return await finish(db, row_id, None)
    lines = await deliver(
        notify.sender, notify.settings, labelled, ref=due.ref, what="refund", db=db
    )
    return await finish(db, row_id, lines)


async def send_refund_emails(db: AsyncSession, notify: Notify, booking_id: str) -> int:
    """Right after a refund event (the webhook): the refund emails this booking owes. Never
    raises."""
    sent = 0
    try:
        dues = await due_refunds(db, booking_id=booking_id)
        await db.rollback()
        for due in dues:
            row_id = await claim(db, due)
            if row_id is None:
                continue
            state = await _send(db, notify, row_id, due)
            sent += state in (EmailSendState.SENT, EmailSendState.HELD)
    except Exception:
        await db.rollback()
        log.exception("Could not send the refund emails for booking %s", booking_id)
    return sent
