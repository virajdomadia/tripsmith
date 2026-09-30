"""P8 — add-ons (R46): priced by the server to the paisa, never discounted (deal, coupon), the
coupon measured on the trip fare only; refusals; the real path (quote → hold → Razorpay order →
signed webhook capture) with the booking's own copy; the voucher, emails, manifest and CSV; the
package form's add-on rules; and the seed. The db tests need TEST_DATABASE_URL."""

import datetime as dt
import json
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import BookingAddon, Package, PackageAddon, PackageImage
from app.models.enums import AddonBasis, CouponKind, Occupancy
from app.schemas.bookings import AddonChoice, BookingRequest, QuoteRequest, QuoteTraveller
from app.schemas.catalog import AddonInput
from app.services.booking import desk
from app.services.booking.addons import AddonFact, detail
from app.services.booking.pricing import (
    ADDON_GONE_REASON,
    apply_coupon,
    build_quote,
    price_addons,
)
from app.services.booking.voucher import load_booking_facts
from app.services.catalog import admin_packages as svc
from app.services.pdf.voucher import render_voucher
from scripts.seed import seed, seed_addons
from tests.razorpay_fake import FakeRazorpay
from tests.settings import fixture_content, make_settings
from tests.test_admin_packages import RecordingRevalidate, goa_id, payload
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking, booking_body
from tests.test_booking_pricing import DEAL, NOW, departure, package
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import owner_cookie
from tests.test_catalog import RecordingStore
from tests.test_coupons import coupon

D = Occupancy.DOUBLE


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_packages.revalidate", rec)
    return rec


def addon(id: str, basis: AddonBasis, price: int, **overrides: object) -> PackageAddon:
    fields: dict[str, object] = {
        "id": id,
        "name": id.title(),
        "description": "",
        "price_paise": price,
        "basis": basis,
        "max_nights": 2 if basis == AddonBasis.NIGHT else None,
        "active": True,
        "position": 0,
    }
    return PackageAddon(**(fields | overrides))


TRANSFER = addon("transfer", AddonBasis.BOOKING, 1_800_00)
RAFTING = addon("rafting", AddonBasis.TRAVELLER, 900_00)
NIGHT = addon("night", AddonBasis.NIGHT, 2_200_00)
OFFERED = [TRANSFER, RAFTING, NIGHT]
CHOICES = [
    AddonChoice(addon_id="night", nights=2),
    AddonChoice(addon_id="rafting", travellers=3),
    AddonChoice(addon_id="transfer"),
]


# --- the sum -------------------------------------------------------------------------------------


def test_each_basis_is_priced_by_the_server_in_the_owners_order() -> None:
    lines = price_addons(OFFERED, CHOICES, party=4)
    assert [(a.addon_id, a.travellers, a.nights, a.amount_paise) for a in lines] == [
        ("transfer", 1, 1, 1_800_00),  # once per booking
        ("rafting", 3, 1, 2_700_00),  # × the travellers who take it
        ("night", 4, 2, 17_600_00),  # × the whole party × the nights
    ]


def test_add_ons_join_the_total_after_the_deal_and_the_deal_never_touches_them() -> None:
    travellers = [QuoteTraveller(occupancy=D), QuoteTraveller(occupancy=D)]
    extras = price_addons(OFFERED, [AddonChoice(addon_id="rafting", travellers=2)], party=2)
    plain = build_quote(
        departure(), package(), travellers, seats_left=12, deal_base=24_999_00, now=NOW
    )
    q = build_quote(
        departure(),
        package(**DEAL),
        travellers,
        seats_left=12,
        deal_base=24_999_00,
        now=NOW,
        addons=extras,
    )
    assert q.subtotal_paise == plain.subtotal_paise == 49_998_00  # the trip fare only
    assert q.discount_paise == 2 * 3_000_00  # the deal, per traveller, on the fare
    assert q.addons_paise == 1_800_00
    assert q.total_paise == 49_998_00 - 6_000_00 + 1_800_00
    assert q.fare_paise == 49_998_00 - 6_000_00


