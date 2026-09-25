"""B3 — the quote to the paisa (04 v2 §4): occupancies, children, the single supplement, the flat
per-traveller deal (on, capped, expired) and the unbookable reasons. Pure, no database."""

import datetime as dt

import pytest

from app.models import Departure, Package
from app.models.enums import Occupancy
from app.schemas.bookings import Quote, QuoteTraveller, UnbookableReason, party_errors
from app.services.booking.pricing import build_quote, unbookable_reason

D, T, S, C = Occupancy.DOUBLE, Occupancy.TRIPLE, Occupancy.SINGLE, Occupancy.CHILD
# 2026-09-25 19:00 UTC is already 00:30 on the 26th in IST: "today" is the 26th.
NOW = dt.datetime(2026, 9, 25, 19, 0, tzinfo=dt.UTC)
DEAL_ENDS = dt.datetime(2026, 9, 30, 18, 29, 59, tzinfo=dt.UTC)  # end of 30 Sep, IST


def departure(**overrides: object) -> Departure:
    fields: dict[str, object] = {
        "id": "dep1",
        "date": dt.date(2026, 11, 14),
        "seats_total": 12,
        "price_double_paise": 24_999_00,
        "price_triple_paise": 22_999_00,
        "price_child_paise": 14_999_00,
        "single_supplement_paise": 8_999_00,
    }
    return Departure(**(fields | overrides))


def package(**overrides: object) -> Package:
    fields: dict[str, object] = {"slug": "munnar"}
    return Package(**(fields | overrides))


DEAL = {"deal_price_paise": 21_999_00, "deal_label": "Monsoon deal", "deal_ends_at": DEAL_ENDS}


def quote(occupancies: list[Occupancy], dep: Departure | None = None, /, **pkg: object) -> Quote:
    travellers = [QuoteTraveller(occupancy=o) for o in occupancies]
    return build_quote(
        dep or departure(), package(**pkg), travellers, seats_left=12, deal_base=24_999_00, now=NOW
    )


def lines(q: Quote) -> list[tuple[str, str, int, int]]:
    return [(li.kind.value, li.occupancy.value, li.count, li.amount_paise) for li in q.lines]


@pytest.mark.parametrize(
    ("party", "expected_lines", "total"),
    [
        ([D, D], [("double", "double", 2, 49_998_00)], 49_998_00),
        (
            [T, T, T, C],
            [("triple", "triple", 3, 68_997_00), ("child", "child", 1, 14_999_00)],
            83_996_00,
        ),
        (
            [S],
            [("single", "single", 1, 24_999_00), ("single_supplement", "single", 1, 8_999_00)],
            33_998_00,
        ),
        (
            [D, D, S, C, C],
            [
                ("double", "double", 2, 49_998_00),
                ("single", "single", 1, 24_999_00),
                ("single_supplement", "single", 1, 8_999_00),
                ("child", "child", 2, 29_998_00),
            ],
            113_994_00,
        ),
    ],
)
def test_prices_without_a_deal(
    party: list[Occupancy], expected_lines: list[tuple[str, str, int, int]], total: int
) -> None:
    q = quote(party)
    assert lines(q) == expected_lines
    assert (q.subtotal_paise, q.discount_paise, q.total_paise) == (total, 0, total)
    assert q.deal is None


def test_a_zero_supplement_adds_no_line() -> None:
    q = quote([S], departure(single_supplement_paise=0))
    assert lines(q) == [("single", "single", 1, 24_999_00)]
    assert q.total_paise == 24_999_00


def test_deal_is_a_flat_amount_off_every_traveller() -> None:
    q = quote([D, D, S, C], **DEAL)
    assert q.deal is not None and q.deal.per_traveller_paise == 3_000_00
    assert lines(q)[-3:] == [
        ("deal", "double", 2, -6_000_00),
        ("deal", "single", 1, -3_000_00),
        ("deal", "child", 1, -3_000_00),
    ]
    assert q.subtotal_paise == 49_998_00 + 24_999_00 + 8_999_00 + 14_999_00
    assert q.discount_paise == 12_000_00
    assert q.total_paise == 98_995_00 - 12_000_00


def test_deal_never_exceeds_a_travellers_own_price() -> None:
    q = quote([D, D, C], departure(price_child_paise=2_000_00), **DEAL)
    assert lines(q)[-2:] == [("deal", "double", 2, -6_000_00), ("deal", "child", 1, -2_000_00)]
    assert q.total_paise == 49_998_00 + 2_000_00 - 8_000_00


def test_deal_ends_at_its_instant_not_after() -> None:
    assert quote([D, D], **(DEAL | {"deal_ends_at": NOW + dt.timedelta(seconds=1)})).deal
    assert quote([D, D], **(DEAL | {"deal_ends_at": NOW})).deal is None
    expired = quote([D, D], **(DEAL | {"deal_ends_at": NOW - dt.timedelta(days=1)}))
    assert expired.deal is None and expired.total_paise == 49_998_00


def test_a_deal_not_below_its_base_price_is_ignored() -> None:
    assert quote([D, D], **(DEAL | {"deal_price_paise": 24_999_00})).deal is None
    assert quote([D, D], **(DEAL | {"deal_price_paise": 0})).deal is None


@pytest.mark.parametrize(
    ("overrides", "seats", "reason"),
    [
        ({}, 12, None),
        ({"price_triple_paise": 0}, 12, UnbookableReason.ON_REQUEST),
        ({"price_child_paise": 0}, 12, UnbookableReason.ON_REQUEST),
        ({"single_supplement_paise": 0}, 12, None),  # a free single room is still priced
        ({"date": dt.date(2026, 9, 28)}, 12, None),  # IST today (26th) + 2
        ({"date": dt.date(2026, 9, 27)}, 12, UnbookableReason.TOO_SOON),
        ({"date": dt.date(2026, 9, 1)}, 12, UnbookableReason.TOO_SOON),  # already left
        ({}, 3, UnbookableReason.SOLD_OUT),  # a party of 4
        ({}, 0, UnbookableReason.SOLD_OUT),
        # On request outranks the date and the seats: the picker shows one reason.
        ({"price_double_paise": 0, "date": dt.date(2026, 9, 27)}, 0, UnbookableReason.ON_REQUEST),
    ],
)
def test_unbookable_reasons(
    overrides: dict[str, object], seats: int, reason: UnbookableReason | None
) -> None:
    assert unbookable_reason(departure(**overrides), seats_left=seats, party=4, now=NOW) == reason


@pytest.mark.parametrize(
    ("party", "ok"),
    [
        ([D, D], True),
        ([S, T, T, T, C], True),
        ([D], False),  # half a double room
        ([T, T], False),
        ([C, C], False),  # no adult
    ],
)
def test_party_rules(party: list[Occupancy], ok: bool) -> None:
    assert (party_errors([QuoteTraveller(occupancy=o) for o in party]) is None) is ok


def test_child_rate_is_for_ages_5_to_11() -> None:
    def err(occ: Occupancy, age: int) -> str | None:
        return party_errors([QuoteTraveller(occupancy=S), QuoteTraveller(occupancy=occ, age=age)])

    assert err(C, 5) is None and err(C, 11) is None
    assert err(C, 4) and err(C, 12)
    assert err(S, 11)  # an 11-year-old in a room of their own pays the child rate
