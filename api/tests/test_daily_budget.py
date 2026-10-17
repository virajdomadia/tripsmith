"""V4 (OP-6, OP-1) — `/cron/daily` under a time budget, the balance-cancellation email on the
email ledger, the heartbeats at the end of the daily crons, and `/health/ready` against a real
database. Need TEST_DATABASE_URL."""

from typing import cast

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra import heartbeat
from app.models import Booking, EmailSend
from app.models.enums import BookingStatus, EmailSendState, EmailType
from app.routers.cron import daily
from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import OWNER_INBOX
from tests.test_bookings_desk import cron, owner_cookie, run_daily, run_emails
from tests.test_deposits import DEPOSIT, on_deposit, row, set_due
from tests.test_email_send import FakeSender

__all__ = ["cron", "rzp"]

pytestmark = pytest.mark.db

DAILY_PING = "https://hc-ping.com/daily-check"
EMAILS_PING = "https://hc-ping.com/emails-check"
CANCELLED_SUBJECT = "cancelled — the balance"


@pytest.fixture
def pings(db_app: FastAPI, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    seen: list[str] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, text="OK")

    monkeypatch.setattr(heartbeat, "TRANSPORT", httpx.MockTransport(record))
    db_app.state.settings = db_app.state.settings.model_copy(
        update={
            "healthcheck_daily_url": SecretStr(DAILY_PING),
            "healthcheck_emails_url": SecretStr(EMAILS_PING),
        }
    )
    return seen


async def overdue(db: AsyncSession, db_app: FastAPI, client: AsyncClient) -> tuple[str, FakeSender]:
    """A deposit-paid booking whose balance is a day past its grace: tonight's tidy cancels it."""
    import datetime as dt

    ref, _, sender = await on_deposit(db, db_app, client)
    await set_due(db, ref, ist_today() - dt.timedelta(days=3))
    return ref, sender


async def ledger(db: AsyncSession, ref: str) -> list[EmailSend]:
    db.expire_all()
    return list(
        (
            await db.execute(
                select(EmailSend)
                .join(Booking, Booking.id == EmailSend.booking_id)
                .where(Booking.ref == ref, EmailSend.type == EmailType.BALANCE_CANCELLED)
            )
        )
        .scalars()
        .all()
    )


# --- OP-1 ---------------------------------------------------------------------------------------


async def test_ready_runs_a_query_and_is_never_cached(db_client: AsyncClient) -> None:
    res = await db_client.get("/health/ready")
    assert res.status_code == 200 and res.json() == {"status": "ok"}
    assert res.headers["cache-control"] == "no-store"


async def test_the_daily_crons_ping_their_heartbeats_when_they_finish(
    db_app: FastAPI, db_client: AsyncClient, cron: None, pings: list[str]
) -> None:
    await run_daily(db_client, db_app)
    await run_emails(db_client, db_app)
    assert pings == [DAILY_PING, EMAILS_PING]


# --- OP-6 ---------------------------------------------------------------------------------------


async def test_a_daily_run_out_of_time_stops_reports_the_rest_and_pings_fail(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    cron: None,
    pings: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ref, _ = await overdue(db, db_app, db_client)
    monkeypatch.setattr(daily, "BUDGET_SECONDS", 0.0)
    report = await run_daily(db_client, db_app)
    assert report["more"] is True
    assert report["balancesCancelled"] == 0
    deferred = cast(list[str], report["deferred"])
    assert {"balances", "pdf_gc", "waitlist", "refunds_resent"} <= set(deferred)
    # What only touches the database still ran: the privacy purge and the prunes never wait.
    assert "details_purged" not in deferred
    assert (await row(db, ref)).status == BookingStatus.PARTIALLY_PAID
    assert pings == [f"{DAILY_PING}/fail"]

    monkeypatch.setattr(daily, "BUDGET_SECONDS", 20.0)
    report = await run_daily(db_client, db_app)
    assert (report["more"], report["deferred"], report["balancesCancelled"]) == (False, [], 1)
    assert pings[-1] == DAILY_PING


async def test_the_balance_cancellation_email_goes_once_through_the_ledger(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    rzp.captured["pay_Deposit00001"] = DEPOSIT
    ref, sender = await overdue(db, db_app, db_client)
    assert (await run_daily(db_client, db_app))["balancesCancelled"] == 1
    (sent,) = await ledger(db, ref)
    assert sent.state in (EmailSendState.SENT, EmailSendState.HELD)
    assert sent.key == f"balance_cancelled:{sent.booking_id}"
    report = await run_emails(db_client, db_app)  # the 09:00 run sends nothing again
    assert report["sent"].get("balance_cancelled", 0) == 0
    assert sum(CANCELLED_SUBJECT in m.subject for m in sender.sent) == 1


async def test_a_failed_cancellation_email_is_sent_by_the_next_emails_run(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    """Before V4 a refused send at 01:00 was lost; now the ledger retries it."""
    rzp.captured["pay_Deposit00001"] = DEPOSIT
    ref, sender = await overdue(db, db_app, db_client)
    sender.fail_for = frozenset({OWNER_INBOX})  # demo mode: the customer's copy goes there
    assert (await run_daily(db_client, db_app))["balancesCancelled"] == 1
    (failed,) = await ledger(db, ref)
    assert failed.state == EmailSendState.FAILED
    assert not any(CANCELLED_SUBJECT in m.subject for m in sender.sent)

    sender.fail_for = frozenset()
    report = await run_emails(db_client, db_app)
    assert report["retried"] == 1 and report["sent"]["balance_cancelled"] == 1
    assert sum(CANCELLED_SUBJECT in m.subject for m in sender.sent) == 1
    report = await run_emails(db_client, db_app)
    assert report["sent"].get("balance_cancelled", 0) == 0
    mail = next(m for m in sender.sent if CANCELLED_SUBJECT in m.subject)
    assert "₹8,500" in mail.text  # what was paid before the cancellation, from the booking


async def test_the_owner_can_preview_the_cancellation_email_and_never_switch_it_off(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    rzp.captured["pay_Deposit00001"] = DEPOSIT
    ref, _ = await overdue(db, db_app, db_client)
    await run_daily(db_client, db_app)
    owner = await owner_cookie(db)
    samples = await db_client.get("/admin/emails/balance_cancelled/samples", headers=owner)
    assert [s["ref"] for s in samples.json()["items"]] == [ref]
    res = await db_client.get(f"/admin/emails/balance_cancelled/preview?ref={ref}", headers=owner)
    assert res.status_code == 200, res.text
    assert "cancelled — the balance" in res.json()["subject"] and "₹8,500" in res.json()["text"]
    off = await db_client.put("/admin/emails/balance_cancelled", json={"on": False}, headers=owner)
    assert off.status_code == 409 and off.json()["error"]["reason"] == "no_switch"