def test_a_coupon_percent_cap_and_minimum_are_measured_on_the_fare_only() -> None:
    travellers = [QuoteTraveller(occupancy=D), QuoteTraveller(occupancy=D)]
    big = [AddonChoice(addon_id="night", nights=2)]  # ₹8,800 of add-ons
    q = build_quote(
        departure(),
        package(),
        travellers,
        seats_left=12,
        deal_base=24_999_00,
        now=NOW,
        addons=price_addons(OFFERED, big, party=2),
    )
    off = apply_coupon(q, coupon())  # 10 % of the ₹49,998 fare, not of ₹58,798
    assert off.coupon is not None and off.coupon.off_paise == 4_999_00
    assert off.total_paise == 49_998_00 - 4_999_00 + 8_800_00
    flat = apply_coupon(q, coupon(kind=CouponKind.FLAT, percent=None, amount_paise=90_000_00))
    assert flat.total_paise == 1_00 + 8_800_00  # the fare floors at ₹1; add-ons stay whole


def test_a_switched_off_or_unknown_add_on_is_a_409_the_sheet_can_act_on() -> None:
    off = addon("off", AddonBasis.BOOKING, 500_00, active=False)
    for choice in ("off", "nope"):
        with pytest.raises(ApiError) as exc:
            price_addons([*OFFERED, off], [AddonChoice(addon_id=choice)], party=2)
        assert (exc.value.status, exc.value.reason) == (409, ADDON_GONE_REASON)
    with pytest.raises(ApiError) as exc:
        price_addons(
            [*OFFERED, off],
            [AddonChoice(addon_id="transfer"), AddonChoice(addon_id="off")],
            party=2,
        )
    assert "“Off” is no longer offered" in exc.value.message
    assert list((exc.value.field_errors or {}).keys()) == ["addons.1"]  # which one to drop


@pytest.mark.parametrize(
    "choice",
    [
        AddonChoice(addon_id="night", nights=3),  # over its maximum of 2
        AddonChoice(addon_id="night"),  # no nights
        AddonChoice(addon_id="rafting"),  # no travellers
    ],
)
def test_nights_over_the_maximum_or_a_missing_count_is_a_validation_error(
    choice: AddonChoice,
) -> None:
    with pytest.raises(ApiError) as exc:
        price_addons(OFFERED, [choice], party=2)
    assert exc.value.code == "validation" and "addons" in (exc.value.field_errors or {})


def test_the_request_refuses_a_repeat_and_more_travellers_than_the_party() -> None:
    base: dict[str, Any] = {"departureId": "d", "travellers": [{"occupancy": "double"}] * 2}
    with pytest.raises(ValidationError, match="picked once"):
        QuoteRequest.model_validate(base | {"addons": [{"addonId": "a"}, {"addonId": "a"}]})
    with pytest.raises(ValidationError, match="more travellers"):
        QuoteRequest.model_validate(base | {"addons": [{"addonId": "a", "travellers": 3}]})
    ok = QuoteRequest.model_validate(base | {"addons": [{"addonId": "a", "travellers": 2}]})
    assert ok.addons[0].travellers == 2
    order = BookingRequest.model_validate(
        {
            "departureId": "d",
            "travellers": [{"name": "Asha Rao", "age": 30, "occupancy": "single"}],
            "contact": {"name": "Asha Rao", "phone": "9876543210", "email": "a@x.in"},
            "addons": [{"addonId": "a", "travellers": 1}],
        }
    )
    assert order.as_quote().addons == order.addons


def test_older_snapshots_read_with_no_add_ons() -> None:
    travellers = [QuoteTraveller(occupancy=D)] * 2
    q = build_quote(departure(), package(), travellers, seats_left=12, deal_base=0, now=NOW)
    snapshot = q.model_dump(mode="json", by_alias=True)
    del snapshot["addons"], snapshot["addonsPaise"]  # a booking quoted before P8
    back = type(q).model_validate(snapshot)
    assert (back.addons, back.addons_paise, back.fare_paise) == ([], 0, q.total_paise)


