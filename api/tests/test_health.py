"""GET /health and the request-id middleware (S4a)."""

import uuid

from fastapi import FastAPI
from httpx import AsyncClient


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
