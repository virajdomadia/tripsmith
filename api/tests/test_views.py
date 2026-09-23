"""POST /views (06 C3): upsert per package per day, bots and unknown slugs dropped, always 204."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PackageView
from app.services.analytics import is_bot, ist_today
from tests.test_enquiries import CountingLimiter, seeded

PHONE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Mobile Safari/537.36"
)


async def rows(db: AsyncSession) -> list[PackageView]:
    return list((await db.execute(select(PackageView))).scalars())


@pytest.mark.parametrize(
    "ua",
    [
        None,
        "",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
        "Mozilla/5.0 (compatible;PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
        "Twitterbot/1.0",
        "WhatsApp/2.23.20.0 A",
        "facebookexternalhit/1.1",
        "curl/8.4.0",
        "python-requests/2.32",
        "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/128.0.0.0 Safari/537.36",
    ],
)
def test_bots_are_recognised(ua: str | None) -> None:
    assert is_bot(ua)


def test_real_browsers_are_not_bots() -> None:
    assert not is_bot(PHONE_UA)
    assert not is_bot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1")
    # Phone makers with "bot" in the model name are visitors, not crawlers.
    assert not is_bot(
        "Mozilla/5.0 (Linux; Android 11; CUBOT KINGKONG 5 Pro) AppleWebKit/537.36 "
        "Chrome/128.0.0.0 Mobile Safari/537.36"
    )


def test_ist_today_rolls_over_at_half_past_six_utc() -> None:
    before = dt.datetime(2026, 9, 21, 18, 29, tzinfo=dt.UTC)  # 23:59 IST
    after = dt.datetime(2026, 9, 21, 18, 31, tzinfo=dt.UTC)  # 00:01 IST next day
    assert ist_today(before) == dt.date(2026, 9, 21)
    assert ist_today(after) == dt.date(2026, 9, 22)


@pytest.mark.db
async def test_two_views_same_day_increment_one_row(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    for _ in range(2):
        res = await db_client.post(
            "/views", json={"slug": "north-goa-beaches"}, headers={"User-Agent": PHONE_UA}
        )
        assert res.status_code == 204, res.text
        assert res.content == b""
        assert res.headers["cache-control"] == "no-store"
    (row,) = await rows(db)
    assert row.count == 2 and row.day == ist_today()


@pytest.mark.db
async def test_packages_count_separately(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    for slug in ("north-goa-beaches", "goa-quiet-escape", "north-goa-beaches"):
        await db_client.post("/views", json={"slug": slug}, headers={"User-Agent": PHONE_UA})
    assert sorted(r.count for r in await rows(db)) == [1, 2]


@pytest.mark.db
async def test_bots_and_unknown_slugs_are_a_silent_204(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    bot = await db_client.post(
        "/views", json={"slug": "north-goa-beaches"}, headers={"User-Agent": "Googlebot/2.1"}
    )
    unknown = await db_client.post(
        "/views", json={"slug": "atlantis"}, headers={"User-Agent": PHONE_UA}
    )
    assert bot.status_code == 204 and unknown.status_code == 204
    assert await rows(db) == []


@pytest.mark.db
async def test_blank_slug_is_a_validation_error(db_client: AsyncClient) -> None:
    res = await db_client.post("/views", json={"slug": ""}, headers={"User-Agent": PHONE_UA})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation"


@pytest.mark.db
async def test_views_are_rate_limited_per_ip(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    """The beacon is the only unauthenticated write with no ceiling (H4, docs/12).

    Over the limit it stays a silent 204 — a beacon the browser fires and forgets has nothing to
    do with a 429, and answering one would tell a prober where the ceiling is.
    """
    await seeded(db)
    limiter = CountingLimiter(limit=2)
    db_app.state.rate_limiter = limiter
    headers = {"User-Agent": PHONE_UA, "X-Forwarded-For": "9.9.9.9"}
    for _ in range(3):
        res = await db_client.post("/views", json={"slug": "north-goa-beaches"}, headers=headers)
        assert res.status_code == 204
    assert limiter.hits == ["views:9.9.9.9"] * 3
    (row,) = await rows(db)
    assert row.count == 2  # the third was dropped

    other = await db_client.post(
        "/views",
        json={"slug": "north-goa-beaches"},
        headers={"User-Agent": PHONE_UA, "X-Forwarded-For": "8.8.8.8"},
    )
    assert other.status_code == 204
    # The row is already in this session's identity map from the read above, and the api updated
    # it on its own session — expire so the assertion reads the database, not the cached object.
    db.expire_all()
    assert (await rows(db))[0].count == 3  # a different address has its own budget


@pytest.mark.db
async def test_bots_never_reach_the_limiter(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    """Crawlers are dropped on the user agent first, so they cost no Upstash quota."""
    await seeded(db)
    limiter = CountingLimiter(limit=2)
    db_app.state.rate_limiter = limiter
    res = await db_client.post(
        "/views", json={"slug": "north-goa-beaches"}, headers={"User-Agent": "Googlebot/2.1"}
    )
    assert res.status_code == 204
    assert limiter.hits == []