def test_the_form_keeps_max_nights_for_a_per_night_add_on_only() -> None:
    fields = {"name": "Extra night", "pricePaise": 2_000_00}
    with pytest.raises(ValidationError, match="most nights"):
        AddonInput.model_validate(fields | {"basis": "night"})
    assert AddonInput.model_validate(fields | {"basis": "night", "maxNights": 3}).max_nights == 3
    dropped = AddonInput.model_validate(fields | {"basis": "traveller", "maxNights": 3})
    assert dropped.max_nights is None
    with pytest.raises(ValidationError):
        AddonInput.model_validate(fields | {"basis": "booking", "pricePaise": 50})  # under ₹1
    with pytest.raises(ValidationError, match="appears twice"):
        payload(
            addons=[
                {"id": "a1", "name": "Rafting", "pricePaise": 900_00, "basis": "traveller"},
                {"id": "a1", "name": "Kayak", "pricePaise": 900_00, "basis": "traveller"},
            ]
        )
    with pytest.raises(ValidationError, match="3-night trip can add up to 3 nights"):
        payload(
            nights=3,
            addons=[{"name": "Stay on", "pricePaise": 900_00, "basis": "night", "maxNights": 4}],
        )
    with pytest.raises(ValidationError, match="share a name"):
        payload(
            addons=[
                {"name": "Rafting", "pricePaise": 900_00, "basis": "traveller"},
                {"name": "rafting ", "pricePaise": 900_00, "basis": "traveller"},
            ]
        )


def test_every_surface_words_an_add_on_the_same_way() -> None:
    assert detail(AddonBasis.BOOKING, 1, 1) == "per booking"
    assert detail(AddonBasis.TRAVELLER, 1, 1) == "1 traveller"
    assert detail(AddonBasis.NIGHT, 4, 2) == "2 nights · 4 travellers"
    fact = AddonFact("Kullu rafting", AddonBasis.TRAVELLER, 2, 1, 1_800_00)
    assert fact.label == "Kullu rafting (2 travellers)"


# --- db ------------------------------------------------------------------------------------------


@pytest.fixture
def rzp(db_app: FastAPI) -> FakeRazorpay:
    from tests.test_enquiries import CountingLimiter

    fake = FakeRazorpay()
    db_app.state.razorpay = fake
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    return fake


SINGLE = 29_000_00  # tests.test_booking_orders.seeded: ₹20,000 double + ₹9,000 supplement


async def with_addons(db: AsyncSession, package_id: str) -> None:
    for i, (id, basis, price) in enumerate(
        [
            ("Airport transfers", AddonBasis.BOOKING, 1_800_00),
            ("Rafting", AddonBasis.TRAVELLER, 900_00),
            ("Extra night", AddonBasis.NIGHT, 2_200_00),
        ]
    ):
        db.add(
            PackageAddon(
                package_id=package_id,
                name=id,
                price_paise=price,
                basis=basis,
                max_nights=2 if basis == AddonBasis.NIGHT else None,
                position=i,
            )
        )
    await db.commit()


async def addon_ids(db: AsyncSession, package_id: str) -> dict[str, str]:
    rows = await db.execute(
        select(PackageAddon.name, PackageAddon.id).where(PackageAddon.package_id == package_id)
    )
    return {name: id for name, id in rows.all()}


