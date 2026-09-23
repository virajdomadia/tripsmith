"""POST /enquiries (06 C2): saves with status=new, dedupes 60 s, honeypot, rate limit, envelope."""

import asyncio
import datetime as dt
import hashlib
import re

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.ratelimit import RateLimitResult
from app.models import Enquiry
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.services.enquiries import hash_ip, make_ref
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_email_send import FakeSender
from tests.test_pdf_service import FakeBlobStore, cover_transport

BODY = {
    "type": "standard",
    "packageSlug": "north-goa-beaches",
    "name": "Priya Sharma",
    "phone": "+91 98450 22110",
    "email": "Priya@Example.com",
    "travelMonth": "2026-11",
    "adults": 2,
    "children": 1,
    "message": "Early check-in possible?",
    "website": "",
}


class CountingLimiter:
    def __init__(self, limit: int = 5) -> None:
        self.limit, self.hits = limit, []  # type: ignore[var-annotated]

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        self.hits.append(key)
        n = self.hits.count(key)
        return RateLimitResult(allowed=n <= self.limit, retry_after=0 if n <= self.limit else 600)


async def seeded(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(Enquiry))).scalar_one()


def test_make_ref_shape() -> None:
    for _ in range(50):
        assert re.fullmatch(r"TS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}", make_ref())


