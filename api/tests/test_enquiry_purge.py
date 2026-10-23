"""V5 (OP-5): the daily tidy deletes enquiries 12 months old that led to no booking, as /privacy
promises. Needs TEST_DATABASE_URL."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Enquiry, EnquiryNote
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


async def test_an_enquiry_a_booking_came_from_is_kept(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await booked(db, db_app, db_client)
    won = await make_enquiry(db, ref="TS-WON001")
    at_ist(won, ist_noon(ist_today() - dt.timedelta(days=enquiries.KEEP_DAYS * 2)))
    won_id = won.id
    await db.commit()
    await db.execute(update(Booking).where(Booking.ref == ref).values(enquiry_id=won_id))
    await db.commit()

    assert await enquiries.purge(db, today=ist_today()) == 0
    assert await refs(db) == {"TS-WON001"}
