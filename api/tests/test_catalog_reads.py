"""F1 catalog reads: package detail, departures by month, destinations (06 C1, R4)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package
from app.models.enums import PackageStatus
from app.services.catalog.reads import month_bounds, related_order
from content import load_content
from scripts.seed import seed
from tests.settings import make_settings
from tests.test_catalog import RecordingStore

CACHE = "public, s-maxage=60, stale-while-revalidate=300"


async def seeded(db: AsyncSession) -> None:
    await seed(db, load_content(), RecordingStore(), make_settings())


async def set_status(db: AsyncSession, slug: str, status: PackageStatus) -> None:
    await db.execute(update(Package).where(Package.slug == slug).values(status=status))
    await db.commit()


# --- pure helpers -------------------------------------------------------------------------------


def test_month_bounds_rolls_over_december() -> None:
    assert month_bounds("2026-12") == (dt.date(2026, 12, 1), dt.date(2027, 1, 1))
    assert month_bounds("2026-02") == (dt.date(2026, 2, 1), dt.date(2026, 3, 1))


class P:  # package-like duck for related_order
    def __init__(self, id: str, dest: str, themes: list[str], price: int, name: str = "") -> None:
        self.id = id
        self.destination_id = dest
        self.themes = themes
        self.starting_price_paise = price
        self.name = name or id


def test_related_order_same_destination_then_shared_theme_then_rest_cheapest_first() -> None:
    me = P("me", "goa", ["beach", "family"], 100)
    candidates = [
        me,  # excluded
        P("kerala-family", "kerala", ["family"], 50),
        P("goa-pricey", "goa", ["honeymoon"], 900),
        P("goa-cheap", "goa", ["beach"], 300),
        P("ladakh", "ladakh", ["adventure"], 10),
        P("himachal-beach", "himachal", ["hills", "beach"], 400),
    ]
    assert [p.id for p in related_order(me, candidates)] == [
        "goa-cheap",
        "goa-pricey",
        "kerala-family",
        "himachal-beach",
        "ladakh",
    ]
