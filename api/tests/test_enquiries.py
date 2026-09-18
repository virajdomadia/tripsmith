"""POST /enquiries (06 C2): saves with status=new, dedupes 60 s, honeypot, rate limit, envelope."""

import datetime as dt
import re

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.ratelimit import RateLimitResult
from app.models import Enquiry
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.services.enquiries import make_ref
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

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
    assert err["fieldErrors"]["phone"].endswith("Enter a 10-digit Indian mobile number")
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
