"""F21 enquiries inbox: schemas, service and `/admin/enquiries*` routes (06 §A4, §C-REST)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Destination, Enquiry, EnquiryNote, Package
from app.models.enums import EnquiryStatus, EnquiryType, PackageStatus
from app.schemas.admin_enquiries import (
    PAGE_SIZE,
    EnquiryFilters,
    EnquiryNoteInput,
    EnquiryStatusInput,
)
from app.services import admin_enquiries as svc
from app.services.email.render import IST
from tests.test_auth import OWNER_EMAIL, OWNER_PASSWORD, seeded_with_owner, with_cookie

# --- filters --------------------------------------------------------------------------------------


def test_filters_default_to_the_unfiltered_first_page() -> None:
    f = EnquiryFilters()
    assert f.page == 1
    assert (f.status, f.type, f.package_id, f.from_, f.to, f.q) == (None,) * 6


def test_filters_read_the_wire_names() -> None:
    f = EnquiryFilters.model_validate(
        {
            "status": "new",
            "type": "custom",
            "packageId": "pkg_1",
            "from": "2026-09-01",
            "to": "2026-09-30",
            "q": "Priya",
            "page": "3",
        }
    )
    assert f.status == EnquiryStatus.NEW
    assert f.package_id == "pkg_1"
    assert f.from_ == dt.date(2026, 9, 1) and f.to == dt.date(2026, 9, 30)
    assert f.page == 3


def test_filters_reject_a_backwards_date_range_under_the_to_field() -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryFilters.model_validate({"from": "2026-09-30", "to": "2026-09-01"})
    assert exc.value.errors()[0]["loc"] == ("to",)


def test_filters_reject_nonsense_values() -> None:
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"status": "archived"})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"page": 0})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"q": "x" * 81})


# --- writes ---------------------------------------------------------------------------------------


def test_status_input_takes_the_four_v1_statuses() -> None:
    assert EnquiryStatusInput.model_validate({"status": "converted"}).status == (
        EnquiryStatus.CONVERTED
    )


def test_note_input_strips_and_refuses_an_empty_body() -> None:
    assert EnquiryNoteInput.model_validate({"body": "  Called back  "}).body == "Called back"
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "   "})
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "x" * 2001})


# --- service: list --------------------------------------------------------------------------------


async def make_package(
    db: AsyncSession, *, slug: str = "test-goa-beaches", dest_slug: str = "test-goa"
) -> Package:
    """Slugs are prefixed `test-`: the route tests seed `tests/fixture_content/`, which already
    owns `goa` and `north-goa-beaches`, and both columns are unique."""
    dest = Destination(
        slug=dest_slug,
        name="Goa",
        tagline="Sun and sand",
        intro="A long enough intro paragraph for the destination record used by these tests.",
        cover_url="http://localhost:8000/seed-photos/goa.jpg",
        region="West India",
        best_months=[11, 12, 1],
        position=1,
    )
    db.add(dest)
    await db.flush()
    pkg = Package(
        slug=slug,
        name="North Goa Beaches",
        destination_id=dest.id,
        nights=3,
        days=4,
        summary="Three slow nights on the Konkan coast with one free beach day.",
        themes=[],
        starting_price_paise=1_499_900,
        status=PackageStatus.LIVE,
        featured=False,
    )
    db.add(pkg)
    await db.flush()
    return pkg


async def make_enquiry(db: AsyncSession, *, ref: str, **overrides: object) -> Enquiry:
    fields: dict[str, object] = {
        "ref": ref,
        "type": EnquiryType.STANDARD,
        "name": "Priya Sharma",
        "phone": "9845022110",
        "email": "priya.s@gmail.com",
        "adults": 2,
        "children": 0,
        "status": EnquiryStatus.NEW,
    }
    fields.update(overrides)
    row = Enquiry(**fields)
    db.add(row)
    await db.flush()
    return row


def at_ist(row: Enquiry, when: dt.datetime) -> None:
    """`created_at` has a server default, so a test that cares about the day sets it explicitly."""
    row.created_at = when


def test_ist_day_start_is_midnight_in_india_expressed_in_utc() -> None:
    start = svc.ist_day_start(dt.date(2026, 9, 22))
    assert start == dt.datetime(2026, 9, 21, 18, 30, tzinfo=dt.UTC)
    assert start.astimezone(IST).hour == 0


def test_like_escape_stops_a_wildcard_in_the_search_box() -> None:
    assert svc.like_escape("100%") == r"100\%"
    assert svc.like_escape("a_b") == r"a\_b"
    assert svc.like_escape(r"back\slash") == "back\\\\slash"


@pytest.mark.db
async def test_list_returns_newest_first_with_the_package_joined(db: AsyncSession) -> None:
    pkg = await make_package(db)
    older = await make_enquiry(db, ref="TS-OLD111", package_id=pkg.id)
    newer = await make_enquiry(db, ref="TS-NEW111", package_id=pkg.id, name="Anirudh S")
    at_ist(older, dt.datetime.now(dt.UTC) - dt.timedelta(days=2))
    await db.commit()

    out = await svc.list_enquiries(db, EnquiryFilters())

    assert [r.ref for r in out.items] == [newer.ref, older.ref]
    assert out.items[0].package is not None
    assert out.items[0].package.name == "North Goa Beaches"
    assert (out.total, out.page, out.page_size, out.total_pages) == (2, 1, PAGE_SIZE, 1)


@pytest.mark.db
async def test_a_contact_enquiry_has_no_package(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-CONT11", type=EnquiryType.CONTACT, package_id=None)
    await db.commit()
    out = await svc.list_enquiries(db, EnquiryFilters())
    assert out.items[0].package is None


@pytest.mark.db
async def test_the_type_filter_selects_only_that_enquiry_type(db: AsyncSession) -> None:
    pkg = await make_package(db)
    await make_enquiry(db, ref="TS-STD111", type=EnquiryType.STANDARD, package_id=pkg.id)
    await make_enquiry(db, ref="TS-CONT22", type=EnquiryType.CONTACT, package_id=None)
    await db.commit()

    out = await svc.list_enquiries(db, EnquiryFilters.model_validate({"type": "contact"}))

    assert [r.ref for r in out.items] == ["TS-CONT22"]


@pytest.mark.db
async def test_counts_ignore_the_status_filter_but_honour_the_others(db: AsyncSession) -> None:
    pkg = await make_package(db)
    other = await make_package(db, slug="test-leh", dest_slug="test-ladakh")
    await make_enquiry(db, ref="TS-AAA111", package_id=pkg.id, status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-BBB111", package_id=pkg.id, status=EnquiryStatus.CONTACTED)
    await make_enquiry(db, ref="TS-CCC111", package_id=other.id, status=EnquiryStatus.NEW)
    await db.commit()

    out = await svc.list_enquiries(
        db, EnquiryFilters.model_validate({"status": "new", "packageId": pkg.id})
    )

    assert [r.ref for r in out.items] == ["TS-AAA111"]
    assert out.total == 1
    # Counts: this package only (the packageId filter applies), all four statuses (it does not).
    assert (out.counts.new, out.counts.contacted, out.counts.all) == (1, 1, 2)


@pytest.mark.db
async def test_date_filter_is_an_inclusive_ist_business_day_range(db: AsyncSession) -> None:
    late = await make_enquiry(db, ref="TS-LATE11")
    early = await make_enquiry(db, ref="TS-EARL11")
    # 23:30 IST on the 22nd is still the 22nd for the owner, though it is 18:00 UTC.
    at_ist(late, dt.datetime(2026, 9, 22, 18, 0, tzinfo=dt.UTC))
    at_ist(early, dt.datetime(2026, 9, 23, 3, 0, tzinfo=dt.UTC))  # 08:30 IST on the 23rd
    await db.commit()

    one_day = EnquiryFilters.model_validate({"from": "2026-09-22", "to": "2026-09-22"})
    assert [r.ref for r in (await svc.list_enquiries(db, one_day)).items] == ["TS-LATE11"]

    both = EnquiryFilters.model_validate({"from": "2026-09-22", "to": "2026-09-23"})
    assert {r.ref for r in (await svc.list_enquiries(db, both)).items} == {"TS-LATE11", "TS-EARL11"}


@pytest.mark.db
async def test_search_matches_a_name_or_a_phone_however_it_is_typed(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-PRIYA1", name="Priya Sharma", phone="9845022110")
    await make_enquiry(db, ref="TS-ANIR11", name="Anirudh S", phone="9980041234")
    await db.commit()

    async def refs(q: str) -> list[str]:
        out = await svc.list_enquiries(db, EnquiryFilters.model_validate({"q": q}))
        return [r.ref for r in out.items]

    assert await refs("priya") == ["TS-PRIYA1"]
    assert await refs("+91 98450-22110") == ["TS-PRIYA1"]
    assert await refs("9980") == ["TS-ANIR11"]
    assert await refs("%") == []  # a wildcard is matched literally, not as "everything"


@pytest.mark.db
async def test_paging_is_fifty_to_a_page(db: AsyncSession) -> None:
    for i in range(PAGE_SIZE + 3):
        await make_enquiry(db, ref=f"TS-P{i:05d}")
    await db.commit()

    first = await svc.list_enquiries(db, EnquiryFilters())
    second = await svc.list_enquiries(db, EnquiryFilters(page=2))

    assert len(first.items) == PAGE_SIZE and len(second.items) == 3
    assert first.total == PAGE_SIZE + 3 and first.total_pages == 2
    assert not {r.id for r in first.items} & {r.id for r in second.items}


@pytest.mark.db
async def test_an_empty_inbox_still_reports_one_page(db: AsyncSession) -> None:
    out = await svc.list_enquiries(db, EnquiryFilters())
    assert (out.items, out.total, out.total_pages, out.counts.all) == ([], 0, 1, 0)


# --- service: detail ------------------------------------------------------------------------------


def test_device_is_derived_from_the_user_agent_and_never_invented() -> None:
    iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"
    mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140"
    assert svc.device_from(iphone) == "Mobile"
    assert svc.device_from("Mozilla/5.0 (Linux; Android 14; Pixel 8)") == "Mobile"
    assert svc.device_from(mac) == "Desktop"
    assert svc.device_from(None) == "Unknown"
    assert svc.device_from("") == "Unknown"


@pytest.mark.db
async def test_detail_carries_every_submitted_field_and_the_package_card(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    row = await make_enquiry(
        db,
        ref="TS-DET111",
        package_id=pkg.id,
        type=EnquiryType.CUSTOM,
        travel_month=dt.date(2026, 11, 1),
        message="Are early check-ins possible?",
        preferred_dates="Second week of November",
        budget_paise=2_500_000,
        changes="Skip Kufri, add a day in Manali",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    )
    await db.commit()

    out = await svc.get_enquiry(db, row.id)

    assert out.ref == "TS-DET111" and out.type == EnquiryType.CUSTOM
    assert out.message == "Are early check-ins possible?"
    assert out.budget_paise == 2_500_000 and out.changes
    assert out.package is not None and out.package.slug == "test-goa-beaches"
    assert out.package.nights == 3 and out.package.starting_price_paise == 1_499_900
    assert out.device == "Mobile"
    assert out.notes == [] and out.related == []


@pytest.mark.db
async def test_detail_never_exposes_the_ip_hash(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-PRIV11", ip_hash="deadbeef" * 4)
    await db.commit()
    payload = (await svc.get_enquiry(db, row.id)).model_dump(by_alias=True)
    assert "ipHash" not in payload and "ip_hash" not in payload
    assert "deadbeef" not in str(payload)


@pytest.mark.db
async def test_notes_come_back_oldest_first(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-NOTE11")
    first = EnquiryNote(enquiry_id=row.id, body="Called at 11:40 — no answer.")
    second = EnquiryNote(enquiry_id=row.id, body="WhatsApp sent with check-in info.")
    db.add_all([first, second])
    await db.flush()
    first.created_at = dt.datetime.now(dt.UTC) - dt.timedelta(hours=1)
    await db.commit()

    out = await svc.get_enquiry(db, row.id)
    assert [n.body for n in out.notes] == [
        "Called at 11:40 — no answer.",
        "WhatsApp sent with check-in info.",
    ]


@pytest.mark.db
async def test_related_lists_other_enquiries_from_the_same_phone_newest_first(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    current = await make_enquiry(db, ref="TS-CUR111", phone="9845022110")
    older = await make_enquiry(db, ref="TS-OTH111", phone="9845022110", package_id=pkg.id)
    await make_enquiry(db, ref="TS-ELSE11", phone="9980041234")
    at_ist(older, dt.datetime.now(dt.UTC) - dt.timedelta(days=30))
    await db.commit()

    out = await svc.get_enquiry(db, current.id)

    assert [r.ref for r in out.related] == ["TS-OTH111"]
    assert out.related[0].package_name == "North Goa Beaches"


@pytest.mark.db
async def test_detail_404s_for_an_unknown_id(db: AsyncSession) -> None:
    with pytest.raises(ApiError) as exc:
        await svc.get_enquiry(db, "enq_does_not_exist")
    assert exc.value.code == "not_found"


# --- service: writes ------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_status_change_appends_a_note_in_the_same_timeline(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-STAT11", status=EnquiryStatus.NEW)
    await db.commit()

    out = await svc.set_status(db, row.id, EnquiryStatus.CONTACTED)

    assert out.status == EnquiryStatus.CONTACTED
    assert [n.body for n in out.notes] == ["Status changed from New to Contacted"]


@pytest.mark.db
async def test_setting_the_same_status_twice_does_not_spam_the_timeline(
    db: AsyncSession,
) -> None:
    row = await make_enquiry(db, ref="TS-SAME11", status=EnquiryStatus.CONTACTED)
    await db.commit()

    out = await svc.set_status(db, row.id, EnquiryStatus.CONTACTED)

    assert out.status == EnquiryStatus.CONTACTED
    assert out.notes == []


@pytest.mark.db
async def test_status_changes_and_owner_notes_interleave_in_one_timeline(
    db: AsyncSession,
) -> None:
    row = await make_enquiry(db, ref="TS-MIX111")
    await db.commit()

    await svc.set_status(db, row.id, EnquiryStatus.CONTACTED)
    await svc.add_note(db, row.id, "Called at 11:40 — no answer, WhatsApp sent.")
    out = await svc.set_status(db, row.id, EnquiryStatus.CONVERTED)

    assert [n.body for n in out.notes] == [
        "Status changed from New to Contacted",
        "Called at 11:40 — no answer, WhatsApp sent.",
        "Status changed from Contacted to Converted",
    ]


@pytest.mark.db
async def test_writes_404_for_an_unknown_id(db: AsyncSession) -> None:
    with pytest.raises(ApiError) as exc:
        await svc.set_status(db, "enq_nope", EnquiryStatus.CLOSED)
    assert exc.value.code == "not_found"
    with pytest.raises(ApiError):
        await svc.add_note(db, "enq_nope", "hello")


@pytest.mark.db
async def test_a_status_change_is_persisted_not_just_returned(db: AsyncSession) -> None:
    row = await make_enquiry(db, ref="TS-PERS11")
    await db.commit()
    await svc.set_status(db, row.id, EnquiryStatus.CLOSED)

    stored = await svc.get_enquiry(db, row.id)
    assert stored.status == EnquiryStatus.CLOSED
    assert len(stored.notes) == 1


# --- routes ---------------------------------------------------------------------------------------


async def owner_headers(db: AsyncSession, client: AsyncClient) -> dict[str, str]:
    await seeded_with_owner(db)
    res = await client.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert res.status_code == 200
    return with_cookie(res.cookies["ts_session"])


@pytest.mark.db
async def test_every_enquiry_route_is_owner_only(db_client: AsyncClient) -> None:
    for method, path in [
        ("GET", "/admin/enquiries"),
        ("GET", "/admin/enquiries.csv"),
        ("GET", "/admin/enquiries/enq_1"),
        ("PATCH", "/admin/enquiries/enq_1/status"),
        ("POST", "/admin/enquiries/enq_1/notes"),
    ]:
        res = await db_client.request(method, path, json={})
        assert res.status_code == 401, path
        assert res.json()["error"]["code"] == "unauthorized"


@pytest.mark.db
async def test_list_route_answers_with_no_store_and_the_camelcase_contract(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    pkg = await make_package(db)
    await make_enquiry(db, ref="TS-ROUT11", package_id=pkg.id)
    await db.commit()

    res = await db_client.get("/admin/enquiries", headers=headers)

    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["items"][0]["ref"] == "TS-ROUT11"
    assert body["items"][0]["package"]["slug"] == "test-goa-beaches"
    assert body["pageSize"] == 50 and body["totalPages"] == 1
    assert body["counts"]["new"] == 1


@pytest.mark.db
async def test_list_route_passes_the_query_through(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    await make_enquiry(db, ref="TS-QRY111", name="Priya Sharma")
    await make_enquiry(db, ref="TS-QRY222", name="Anirudh S")
    await db.commit()

    res = await db_client.get("/admin/enquiries?q=priya&status=new&page=1", headers=headers)

    assert [r["ref"] for r in res.json()["items"]] == ["TS-QRY111"]


@pytest.mark.db
async def test_a_blank_filter_is_treated_as_absent(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    """The no-JS GET form submits every control, so `?status=&q=` must not 400."""
    headers = await owner_headers(db, db_client)
    await make_enquiry(db, ref="TS-BLNK11")
    await db.commit()

    res = await db_client.get("/admin/enquiries?status=&type=&q=&from=&to=", headers=headers)

    assert res.status_code == 200 and res.json()["total"] == 1


@pytest.mark.db
async def test_a_backwards_date_range_is_a_field_error(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    res = await db_client.get("/admin/enquiries?from=2026-09-30&to=2026-09-01", headers=headers)
    assert res.status_code == 400
    assert res.json()["error"]["fieldErrors"] == {"to": "must not be before `from`"}


@pytest.mark.db
async def test_detail_status_and_notes_round_trip(db: AsyncSession, db_client: AsyncClient) -> None:
    headers = await owner_headers(db, db_client)
    row = await make_enquiry(db, ref="TS-RND111")
    await db.commit()

    detail = await db_client.get(f"/admin/enquiries/{row.id}", headers=headers)
    assert detail.status_code == 200 and detail.json()["status"] == "new"

    moved = await db_client.patch(
        f"/admin/enquiries/{row.id}/status", json={"status": "contacted"}, headers=headers
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "contacted"
    assert moved.headers["cache-control"] == "no-store"

    noted = await db_client.post(
        f"/admin/enquiries/{row.id}/notes", json={"body": "Called back"}, headers=headers
    )
    assert noted.status_code == 201
    assert [n["body"] for n in noted.json()["notes"]] == [
        "Status changed from New to Contacted",
        "Called back",
    ]


@pytest.mark.db
async def test_an_empty_note_is_rejected_under_its_field(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    row = await make_enquiry(db, ref="TS-EMPT11")
    await db.commit()

    res = await db_client.post(
        f"/admin/enquiries/{row.id}/notes", json={"body": "   "}, headers=headers
    )

    assert res.status_code == 400
    assert "body" in res.json()["error"]["fieldErrors"]


@pytest.mark.db
async def test_csv_route_is_an_attachment_with_the_right_headers(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    headers = await owner_headers(db, db_client)
    await make_enquiry(db, ref="TS-DWN111", name="Priya Sharma")
    await db.commit()

    res = await db_client.get("/admin/enquiries.csv", headers=headers)

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.headers["cache-control"] == "no-store"
    assert 'attachment; filename="tripsmith-enquiries-' in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM on the wire
    assert "TS-DWN111" in res.text
