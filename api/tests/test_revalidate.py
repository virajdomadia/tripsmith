"""infra/revalidate.py — POST {WEB_URL}/revalidate after admin mutations (04 §1, S6)."""

import json
import logging

import httpx
import pytest
from pydantic import SecretStr

from app.config import Settings
from app.infra.revalidate import revalidate


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "web_url": "https://tripsmith.example",
        "revalidate_secret": SecretStr("s3cret"),
    }
    base.update(overrides)
    return Settings.model_validate(base)


def _transport(status: int, calls: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, json={"revalidated": ["packages"]})

    return httpx.MockTransport(handler)


async def test_posts_secret_and_tags_to_the_web_revalidate_route() -> None:
    calls: list[httpx.Request] = []

    ok = await revalidate(
        ["packages", "package:goa-3n"], settings=_settings(), transport=_transport(200, calls)
    )

    assert ok is True
    assert len(calls) == 1
    req = calls[0]
    assert req.method == "POST"
    assert str(req.url) == "https://tripsmith.example/revalidate"
    assert json.loads(req.content) == {"secret": "s3cret", "tags": ["packages", "package:goa-3n"]}


async def test_trailing_slash_on_web_url_is_tolerated() -> None:
    calls: list[httpx.Request] = []
    await revalidate(
        ["packages"],
        settings=_settings(web_url="https://tripsmith.example/"),
        transport=_transport(200, calls),
    )
    assert str(calls[0].url) == "https://tripsmith.example/revalidate"


async def test_non_2xx_is_logged_and_returns_false(caplog: pytest.LogCaptureFixture) -> None:
    # A failed revalidation must never fail the admin mutation that triggered it.
    calls: list[httpx.Request] = []
    with caplog.at_level(logging.ERROR):
        ok = await revalidate(["packages"], settings=_settings(), transport=_transport(401, calls))
    assert ok is False
    assert "401" in caplog.text


async def test_network_error_is_logged_and_returns_false(caplog: pytest.LogCaptureFixture) -> None:
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with caplog.at_level(logging.ERROR):
        ok = await revalidate(
            ["packages"], settings=_settings(), transport=httpx.MockTransport(boom)
        )
    assert ok is False
    assert "refused" in caplog.text


async def test_no_secret_configured_skips_with_a_warning(caplog: pytest.LogCaptureFixture) -> None:
    calls: list[httpx.Request] = []
    with caplog.at_level(logging.WARNING):
        ok = await revalidate(
            ["packages"],
            settings=_settings(revalidate_secret=None),
            transport=_transport(200, calls),
        )
    assert ok is False
    assert calls == []
    assert "REVALIDATE_SECRET" in caplog.text


async def test_empty_tag_list_is_a_no_op() -> None:
    calls: list[httpx.Request] = []
    ok = await revalidate([], settings=_settings(), transport=_transport(200, calls))
    assert ok is True
    assert calls == []