@pytest.mark.db
async def test_quote_hold_and_capture_charge_exactly_the_add_ons_and_every_surface_lists_them(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    pkg, dep = await seeded(db, seats=4)
    pkg_id, dep_id = pkg.id, dep.id
    await with_addons(db, pkg_id)
    ids = await addon_ids(db, pkg_id)
    choices = [
        {"addonId": ids["Rafting"], "travellers": 2},
        {"addonId": ids["Extra night"], "nights": 1},
        {"addonId": ids["Airport transfers"]},
    ]
    extras = 1_800_00 + 2 * 900_00 + 2 * 2_200_00

    quote = {
        "departureId": dep_id,
        "travellers": [{"occupancy": "single"}] * 2,
        "addons": choices,
    }
    quoted = await db_client.post("/bookings/quote", json=quote)
    assert quoted.status_code == 200, quoted.text
    q = quoted.json()
    assert [(a["name"], a["amountPaise"]) for a in q["addons"]] == [
        ("Airport transfers", 1_800_00),
        ("Rafting", 1_800_00),
        ("Extra night", 4_400_00),
    ]
    assert (q["addonsPaise"], q["totalPaise"]) == (extras, 2 * SINGLE + extras)

    body = booking_body(dep_id, 2, email="addons@example.test", phone="9100000077")
    held = await db_client.post("/bookings", json={**body, "addons": choices})
    assert held.status_code == 201, held.text
    order = held.json()
    assert order["amountPaise"] == 2 * SINGLE + extras
    sent = [r for r in rzp.requests if r.url.path == "/v1/orders"]
    assert json.loads(sent[-1].content)["amount"] == 2 * SINGLE + extras  # to the paisa
    ref = order["bookingRef"]
    b = await booking(db, ref)
    rows = (
        (
            await db.execute(
                select(BookingAddon)
                .where(BookingAddon.booking_id == b.id)
                .order_by(BookingAddon.position)
            )
        )
        .scalars()
        .all()
    )
    assert [(r.name, r.travellers, r.nights, r.amount_paise, r.payment_id) for r in rows] == [
        ("Airport transfers", 1, 1, 1_800_00, None),
        ("Rafting", 2, 1, 1_800_00, None),
        ("Extra night", 2, 1, 4_400_00, None),
    ]

    capture = event("payment.captured", order["orderId"], "pay_Addons001", order["amountPaise"])
    assert (await deliver(db_client, capture)).status_code == 200
    paid = await booking(db, ref)
    assert (paid.status.value, paid.paid_paise) == ("confirmed", 2 * SINGLE + extras)

    facts = await load_booking_facts(db, ref)
    assert facts is not None
    assert [a.label for a in facts.addons] == [
        "Airport transfers (per booking)",
        "Rafting (2 travellers)",
        "Extra night (1 night · 2 travellers)",
    ]
    pdf = render_voucher(facts, site_url="https://tripsmith.test", whatsapp_number="919999999999")
    assert pdf.startswith(b"%PDF")
    customer = next(m for m in sender.sent if m.to == "addons@example.test")
    assert "Rafting (2 travellers) · ₹1,800" in customer.text

    owner = await owner_cookie(db)
    manifest = (await db_client.get(f"/admin/departures/{dep_id}/manifest", headers=owner)).json()
    assert manifest["bookings"][0]["addons"][1] == "Rafting (2 travellers)"
    assert manifest["addons"] == [
        {"name": "Airport transfers", "bookings": 1, "travellers": 0},
        {"name": "Rafting", "bookings": 1, "travellers": 2},
        {"name": "Extra night", "bookings": 1, "travellers": 2},
    ]
    records = await desk.csv_records(db, desk.BookingFilters())
    at = desk.CSV_HEADERS.index("Add-ons")  # P5's deposit columns follow
    assert desk.CSV_HEADERS[at : at + 2] == ("Add-ons", "Add-ons (₹)")
    assert records[0][at + 1] == str(extras // 100)
    assert records[0][at].startswith("Airport transfers (per booking) ₹1,800; Rafting")
    history = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()["history"]
    assert any("with Airport transfers (per booking)" in e["text"] for e in history["entries"])


@pytest.mark.db
async def test_a_switched_off_add_on_is_refused_at_quote_and_hold(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    pkg, dep = await seeded(db, seats=4)
    pkg_id, dep_id = pkg.id, dep.id
    await with_addons(db, pkg_id)
    ids = await addon_ids(db, pkg_id)
    transfer = await db.get(PackageAddon, ids["Airport transfers"])
    assert transfer is not None
    transfer.active = False
    await db.commit()
    choice = [{"addonId": ids["Airport transfers"]}]
    quoted = await db_client.post(
        "/bookings/quote",
        json={"departureId": dep_id, "travellers": [{"occupancy": "single"}], "addons": choice},
    )
    assert quoted.status_code == 409
    assert quoted.json()["error"]["reason"] == ADDON_GONE_REASON
    body = booking_body(dep_id, 1, email="off@example.test", phone="9100000078")
    held = await db_client.post("/bookings", json={**body, "addons": choice})
    assert (held.status_code, held.json()["error"]["reason"]) == (409, ADDON_GONE_REASON)
    too_many = await db_client.post(
        "/bookings/quote",
        json={
            "departureId": dep_id,
            "travellers": [{"occupancy": "single"}],
            "addons": [{"addonId": ids["Extra night"], "nights": 5}],
        },
    )
    assert too_many.status_code == 400


@pytest.mark.db
async def test_the_package_form_saves_orders_and_deletes_add_ons_and_bookings_keep_theirs(
    db: AsyncSession, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    created = await svc.create_package(
        db,
        payload(
            destinationId=await goa_id(db),
            addons=[
                {"name": "Kayak", "pricePaise": 1_000_00, "basis": "traveller"},
                {"name": "Night", "pricePaise": 2_000_00, "basis": "night", "maxNights": 2},
            ],
        ),
    )
    assert [(a.name, a.max_nights, a.image_id) for a in created.addons] == [
        ("Kayak", None, None),
        ("Night", 2, None),
    ]
    pkg = (await db.execute(select(Package).where(Package.id == created.id))).scalar_one()
    image = PackageImage(package_id=pkg.id, url="http://localhost/i.jpg", width=1, height=1)
    db.add(image)
    await db.commit()
    image_id = image.id
    kayak, night = created.addons
    base = payload(destinationId=await goa_id(db), expectedEditedAt=created.edited_at)

    def body(addons: list[dict[str, object]]) -> Any:
        return base.model_copy(update={"addons": [AddonInput.model_validate(a) for a in addons]})

    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db,
            created.id,
            body([{"name": "Xy", "pricePaise": 100, "basis": "booking", "imageId": "nope"}]),
        )
    assert exc.value.field_errors == {"addons.0.imageId": svc.FOREIGN_IMAGE}
    await db.rollback()  # as the route's session would be

    updated = await svc.update_package(
        db,
        created.id,
        body(
            [
                {
                    "id": night.id,
                    "name": "Extra night",
                    "pricePaise": 2_500_00,
                    "basis": "night",
                    "maxNights": 3,
                    "imageId": image_id,
                    "active": False,
                },
                {"name": "Transfers", "pricePaise": 1_500_00, "basis": "booking"},
            ]
        ),
    )
    assert [(a.id == night.id, a.name, a.active, a.image_id) for a in updated.addons] == [
        (True, "Extra night", False, image_id),
        (False, "Transfers", True, None),
    ]
    gone = await db.execute(select(PackageAddon).where(PackageAddon.id == kayak.id))
    assert gone.scalar_one_or_none() is None

    with pytest.raises(ApiError) as exc:
        await svc.update_package(
            db,
            created.id,
            body(
                [{"id": "someone-elses", "name": "Xy", "pricePaise": 100, "basis": "booking"}]
            ).model_copy(update={"expected_edited_at": None}),
        )
    assert exc.value.field_errors == {"addons": svc.FOREIGN_ADDON}


@pytest.mark.db
async def test_the_public_page_lists_switched_on_add_ons_and_the_seed_keeps_their_ids(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    page = (await db_client.get("/packages/north-goa-beaches")).json()
    assert [(a["name"], a["basis"], a["maxNights"]) for a in page["addons"]] == [
        ("Airport transfers", "booking", None),
        ("Grande Island snorkelling", "traveller", None),
        ("Calangute parasailing", "traveller", None),
        ("Extra night", "night", 2),
    ]
    assert page["addons"][1]["image"]["alt"] == "Fort Aguada from above with the lighthouse"
    before = {a["name"]: a["id"] for a in page["addons"]}

    snorkel = await db.get(PackageAddon, before["Grande Island snorkelling"])
    assert snorkel is not None
    snorkel.active = False
    await db.commit()
    await seed(db, fixture_content(), RecordingStore(), make_settings())  # a re-seed
    again = (await db_client.get("/packages/north-goa-beaches?fresh=1")).json()
    assert {a["name"]: a["id"] for a in again["addons"]} == before  # back on, same ids
    assert dt.date.fromisoformat(again["departures"][0]["date"])  # the page still reads


@pytest.mark.db
async def test_the_addons_only_seed_touches_nothing_but_add_ons(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pkg = (
        await db.execute(select(Package).where(Package.slug == "north-goa-beaches"))
    ).scalar_one()
    pkg_id = pkg.id
    pkg.name = "North Goa, edited by the owner"
    for a in (
        await db.execute(select(PackageAddon).where(PackageAddon.package_id == pkg_id))
    ).scalars():
        await db.delete(a)
    await db.commit()

    result = await seed_addons(db, fixture_content())
    assert result.counts == {"addons": 4}
    db.expire_all()
    rows = (
        (
            await db.execute(
                select(PackageAddon)
                .where(PackageAddon.package_id == pkg_id)
                .order_by(PackageAddon.position)
            )
        )
        .scalars()
        .all()
    )
    assert [r.name for r in rows] == [
        "Airport transfers",
        "Grande Island snorkelling",
        "Calangute parasailing",
        "Extra night",
    ]
    assert all(r.image_id for r in rows)  # matched to the uploaded gallery by file name
    renamed = await db.get(Package, pkg_id)
    assert renamed is not None and renamed.name == "North Goa, edited by the owner"
