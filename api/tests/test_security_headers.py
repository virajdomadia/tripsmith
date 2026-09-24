"""Defence-in-depth response headers on every api response (H4, docs/12).

The api answers on its own origin (`tripsmith-api.vercel.app`), not only through the web's
`/api/:path*` rewrite, so it carries its own headers rather than relying on the web's.
"""

import logging

import pytest
from httpx import AsyncClient

from app.main import create_app
from tests.settings import make_settings

BASELINE = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
}


@pytest.mark.parametrize("path", ["/health", "/packages", "/openapi.json", "/no-such-route"])
async def test_every_response_carries_the_baseline_headers(client: AsyncClient, path: str) -> None:
    res = await client.get(path)
    for header, value in BASELINE.items():
        assert res.headers[header] == value, f"{path} missing {header}"


async def test_json_routes_get_a_locked_down_csp(client: AsyncClient) -> None:
    csp = (await client.get("/health")).headers["content-security-policy"]
    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp


async def test_docs_csp_allows_the_swagger_bundle(client: AsyncClient) -> None:
    """`/docs` is HTML that loads Swagger UI from jsdelivr — the JSON CSP would blank the page."""
    res = await client.get("/docs")
    assert res.status_code == 200
    csp = res.headers["content-security-policy"]
    assert "https://cdn.jsdelivr.net" in csp
    assert "frame-ancestors 'none'" in csp
    assert "default-src 'none'" not in csp


async def test_unhandled_500s_carry_the_headers_too(client: AsyncClient) -> None:
    """`ServerErrorMiddleware` renders outside the middleware stack — the envelope carries them.

    `/packages` with no DATABASE_URL (the `client` fixture has none) is exactly that path.
    """
    res = await client.get("/packages")
    assert res.status_code == 500 and res.json()["error"]["code"] == "internal"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in res.headers["content-security-policy"]


def test_missing_session_secret_is_reported_on_a_deployment(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """H4: without `SESSION_SECRET` the enquiry IP hash silently degrades to an unkeyed digest.

    Nothing else reads that variable yet, so a deployment missing it would look perfectly healthy.
    The api says so at startup instead — at ERROR, so Sentry's logging integration carries it.
    """
    monkeypatch.setenv("VERCEL", "1")
    with caplog.at_level(logging.ERROR):
        create_app(settings=make_settings(session_secret=None))
    assert any("SESSION_SECRET" in r.message for r in caplog.records)

    caplog.clear()
    with caplog.at_level(logging.ERROR):
        create_app(settings=make_settings(session_secret="set"))
    assert not any("SESSION_SECRET" in r.message for r in caplog.records)


def test_local_runs_are_not_nagged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    with caplog.at_level(logging.ERROR):
        create_app(settings=make_settings(session_secret=None))
    assert not caplog.records
