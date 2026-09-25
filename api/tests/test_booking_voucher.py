"""B7 — the voucher and the booking emails (R16 late capture, R17 confirmation): the signed link,
the render, which emails each capture sends, and the api journey (order → signed webhook →
confirmed → voucher 200 for its owner, 403 otherwise). The db tests need TEST_DATABASE_URL."""

import datetime as dt
import io
import time
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.email import EmailAttachment, EmailMessage
from app.models import User
from app.models.enums import BookingStatus, UserRole
from app.services.auth.passwords import hash_password
from app.services.auth.sessions import login
from app.services.booking.settled import Capture, Settled
from app.services.booking.voucher import (
    LINK_SECONDS,
    BookingFacts,
    Hotel,
    Traveller,
    link_is_valid,
    voucher_path,
)
from app.services.email.bookings import render_booking_emails, send_booking_emails
from app.services.pdf.voucher import render_voucher
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_auth import with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking_body, callback, rzp
from tests.test_booking_webhook import (
    OWNER_INBOX,
    SECRET,
    deliver,
    event,
    mailing,
    roles,
    with_webhook_secret,
)
from tests.test_email_send import FakeSender

__all__ = ["rzp"]

LIVE = make_settings(
    email_from="Tripsmith <hello@tripsmith.in>",
    owner_notify_email=OWNER_INBOX,
    site_url="https://tripsmith.vercel.app",
)
TEST_MODE = make_settings(
    email_from="Tripsmith <onboarding@resend.dev>",
    owner_notify_email=OWNER_INBOX,
    site_url="https://tripsmith.vercel.app",
)


def facts(status: BookingStatus = BookingStatus.CONFIRMED, travellers: int = 3) -> BookingFacts:
    return BookingFacts(
        ref="TB-7F3K2Q",
        status=status,
        package_name="Kasol Riverside Weekend",
        package_slug="kasol-weekend-camp",
        destination="Himachal",
        nights=2,
        days=3,
        departure_city="Ex-Delhi",
        departs=dt.date(2026, 10, 9),
        returns=dt.date(2026, 10, 11),
        travellers=tuple(
            Traveller(f"Traveller {i}", 30 + i, "Double room") for i in range(travellers)
        ),
        hotels=(Hotel("Riverside Camps", "Kasol", 3, 2),),
        inclusions=("Two nights in riverside tents", "All meals", "Guided Chalal trek"),
        lead_name="Priya Sharma",
        lead_phone="9000000001",
        lead_email="priya@example.com",
        total_paise=11_998_00,
        paid_paise=11_998_00,
        payment_ids=("pay_TgNJB4GC0DdPbz",),
        booked_at=dt.datetime(2026, 9, 26, 9, 30, tzinfo=dt.UTC),
    )


def pdf_text(pdf: bytes) -> tuple[int, str]:
    reader = PdfReader(io.BytesIO(pdf))
    return len(reader.pages), " ".join(" ".join(p.extract_text().split()) for p in reader.pages)


# --- signed link -------------------------------------------------------------------------------


def test_the_link_is_good_for_thirty_minutes_for_its_booking_only() -> None:
    now = 1_790_000_000.0
    path = voucher_path("TB-7F3K2Q", SECRET, now=now)
    assert path is not None and path.startswith("/bookings/TB-7F3K2Q/voucher.pdf?exp=")
    exp = int(path.split("exp=")[1].split("&")[0])
    sig = path.split("sig=")[1]
    assert exp == now + LINK_SECONDS
    assert link_is_valid("TB-7F3K2Q", exp, sig, SECRET, now=now + LINK_SECONDS - 1)
    assert not link_is_valid("TB-7F3K2Q", exp, sig, SECRET, now=now + LINK_SECONDS + 1)
    assert not link_is_valid("TB-AAAAAA", exp, sig, SECRET, now=now)  # another booking
    assert not link_is_valid("TB-7F3K2Q", exp + 3600, sig, SECRET, now=now)  # stretched expiry
    assert not link_is_valid("TB-7F3K2Q", exp, sig, "another-secret", now=now)
    assert not link_is_valid("TB-7F3K2Q", exp, "é", SECRET, now=now)  # non-hex: False, not 500
    # No SESSION_SECRET (local dev): nothing is signed, nothing verifies.
    assert voucher_path("TB-7F3K2Q", None) is None and voucher_path("TB-7F3K2Q", "") is None
    assert not link_is_valid("TB-7F3K2Q", exp, sig, None, now=now)


# --- voucher -----------------------------------------------------------------------------------


def test_the_voucher_carries_what_r17_lists_on_one_page_well_inside_3_s() -> None:
    start = time.perf_counter()
    pdf = render_voucher(
        facts(), site_url="https://tripsmith.vercel.app", whatsapp_number="919845012345"
    )
    assert time.perf_counter() - start < 3
    pages, text = pdf_text(pdf)
    assert pages == 1
    for expected in (
        "TB-7F3K2Q",  # booking ref
        "Traveller 0",  # travellers
        "Traveller 2",
        "Fri 9 Oct 2026",  # departure
        "Sun 11 Oct 2026",
        "Riverside Camps",  # hotels
        "All meals",  # inclusions
        "+91 98450 12345",  # contact
        "₹11,998",
        "pay_TgNJB4GC0DdPbz",
    ):
        assert expected in text, expected