@pytest.mark.db
async def test_submit_saves_a_new_enquiry(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post(
        "/enquiries",
        json=BODY,
        headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.1", "User-Agent": "UA"},
    )
    assert res.status_code == 201, res.text
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert re.fullmatch(r"TS-[A-Z2-9]{6}", body["ref"])
    assert body["firstName"] == "Priya"
    assert body["emailed"] is False
    assert body["package"] == {"slug": "north-goa-beaches", "name": "North Goa Beaches"}

    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.ref == body["ref"]
    assert row.type == EnquiryType.STANDARD and row.status == EnquiryStatus.NEW
    assert row.email_status == EmailStatus.SKIPPED
    assert row.phone == "9845022110" and row.email == "priya@example.com"
    assert row.travel_month == dt.date(2026, 11, 1)
    assert row.adults == 2 and row.children == 1
    assert row.package_id is not None
    assert row.ip_hash and row.ip_hash != "1.2.3.4" and len(row.ip_hash) == 32
    assert row.user_agent == "UA"


@pytest.mark.db
async def test_contact_enquiry_has_no_package(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post(
        "/enquiries",
        json={**BODY, "type": "contact", "packageSlug": None, "travelMonth": None},
    )
    assert res.status_code == 201
    assert res.json()["package"] is None
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.package_id is None and row.type == EnquiryType.CONTACT


@pytest.mark.db
async def test_custom_enquiry_stores_the_extra_fields(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    res = await db_client.post(
        "/enquiries",
        json={
            **BODY,
            "type": "custom",
            "preferredDates": "14–18 Nov",
            "budget": 25000,
            "changes": "Add a night",
        },
    )
    assert res.status_code == 201
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.preferred_dates == "14–18 Nov"
    assert row.budget_paise == 2_500_000
    assert row.changes == "Add a night"


@pytest.mark.db
async def test_validation_errors_use_wire_names(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post("/enquiries", json={**BODY, "phone": "12345", "packageSlug": None})
    assert res.status_code == 400
    err = res.json()["error"]
    assert err["code"] == "validation"
    assert set(err["fieldErrors"]) == {"phone", "packageSlug"}
    assert err["fieldErrors"]["phone"] == "Enter a 10-digit Indian mobile number"
    assert await count(db) == 0


@pytest.mark.db
async def test_unknown_or_draft_package_is_a_field_error(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    res = await db_client.post("/enquiries", json={**BODY, "packageSlug": "atlantis"})
    assert res.status_code == 400
    assert res.json()["error"]["fieldErrors"] == {"packageSlug": "That trip is no longer available"}


@pytest.mark.db
async def test_honeypot_returns_success_without_saving(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    res = await db_client.post("/enquiries", json={**BODY, "website": "http://spam.example"})
    assert res.status_code == 201
    assert re.fullmatch(r"TS-[A-Z2-9]{6}", res.json()["ref"])
    assert await count(db) == 0


@pytest.mark.db
async def test_duplicate_within_a_minute_returns_the_same_ref(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    first = await db_client.post("/enquiries", json=BODY)
    second = await db_client.post(
        "/enquiries", json={**BODY, "message": "resent", "phone": "9845022110"}
    )
    assert first.status_code == second.status_code == 201
    assert first.json()["ref"] == second.json()["ref"]
    assert await count(db) == 1
    # A different package (or none) is a different enquiry.
    third = await db_client.post("/enquiries", json={**BODY, "packageSlug": "goa-quiet-escape"})
    assert third.status_code == 201 and third.json()["ref"] != first.json()["ref"]
    assert await count(db) == 2


@pytest.mark.db
async def test_web_proxy_ip_is_trusted_only_with_the_shared_secret(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    db_app.state.settings = make_settings(revalidate_secret="s3cret")
    limiter = CountingLimiter(limit=5)
    db_app.state.rate_limiter = limiter
    base = {"X-Forwarded-For": "76.76.21.21"}  # what Vercel stamps on the web -> api hop
    await db_client.post("/enquiries", json=BODY, headers={**base, "X-Client-Ip": "1.1.1.1"})
    await db_client.post(
        "/enquiries",
        json={**BODY, "phone": "9000000009"},
        headers={**base, "X-Client-Ip": "2.2.2.2", "X-Internal-Secret": "wrong"},
    )
    await db_client.post(
        "/enquiries",
        json={**BODY, "phone": "9000000008"},
        headers={**base, "X-Client-Ip": "3.3.3.3", "X-Internal-Secret": "s3cret"},
    )
    assert limiter.hits == ["enquiry:76.76.21.21", "enquiry:76.76.21.21", "enquiry:3.3.3.3"]
    rows = (await db.execute(select(Enquiry.ip_hash).order_by(Enquiry.created_at))).scalars().all()
    assert rows[0] == rows[1] != rows[2]


@pytest.mark.db
async def test_rate_limit_is_per_ip_and_returns_429(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    limiter = CountingLimiter(limit=2)
    db_app.state.rate_limiter = limiter
    h = {"X-Forwarded-For": "9.9.9.9"}
    assert (await db_client.post("/enquiries", json=BODY, headers=h)).status_code == 201
    assert (
        await db_client.post("/enquiries", json={**BODY, "phone": "9000000001"}, headers=h)
    ).status_code == 201
    res = await db_client.post("/enquiries", json={**BODY, "phone": "9000000002"}, headers=h)
    assert res.status_code == 429
    assert res.headers["retry-after"] == "600"
    assert res.json()["error"]["code"] == "rate_limited"
    assert limiter.hits == ["enquiry:9.9.9.9"] * 3
    # The limiter is consulted before validation, so junk cannot be used to probe rules for free.
    other = await db_client.post("/enquiries", json=BODY, headers={"X-Forwarded-For": "8.8.8.8"})
    assert other.status_code == 201


def mailing(db_app: FastAPI, sender: FakeSender, **settings_over: object) -> FakeSender:
    """Point the app at a fake sender and live-mode email settings."""
    db_app.state.email_sender = sender
    db_app.state.settings = make_settings(
        **{
            "email_from": "Tripsmith <hello@tripsmith.in>",
            "owner_notify_email": "owner@example.com",
            "site_url": "https://tripsmith.vercel.app",
            **settings_over,
        }
    )
    return sender


@pytest.mark.db
async def test_submit_sends_both_emails_and_marks_sent(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    assert res.json()["emailed"] is True
    assert sorted(m.to for m in sender.sent) == ["owner@example.com", "priya@example.com"]
    owner = next(m for m in sender.sent if m.to == "owner@example.com")
    assert res.json()["ref"] in owner.subject and "North Goa Beaches" in owner.subject
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.email_status == EmailStatus.SENT
    assert f"/admin/enquiries/{row.id}" in owner.html


@pytest.mark.db
async def test_mail_failure_keeps_the_201_and_marks_failed(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    mailing(db_app, FakeSender(fail_for=frozenset({"priya@example.com"})))
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    assert res.json()["emailed"] is False
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.email_status == EmailStatus.FAILED


@pytest.mark.db
async def test_test_mode_redirects_and_does_not_claim_emailed(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender(), email_from="Tripsmith <onboarding@resend.dev>")
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201 and res.json()["emailed"] is False
    assert [m.to for m in sender.sent] == ["owner@example.com", "owner@example.com"]
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.email_status == EmailStatus.SENT


@pytest.mark.db
async def test_honeypot_and_dedupe_send_nothing(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    bot = await db_client.post("/enquiries", json={**BODY, "website": "http://spam"})
    assert bot.status_code == 201 and bot.json()["emailed"] is False
    assert sender.sent == []
    first = await db_client.post("/enquiries", json=BODY)
    assert first.json()["emailed"] is True
    again = await db_client.post("/enquiries", json=BODY)
    assert first.json()["ref"] == again.json()["ref"]
    assert again.json()["emailed"] is False
    assert len(sender.sent) == 2  # only the first submit mailed


@pytest.mark.db
async def test_status_write_failure_keeps_the_201(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A DB error while recording email_status must not cost the already-sent, already-saved
    lead its 201 — the row simply keeps `skipped` from the first commit."""
    await seeded(db)
    mailing(db_app, FakeSender())

    def boom(*args: object, **kwargs: object) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr("app.services.enquiries.update", boom)
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    assert res.json()["emailed"] is True
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.email_status == EmailStatus.SKIPPED


@pytest.mark.db
async def test_ref_collision_retries_with_a_fresh_ref(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    db.add(
        Enquiry(
            ref="TS-AAAAAA",
            type=EnquiryType.CONTACT,
            name="Existing Person",
            phone="9999999999",
            email="existing@example.com",
            adults=1,
            children=0,
            status=EnquiryStatus.NEW,
            email_status=EmailStatus.SKIPPED,
        )
    )
    await db.commit()

    refs = iter(["TS-AAAAAA", "TS-BBBBBB"])
    monkeypatch.setattr("app.services.enquiries.make_ref", lambda: next(refs))

    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    assert res.json()["ref"] == "TS-BBBBBB"
    assert res.json()["emailed"] is True

    row = (await db.execute(select(Enquiry).where(Enquiry.ref == "TS-BBBBBB"))).scalar_one()
    assert row.email_status == EmailStatus.SENT
    assert len(sender.sent) == 2


def with_pdf(db_app: FastAPI, store: FakeBlobStore | None) -> FakeBlobStore | None:
    db_app.state.pdf = PdfService(store, db_app.state.settings, transport=cover_transport())  # type: ignore[arg-type]
    return store


@pytest.mark.db
async def test_submit_attaches_the_itinerary_pdf_to_the_visitor_email(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    store = with_pdf(db_app, FakeBlobStore())
    assert store is not None
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    visitor = next(m for m in sender.sent if m.to == "priya@example.com")
    owner = next(m for m in sender.sent if m.to == "owner@example.com")
    assert len(visitor.attachments) == 1
    assert visitor.attachments[0].filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert visitor.attachments[0].content.startswith(b"%PDF-")
    assert owner.attachments == ()
    assert "/api/packages/north-goa-beaches/itinerary.pdf" in visitor.html
    assert len(store.objects) == 1  # the cache is warm for the emailed link


@pytest.mark.db
async def test_contact_enquiry_sends_no_attachment(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    store = with_pdf(db_app, FakeBlobStore())
    assert store is not None
    res = await db_client.post(
        "/enquiries", json={**BODY, "type": "contact", "packageSlug": None, "travelMonth": None}
    )
    assert res.status_code == 201
    assert all(m.attachments == () for m in sender.sent)
    assert store.objects == {}


@pytest.mark.db
async def test_slow_pdf_is_dropped_and_the_enquiry_still_mails(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    with_pdf(db_app, FakeBlobStore())
    monkeypatch.setattr("app.services.enquiries.PDF_ATTACHMENT_TIMEOUT", 0.05)

    async def slow(*a: object, **k: object) -> None:
        await asyncio.sleep(1)

    monkeypatch.setattr(PdfService, "attachment_for", slow)

    res = await db_client.post("/enquiries", json=BODY)

    assert res.status_code == 201, res.text
    assert res.json()["emailed"] is True
    assert len(sender.sent) == 2
    assert all(m.attachments == () for m in sender.sent)


@pytest.mark.db
async def test_pdf_failure_keeps_the_201_and_the_emails(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await seeded(db)
    sender = mailing(db_app, FakeSender())
    with_pdf(db_app, FakeBlobStore())

    def boom(*a: object, **k: object) -> bytes:
        raise RuntimeError("fpdf exploded")

    monkeypatch.setattr("app.services.pdf.service.render_itinerary", boom)
    res = await db_client.post("/enquiries", json=BODY)
    assert res.status_code == 201 and res.json()["emailed"] is True
    assert len(sender.sent) == 2 and all(m.attachments == () for m in sender.sent)
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.email_status == EmailStatus.SENT


def test_ip_hash_is_keyed_so_it_cannot_be_reversed_by_enumeration() -> None:
    """H4: an unsalted digest of an IPv4 address is not an anonymisation.

    There are only ~4.3 billion of them, so a plain sha256 column can be reversed with a table
    anyone can build in minutes. `SESSION_SECRET` — already provisioned and otherwise unused —
    keys the digest, so the stored value is only reversible to someone who holds the secret.
    """
    keyed = hash_ip("49.207.1.1", secret="the-deployment-secret")
    assert keyed != hashlib.sha256(b"49.207.1.1").hexdigest()[:32]  # the obvious table
    assert keyed != hash_ip("49.207.1.1", secret=None)  # and the unkeyed digest of the same input
    assert keyed == hash_ip("49.207.1.1", secret="the-deployment-secret")  # stable
    assert keyed != hash_ip("49.207.1.2", secret="the-deployment-secret")
    assert len(keyed) == 32


@pytest.mark.db
async def test_stored_ip_hash_uses_the_configured_secret(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    db_app.state.settings = make_settings(session_secret="pepper")
    res = await db_client.post("/enquiries", json=BODY, headers={"X-Forwarded-For": "49.207.1.1"})
    assert res.status_code == 201
    stored = (await db.execute(select(Enquiry.ip_hash))).scalar_one()
    assert stored == hash_ip("49.207.1.1", secret="pepper")
