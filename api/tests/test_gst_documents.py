"""P13b — GST documents (R51): the tax arithmetic, checkout's State and GSTIN, which documents a
booking has, their numbers (per kind and FY, never skipping or repeating — under concurrency
too), the PDF route, and the invoice on the fully-paid email. The db tests need
TEST_DATABASE_URL."""

import asyncio
import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import Booking, GstDocument, Payment, User
from app.models.enums import PaymentProvider, PaymentStatus, UserRole
from app.schemas.bookings import BookingContact
from app.services.analytics import ist_today
from app.services.auth.sessions import open_session
from app.services.gst import documents
from app.services.gst.tax import fy_of, rupees_in_words, split
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking_body, rzp
from tests.test_booking_webhook import OWNER_INBOX, deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import owner_cookie
from tests.test_cancellation_resolve import NOTE, asked, resolve
from tests.test_customer_accounts import signed_in
from tests.test_my_trips import setup

__all__ = ["rzp"]

CONTACT = {"name": "Asha Rao", "phone": "9845012345", "email": "asha@customer.in"}


# --- pure ---------------------------------------------------------------------------------------


def test_karnataka_splits_cgst_and_sgst_other_states_pay_igst_to_the_paisa() -> None:
    ka = split(11_998_00, "Karnataka")
    assert (ka.taxable_paise, ka.cgst_paise, ka.sgst_paise, ka.igst_paise) == (
        11_426_67,
        285_66,
        285_67,
        0,
    )
    assert ka.taxable_paise + ka.tax_paise == 11_998_00 and ka.intra_state
    mh = split(11_998_00, "Maharashtra")
    assert (mh.cgst_paise, mh.sgst_paise, mh.igst_paise) == (0, 0, 571_33)
    assert mh.taxable_paise + mh.tax_paise == 11_998_00 and not mh.intra_state
    # A booking made before checkout asked for a State is the supplier's: Karnataka.
    assert split(10_500_00, None).cgst_paise == 25_000


def test_financial_years_turn_on_the_first_of_april() -> None:
    assert fy_of(dt.date(2026, 9, 28)) == "2026-27"
    assert fy_of(dt.date(2027, 3, 31)) == "2026-27"
    assert fy_of(dt.date(2027, 4, 1)) == "2027-28"
    assert fy_of(dt.date(2099, 12, 1)) == "2099-00"


def test_amounts_in_words_use_lakhs_and_crores() -> None:
    assert rupees_in_words(11_998_00) == "Rupees Eleven Thousand Nine Hundred Ninety-Eight only"
    assert rupees_in_words(1_23_456_00) == (
        "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six only"
    )
    assert rupees_in_words(2_00_00_000_50) == "Rupees Two Crore and Fifty Paise only"


def test_checkout_takes_a_state_and_a_gstin_that_matches_it() -> None:
    c = BookingContact.model_validate(
        {**CONTACT, "state": "Delhi", "gstin": " 07abcde1234f1z5 ", "companyName": " Acme Pvt "}
    )
    assert (c.state, c.gstin, c.company_name) == ("Delhi", "07ABCDE1234F1Z5", "Acme Pvt")
    alone = BookingContact.model_validate(
        {**CONTACT, "gstin": "27ABCDE1234F1Z5", "companyName": "Acme"}
    )
    assert alone.state == "Maharashtra"  # an older client's GSTIN still gets IGST, not Karnataka
    plain = BookingContact.model_validate({**CONTACT, "companyName": "Ignored"})
    assert (plain.state, plain.gstin, plain.company_name) == (None, None, None)
    for bad, field in (
        ({"state": "Narnia"}, "state"),
        ({"state": "Karnataka", "gstin": "07ABCDE1234F1Z5", "companyName": "X"}, "gstin"),
        ({"gstin": "29ABCDE1234F1Z5"}, "companyName"),
        ({"gstin": "GSTIN-PLEASE"}, "gstin"),
    ):
        with pytest.raises(ValidationError) as err:
            BookingContact.model_validate({**CONTACT, **bad})
        locs = [str(e["loc"][-1]).replace("_n", "N") for e in err.value.errors()]
        assert locs == [field]


# --- db -----------------------------------------------------------------------------------------


async def paid(
    client: AsyncClient, departure_id: str, n: int, contact: dict[str, str] | None = None
) -> str:
    body = booking_body(departure_id, 1, email=f"g{n}@customer.in", phone=f"98450{n:05d}")
    if contact:
        body["contact"] = {**body["contact"], **contact}  # type: ignore[dict-item]
    res = await client.post("/bookings", json=body)
    assert res.status_code == 201, res.text
    order = res.json()
    captured = event("payment.captured", order["orderId"], f"pay_Gst{n:09d}", order["amountPaise"])
    assert (await deliver(client, captured)).json() == {"status": "captured"}
    return str(order["bookingRef"])


