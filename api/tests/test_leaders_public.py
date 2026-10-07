"""P3b — trip leaders on the public site (R41): the package's card and each date's avatar, the
`/leaders` routes, "Led by" on reviews — read live, switched-off leaders hidden, no phone."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package, Review, TripLeader
from app.services.catalog import reads
from app.services.pdf.itinerary import pdf_version
from tests.test_booking_orders import SOON, seeded
from tests.test_reviews import extra_review

pytestmark = pytest.mark.db

PHONE = "+91 98450 77777"


def leader(slug: str, name: str, **over: object) -> TripLeader:
    fields: dict[str, object] = {
        "slug": slug,
        "name": name,
        "languages": ["English", "Hindi"],
        "years_leading": 7,
        "regions": ["Himachal"],
        "bio": "Leads small groups up the valley with a flask of chai and a lot of patience.",
        "fun_fact": "Knows every dog in Tosh by name.",
        "phone": PHONE,
        "active": True,
    }
    fields.update(over)
    return TripLeader(**fields)


async def setup(db: AsyncSession) -> tuple[Package, list[str], TripLeader, TripLeader]:
    """A live package (Kavya by default) with two dates; the later one is Tenzin's own."""
    kavya, tenzin = leader("kavya-rawat", "Kavya Rawat"), leader("tenzin-norbu", "Tenzin Norbu")
    db.add_all([kavya, tenzin])
    await db.commit()
    pkg, _ = await seeded(db, seats=8)
    await db.execute(update(Package).where(Package.id == pkg.id).values(leader_id=kavya.id))
    later = sorted(pkg.departures, key=lambda d: d.date)[1]
    await db.execute(update(Departure).where(Departure.id == later.id).values(leader_id=tenzin.id))
    await db.commit()
    return pkg, [d.id for d in sorted(pkg.departures, key=lambda d: d.date)], kavya, tenzin


async def test_the_package_shows_its_leader_and_each_dates_own(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, _, _, tenzin = await setup(db)
    res = await db_client.get(f"/packages/{pkg.slug}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["leader"]["name"] == "Kavya Rawat" and body["leader"]["yearsLeading"] == 7
    assert [d["leader"]["slug"] for d in body["departures"]] == ["kavya-rawat", "tenzin-norbu"]
    assert PHONE not in res.text and "phone" not in res.text  # trip pack only (R48)

    month = SOON.strftime("%Y-%m")
    dates = (await db_client.get(f"/packages/{pkg.slug}/departures?month={month}")).json()
    assert dates["items"][0]["leader"]["name"] == "Kavya Rawat"

    # Switched off (as a past trip's leader would be): no card, no avatar — never a dead link.
    await db.execute(update(TripLeader).where(TripLeader.id == tenzin.id).values(active=False))
    await db.commit()
    body = (await db_client.get(f"/packages/{pkg.slug}?fresh=1")).json()
    assert [d["leader"] and d["leader"]["slug"] for d in body["departures"]] == [
        "kavya-rawat",
        None,
    ]


async def test_leaders_list_and_page_show_live_upcoming_trips_only(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, dep_ids, kavya, tenzin = await setup(db)
    db.add(leader("idle-person", "Idle Person"))
    db.add(leader("off-person", "Off Person", active=False))
    await db.commit()

    listed = (await db_client.get("/leaders")).json()["items"]
    assert [(r["slug"], r["upcoming"]) for r in listed] == [
        ("idle-person", 0),
        ("kavya-rawat", 1),
        ("tenzin-norbu", 1),
    ]
    page = await db_client.get("/leaders/tenzin-norbu")
    assert page.status_code == 200
    detail = page.json()
    assert [t["package"]["slug"] for t in detail["trips"]] == [pkg.slug]
    assert detail["trips"][0]["dates"] == [(SOON + dt.timedelta(days=7)).isoformat()]
    assert PHONE not in page.text
    assert (await db_client.get("/leaders/off-person")).status_code == 404
    assert (await db_client.get("/leaders/nobody")).status_code == 404

    # An unpublished package drops off the page.
    await db.execute(update(Package).where(Package.id == pkg.id).values(status="draft"))
    await db.commit()
    assert (await db_client.get("/leaders/tenzin-norbu?fresh=1")).json()["trips"] == []


async def test_reviews_say_who_led_the_date_travelled(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, dep_ids, kavya, tenzin = await setup(db)
    at = dt.datetime.now(dt.UTC)
    for n, dep in ((1, dep_ids[0]), (2, dep_ids[1])):
        r = await extra_review(db, pkg, dep, n, 5, at=at - dt.timedelta(minutes=n))
        await db.execute(
            update(Review).where(Review.id == r.id).values(approved=True, moderated_at=at)
        )
    await db.execute(update(Package).where(Package.id == pkg.id).values(rating_count=2))
    await db.commit()

    items = (await db_client.get(f"/packages/{pkg.slug}/reviews")).json()["items"]
    assert [i["ledBy"] for i in items] == [
        {"name": "Kavya Rawat", "slug": "kavya-rawat"},
        {"name": "Tenzin Norbu", "slug": "tenzin-norbu"},
    ]
    await db.execute(update(TripLeader).where(TripLeader.id == tenzin.id).values(active=False))
    await db.commit()
    items = (await db_client.get(f"/packages/{pkg.slug}/reviews?fresh=1")).json()["items"]
    assert items[1]["ledBy"] == {"name": "Tenzin Norbu", "slug": None}  # named, not linked


async def test_a_leader_change_does_not_mint_a_new_itinerary_pdf(db: AsyncSession) -> None:
    pkg, dep_ids, kavya, tenzin = await setup(db)
    slug, pkg_id, tenzin_id = pkg.slug, pkg.id, tenzin.id
    db.expire_all()  # the bulk updates in `setup` left stale attributes behind
    before = await reads.get_package(db, slug, with_related=False)
    assert before is not None
    await db.execute(
        update(Departure).where(Departure.id == dep_ids[0]).values(leader_id=tenzin_id)
    )
    await db.execute(update(Package).where(Package.id == pkg_id).values(leader_id=None))
    await db.commit()
    db.expire_all()
    after = await reads.get_package(db, slug, with_related=False)
    assert after is not None and after.leader is None
    assert after.departures[0].leader and after.departures[0].leader.slug == "tenzin-norbu"
    site = {"site_url": "https://x.test", "whatsapp_number": "91"}
    assert pdf_version(before, **site) == pdf_version(after, **site)
