"""P1 — saved trips, the ♡ (R39): save and unsave, the cap, the guest merge on sign-in, the
Saved tab's cards, and the dashboard's "Most saved". The db tests need TEST_DATABASE_URL."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package, SavedPackage, User
from app.models.enums import PackageStatus
from app.services import saved as svc
from app.services.analytics import ist_today
from tests.test_auth import with_cookie
from tests.test_booking_orders import SOON, dep
from tests.test_customer_accounts import EMAIL, signed_in
from tests.test_db import goa, package

NOW = dt.datetime(2026, 10, 10, 12, tzinfo=dt.UTC)


def test_a_browser_save_time_is_trusted_only_inside_the_last_year() -> None:
    week_ago = NOW - dt.timedelta(days=7)
    assert svc.save_time(week_ago, NOW) == week_ago
    assert svc.save_time(None, NOW) == NOW
    assert svc.save_time(NOW + dt.timedelta(minutes=5), NOW) == NOW  # a fast clock
    assert svc.save_time(NOW - dt.timedelta(days=400), NOW) == NOW  # too old to believe
    naive = week_ago.replace(tzinfo=None)
    assert svc.save_time(naive, NOW) == week_ago  # read as UTC


async def catalog(db: AsyncSession) -> dict[str, Package]:
    """Three live packages (Calangute's first date is sold out) and a draft."""
    where = goa()
    rows = {
        "north-goa-beaches": package(where, status=PackageStatus.LIVE),
        "south-goa-slow": package(
            where, slug="south-goa-slow", name="South Goa Slow", status=PackageStatus.LIVE
        ),
        "calangute-weekend": package(
            where, slug="calangute-weekend", name="Calangute Weekend", status=PackageStatus.LIVE
        ),
        "draft-trip": package(where, slug="draft-trip", name="Draft Trip"),
    }
    rows["north-goa-beaches"].departures = [dep(SOON, 8, 20_000_00)]
    rows["calangute-weekend"].departures = [
        dep(SOON, 0, 18_000_00),
        dep(SOON + dt.timedelta(days=7), 6, 18_000_00),
    ]
    db.add_all(rows.values())
    await db.commit()
    return rows


def slugs_of(res) -> list[str]:  # noqa: ANN001
    assert res.status_code == 200, res.text
    return res.json()["slugs"]


@pytest.mark.db
async def test_saving_and_unsaving_a_trip(db: AsyncSession, db_client: AsyncClient) -> None:
    await catalog(db)
    assert (await db_client.put("/account/saved/south-goa-slow")).status_code == 401
    assert (await db_client.get("/account/saved/slugs")).status_code == 401
    me = with_cookie(await signed_in(db_client))

    res = await db_client.put("/account/saved/south-goa-slow", headers=me)
    assert res.headers["cache-control"].startswith("no-store")
    assert slugs_of(res) == ["south-goa-slow"]
    assert res.json()["max"] == 60
    # Idempotent: a second save changes nothing.
    assert slugs_of(await db_client.put("/account/saved/south-goa-slow", headers=me)) == [
        "south-goa-slow"
    ]
    assert slugs_of(await db_client.put("/account/saved/north-goa-beaches", headers=me)) == [
        "north-goa-beaches",
        "south-goa-slow",
    ]

    # Drafts and unknown trips cannot be saved; a malformed slug never reaches the db.
    for slug in ("draft-trip", "no-such-trip"):
        res = await db_client.put(f"/account/saved/{slug}", headers=me)
        assert res.status_code == 404, slug
    assert (await db_client.put("/account/saved/Bad_Slug", headers=me)).status_code in (400, 422)

    assert slugs_of(await db_client.delete("/account/saved/south-goa-slow", headers=me)) == [
        "north-goa-beaches"
    ]
    # Unsaving twice is fine too.
    assert slugs_of(await db_client.delete("/account/saved/south-goa-slow", headers=me)) == [
        "north-goa-beaches"
    ]
    assert slugs_of(await db_client.get("/account/saved/slugs", headers=me)) == [
        "north-goa-beaches"
    ]

    # Another account sees none of it.
    other = with_cookie(await signed_in(db_client, "ravi@example.test"))
    assert slugs_of(await db_client.get("/account/saved/slugs", headers=other)) == []


@pytest.mark.db
async def test_an_account_keeps_at_most_the_cap(
    db: AsyncSession, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "MAX_SAVED", 2)
    await catalog(db)
    me = with_cookie(await signed_in(db_client))
    for slug in ("south-goa-slow", "north-goa-beaches"):
        assert (await db_client.put(f"/account/saved/{slug}", headers=me)).status_code == 200
    res = await db_client.put("/account/saved/calangute-weekend", headers=me)
    assert res.status_code == 409, res.text
    assert res.json()["error"]["reason"] == "saved_full"
    # Saving one already saved is still fine at the cap.
    assert (await db_client.put("/account/saved/south-goa-slow", headers=me)).status_code == 200


@pytest.mark.db
async def test_a_guests_saves_join_the_account_on_sign_in(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    rows = await catalog(db)
    assert (await db_client.post("/account/saved/merge", json={"items": []})).status_code == 401
    me = with_cookie(await signed_in(db_client))

    # Already on the account: north (saved now).
    assert (await db_client.put("/account/saved/north-goa-beaches", headers=me)).status_code == 200
    long_ago = (dt.datetime.now(dt.UTC) - dt.timedelta(days=20)).isoformat()
    week_ago = (dt.datetime.now(dt.UTC) - dt.timedelta(days=7)).isoformat()
    yesterday = (dt.datetime.now(dt.UTC) - dt.timedelta(days=1)).isoformat()
    res = await db_client.post(
        "/account/saved/merge",
        json={
            "items": [
                {"slug": "calangute-weekend", "at": yesterday},
                {"slug": "north-goa-beaches", "at": long_ago},  # older than the account's
                {"slug": "south-goa-slow", "at": week_ago},
                {"slug": "south-goa-slow", "at": yesterday},  # a duplicate: the older wins
                {"slug": "draft-trip", "at": yesterday},  # skipped
                {"slug": "no-such-trip"},  # skipped
            ]
        },
        headers=me,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["added"] == 2 and body["leftOut"] == 0
    # Newest first: calangute (yesterday), south (a week ago), north (now 20 days ago).
    assert body["slugs"] == ["calangute-weekend", "south-goa-slow", "north-goa-beaches"]

    await db.rollback()
    north = await db.get(SavedPackage, (await user_id(db), rows["north-goa-beaches"].id))
    assert north is not None
    assert north.created_at < dt.datetime.now(dt.UTC) - dt.timedelta(days=19)

    # Merging the same list again adds nothing.
    again = await db_client.post(
        "/account/saved/merge", json={"items": [{"slug": "south-goa-slow"}]}, headers=me
    )
    assert again.json()["added"] == 0

    # More than a guest can hold is refused outright.
    many = {"items": [{"slug": f"trip-{i}"} for i in range(31)]}
    assert (await db_client.post("/account/saved/merge", json=many, headers=me)).status_code in (
        400,
        422,
    )


@pytest.mark.db
async def test_a_full_account_leaves_out_the_oldest_browser_saves(
    db: AsyncSession, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "MAX_SAVED", 2)
    await catalog(db)
    me = with_cookie(await signed_in(db_client))
    assert (await db_client.put("/account/saved/north-goa-beaches", headers=me)).status_code == 200
    now = dt.datetime.now(dt.UTC)
    res = await db_client.post(
        "/account/saved/merge",
        json={
            "items": [
                {"slug": "south-goa-slow", "at": (now - dt.timedelta(days=9)).isoformat()},
                {"slug": "calangute-weekend", "at": (now - dt.timedelta(days=1)).isoformat()},
            ]
        },
        headers=me,
    )
    body = res.json()
    assert body["added"] == 1 and body["leftOut"] == 1
    assert body["slugs"] == ["north-goa-beaches", "calangute-weekend"]


async def user_id(db: AsyncSession, email: str = EMAIL) -> str:
    return (await db.execute(select(User.id).where(User.email == email))).scalar_one()


@pytest.mark.db
async def test_the_saved_tab_lists_live_trips_with_the_next_open_date(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    rows = await catalog(db)
    assert (await db_client.get("/account/saved")).status_code == 401
    me = with_cookie(await signed_in(db_client))
    for slug in ("north-goa-beaches", "calangute-weekend", "south-goa-slow"):
        assert (await db_client.put(f"/account/saved/{slug}", headers=me)).status_code == 200

    # South Goa goes back to draft after it was saved: hidden, but its row stays.
    await db.execute(text("update packages set status = 'draft' where slug = 'south-goa-slow'"))
    await db.commit()

    res = await db_client.get("/account/saved", headers=me)
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"].startswith("no-store")
    items = res.json()["items"]
    assert [i["card"]["slug"] for i in items] == ["calangute-weekend", "north-goa-beaches"]
    calangute, north = items
    # Calangute's first date is sold out: the next OPEN date is a week later.
    assert calangute["nextDeparture"] == {
        "date": (SOON + dt.timedelta(days=7)).isoformat(),
        "seatsLeft": 6,
    }
    assert north["nextDeparture"] == {"date": SOON.isoformat(), "seatsLeft": 8}
    assert north["card"]["name"] == "North Goa Beaches" and north["savedAt"]
    assert slugs_of(await db_client.get("/account/saved/slugs", headers=me)) == [
        "calangute-weekend",
        "north-goa-beaches",
    ]
    await db.rollback()
    kept = (
        await db.execute(
            select(SavedPackage).where(SavedPackage.package_id == rows["south-goa-slow"].id)
        )
    ).scalar_one_or_none()
    assert kept is not None


@pytest.mark.db
async def test_most_saved_counts_the_last_thirty_days_with_the_all_time_total(
    db: AsyncSession,
) -> None:
    rows = await catalog(db)
    users = [User(name=f"U{i}", email=f"u{i}@example.test") for i in range(3)]
    db.add_all(users)
    await db.commit()
    today = ist_today()
    recent = dt.datetime.now(dt.UTC) - dt.timedelta(days=2)
    old = dt.datetime.now(dt.UTC) - dt.timedelta(days=90)
    north, south = rows["north-goa-beaches"].id, rows["south-goa-slow"].id
    db.add_all(
        [
            SavedPackage(user_id=users[0].id, package_id=north, created_at=recent),
            SavedPackage(user_id=users[1].id, package_id=north, created_at=old),
            SavedPackage(user_id=users[2].id, package_id=north, created_at=old),
            SavedPackage(user_id=users[0].id, package_id=south, created_at=recent),
            SavedPackage(user_id=users[1].id, package_id=south, created_at=recent),
        ]
    )
    await db.commit()

    top = await svc.top_saved(db, today - dt.timedelta(days=29))
    assert [(t.slug, t.count, t.all_time) for t in top] == [
        ("south-goa-slow", 2, 2),
        ("north-goa-beaches", 1, 3),
    ]
    assert await svc.top_saved(db, today + dt.timedelta(days=1)) == []