@pytest.mark.db
async def test_a_paid_booking_is_receipted_and_invoiced_at_the_capture(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=8)
    ref = await paid(
        db_client,
        departure.id,
        1,
        {"state": "Maharashtra", "gstin": "27ABCDE1234F1Z5", "companyName": "Acme Travel Desk"},
    )
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    invoice = b["documents"][1]
    fy = fy_of(dt.date.fromisoformat(invoice["dated"]))
    # Both are numbered in the capture's own transaction, in the order the events happened.
    kinds = [(d["kind"], d["number"]) for d in b["documents"]]
    assert kinds == [("receipt", f"RC/{fy}/0001"), ("invoice", f"TS/{fy}/0001")]
    assert invoice["amountPaise"] == b["totalPaise"] == b["paidPaise"]  # invoice total = paid
    stored = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    assert (stored.billing_state, stored.gstin, stored.company_name) == (
        "Maharashtra",
        "27ABCDE1234F1Z5",
        "Acme Travel Desk",
    )

    for _ in range(2):  # the second download finds the number already issued
        res = await db_client.get(f"/account/bookings/{ref}/documents/invoice.pdf", headers=owner)
        assert res.status_code == 200, res.text
        assert (
            res.content.startswith(b"%PDF") and res.headers["cache-control"] == "private, no-store"
        )
        assert f"TS-{fy}-0001" in res.headers["content-disposition"]
    receipt_key = b["documents"][0]["key"]
    res = await db_client.get(f"/account/bookings/{ref}/documents/{receipt_key}.pdf", headers=owner)
    assert res.status_code == 200 and f"RC-{fy}-0001" in res.headers["content-disposition"]
    rows = (await db.execute(select(GstDocument.number).order_by(GstDocument.number))).scalars()
    assert list(rows) == [f"RC/{fy}/0001", f"TS/{fy}/0001"]
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert [d["number"] for d in b["documents"]] == [f"RC/{fy}/0001", f"TS/{fy}/0001"]


