"""P20 · Enquiries A2 (R59): needs reply, follow-ups, lost reasons, the waiting sort, the
estimate, and the same customer's past trips. The db tests need TEST_DATABASE_URL."""

import datetime as dt

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import EnquiryMessage
from app.models.enums import EnquiryStatus, MessageDirection
from app.schemas.admin_enquiries import EnquiryFilters, EnquiryStatusInput
from app.services import admin_enquiries as svc
from app.services.analytics import ist_today
from tests.test_admin_enquiries import make_enquiry, make_package

S = EnquiryStatus


def test_the_inbox_takes_a_view_and_a_sort() -> None:
    f = EnquiryFilters.model_validate({"view": "followup", "sort": "waiting"})
    assert (f.view, f.sort) == ("followup", "waiting")
    assert EnquiryFilters().sort == "newest"
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"view": "quoted"})


def test_a_lost_reason_is_trimmed_and_plain() -> None:
    assert (
        EnquiryStatusInput.model_validate({"status": "closed", "lostReason": "  "}).lost_reason
        is None
    )
    with pytest.raises(ValidationError):
        EnquiryStatusInput.model_validate({"status": "closed", "lostReason": "bad\x07"})


async def replied(db: AsyncSession, enquiry_id: str, *, sent: bool = True) -> None:
    db.add(
        EnquiryMessage(
            enquiry_id=enquiry_id,
            direction=MessageDirection.OUTBOUND,
            subject="Your enquiry",
            body="Hi",
            resend_id="em_1" if sent else None,
            error=None if sent else "SMTP down",
        )
    )
    await db.flush()


@pytest.mark.db
async def test_needs_reply_follow_ups_and_the_waiting_order(db: AsyncSession) -> None:
    now = dt.datetime.now(dt.UTC)
    today = ist_today()
    old = await make_enquiry(db, ref="TS-A2OLD1", created_at=now - dt.timedelta(hours=5))
    fresh = await make_enquiry(db, ref="TS-A2NEW1", created_at=now - dt.timedelta(minutes=10))
    tried = await make_enquiry(db, ref="TS-A2TRY1", created_at=now - dt.timedelta(minutes=30))
    await replied(db, tried.id, sent=False)  # a failed try is not an answer
    answered = await make_enquiry(db, ref="TS-A2ANS1", created_at=now - dt.timedelta(hours=1))
    await replied(db, answered.id)
    due = await make_enquiry(
        db,
        ref="TS-A2DUE1",
        status=S.CONTACTED,
        follow_up_on=today,
        created_at=now - dt.timedelta(days=3),
    )
    await make_enquiry(
        db, ref="TS-A2LTR1", status=S.CONTACTED, follow_up_on=today + dt.timedelta(days=2)
    )
    await make_enquiry(
        db, ref="TS-A2WON1", status=S.CONVERTED, created_at=now - dt.timedelta(days=9)
    )
    await db.commit()

    page = await svc.list_enquiries(db, EnquiryFilters(sort="waiting"))
    a = page.attention
    assert (a.needs_reply, a.over_target, a.follow_up_due) == (3, 1, 1)
    assert a.oldest_waiting_since == old.created_at
    refs = [r.ref for r in page.items]
    # Unanswered, longest waiting first; then the follow-up due; then the rest newest first.
    assert refs[:4] == ["TS-A2OLD1", "TS-A2TRY1", "TS-A2NEW1", "TS-A2DUE1"]
    assert {r.ref: r.replied for r in page.items}["TS-A2ANS1"] is True
    assert {r.ref: r.replied for r in page.items}["TS-A2TRY1"] is False

    reply = await svc.list_enquiries(db, EnquiryFilters(view="reply"))
    assert {r.ref for r in reply.items} == {"TS-A2OLD1", "TS-A2TRY1", "TS-A2NEW1"}
    assert reply.attention.needs_reply == 3  # the chips ignore the view they count
    assert reply.counts == page.counts
    followup = await svc.list_enquiries(db, EnquiryFilters(view="followup"))
    assert [r.ref for r in followup.items] == [due.ref]
    assert fresh.id != due.id


@pytest.mark.db
async def test_a_follow_up_is_noted_cleared_on_winning_and_refused_when_closed(
    db: AsyncSession,
) -> None:
    today = ist_today()
    row = await make_enquiry(db, ref="TS-A2FUP1")
    await db.commit()
    out = await svc.set_follow_up(db, row.id, today + dt.timedelta(days=4))
    assert out.follow_up_on == today + dt.timedelta(days=4)
    assert out.notes[-1].body.startswith("Follow-up set for ")
    out = await svc.set_follow_up(db, row.id, today + dt.timedelta(days=4))  # same day: no note
    assert len(out.notes) == 1
    with pytest.raises(ApiError, match="today or a later day"):
        await svc.set_follow_up(db, row.id, today - dt.timedelta(days=1))

    out = await svc.set_status(db, row.id, S.CONVERTED)
    assert out.follow_up_on is None
    with pytest.raises(ApiError, match="Only an open enquiry"):
        await svc.set_follow_up(db, row.id, today)


@pytest.mark.db
async def test_lost_keeps_its_reason_and_reopening_clears_it(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-A2LST1", follow_up_on=ist_today())
    await db.commit()
    out = await svc.set_status(db, row.id, S.CLOSED, lost_reason="Price too high")
    assert (out.status, out.lost_reason, out.follow_up_on) == (S.CLOSED, "Price too high", None)
    assert out.notes[-1].body == "Status changed from New to Closed · lost: Price too high"
    out = await svc.set_status(db, row.id, S.CLOSED, lost_reason="Went with a friend's plan")
    assert out.lost_reason == "Went with a friend's plan"
    assert len(out.notes) == 1  # a new reason is kept without another status line
    out = await svc.set_status(db, row.id, S.CONTACTED)
    assert out.lost_reason is None


@pytest.mark.db
async def test_the_row_estimates_the_trip_and_the_detail_lists_past_trips(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    row = await make_enquiry(db, ref="TS-A2EST1", package_id=pkg.id, adults=2, children=1)
    await make_enquiry(db, ref="TS-A2EST2")  # no package: no estimate
    await db.commit()
    page = await svc.list_enquiries(db, EnquiryFilters())
    est = {r.ref: r.estimate_paise for r in page.items}
    assert est == {"TS-A2EST1": 3 * pkg.starting_price_paise, "TS-A2EST2": None}
    detail = await svc.get_enquiry(db, row.id)
    assert detail.bookings == []  # no bookings with this email or phone yet
