"""P3a — trip leaders (R41): the owner's CRUD and switch, the package default and per-date
leader, the live read on the voucher, desk and manifest, and `seed.py --leaders`."""

import dataclasses
import datetime as dt
from collections.abc import Sequence

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Departure, Package, TripLeader
from app.schemas.catalog import PackageInput
from app.schemas.leaders import LeaderInput
from app.services.booking.voucher import load_booking_facts
from app.services.catalog import admin_leaders as svc
from app.services.catalog import admin_packages as packages
from app.services.pdf.voucher import render_voucher
from content._schema import LeaderContent, LeaderOverride
from scripts.seed import seed, seed_leaders
from tests.razorpay_fake import FakeRazorpay
from tests.settings import fixture_content, make_settings
from tests.test_admin_destinations import RecordingBlobStore, small_jpeg
from tests.test_admin_packages import as_payload
from tests.test_booking_orders import seeded
from tests.test_booking_payments import rzp
from tests.test_booking_voucher import pdf_text
from tests.test_booking_webhook import mailing
from tests.test_bookings_desk import hold, owner_cookie
from tests.test_catalog import RecordingStore

__all__ = ["rzp"]

BLOB = "https://89fzkazlv3xxpipg.public.blob.vercel-storage.com/leaders/uploads/t.jpg"
SUMMARY = "Three nights on the Vagator side, with the quiet north beaches and Chapora fort."
BIO = "Grew up in Leh and paces every group for the altitude, with a spare oxygen can."


def leader_input(**overrides: object) -> LeaderInput:
    fields: dict[str, object] = {
        "slug": "tenzin-norbu",
        "name": "Tenzin Norbu",
        "languages": ["English", "Hindi"],
        "yearsLeading": 11,
        "regions": ["Ladakh"],
        "bio": BIO,
        "funFact": "Names every peak from Pangong.",
        "phone": "+91 98450 12345",
    }
    fields.update(overrides)
    return LeaderInput.model_validate(fields)


async def form(db: AsyncSession, id: str, **overrides: object) -> PackageInput:
    """The package as the editor sends it back (the test package's summary is padded to the
    form's minimum)."""
    return await as_payload(db, id, summary=SUMMARY, **overrides)


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_leaders.revalidate", rec)
    monkeypatch.setattr("app.services.catalog.admin_packages.revalidate", rec)
    return rec


# --- schema --------------------------------------------------------------------------------------


def test_input_tidies_tags_and_checks_lengths() -> None:
    got = leader_input(languages=[" English ", "english", "", "Hindi"], regions=["Ladakh "])
    assert got.languages == ["English", "Hindi"] and got.regions == ["Ladakh"]
    assert leader_input(photoUrl="  ").photo_url is None
    assert leader_input(funFact="").fun_fact == ""
    for bad in (
        {"phone": "call me"},
        {"bio": "Too short"},
        {"bio": "x" * 301},
        {"funFact": "x" * 141},
        {"languages": []},
        {"regions": ["x" * 41]},
        {"slug": "Tenzin Norbu"},
        {"yearsLeading": 61},
        {"photoUrl": "https://evil.example/t.jpg"},
    ):
        with pytest.raises(ValidationError):
            leader_input(**bad)


# --- service: CRUD -------------------------------------------------------------------------------


