"""Shared fixtures: a fresh app per test and an in-process httpx client.

`raise_app_exceptions=False` so unhandled errors reach the test as the 500 envelope
(what a real client sees) instead of a traceback out of the transport.
"""

from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def app() -> FastAPI:
    # model_validate skips the env / .env.local sources: Sentry stays off in tests even when
    # the local .env.local carries a real DSN.
    return create_app(settings=Settings.model_validate({}))


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
