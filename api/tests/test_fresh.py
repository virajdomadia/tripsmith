"""`?fresh=1` forces `Cache-Control: no-store` on GET/HEAD (`FreshQueryMiddleware`, docs/06),
so the web's tag-revalidated reads (`web/src/lib/api.ts`) skip the api's Vercel edge cache.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_enquiries import seeded

PUBLIC_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300"


async def test_meta_with_fresh_is_no_store(client: AsyncClient) -> None:
    res = await client.get("/meta?fresh=1")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"


async def test_meta_without_fresh_keeps_the_public_header(client: AsyncClient) -> None:
    res = await client.get("/meta")
    assert res.status_code == 200
    assert res.headers["cache-control"] == PUBLIC_CACHE_CONTROL


@pytest.mark.db
async def test_packages_search_with_fresh_is_no_store(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/packages?fresh=1&destination=goa")

    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    # The query model (`SearchParams`, no `extra="forbid"`) ignores the unknown `fresh` key
    # rather than rejecting it, so the caller's own filter still applies.
    assert res.json()["total"] == 2


@pytest.mark.db
async def test_destination_detail_with_fresh_is_no_store(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/destinations/goa?fresh=1")

    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"


@pytest.mark.db
async def test_post_with_fresh_is_unaffected(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)

    res = await db_client.post(
        "/views?fresh=1",
        json={"slug": "north-goa-beaches"},
        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)"},
    )

    # /views already answers with its own no-store; `fresh` is a GET/HEAD-only concern, so this
    # just confirms a POST's headers are untouched by the middleware either way.
    assert res.status_code == 204
    assert res.headers["cache-control"] == "no-store"


async def test_health_with_fresh_is_still_ok(client: AsyncClient) -> None:
    res = await client.get("/health?fresh=1")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
