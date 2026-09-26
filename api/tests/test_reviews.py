"""B13 — reviews (R21, R24): a customer reviews a completed booking once; the owner publishes or
hides it; the package page shows the published ones and an aggregate cached on the package,
never counting testimonials. The db tests need TEST_DATABASE_URL."""

import datetime as dt
from collections.abc import Sequence

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Departure, Package, Review, User
from app.models.enums import BookingStatus, UserRole
from app.schemas.reviews import ReviewInput, ReviewState
from app.services import reviews as svc
from app.services.analytics import ist_today
from scripts.seed import DemoTrip, seed_demo_traveller
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import OWNER_INBOX, mailing, with_webhook_secret
from tests.test_bookings_desk import owner_cookie
from tests.test_customer_accounts import EMAIL, paid_booking, signed_in

__all__ = ["rzp"]

TEXT = "Lovely trip, the houseboat night was the best part of it."


# --- no db ---------------------------------------------------------------------------------------


def test_public_names_are_first_name_and_last_initial() -> None:
    assert svc.public_name("Asha Bhat") == "Asha B."
    assert svc.public_name("  asha   rani  bhat ") == "Asha B."
    assert svc.public_name("Madhu") == "Madhu"
    assert svc.public_name("   ") == "A traveller"


def test_the_state_comes_from_approved_and_moderated_at() -> None:
    now = dt.datetime.now(dt.UTC)
    assert ReviewState.of(False, None) is ReviewState.PENDING
    assert ReviewState.of(True, None) is ReviewState.PENDING  # never moderated
    assert ReviewState.of(True, now) is ReviewState.PUBLISHED
    assert ReviewState.of(False, now) is ReviewState.HIDDEN


def test_review_input_trims_counts_code_points_and_refuses_control_characters() -> None:
    ok = ReviewInput.model_validate({"rating": 4, "text": f"  {TEXT}\r\nMore.  "})
    assert ok.text == f"{TEXT}\nMore."
    assert len(ReviewInput(rating=1, text="🙂" * 20).text) == 20  # emoji count once
    for bad in (
        {"rating": 0, "text": TEXT},
        {"rating": 6, "text": TEXT},
        {"rating": 5, "text": "  too short        "},
        {"rating": 5, "text": "x" * 1001},
        {"rating": 5, "text": TEXT + "\x07"},
    ):
        with pytest.raises(ValidationError):
            ReviewInput.model_validate(bad)


# --- db helpers ----------------------------------------------------------------------------------


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.reviews.revalidate", rec)
    return rec


async def complete(db: AsyncSession, ref: str) -> None:
    """What the daily sweep does the day after departure."""
    await db.execute(
        update(Booking).where(Booking.ref == ref).values(status=BookingStatus.COMPLETED)
    )
    await db.commit()


async def setup(db: AsyncSession, db_app: FastAPI, client: AsyncClient):  # noqa: ANN201
    """A live package, live-mode email to the owner, and one confirmed booking for EMAIL."""
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    # Demo mode, so sign-in answers with the code (the owner's copy is never redirected).
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    pkg, departure = await seeded(db, seats=8)
    ref = await paid_booking(client, departure.id, EMAIL, "9000000081", "pay_B13Rev0001")
    sender.sent.clear()
    return sender, pkg, ref


async def extra_review(
    db: AsyncSession, pkg: Package, departure_id: str, n: int, rating: int, *, at: dt.datetime
) -> Review:
    """A completed booking + a review, straight into the tables (for aggregates and paging)."""
    user = User(name=f"Guest {n}", email=f"guest{n}@example.test", role=UserRole.CUSTOMER)
    db.add(user)
    await db.flush()
    booking = Booking(
        ref=f"TB-RV{n:04d}",
        package_id=pkg.id,
        departure_id=departure_id,
        user_id=user.id,
        status=BookingStatus.COMPLETED,
        hold_expires_at=at,
        contact_name=f"Guest Number{n}",
        contact_phone="9000000000",
        contact_email=user.email,
        quote={},
        total_paise=1,
        paid_paise=1,
    )
    db.add(booking)
    await db.flush()
    review = Review(
        booking_id=booking.id,
        package_id=pkg.id,
        user_id=user.id,
        rating=rating,
        text=f"Review number {n} is long enough.",
        created_at=at,
    )
    db.add(review)
    await db.commit()
    return review


