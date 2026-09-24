"""GET /health and the request-id middleware (S4a)."""

import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from tests.settings import make_settings


async def test_health_returns_ok(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_incoming_request_id_is_echoed(client: AsyncClient) -> None:
    res = await client.get("/health", headers={"X-Request-Id": "abc-123"})
    assert res.headers["x-request-id"] == "abc-123"


async def test_request_id_is_generated_when_absent(client: AsyncClient) -> None:
    res = await client.get("/health")
    generated = res.headers["x-request-id"]
    assert uuid.UUID(generated).version == 4


async def test_module_level_app_exists_for_vercel() -> None:
    # Vercel's FastAPI preset looks for `app` in app/main.py.
    from app.main import app

    assert isinstance(app, FastAPI)


async def test_lifespan_runs_cleanly(app: FastAPI) -> None:
    async with app.router.lifespan_context(app):
        pass


async def test_oversized_or_odd_request_id_is_replaced(client: AsyncClient) -> None:
    # Only a bounded, safe charset is trusted (log/Sentry tag injection otherwise).
    res = await client.get("/health", headers={"X-Request-Id": "x" * 5000})
    assert uuid.UUID(res.headers["x-request-id"]).version == 4
    res = await client.get("/health", headers={"X-Request-Id": "bad id with spaces"})
    assert uuid.UUID(res.headers["x-request-id"]).version == 4


async def test_request_id_allows_safe_punctuation(client: AsyncClient) -> None:
    res = await client.get("/health", headers={"X-Request-Id": "req_1.2-3:abc"})
    assert res.headers["x-request-id"] == "req_1.2-3:abc"


async def test_head_health_is_a_200_with_the_get_headers_and_no_body(client: AsyncClient) -> None:
    get = await client.get("/health")
    head = await client.head("/health")
    assert head.status_code == 200
    assert head.content == b""
    assert head.headers["content-type"] == get.headers["content-type"]
    assert head.headers["content-length"] == get.headers["content-length"]
    assert "x-request-id" in head.headers


async def test_head_on_a_path_without_get_stays_not_found(client: AsyncClient) -> None:
    res = await client.head("/enquiries")
    assert res.status_code == 404 and res.content == b""


async def test_head_on_a_route_that_raises_is_a_bodyless_500(app: FastAPI) -> None:
    """The unhandled-exception envelope is written by Starlette's ServerErrorMiddleware, outside
    every `add_middleware` layer; HEAD-as-GET wraps the finished stack so it drops that body too."""

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("kaboom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        get = await c.get("/boom")
        head = await c.head("/boom")
    assert get.status_code == 500 and get.content
    assert head.status_code == 500 and head.content == b""


def test_sentry_is_initialised_before_the_startup_checks_log(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The limiter / sender / keyed-hash checks log at ERROR for Sentry to carry — only possible
    once `init_sentry` has run."""
    import app.main as main

    order: list[str] = []
    monkeypatch.setattr(main, "init_sentry", lambda s: order.append("sentry"))
    monkeypatch.setattr(main, "build_rate_limiter", lambda s: order.append("limiter"))
    monkeypatch.setattr(main, "build_email_sender", lambda s: order.append("sender"))
    monkeypatch.setattr(main, "_check_keyed_hashing", lambda s: order.append("hashing"))
    main.create_app(settings=make_settings())
    assert order[0] == "sentry" and set(order[1:]) == {"limiter", "sender", "hashing"}