def test_a_full_party_runs_on_to_a_second_page() -> None:
    pdf = render_voucher(
        facts(travellers=12), site_url="https://x.test", whatsapp_number="919845012345"
    )
    pages, text = pdf_text(pdf)
    assert pages == 2 and "Traveller 11" in text and "Page 2 of 2" in text


# --- emails ------------------------------------------------------------------------------------

VOUCHER = EmailAttachment("Tripsmith-TB-7F3K2Q-voucher.pdf", b"%PDF-1.7")


def by_role(emails: list[tuple[str, EmailMessage]]) -> dict[str, EmailMessage]:
    roles = [r for r, _ in emails]
    assert len(roles) == len(set(roles)), roles
    return dict(emails)


def says_confirmed(m: EmailMessage) -> bool:
    return any("confirmed" in part.lower() for part in (m.subject, m.html, m.text))


def test_a_confirmation_sends_the_customer_the_voucher_and_the_owner_the_booking() -> None:
    emails = by_role(
        render_booking_emails(
            facts(), Capture(Settled.CONFIRMED, "pay_A", 11_998_00), settings=LIVE, voucher=VOUCHER
        )
    )
    customer, owner = emails["customer"], emails["owner"]
    assert customer.to == "priya@example.com"
    assert (
        customer.subject == "Booking TB-7F3K2Q confirmed — Kasol Riverside Weekend, Fri 9 Oct 2026"
    )
    assert customer.attachments == (VOUCHER,)
    assert "attached as a PDF" in customer.text and "wa.me/" in customer.text
    assert owner.to == OWNER_INBOX and owner.reply_to == "priya@example.com"
    assert owner.subject.startswith("New booking TB-7F3K2Q — Priya Sharma")
    assert owner.attachments == () and "Refund" not in owner.text


def test_a_confirmation_without_its_voucher_says_so() -> None:
    emails = by_role(
        render_booking_emails(facts(), Capture(Settled.CONFIRMED, "pay_A", 1), settings=LIVE)
    )
    assert emails["customer"].attachments == ()
    assert "couldn’t attach your voucher" in emails["customer"].text


def test_seats_gone_tells_both_about_the_refund_and_never_says_confirmed() -> None:
    capture = Capture(Settled.SEATS_GONE, "pay_Late", 11_998_00)
    emails = by_role(render_booking_emails(facts(BookingStatus.CANCELLED), capture, settings=LIVE))
    customer, owner = emails["customer"], emails["owner"]
    assert "couldn't hold your seat" in customer.subject
    assert "Your ₹11,998 will be refunded within 5–7 days" in customer.text
    assert customer.attachments == ()
    assert owner.subject.startswith("Refund needed on TB-7F3K2Q — ₹11,998")
    assert "pay_Late" in owner.text
    assert not says_confirmed(customer) and not says_confirmed(owner)


def test_money_on_a_booking_no_longer_pending() -> None:
    capture = Capture(Settled.NOT_PENDING, "pay_Extra", 5_000_00)
    # A second payment on a confirmed booking: the owner refunds it; the customer is not told
    # their trip is off.
    twice = by_role(render_booking_emails(facts(), capture, settings=LIVE))
    assert list(twice) == ["owner"] and "Refund ₹5,000 by hand" in twice["owner"].html
    # A payment on a cancelled booking: the customer hears about the refund too.
    gone = by_role(render_booking_emails(facts(BookingStatus.CANCELLED), capture, settings=LIVE))
    assert list(gone) == ["customer", "owner"]
    assert "Your ₹5,000 will be refunded" in gone["customer"].text
    # A part payment (add-on D) sends nothing yet.
    part = Capture(Settled.PART_PAID, "pay_Part", 1)
    assert render_booking_emails(facts(BookingStatus.PENDING), part, settings=LIVE) == []


def test_no_owner_inbox_means_no_owner_email() -> None:
    emails = render_booking_emails(
        facts(), Capture(Settled.CONFIRMED, "pay_A", 1), settings=make_settings()
    )
    assert [r for r, _ in emails] == ["customer"]


async def test_demo_mode_sends_the_customer_copy_to_the_owner() -> None:
    sender = FakeSender()
    capture = Capture(Settled.CONFIRMED, "pay_A", 1)
    await send_booking_emails(sender, TEST_MODE, facts(), capture, voucher=VOUCHER)
    assert [m.to for m in sender.sent] == [OWNER_INBOX, OWNER_INBOX]
    assert sender.sent[0].subject.startswith("[Test → priya@example.com] Booking TB-7F3K2Q")
    assert sender.sent[0].attachments == (VOUCHER,)
    # Demo mode with no owner inbox: nothing can be delivered, so nothing is sent.
    silent = FakeSender()
    await send_booking_emails(silent, make_settings(), facts(), capture)
    assert silent.sent == []