# --- db: the customer ----------------------------------------------------------------------------


@pytest.mark.db
async def test_only_a_completed_booking_can_be_reviewed_once_and_the_owner_hears_of_it(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, pkg, ref = await setup(db, db_app, db_client)
    token = await signed_in(db_client)
    me = with_cookie(token)
    body = {"rating": 4, "text": f"  {TEXT}  "}
    path = f"/account/bookings/{ref}/review"

    assert (await db_client.post(path, json=body)).status_code == 401
    # Confirmed, not yet travelled: no form, and the api refuses.
    detail = (await db_client.get(f"/account/bookings/{ref}", headers=me)).json()
    assert detail["canReview"] is False and detail["review"] is None
    res = await db_client.post(path, json=body, headers=me)
    assert res.status_code == 409 and res.json()["error"]["reason"] == "not_completed"

    await complete(db, ref)
    [row] = (await db_client.get("/account/bookings", headers=me)).json()["bookings"]
    assert row["canReview"] is True and row["reviewRating"] is None

    # Someone else's booking is a 404, like every other account route.
    other = await signed_in(db_client, "ravi@example.test")
    assert (await db_client.post(path, json=body, headers=with_cookie(other))).status_code == 404

    res = await db_client.post(path, json=body, headers=me)
    assert res.status_code == 201, res.text
    review = res.json()
    assert review["rating"] == 4 and review["text"] == TEXT and review["state"] == "pending"

    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject.startswith("New review · ★ 4 · ")
    assert TEXT in mail.text and "/admin/reviews" in mail.text and mail.reply_to == EMAIL

    again = await db_client.post(path, json=body, headers=me)
    assert again.status_code == 409 and again.json()["error"]["reason"] == "already_reviewed"

    detail = (await db_client.get(f"/account/bookings/{ref}", headers=me)).json()
    assert detail["canReview"] is False and detail["review"]["state"] == "pending"
    [row] = (await db_client.get("/account/bookings", headers=me)).json()["bookings"]
    assert row["canReview"] is False and row["reviewRating"] == 4

    # Pending: nothing public yet.
    await db.rollback()
    await db.refresh(pkg)
    assert pkg.rating_count == 0 and pkg.rating_avg is None
    public = (await db_client.get(f"/packages/{pkg.slug}")).json()
    assert public["rating"] is None and public["reviews"] == []


@pytest.mark.db
async def test_a_lost_owner_email_never_undoes_the_review(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, _, ref = await setup(db, db_app, db_client)
    sender.fail_for = frozenset({OWNER_INBOX})
    await complete(db, ref)
    token = await signed_in(db_client)
    res = await db_client.post(
        f"/account/bookings/{ref}/review",
        json={"rating": 5, "text": TEXT},
        headers=with_cookie(token),
    )
    assert res.status_code == 201, res.text
    await db.rollback()
    assert (await db.execute(select(func.count()).select_from(Review))).scalar_one() == 1
    assert sender.sent == []


# --- db: the owner -------------------------------------------------------------------------------


@pytest.mark.db
async def test_moderation_is_owner_only_and_moves_the_aggregate_both_ways(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    revalidated: RecordingRevalidate,
) -> None:
    _, pkg, ref = await setup(db, db_app, db_client)
    await complete(db, ref)
    token = await signed_in(db_client)
    created = await db_client.post(
        f"/account/bookings/{ref}/review",
        json={"rating": 4, "text": TEXT},
        headers=with_cookie(token),
    )
    assert created.status_code == 201
    await db.rollback()
    review_id = (await db.execute(select(Review.id))).scalar_one()

    # A customer or nobody: refused.
    for headers in ({}, with_cookie(token)):
        assert (await db_client.get("/admin/reviews", headers=headers)).status_code in (401, 403)
        res = await db_client.post(f"/admin/reviews/{review_id}/publish", headers=headers)
        assert res.status_code in (401, 403)

    owner = await owner_cookie(db)
    queue = (await db_client.get("/admin/reviews", headers=owner)).json()
    assert queue["state"] == "pending" and queue["counts"] == {
        "pending": 1,
        "published": 0,
        "hidden": 0,
    }
    [item] = queue["items"]
    assert item["bookingRef"] == ref and item["name"] == "Asha Rao" and item["email"] == EMAIL
    assert item["packageSlug"] == pkg.slug and item["moderatedAt"] is None
    session = (await db_client.get("/auth/session", headers=owner)).json()
    assert session["reviewsPending"] == 1
    assert (await db_client.get("/admin/dashboard", headers=owner)).json()["reviewsPending"] == 1

    res = await db_client.post(f"/admin/reviews/{review_id}/publish", headers=owner)
    assert res.status_code == 200, res.text
    assert res.json()["state"] == "published" and res.json()["moderatedAt"] is not None
    assert revalidated.calls and f"package:{pkg.slug}" in revalidated.calls[-1]

    public = (await db_client.get(f"/packages/{pkg.slug}")).json()
    assert public["rating"] == {"avg": 4.0, "count": 1}
    [shown] = public["reviews"]
    assert shown["name"] == "Asha R." and shown["rating"] == 4 and shown["text"] == TEXT
    assert "email" not in shown
    search = (await db_client.get("/packages")).json()
    assert next(c for c in search["items"] if c["slug"] == pkg.slug)["rating"]["count"] == 1
    mine = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    assert mine["review"]["state"] == "published"
    desk = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert desk["review"]["state"] == "published" and desk["review"]["rating"] == 4

    res = await db_client.post(f"/admin/reviews/{review_id}/hide", headers=owner)
    assert res.status_code == 200 and res.json()["state"] == "hidden"
    public = (await db_client.get(f"/packages/{pkg.slug}")).json()
    assert public["rating"] is None and public["reviews"] == []
    hidden = (await db_client.get("/admin/reviews?state=hidden", headers=owner)).json()
    assert [r["id"] for r in hidden["items"]] == [review_id]
    assert hidden["counts"] == {"pending": 0, "published": 0, "hidden": 1}
    mine = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    assert mine["review"]["state"] == "hidden"

    # …and back again: hidden is not final.
    res = await db_client.post(f"/admin/reviews/{review_id}/publish", headers=owner)
    assert res.json()["state"] == "published"
    assert (await db_client.get(f"/packages/{pkg.slug}")).json()["rating"]["count"] == 1

    assert (await db_client.post("/admin/reviews/nope/publish", headers=owner)).status_code == 404
    assert (await db_client.get("/admin/reviews?state=odd", headers=owner)).status_code == 400


@pytest.mark.db
async def test_the_aggregate_averages_published_reviews_only_and_pages_newest_first(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    pkg, departure = await seeded(db, seats=40)
    start = dt.datetime(2026, 9, 1, tzinfo=dt.UTC)
    ratings = [5, 4, 4, 3, 5, 5, 2, 4]
    pkg_id, slug, departure_id = pkg.id, pkg.slug, departure.id
    made = [
        (await extra_review(db, pkg, departure_id, n, r, at=start + dt.timedelta(hours=n))).id
        for n, r in enumerate(ratings)
    ]
    for review_id in made[:-1]:  # the last stays pending
        await svc.moderate(db, review_id, publish=True)
    await svc.moderate(db, made[3], publish=False)  # hide the 3 ★

    published = [r for i, r in enumerate(ratings[:-1]) if i != 3]  # 5 4 4 5 5 2
    await db.rollback()
    count, avg = (
        await db.execute(
            select(Package.rating_count, Package.rating_avg).where(Package.id == pkg_id)
        )
    ).one()
    assert count == len(published) == 6
    assert str(avg) == "4.2"  # 25 / 6 = 4.1666…

    detail = (await db_client.get(f"/packages/{slug}")).json()
    assert detail["rating"] == {"avg": 4.2, "count": 6}
    assert [r["text"] for r in detail["reviews"]] == [
        f"Review number {n} is long enough." for n in (6, 5, 4, 2, 1, 0)
    ]
    page2 = (await db_client.get(f"/packages/{slug}/reviews?page=2")).json()
    assert page2["items"] == [] and page2["total"] == 6 and page2["totalPages"] == 1
    assert (await db_client.get("/packages/nope/reviews")).status_code == 404
    assert (await db_client.get(f"/packages/{slug}/reviews?page=0")).status_code == 400

    # A seventh published review spills onto page 2.
    await svc.moderate(db, made[-1], publish=True)
    page2 = (await db_client.get(f"/packages/{slug}/reviews?page=2")).json()
    assert page2["totalPages"] == 2 and [r["rating"] for r in page2["items"]] == [5]


# --- db: the demo seed ---------------------------------------------------------------------------


@pytest.mark.db
async def test_the_demo_traveller_seed_is_idempotent_and_resets_the_open_trip(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, _ = await seeded(db, seats=8)
    trips = (
        DemoTrip("TB-DEMO01", pkg.slug, 60, (5, TEXT)),
        DemoTrip("TB-DEMO02", pkg.slug, 21, None),
    )
    today = ist_today()
    await seed_demo_traveller(db, today=today, trips=trips)
    await seed_demo_traveller(db, today=today + dt.timedelta(days=3), trips=trips)

    await db.rollback()
    bookings = (
        (
            await db.execute(
                select(Booking).where(Booking.ref.like("TB-DEMO%")).order_by(Booking.ref)
            )
        )
        .scalars()
        .all()
    )
    assert [b.status for b in bookings] == [BookingStatus.COMPLETED] * 2
    assert all(b.paid_paise == b.total_paise > 0 for b in bookings)
    dates = [
        (
            await db.execute(select(Departure.date).where(Departure.id == b.departure_id))
        ).scalar_one()
        for b in bookings
    ]
    assert dates == [today - dt.timedelta(days=60), today - dt.timedelta(days=21)]  # kept
    await db.refresh(pkg)
    assert pkg.rating_count == 1 and str(pkg.rating_avg) == "5.0"

    # The visitor reviews the open trip; a re-run removes it again.
    token = await signed_in(db_client, "traveller.demo@example.com")
    res = await db_client.post(
        "/account/bookings/TB-DEMO02/review",
        json={"rating": 3, "text": TEXT},
        headers=with_cookie(token),
    )
    assert res.status_code == 201, res.text
    await seed_demo_traveller(db, today=today, trips=trips)
    await db.rollback()
    assert (await db.execute(select(func.count()).select_from(Review))).scalar_one() == 1

    # The past departures never show publicly, and the page is whole.
    detail = (await db_client.get(f"/packages/{pkg.slug}")).json()
    assert all(d["date"] >= today.isoformat() for d in detail["departures"])
    assert detail["rating"]["count"] == 1 and detail["reviews"][0]["name"] == "Meera I."
    mine = (await db_client.get("/account/bookings/TB-DEMO01", headers=with_cookie(token))).json()
    assert mine["review"]["state"] == "published" and mine["hasVoucher"] is True


@pytest.mark.db
async def test_a_reseed_never_deletes_a_departure_that_has_bookings(db: AsyncSession) -> None:
    from scripts.seed import seed
    from tests.settings import fixture_content, make_settings
    from tests.test_catalog import RecordingStore

    content = fixture_content()
    await seed(db, content, RecordingStore(), make_settings())
    pkg = (await db.execute(select(Package).limit(1))).scalar_one()
    old = Departure(
        package_id=pkg.id,
        date=ist_today() - dt.timedelta(days=90),
        seats_total=10,
        price_double_paise=1,
        price_triple_paise=1,
        price_child_paise=1,
        single_supplement_paise=0,
    )
    spare = Departure(
        package_id=pkg.id,
        date=ist_today() - dt.timedelta(days=91),
        seats_total=10,
        price_double_paise=1,
        price_triple_paise=1,
        price_child_paise=1,
        single_supplement_paise=0,
    )
    db.add_all([old, spare])
    await db.flush()
    db.add(
        Booking(
            ref="TB-OLD001",
            package_id=pkg.id,
            departure_id=old.id,
            status=BookingStatus.COMPLETED,
            hold_expires_at=dt.datetime.now(dt.UTC),
            contact_name="Old Guest",
            contact_phone="9000000000",
            contact_email="old@example.test",
            quote={},
            total_paise=1,
            paid_paise=1,
        )
    )
    await db.commit()
    old_id, spare_id = old.id, spare.id

    await seed(db, content, RecordingStore(), make_settings())
    await db.rollback()
    ids = set((await db.execute(select(Departure.id))).scalars())
    assert old_id in ids and spare_id not in ids
