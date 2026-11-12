"""The refund email (R53, P15): sent once from the webhook through the email ledger — a replayed
webhook sends nothing more. The db test needs TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, EmailSend, Payment, Refund
from app.models.enums import EmailSendState, RefundStatus
from app.services.email.ledger import refund_key
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import deliver
from tests.test_customer_accounts import EMAIL
from tests.test_refunds import refund_event
from tests.test_traveller_details import booked

__all__ = ["rzp"]


def _to_customer(sender: Any) -> list[Any]:
    """Demo mode redirects the customer's copy to the owner, subject `[Test → <email>] …`."""
    return [m for m in sender.sent if m.subject.startswith(f"[Test → {EMAIL}]")]


@pytest.mark.db
async def test_the_refund_email_goes_once_from_the_webhook(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    sender.sent.clear()
    b = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    pay = (await db.execute(select(Payment).where(Payment.booking_id == b.id))).scalars().first()
    assert pay is not None
    refund = Refund(
        booking_id=b.id,
        payment_id=pay.id,
        amount_paise=5_000_00,
        reason="surplus",
        status=RefundStatus.PROCESSED,
        razorpay_refund_id="rfnd_P15Email0001",
    )
    db.add(refund)
    await db.commit()
    refund_id = refund.id
    await db.execute(
        update(Refund).where(Refund.id == refund.id).values(processed_at=dt.datetime.now(dt.UTC))
    )
    await db.commit()
    entity = {"id": "rfnd_P15Email0001", "status": "processed", "notes": {"refund_id": refund.id}}
    for _ in range(2):  # a replay sends nothing more
        res = await deliver(db_client, refund_event("refund.processed", entity))
        assert res.status_code == 200, res.text
    mails = [m for m in _to_customer(sender) if "Refund of ₹5,000" in m.subject]
    assert len(mails) == 1 and "rfnd_P15Email0001" in mails[0].text
    assert "paid more than the booking needed" in mails[0].text
    db.expire_all()
    rows = (await db.execute(select(EmailSend))).scalars().all()
    assert [(r.key, r.state) for r in rows] == [(refund_key(refund_id), EmailSendState.HELD)]