async def test_a_failed_send_is_logged_never_raised(caplog: pytest.LogCaptureFixture) -> None:
    sender = FakeSender(fail_for=frozenset({"priya@example.com"}))
    await send_booking_emails(sender, LIVE, facts(), Capture(Settled.CONFIRMED, "pay_A", 1))
    assert [m.to for m in sender.sent] == [OWNER_INBOX]
    assert "customer booking email failed for TB-7F3K2Q" in caplog.text
    assert "priya@example.com" not in caplog.text  # the role, never the address


# --- db: the journey ---------------------------------------------------------------------------


async def held(client: AsyncClient, departure_id: str, party: int = 2) -> dict[str, Any]:
    res = await client.post(
        "/bookings",
        json=booking_body(departure_id, party, email="j@example.test", phone="9000000031"),
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.db
async def test_journey_order_webhook_confirmed_voucher_for_its_owner_only(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=4)
    order = await held(db_client, departure.id)
    ref, order_id = order["bookingRef"], order["orderId"]

    # The signed webhook confirms it and sends the two emails, once.
    body = event("payment.captured", order_id, "pay_Journey01", order["amountPaise"])
    assert (await deliver(db_client, body)).json() == {"status": "captured"}
    assert roles(sender) == ["customer", "owner"]
    customer = next(m for m in sender.sent if m.to == "j@example.test")
    [voucher] = customer.attachments
    assert voucher.filename == f"Tripsmith-{ref}-voucher.pdf"
    assert ref in pdf_text(voucher.content)[1]

    # Checkout's callback lands after it: no new email, and the visitor gets the signed link.
    res = await db_client.post(f"/bookings/{ref}/confirm", json=callback(order_id, "pay_Journey01"))
    assert res.status_code == 200 and res.json()["status"] == "confirmed"
    link = res.json()["voucherUrl"]
    assert link.startswith(f"/bookings/{ref}/voucher.pdf?exp=")
    assert len(sender.sent) == 2

    start = time.perf_counter()
    pdf = await db_client.get(link)
    assert time.perf_counter() - start < 3
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["cache-control"] == "private, no-store"
    assert ref in pdf_text(pdf.content)[1]

    # 403 otherwise: a wrong, missing, borrowed or expired signature.
    exp, sig = link.split("exp=")[1].split("&sig=")
    for bad in (
        f"/bookings/{ref}/voucher.pdf?exp={exp}&sig={'0' * 64}",
        f"/bookings/{ref}/voucher.pdf",
        f"/bookings/TB-ZZZZZZ/voucher.pdf?exp={exp}&sig={sig}",
        f"/bookings/{ref}/voucher.pdf?exp={int(time.time()) - 1}&sig={sig}",
    ):
        res = await db_client.get(bad)
        assert res.status_code == 403, bad
        assert res.json()["error"]["code"] == "forbidden"

    # Sync answers the status to anyone with the ref, the link only with the order id.
    res = await db_client.post(f"/bookings/{ref}/sync")
    assert res.json()["status"] == "confirmed" and res.json()["voucherUrl"] is None
    res = await db_client.post(f"/bookings/{ref}/sync", json={"orderId": "order_NotThisOne1"})
    assert res.json()["voucherUrl"] is None
    res = await db_client.post(f"/bookings/{ref}/sync", json={"orderId": order_id})
    assert (await db_client.get(res.json()["voucherUrl"])).status_code == 200

    # Signed in: the owner downloads it; a customer (whose bookings arrive in B8) cannot yet.
    account = f"/account/bookings/{ref}/voucher.pdf"
    assert (await db_client.get(account)).status_code == 401
    for name, email, role in (
        ("Owner", "owner@tripsmith.demo", UserRole.OWNER),
        ("Meera", "meera@example.test", UserRole.CUSTOMER),
    ):
        db.add(User(name=name, email=email, role=role, password_hash=hash_password("pw")))
    await db.commit()
    opened = await login(db, "owner@tripsmith.demo", "pw", ip=None, user_agent=None)
    assert opened is not None
    res = await db_client.get(account, headers=with_cookie(opened[1]))
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf"
    other = await login(db, "meera@example.test", "pw", ip=None, user_agent=None)
    assert other is not None
    res = await db_client.get(account, headers=with_cookie(other[1]))
    assert res.status_code == 403
    assert len(sender.sent) == 2  # nothing above sent anything


@pytest.mark.db
async def test_a_pending_booking_has_no_voucher_and_no_link(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, departure = await seeded(db, seats=4)
    order = await held(db_client, departure.id)
    ref = order["bookingRef"]
    res = await db_client.post(f"/bookings/{ref}/sync", json={"orderId": order["orderId"]})
    assert res.json()["status"] == "pending" and res.json()["voucherUrl"] is None
    signed = voucher_path(ref, SECRET)
    assert signed is not None
    res = await db_client.get(signed)
    assert res.status_code == 404 and res.json()["error"]["code"] == "not_found"