@pytest.mark.db
async def test_create_list_update_and_a_duplicate_slug(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    made = await svc.create_leader(db, leader_input())
    assert made.active and made.deletable and (made.default_for, made.upcoming) == (0, 0)
    assert revalidated.calls[-1] == ["leaders", "leader:tenzin-norbu"]
    await svc.create_leader(db, leader_input(slug="arun-k", name="Arun K"))
    assert [r.slug for r in await svc.list_leaders(db)] == ["arun-k", "tenzin-norbu"]

    with pytest.raises(ApiError) as dup:
        await svc.create_leader(db, leader_input(name="Someone else"))
    assert dup.value.code == "conflict" and "slug" in (dup.value.field_errors or {})

    pkg, _ = await seeded(db, seats=4)
    pkg_slug = pkg.slug
    await db.execute(update(Package).where(Package.id == pkg.id).values(leader_id=made.id))
    await db.commit()
    renamed = await svc.update_leader(db, made.id, leader_input(slug="tenzin-n", photoUrl=BLOB))
    assert renamed.slug == "tenzin-n" and renamed.photo_url == BLOB
    assert revalidated.calls[-1] == [
        "leaders",
        "leader:tenzin-n",
        "leader:tenzin-norbu",
        f"package:{pkg_slug}",
    ]


# --- service: the package's default and a date's own leader --------------------------------------


async def two_leaders(db: AsyncSession) -> tuple[str, str]:
    a = await svc.create_leader(db, leader_input())
    b = await svc.create_leader(db, leader_input(slug="kavya-rawat", name="Kavya Rawat"))
    return a.id, b.id


@pytest.mark.db
async def test_the_editor_sets_a_default_and_a_dates_own_leader(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    a, b = await two_leaders(db)
    pkg, _ = await seeded(db, seats=4)
    pkg_id = pkg.id
    body = await form(db, pkg_id, leaderId=a)
    body.departures[1].leader_id = b  # the later date gets Kavya
    out = await packages.update_package(db, pkg_id, body)
    assert out.leader_id == a
    assert [d.leader_id for d in out.departures] == [None, b]
    assert {"leaders", "leader:tenzin-norbu", "leader:kavya-rawat"} <= set(revalidated.calls[-1])

    rows = {r.id: r for r in await svc.list_leaders(db)}
    assert (rows[a].default_for, rows[a].upcoming, rows[a].deletable) == (1, 1, False)
    assert (rows[b].default_for, rows[b].upcoming, rows[b].deletable) == (0, 1, False)

    # A form from before P3 (no leaderId anywhere) leaves both as saved.
    again = await packages.update_package(db, pkg_id, await form(db, pkg_id))
    assert again.leader_id == a and [d.leader_id for d in again.departures] == [None, b]

    # Clearing the date's own leader sends it back to the default.
    body = await form(db, pkg_id)
    body.departures[1].leader_id = None
    body.departures[1].model_fields_set.add("leader_id")
    cleared = await packages.update_package(db, pkg_id, body)
    assert [d.leader_id for d in cleared.departures] == [None, None]


@pytest.mark.db
async def test_picks_must_exist_and_be_switched_on(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    a, b = await two_leaders(db)
    pkg, _ = await seeded(db, seats=4)
    pkg_id = pkg.id
    with pytest.raises(ApiError) as unknown:
        await packages.update_package(db, pkg_id, await form(db, pkg_id, leaderId="nope"))
    assert unknown.value.field_errors == {"leaderId": svc.UNKNOWN_LEADER}

    await svc.set_active(db, b, False)
    body = await form(db, pkg_id)
    body.departures[0].leader_id = b
    with pytest.raises(ApiError) as off:
        await packages.update_package(db, pkg_id, body)
    assert off.value.field_errors == {"departures.0.leaderId": svc.INACTIVE_LEADER}

    # A row that already has a switched-off leader keeps them when the form sends them back.
    await svc.set_active(db, b, True)
    body = await form(db, pkg_id)
    body.departures[0].leader_id = b
    await packages.update_package(db, pkg_id, body)
    await db.execute(update(TripLeader).where(TripLeader.id == b).values(active=False))
    await db.commit()
    body = await form(db, pkg_id, leaderId=a)
    body.departures[0].leader_id = b
    kept = await packages.update_package(db, pkg_id, body)
    assert kept.leader_id == a and kept.departures[0].leader_id == b


@pytest.mark.db
async def test_switching_off_waits_until_nothing_upcoming_and_delete_until_never_used(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    a, b = await two_leaders(db)
    pkg, _ = await seeded(db, seats=4)
    pkg_id, pkg_name = pkg.id, pkg.name
    await packages.update_package(db, pkg_id, await form(db, pkg_id, leaderId=a))

    with pytest.raises(ApiError) as busy:
        await svc.set_active(db, a, False)
    assert busy.value.code == "conflict" and pkg_name in busy.value.message
    with pytest.raises(ApiError) as used:
        await svc.delete_leader(db, a)
    assert used.value.message == svc.ASSIGNED

    # Kavya takes the trip over; Tenzin led a date already gone, so is kept for that.
    past = Departure(
        package_id=pkg_id,
        date=dt.date.today() - dt.timedelta(days=40),
        seats_total=10,
        price_double_paise=20_000_00,
        price_triple_paise=18_000_00,
        price_child_paise=10_000_00,
        single_supplement_paise=9_000_00,
    )
    db.add(past)
    await db.commit()
    past_id = past.id
    moved = await packages.update_package(db, pkg_id, await form(db, pkg_id, leaderId=b))
    assert moved.leader_id == b
    pinned = {d.id: d.leader_id for d in moved.departures}
    assert pinned[past_id] == a  # the date already gone keeps who led it
    assert [v for k, v in pinned.items() if k != past_id] == [None, None]

    off = await svc.set_active(db, a, False)
    assert not off.active and not off.deletable and off.upcoming == 0
    with pytest.raises(ApiError):
        await svc.delete_leader(db, a)
    assert [r.slug for r in await svc.list_leaders(db)] == ["kavya-rawat", "tenzin-norbu"]

    spare = await svc.create_leader(db, leader_input(slug="spare", name="Spare Person"))
    await svc.delete_leader(db, spare.id)
    assert revalidated.calls[-1] == ["leaders", "leader:spare"]
    with pytest.raises(ApiError) as gone:
        await svc.get_leader(db, spare.id)
    assert gone.value.code == "not_found"


# --- the live read: voucher, desk, manifest ------------------------------------------------------


@pytest.mark.db
async def test_a_changed_departure_leader_reaches_the_next_voucher_and_the_desk(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    revalidated: RecordingRevalidate,
) -> None:
    owner = await owner_cookie(db)
    mailing(db_app)
    a, b = await two_leaders(db)
    pkg, departure = await seeded(db, seats=4)
    pkg_id, dep_id = pkg.id, departure.id
    order = await hold(db_client, dep_id, 2, 1)
    ref = str(order["bookingRef"])
    paid = await db_client.post(f"/admin/bookings/{ref}/mark-paid", json={}, headers=owner)
    assert paid.status_code == 200, paid.text

    facts = await load_booking_facts(db, ref)
    assert facts is not None and facts.leader is None  # no leader yet: no line
    _, text = pdf_text(render_voucher(facts, site_url="https://x.test", whatsapp_number="91"))
    assert "Trip leader" not in text

    await packages.update_package(db, pkg_id, await form(db, pkg_id, leaderId=a))
    facts = await load_booking_facts(db, ref)
    assert facts is not None and facts.leader is not None
    assert facts.leader.line == "Tenzin Norbu · English, Hindi"
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["leader"]["name"] == "Tenzin Norbu" and detail["leader"]["byDefault"] is True

    body = await form(db, pkg_id)
    body.departures[0].leader_id = b  # the booking's date switches to Kavya
    await packages.update_package(db, pkg_id, body)
    facts = await load_booking_facts(db, ref)
    assert facts is not None and facts.leader is not None and facts.leader.name == "Kavya Rawat"
    _, text = pdf_text(render_voucher(facts, site_url="https://x.test", whatsapp_number="91"))
    assert "Trip leader: Kavya Rawat · English, Hindi" in text

    manifest = (await db_client.get(f"/admin/departures/{dep_id}/manifest", headers=owner)).json()
    assert manifest["leader"] == {
        "id": b,
        "slug": "kavya-rawat",
        "name": "Kavya Rawat",
        "photoUrl": None,
        "active": True,
        "phone": "+91 98450 12345",
        "byDefault": False,
    }


# --- routes --------------------------------------------------------------------------------------


@pytest.mark.db
async def test_routes_need_the_owner_and_round_trip(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    for method, path in (
        ("GET", "/admin/leaders"),
        ("POST", "/admin/leaders"),
        ("POST", "/admin/leaders/photo"),
        ("GET", "/admin/leaders/x"),
        ("PUT", "/admin/leaders/x"),
        ("POST", "/admin/leaders/x/active"),
        ("DELETE", "/admin/leaders/x"),
    ):
        assert (await db_client.request(method, path)).status_code == 401, path

    owner = await owner_cookie(db)
    body = leader_input().model_dump(by_alias=True, mode="json")
    made = await db_client.post("/admin/leaders", json=body, headers=owner)
    assert made.status_code == 201, made.text
    leader_id = made.json()["id"]
    assert made.headers["cache-control"] == "no-store"

    listed = (await db_client.get("/admin/leaders", headers=owner)).json()["items"]
    assert [r["slug"] for r in listed] == ["tenzin-norbu"]
    put = await db_client.put(
        f"/admin/leaders/{leader_id}", json={**body, "name": "Tenzin N."}, headers=owner
    )
    assert put.status_code == 200 and put.json()["name"] == "Tenzin N."
    off = await db_client.post(
        f"/admin/leaders/{leader_id}/active", json={"active": False}, headers=owner
    )
    assert off.status_code == 200 and off.json()["active"] is False

    store = RecordingBlobStore()
    db_app.state.store = store
    up = await db_client.post(
        "/admin/leaders/photo",
        files={"file": ("me.jpeg", small_jpeg(), "image/jpeg")},
        headers=owner,
    )
    assert up.status_code == 201, up.text
    assert store.puts[0][0].startswith("leaders/uploads/")

    gone = await db_client.delete(f"/admin/leaders/{leader_id}", headers=owner)
    assert gone.status_code == 204
    assert (await db_client.get(f"/admin/leaders/{leader_id}", headers=owner)).status_code == 404


@pytest.mark.db
async def test_a_photo_from_another_store_is_refused(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    db_app.state.settings = make_settings(blob_read_write_token="vercel_blob_rw_ownstore_secret")
    owner = await owner_cookie(db)
    body = leader_input(photoUrl=BLOB).model_dump(by_alias=True, mode="json")
    res = await db_client.post("/admin/leaders", json=body, headers=owner)
    assert res.status_code == 400, res.text
    assert "photo" in res.json()["error"]["fieldErrors"]["photoUrl"]


# --- seed ----------------------------------------------------------------------------------------


def demo_content():  # noqa: ANN201 — the content dataclass
    content = fixture_content()
    leaders = [
        LeaderContent(
            slug="rohan-dsouza",
            name="Rohan D'Souza",
            languages=["English", "Konkani"],
            years_leading=6,
            regions=["Goa"],
            bio=BIO,
            fun_fact="Never lost at beach football.",
            packages=["goa-quiet-escape", "north-goa-beaches"],
        ),
        LeaderContent(
            slug="meera-nair",
            name="Meera Nair",
            languages=["English"],
            years_leading=9,
            regions=["Kerala"],
            bio=BIO,
            fun_fact="",
            packages=[],
            overrides=[LeaderOverride(package="north-goa-beaches", date=dt.date(2026, 12, 18))],
        ),
    ]
    return dataclasses.replace(content, leaders=leaders)


@pytest.mark.db
async def test_seed_leaders_fills_only_empty_picks_and_reruns_cleanly(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    first = await seed_leaders(db, demo_content())
    assert first.counts == {"leaders": 2, "leader_defaults": 2, "leader_dates": 1}
    rohan = (
        await db.execute(select(TripLeader).where(TripLeader.slug == "rohan-dsouza"))
    ).scalar_one()
    assert rohan.phone == "+91 98450 12345" and rohan.photo_url is None and rohan.active

    # The owner picks someone else for one package; a re-run keeps that pick.
    meera_id = (
        await db.execute(select(TripLeader.id).where(TripLeader.slug == "meera-nair"))
    ).scalar_one()
    await db.execute(
        update(Package).where(Package.slug == "goa-quiet-escape").values(leader_id=meera_id)
    )
    await db.commit()
    again = await seed_leaders(db, demo_content())
    assert again.counts == {"leaders": 2, "leader_defaults": 0, "leader_dates": 0}
    picks = dict((await db.execute(select(Package.slug, Package.leader_id))).tuples().all())
    assert picks == {"goa-quiet-escape": meera_id, "north-goa-beaches": rohan.id}