@pytest.mark.db
async def test_the_documents_are_the_customers_and_the_owners_only(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref = await setup(db, db_app, db_client)  # demo mode: sign-in codes on screen
    url = f"/account/bookings/{ref}/documents/invoice.pdf"
    assert (await db_client.get(url)).status_code == 401
    token = await signed_in(db_client)
    mine = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    assert [d["kind"] for d in mine["documents"]] == ["receipt", "invoice"]
    assert (await db_client.get(url, headers=with_cookie(token))).status_code == 200
    stranger = User(name="Ravi", email="ravi@example.test", role=UserRole.CUSTOMER)
    db.add(stranger)
    await db.commit()
    _, other = await open_session(db, stranger, ip=None, user_agent=None)
    assert (await db_client.get(url, headers=with_cookie(other))).status_code == 403
    bad = await db_client.get(
        f"/account/bookings/{ref}/documents/receipt-X.pdf", headers=with_cookie(token)
    )
    assert bad.status_code == 400
    missing = await db_client.get(
        f"/account/bookings/{ref}/documents/credit-nosuchrefund.pdf", headers=with_cookie(token)
    )
    assert missing.status_code == 404


@pytest.mark.db
async def test_a_refund_after_the_invoice_gets_a_credit_note_citing_it(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref, owner, id = await asked(db, db_app, db_client, days_out=20)
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    half = detail["cancellation"]["suggestedRefundPaise"]
    res = await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=half)
    assert res.status_code == 200, res.text
    docs = res.json()["documents"]
    assert [d["kind"] for d in docs] == ["receipt", "invoice", "credit_note"]
    credit = docs[2]
    # Numbered when Razorpay processed the refund; it cites the invoice numbered at payment.
    assert credit["amountPaise"] == half and credit["number"].startswith("CN/")
    assert [d["number"][:2] for d in docs] == ["RC", "TS", "CN"]
    got = await db_client.get(
        f"/account/bookings/{ref}/documents/{credit['key']}.pdf", headers=owner
    )
    assert got.status_code == 200, got.text
    assert credit["number"].replace("/", "-") in got.headers["content-disposition"]


@pytest.mark.db
async def test_credit_notes_never_exceed_the_invoice(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """A cancellation refund that also returns money paid beyond the price (a second payment)
    credits only what was invoiced; the rest is not a credit."""
    _, ref, owner, id = await asked(db, db_app, db_client, days_out=40)
    b = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    extra = 3_000_00
    db.add(
        Payment(
            booking_id=b.id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id="order_GstExtra01",
            razorpay_payment_id="pay_GstExtra01",
            amount_paise=extra,
            status=PaymentStatus.CAPTURED,
        )
    )
    await db.execute(
        update(Booking).where(Booking.id == b.id).values(paid_paise=Booking.paid_paise + extra)
    )
    await db.commit()
    total = b.total_paise
    res = await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=total)
    assert res.status_code == 200, res.text
    docs = res.json()["documents"]
    credits = [d for d in docs if d["kind"] == "credit_note"]
    invoice = next(d for d in docs if d["kind"] == "invoice")
    assert sum(d["amountPaise"] for d in credits) == invoice["amountPaise"] == total


@pytest.mark.db
async def test_money_on_a_released_hold_is_receipted_but_never_invoiced(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    order = (
        await db_client.post(
            "/bookings",
            json=booking_body(departure.id, 1, email="late@customer.in", phone="9845000077"),
        )
    ).json()
    ref = order["bookingRef"]
    assert (await db_client.post(f"/admin/bookings/{ref}/release", headers=owner)).is_success
    with_webhook_secret(db_app)
    captured = event("payment.captured", order["orderId"], "pay_GstLate001", order["amountPaise"])
    await deliver(db_client, captured)
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert [d["kind"] for d in b["documents"]] == ["receipt"]  # its refund is not a credit
    no = await db_client.get(f"/account/bookings/{ref}/documents/invoice.pdf", headers=owner)
    assert no.status_code == 404


@pytest.mark.db
async def test_the_fully_paid_email_carries_the_tax_invoice(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=8)
    ref = await paid(db_client, departure.id, 2, {"state": "Karnataka"})
    [customer] = [m for m in sender.sent if m.to != OWNER_INBOX]
    names = [a.filename for a in customer.attachments]
    fy = fy_of(ist_today())
    assert names == [f"Tripsmith-{ref}-voucher.pdf", f"Tripsmith-{ref}-TS-{fy}-0001.pdf"]
    assert "tax invoice is attached" in customer.text
    assert all(a.content.startswith(b"%PDF") for a in customer.attachments)


@pytest.mark.db
async def test_invoice_numbers_stay_gap_free_under_concurrency(
    db: AsyncSession,
    db_engine: AsyncEngine,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
) -> None:
    """Accept: invoice numbers never skip or repeat. Eight bookings are invoiced at once, and a
    ninth takes a number and rolls back mid-way — the number goes back, so the eight are
    exactly 1…8. (The bookings are paid with emails off, then their invoices cleared, so every
    number here is issued by the race.)"""
    with_webhook_secret(db_app)
    _, departure = await seeded(db, seats=20)
    refs = [await paid(db_client, departure.id, 10 + i) for i in range(9)]
    await db.execute(text("delete from gst_documents"))
    await db.execute(text("delete from gst_counters"))
    await db.commit()
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    ids = {
        r: (await db.execute(select(Booking.id).where(Booking.ref == r))).scalar_one() for r in refs
    }
    await db.rollback()

    async def invoice(ref: str) -> str:
        # The booking row alone — no departure lock — so the (invoice, FY) counter row, created
        # by whichever issuer's INSERT … ON CONFLICT lands first, is all that serialises them.
        async with maker() as s:
            booking = (await s.execute(select(Booking).where(Booking.id == ids[ref]))).scalar_one()
            doc = await documents._issue_locked(s, booking, "invoice")  # noqa: SLF001
            await asyncio.sleep(0.01)
            await s.commit()
            return doc.number or ""

    async def abandoned(ref: str) -> None:
        async with maker() as s:
            booking = (await s.execute(select(Booking).where(Booking.id == ids[ref]))).scalar_one()
            await documents._issue_locked(s, booking, "invoice")  # noqa: SLF001
            await asyncio.sleep(0.05)  # hold the counter row while the others queue on it
            await s.rollback()

    results = await asyncio.gather(abandoned(refs[8]), *(invoice(r) for r in refs[:8]))
    numbers = sorted(n for n in results if n)
    fy = numbers[0].split("/")[1]
    assert numbers == [f"TS/{fy}/{i:04d}" for i in range(1, 9)]
    # And the abandoned one, issued now, is the ninth — not the first, and not a repeat.
    async with maker() as s:
        assert (await documents.issue(s, refs[8], "invoice")).number == f"TS/{fy}/0009"
