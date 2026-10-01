"""P6 — the waitlist (R44): joining a sold-out date, walking the list in order when seats free,
the 24 h offer that holds them, claiming it, and the emails. The races are made certain with
test_lock_paths' blocker: two walks for one freed seat, and a walk against a new hold.
Needs TEST_DATABASE_URL (apart from the pure date rules)."""

import datetime as dt
from collections.abc import Awaitable, Callable

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.errors import ApiError
from app.models import Booking, Departure, WaitlistEntry
from app.models.enums import BookingStatus, WaitlistMail, WaitlistState
from app.schemas.bookings import BookingOrder
from app.services.booking import waitlist
from app.services.booking.after_capture import Notify
from app.services.booking.desk import release_hold
from app.services.booking.orders import create_booking_order
from app.services.email.render import IST
from app.services.email.waitlist import send_due
from tests.razorpay_fake import FakeRazorpay
from tests.settings import make_settings
from tests.test_booking_orders import order, seats_left, seeded
from tests.test_booking_payments import callback
from tests.test_email_send import FakeSender
from tests.test_enquiries import CountingLimiter
from tests.test_lock_paths import race

SECRET = "waitlist-test-secret"
SETTINGS = make_settings(
    session_secret=SECRET,
    cron_secret="s3cret",
    email_from="Tripsmith <trips@tripsmith.test>",
    owner_notify_email="owner@tripsmith.test",
    site_url="https://tripsmith.test",
)


# --- pure rules --------------------------------------------------------------------------------


def test_an_offer_lasts_24_hours_but_ends_before_the_web_stops_booking() -> None:
    departs = dt.date(2026, 11, 20)
    assert waitlist.cutoff(departs) == dt.datetime(2026, 11, 19, 0, 0, tzinfo=IST)
    early = dt.datetime(2026, 11, 1, 6, 0, tzinfo=dt.UTC)
    assert waitlist.offer_ends(departs, early) == early + dt.timedelta(hours=24)
    late = dt.datetime(2026, 11, 18, 6, 0, tzinfo=IST)  # 18 h before the cutoff
    assert waitlist.offer_ends(departs, late) == waitlist.cutoff(departs)
    too_late = dt.datetime(2026, 11, 18, 19, 0, tzinfo=IST)  # 5 h left: no offer
    assert waitlist.offer_ends(departs, too_late) is None


def test_joining_closes_three_days_out() -> None:
    departs = dt.date(2026, 11, 20)
    assert waitlist.join_open(departs, dt.date(2026, 11, 17))
    assert not waitlist.join_open(departs, dt.date(2026, 11, 18))


def test_a_claim_token_names_one_offer_and_needs_the_secret() -> None:
    token = waitlist.claim_token("abc123", 2, SECRET)
    assert token is not None
    assert waitlist.read_token(token, SECRET) == ("abc123", 2)
    assert waitlist.read_token(token, "another") is None
    assert waitlist.read_token(token.replace(".2.", ".3."), SECRET) is None
    assert waitlist.claim_token("abc123", 2, None) is None


# --- helpers -----------------------------------------------------------------------------------


async def sold_out(db: AsyncSession, seats: int = 4) -> str:
    """A date whose seats are all held by one 10-minute web hold. Returns the departure id."""
    _, dep = await seeded(db, seats=seats)
    dep_id = dep.id
    await create_booking_order(
        db, order(dep_id, seats, email="holder@customer.in", phone="9000000100"), FakeRazorpay()
    )
    assert await seats_left(db, dep_id) == 0
    return dep_id


async def join(db: AsyncSession, dep_id: str, who: str, party: int) -> waitlist.Joined:
    return await waitlist.join(
        db,
        departure_id=dep_id,
        name=f"{who.title()} Rao",
        email=f"{who}@customer.in",
        party=party,
        ip="10.0.0.1",
    )


async def entries(db: AsyncSession, dep_id: str) -> dict[str, WaitlistEntry]:
    db.expire_all()
    rows = (
        await db.execute(
            select(WaitlistEntry)
            .where(WaitlistEntry.departure_id == dep_id)
            .order_by(WaitlistEntry.position)
        )
    ).scalars()
    return {e.email.split("@")[0]: e for e in rows}


