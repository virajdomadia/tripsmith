"""V5 (OP-5): the daily tidy deletes enquiries 12 months old that led to no booking, as /privacy
promises. Needs TEST_DATABASE_URL."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Enquiry, EnquiryNote
from app.models.enums import BookingStatus, EnquiryStatus
from app.services import enquiries
from app.services.analytics import ist_today
from app.services.email.render import IST
from tests.razorpay_fake import FakeRazorpay
from tests.test_admin_enquiries import at_ist, make_enquiry
from tests.test_booking_payments import rzp
from tests.test_traveller_details import booked

__all__ = ["rzp"]

pytestmark = pytest.mark.db


def ist_noon(day: dt.date) -> dt.datetime:
    return dt.datetime.combine(day, dt.time(12), IST)


async def refs(db: AsyncSession) -> set[str]:
    db.expire_all()
    return set((await db.execute(select(Enquiry.ref))).scalars())


async def test_an_enquiry_goes_on_the_day_it_turns_twelve_months_old(db: AsyncSession) -> None:
    today = ist_today()
    kept = await make_enquiry(db, ref="TS-KEEP01")
    at_ist(kept, ist_noon(today - dt.timedelta(days=enquiries.KEEP_DAYS - 1)))
    old = await make_enquiry(db, ref="TS-GONE01")
    at_ist(old, ist_noon(today - dt.timedelta(days=enquiries.KEEP_DAYS)))
    db.add(EnquiryNote(enquiry_id=old.id, body="Called back, no answer"))
    await db.commit()

    assert await enquiries.purge(db, today=today) == 1
    assert await refs(db) == {"TS-KEEP01"}
    assert (await db.execute(select(EnquiryNote))).first() is None, "notes go with it"
    assert await enquiries.purge(db, today=today) == 0


async def test_the_owner_s_won_and_the_seeded_history_are_kept(db: AsyncSession) -> None:
    long_ago = ist_noon(ist_today() - dt.timedelta(days=enquiries.KEEP_DAYS * 2))
    won = await make_enquiry(db, ref="TS-WON002", status=EnquiryStatus.CONVERTED)
    at_ist(won, long_ago)
    seed = await make_enquiry(db, ref="TS-H00001", email="History-Seed-7@example.com")
    at_ist(seed, long_ago)
    await db.commit()

    assert await enquiries.purge(db, today=ist_today()) == 0
    assert await refs(db) == {"TS-WON002", "TS-H00001"}


@pytest.mark.parametrize(
    ("status", "paid", "kept"),
    [
        (None, None, True),  # paid and confirmed
        (BookingStatus.CANCELLED, None, True),  # paid, then cancelled: it was a booking
        (BookingStatus.CANCELLED, 0, False),  # a link never paid: no booking came of it
    ],
)
async def test_an_enquiry_is_kept_only_for_a_booking_that_was_one(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    status: BookingStatus | None,
    paid: int | None,
    kept: bool,
) -> None:
    ref, _, _ = await booked(db, db_app, db_client)
    lead = await make_enquiry(db, ref="TS-LEAD01", status=EnquiryStatus.CONTACTED)
    at_ist(lead, ist_noon(ist_today() - dt.timedelta(days=enquiries.KEEP_DAYS * 2)))
    lead_id = lead.id
    await db.commit()
    values: dict[str, object] = {"enquiry_id": lead_id}
    if status is not None:
        values["status"] = status
    if paid is not None:
        values["paid_paise"] = paid
    await db.execute(update(Booking).where(Booking.ref == ref).values(**values))
    await db.commit()

    assert await enquiries.purge(db, today=ist_today()) == (0 if kept else 1)
    assert await refs(db) == ({"TS-LEAD01"} if kept else set())