async def lapse_holds(db: AsyncSession, dep_id: str) -> None:
    """Every hold on the date runs out — the case that fires no event."""
    await db.execute(
        update(Booking)
        .where(Booking.departure_id == dep_id, Booking.status == BookingStatus.PENDING)
        .values(hold_expires_at=text("now() - interval '1 minute'"))
    )
    await db.commit()


async def walk(db: AsyncSession, dep_id: str) -> waitlist.Walked:
    return await waitlist.walk_departures(db, [dep_id])


# --- joining -----------------------------------------------------------------------------------


@pytest.mark.db
async def test_joining_a_sold_out_date_puts_the_party_in_line(db: AsyncSession) -> None:
    dep_id = await sold_out(db)
    first = await join(db, dep_id, "asha", 2)
    second = await join(db, dep_id, "bina", 1)
    assert (first.position, first.waiting) == (1, 1)
    assert (second.position, second.waiting) == (2, 2)

    with pytest.raises(ApiError) as again:
        await join(db, dep_id, "asha", 3)
    assert (again.value.status, again.value.reason) == (409, "already_waiting")


@pytest.mark.db
async def test_a_date_with_seats_for_the_party_is_booked_not_waited_for(
    db: AsyncSession,
) -> None:
    _, dep = await seeded(db, seats=4)
    with pytest.raises(ApiError) as free:
        await join(db, dep.id, "asha", 2)
    assert free.value.reason == "seats_available"


@pytest.mark.db
async def test_the_list_closes_three_days_before_departure(db: AsyncSession) -> None:
    dep_id = await sold_out(db)
    soon = dt.datetime.combine(
        (await db.get(Departure, dep_id)).date - dt.timedelta(days=2),  # type: ignore[union-attr]
        dt.time(12),
        IST,
    )
    with pytest.raises(ApiError) as closed:
        await waitlist.join(
            db,
            departure_id=dep_id,
            name="Asha Rao",
            email="asha@customer.in",
            party=1,
            ip=None,
            now=soon,
        )
    assert closed.value.reason == "waitlist_closed"


# --- walking -----------------------------------------------------------------------------------


@pytest.mark.db
async def test_freed_seats_go_down_the_list_and_a_bigger_party_keeps_its_place(
    db: AsyncSession,
) -> None:
    dep_id = await sold_out(db, seats=3)
    await join(db, dep_id, "asha", 4)  # bigger than the date: skipped every time
    await join(db, dep_id, "bina", 2)
    await join(db, dep_id, "chet", 1)
    await join(db, dep_id, "dev", 1)

    await lapse_holds(db, dep_id)  # 3 seats free, and no event says so
    walked = await walk(db, dep_id)
    assert walked.offered == 2

    e = await entries(db, dep_id)
    assert e["asha"].state == WaitlistState.WAITING and e["asha"].position == 1
    assert e["bina"].state == WaitlistState.OFFERED and e["bina"].mail_due == WaitlistMail.OFFER
    assert e["chet"].state == WaitlistState.OFFERED
    assert e["dev"].state == WaitlistState.WAITING  # nothing left for them
    # The offers hold the seats: to everyone else the date is still sold out.
    assert await seats_left(db, dep_id) == 0
    # A walk that finds nothing new changes nothing.
    assert (await walk(db, dep_id)).offered == 0


@pytest.mark.db
async def test_a_new_hold_lets_the_list_go_first(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    assert await seats_left(db, dep_id) == 2  # the view alone would sell them again

    with pytest.raises(ApiError) as late:
        await create_booking_order(
            db, order(dep_id, 1, email="walkin@customer.in", phone="9000000200"), FakeRazorpay()
        )
    assert late.value.reason == "sold_out"
    # The order was refused, but the offer its walk made stands (committed on its own).
    assert (await entries(db, dep_id))["asha"].state == WaitlistState.OFFERED


@pytest.mark.db
async def test_an_offer_that_runs_out_moves_on_and_goes_to_the_back(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await join(db, dep_id, "bina", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    e = await entries(db, dep_id)
    assert e["asha"].state == WaitlistState.OFFERED
    e["asha"].mail_due = None  # the offer email went out
    e["asha"].offer_expires_at = dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)
    await db.commit()

    walked = await walk(db, dep_id)
    assert (walked.lapsed, walked.offered) == (1, 1)
    e = await entries(db, dep_id)
    assert e["bina"].state == WaitlistState.OFFERED
    assert e["asha"].state == WaitlistState.WAITING  # still on the list…
    assert e["asha"].position > e["bina"].position  # …at the back
    assert e["asha"].mail_due == WaitlistMail.LAPSE


@pytest.mark.db
async def test_the_desk_releasing_a_hold_offers_its_seats_at_once(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    ref = (await db.execute(select(Booking.ref).where(Booking.departure_id == dep_id))).scalar_one()
    await release_hold(db, ref)
    assert (await entries(db, dep_id))["asha"].state == WaitlistState.OFFERED


# --- claiming ----------------------------------------------------------------------------------


async def offered(db: AsyncSession, dep_id: str, who: str) -> str:
    entry = (await entries(db, dep_id))[who]
    assert entry.state == WaitlistState.OFFERED
    token = waitlist.claim_token(entry.id, entry.offer_no, SECRET)
    assert token
    return token


@pytest.mark.db
async def test_claiming_books_the_held_seats_until_the_offer_would_end(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=3)
    await join(db, dep_id, "asha", 3)
    await join(db, dep_id, "bina", 1)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    token = await offered(db, dep_id, "asha")
    ends = (await entries(db, dep_id))["asha"].offer_expires_at

    # Another email can't use the link.
    body = order(dep_id, 2, email="someone@customer.in", phone="9000000300")
    with pytest.raises(ApiError) as other:
        await create_booking_order(
            db, body.model_copy(update={"claim": token}), FakeRazorpay(), secret=SECRET
        )
    assert other.value.reason == "claim_email"

    # Asha brings two, not three: the seat she leaves goes to the next in line.
    body = order(dep_id, 2, email="asha@customer.in", phone="9000000301")
    got = await create_booking_order(
        db, body.model_copy(update={"claim": token}), FakeRazorpay(), secret=SECRET
    )
    assert isinstance(got, BookingOrder)
    assert got.hold_expires_at == ends
    e = await entries(db, dep_id)
    assert e["asha"].state == WaitlistState.CLAIMED and e["asha"].booking_id
    assert e["bina"].state == WaitlistState.OFFERED
    assert await seats_left(db, dep_id) == 0


@pytest.mark.db
async def test_a_claim_cannot_grow_past_the_held_seats(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    token = await offered(db, dep_id, "asha")
    body = order(dep_id, 3, email="asha@customer.in", phone="9000000301")
    with pytest.raises(ApiError) as short:
        await create_booking_order(
            db, body.model_copy(update={"claim": token}), FakeRazorpay(), secret=SECRET
        )
    assert short.value.reason == "claim_short"


@pytest.mark.db
async def test_an_unpaid_claim_goes_back_in_line_and_a_paid_one_is_booked(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    db_app.state.settings = SETTINGS
    db_app.state.razorpay = FakeRazorpay()
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 1)
    await join(db, dep_id, "bina", 1)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    a, b = await offered(db, dep_id, "asha"), await offered(db, dep_id, "bina")

    def claim(who: str, token: str) -> dict[str, object]:
        body = order(dep_id, 1, email=f"{who}@customer.in", phone="9000000400")
        return body.model_copy(update={"claim": token}).model_dump(mode="json", by_alias=True)

    held_a = await db_client.post("/bookings", json=claim("asha", a))
    held_b = await db_client.post("/bookings", json=claim("bina", b))
    assert held_a.status_code == held_b.status_code == 201, (held_a.text, held_b.text)

    # Bina pays; Asha's booking lapses unpaid.
    order_b = held_b.json()
    res = await db_client.post(
        f"/bookings/{order_b['bookingRef']}/confirm",
        json=callback(order_b["orderId"], "pay_Bina0001"),
    )
    assert res.json()["status"] == "confirmed", res.text
    await db.execute(
        update(Booking)
        .where(Booking.ref == held_a.json()["bookingRef"])
        .values(hold_expires_at=text("now() - interval '1 minute'"))
    )
    await db.commit()
    await walk(db, dep_id)
    e = await entries(db, dep_id)
    assert e["bina"].state == WaitlistState.BOOKED
    # Asha goes to the back; the walk that lapsed her doesn't re-offer her at once…
    assert e["asha"].state == WaitlistState.WAITING and e["asha"].mail_due == WaitlistMail.LAPSE
    # …the next one does, since she is the whole list (at most MAX_AUTO_OFFERS times).
    await walk(db, dep_id)
    e = await entries(db, dep_id)
    assert e["asha"].state == WaitlistState.OFFERED and e["asha"].offer_no == 2


@pytest.mark.db
async def test_automatic_offers_stop_after_three_lapses(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    for n in range(1, waitlist.MAX_AUTO_OFFERS + 1):
        await walk(db, dep_id)
        entry = (await entries(db, dep_id))["asha"]
        assert (entry.state, entry.offer_no) == (WaitlistState.OFFERED, n)
        entry.offer_expires_at = dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1)
        await db.commit()
        await walk(db, dep_id)  # lapses it
    await walk(db, dep_id)
    entry = (await entries(db, dep_id))["asha"]
    assert entry.state == WaitlistState.WAITING  # still on the list; the owner can offer by hand
    assert await seats_left(db, dep_id) == 2


@pytest.mark.db
async def test_a_list_that_closes_sends_no_back_of_the_list_email(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    # The offer ran to the cutoff, and the date stops taking bookings at the same moment.
    departs = (await db.get(Departure, dep_id)).date  # type: ignore[union-attr]
    await db.execute(
        update(WaitlistEntry).values(offer_expires_at=dt.datetime.now(dt.UTC), mail_due=None)
    )
    await db.execute(
        update(Departure)
        .where(Departure.id == dep_id)
        .values(date=dt.datetime.now(IST).date() + dt.timedelta(days=1))
    )
    await db.commit()
    walked = await walk(db, dep_id)
    assert (walked.lapsed, walked.closed) == (1, 1)
    entry = (await entries(db, dep_id))["asha"]
    assert (entry.state, entry.mail_due) == (WaitlistState.CLOSED, None)
    sender = FakeSender()
    assert await send_due(db, Notify(sender, SETTINGS)) == 0 and sender.sent == []
    assert departs  # the original date, for the reader


@pytest.mark.db
async def test_a_claim_keeps_its_hold_when_the_same_person_books_another_date(
    db: AsyncSession,
) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    token = await offered(db, dep_id, "asha")
    body = order(dep_id, 2, email="asha@customer.in", phone="9000000301")
    await create_booking_order(
        db, body.model_copy(update={"claim": token}), FakeRazorpay(), secret=SECRET
    )
    other = (
        (
            await db.execute(
                select(Departure.id).where(Departure.id != dep_id).order_by(Departure.date)
            )
        )
        .scalars()
        .first()
    )
    assert other
    await create_booking_order(
        db, order(other, 1, email="asha@customer.in", phone="9000000301"), FakeRazorpay()
    )
    await walk(db, dep_id)
    assert (await entries(db, dep_id))["asha"].state == WaitlistState.CLAIMED
    assert await seats_left(db, dep_id) == 0


@pytest.mark.db
async def test_razorpay_down_on_a_smaller_claim_never_oversells(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=4)
    await join(db, dep_id, "asha", 4)
    await join(db, dep_id, "bina", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    token = await offered(db, dep_id, "asha")
    body = order(dep_id, 2, email="asha@customer.in", phone="9000000301")
    with pytest.raises(ApiError) as down:
        await create_booking_order(
            db, body.model_copy(update={"claim": token}), FakeRazorpay(down=True), secret=SECRET
        )
    assert down.value.status == 502
    # Nothing was offered on from the failed claim, so Asha's whole offer stands.
    e = await entries(db, dep_id)
    assert e["asha"].state == WaitlistState.OFFERED and e["bina"].state == WaitlistState.WAITING
    assert await seats_left(db, dep_id) == 0

    # Seats moved on meanwhile (Bina offered the claim's leftover): Asha goes to the back.
    body = body.model_copy(update={"claim": token})
    await create_booking_order(db, body, FakeRazorpay(), secret=SECRET)
    e = await entries(db, dep_id)
    assert e["bina"].state == WaitlistState.OFFERED  # the 2 seats Asha left
    ref = (
        await db.execute(select(Booking.ref).where(Booking.id == e["asha"].booking_id))
    ).scalar_one()
    from app.schemas.bookings import BookingContact
    from app.services.booking.orders import _undo_hold

    booking_row = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    await _undo_hold(
        db,
        booking_row,
        [],
        BookingContact(name="Asha Rao", phone="9000000301", email="asha@customer.in"),
    )
    e = await entries(db, dep_id)
    # Her booking ended: 2 seats free again, but her offer was for 4 — back of the list.
    assert e["asha"].state == WaitlistState.WAITING
    assert e["asha"].position > e["bina"].position


# --- races -------------------------------------------------------------------------------------


def lock_departure(dep_id: str) -> Callable[[AsyncSession], Awaitable[object]]:
    async def go(session: AsyncSession) -> None:
        await session.execute(select(Departure.id).where(Departure.id == dep_id).with_for_update())

    return go


@pytest.mark.db
async def test_two_walks_never_offer_one_freed_seat_twice(
    db: AsyncSession, db_engine: AsyncEngine
) -> None:
    dep_id = await sold_out(db, seats=1)
    await join(db, dep_id, "asha", 1)
    await join(db, dep_id, "bina", 1)
    await lapse_holds(db, dep_id)

    async def walker(session: AsyncSession) -> waitlist.Walked:
        return await waitlist.walk_departures(session, [dep_id])

    results = await race(db_engine, lock_departure(dep_id), [walker, walker])
    assert sorted(r.offered for r in results) == [0, 1]
    e = await entries(db, dep_id)
    assert [e["asha"].state, e["bina"].state] == [WaitlistState.OFFERED, WaitlistState.WAITING]
    assert await seats_left(db, dep_id) == 0


@pytest.mark.db
async def test_a_walk_and_a_new_hold_never_share_a_seat(
    db: AsyncSession, db_engine: AsyncEngine
) -> None:
    dep_id = await sold_out(db, seats=1)
    await join(db, dep_id, "asha", 1)
    await lapse_holds(db, dep_id)

    async def walker(session: AsyncSession) -> waitlist.Walked:
        return await waitlist.walk_departures(session, [dep_id])

    async def holder(session: AsyncSession) -> BookingOrder:
        body = order(dep_id, 1, email="walkin@customer.in", phone="9000000500")
        return await create_booking_order(session, body, FakeRazorpay())

    for contenders in ([walker, holder], [holder, walker]):
        await db.execute(update(WaitlistEntry).values(state=WaitlistState.WAITING))
        await lapse_holds(db, dep_id)
        results = await race(db_engine, lock_departure(dep_id), contenders)
        # The list always goes first: the hold's own walk offers the seat, so the hold fails.
        assert any(isinstance(r, ApiError) and r.reason == "sold_out" for r in results)
        assert (await entries(db, dep_id))["asha"].state == WaitlistState.OFFERED
        assert await seats_left(db, dep_id) == 0


# --- emails, the tick, My trips, the public read ----------------------------------------------


@pytest.mark.db
async def test_the_offer_email_goes_once_with_a_claim_link(db: AsyncSession) -> None:
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    sender = FakeSender()
    notify = Notify(sender, SETTINGS)
    assert await send_due(db, notify) == 1
    assert await send_due(db, notify) == 0  # claimed once
    [mail] = sender.sent
    assert mail.to == "asha@customer.in" and mail.subject.startswith("Seats are free on")
    token = await offered(db, dep_id, "asha")
    assert "https://tripsmith.test/packages/" in mail.text and f"?claim={token}#book" in mail.text
    entry = (await entries(db, dep_id))["asha"]
    assert entry.mail_due is None and entry.events[-1]["kind"] == "email"


@pytest.mark.db
async def test_the_tick_needs_the_secret_and_walks_every_list(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    db_app.state.settings = SETTINGS
    sender = FakeSender()
    db_app.state.email_sender = sender
    dep_id = await sold_out(db, seats=2)
    await join(db, dep_id, "asha", 2)
    await lapse_holds(db, dep_id)

    assert (await db_client.get("/cron/waitlist")).status_code == 401
    res = await db_client.get("/cron/waitlist", headers={"Authorization": "Bearer s3cret"})
    assert res.status_code == 200, res.text
    assert res.json() == {"offered": 1, "lapsed": 0, "closed": 0, "emails": 1}
    assert len(sender.sent) == 1


@pytest.mark.db
async def test_join_route_answers_the_place_and_the_claim_link_reads_the_offer(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    db_app.state.settings = SETTINGS
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    dep_id = await sold_out(db, seats=2)
    res = await db_client.post(
        "/waitlist",
        json={"departureId": dep_id, "name": "Asha Rao", "email": "Asha@Customer.in", "party": 2},
    )
    assert res.status_code == 201, res.text
    assert res.json() == {"position": 1, "waiting": 1}
    listed = await db_client.get(f"/packages/{await slug_of(db, dep_id)}/departures?fresh=1")
    row = next(d for d in listed.json()["items"] if d["id"] == dep_id)
    assert (row["waiting"], row["waitlistOpen"], row["seatsLeft"]) == (1, True, 0)

    await lapse_holds(db, dep_id)
    await walk(db, dep_id)
    token = await offered(db, dep_id, "asha")
    claim = await db_client.get(f"/waitlist/claim/{token}")
    assert claim.status_code == 200, claim.text
    body = claim.json()
    assert (body["state"], body["heldSeats"], body["party"]) == ("offered", 2, 2)
    assert body["email"] == "asha@customer.in"

    # The quote counts the held seats as free for the link's holder only.
    quote = {"departureId": dep_id, "travellers": [{"occupancy": "double"}] * 2}
    assert (await db_client.post("/bookings/quote", json=quote)).status_code == 409
    got = await db_client.post("/bookings/quote", json={**quote, "claim": token})
    assert got.status_code == 200, got.text

    bad = await db_client.get(f"/waitlist/claim/{token[:-4]}beef")
    assert bad.status_code == 404


async def slug_of(db: AsyncSession, dep_id: str) -> str:
    from app.models import Package

    return (
        await db.execute(select(Package.slug).join(Departure).where(Departure.id == dep_id))
    ).scalar_one()


@pytest.mark.db
async def test_my_trips_lists_the_offer_with_its_claim_link(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    from pydantic import SecretStr

    from tests.test_auth import with_cookie
    from tests.test_customer_accounts import signed_in

    settings = db_app.state.settings
    db_app.state.settings = settings.model_copy(update={"session_secret": SecretStr(SECRET)})
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    dep_id = await sold_out(db, seats=2)
    await waitlist.join(
        db, departure_id=dep_id, name="Asha Rao", email="asha@example.test", party=2, ip=None
    )
    cookie = await signed_in(db_client, "asha@example.test")

    res = await db_client.get("/account/bookings", headers=with_cookie(cookie))
    assert res.status_code == 200, res.text
    [waiting] = res.json()["waitlist"]
    assert (waiting["state"], waiting["position"], waiting["claimPath"]) == ("waiting", 1, None)

    await lapse_holds(db, dep_id)  # reading My trips walks the date
    res = await db_client.get("/account/bookings", headers=with_cookie(cookie))
    [offer] = res.json()["waitlist"]
    assert offer["state"] == "offered" and offer["offerExpiresAt"]
    assert offer["claimPath"].startswith("/packages/") and "?claim=" in offer["claimPath"]
