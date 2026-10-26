"""V7 (Q-2) — the emailed tax invoice's render is bounded by `PDF_RENDER_TIMEOUT`: past it the
email goes without the PDF (logged, never raised); within it the PDF is attached. No database:
the number's issue and the facts read are stubbed, so only the render is timed."""

import logging
import time
from typing import Any, cast

import pytest
from pydantic import ValidationError
from pydantic_settings import SettingsConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.services.gst import files
from app.services.gst.documents import DocRef
from tests.settings import TEST_PDF_RENDER_TIMEOUT, make_settings

NO_DB = cast(AsyncSession, None)


@pytest.fixture
def slow_render(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = cast(DocRef, type("Doc", (), {"number": "TS/26-27/0001"})())

    async def issue(_db: Any, _ref: str, _key: str) -> DocRef:
        return doc

    async def gst_facts(_db: Any, _ref: str, _doc: DocRef) -> Any:
        return object()

    def render(_facts: Any) -> bytes:
        time.sleep(0.3)
        return b"%PDF-slow"

    monkeypatch.setattr(files, "issue", issue)
    monkeypatch.setattr(files, "gst_facts", gst_facts)
    monkeypatch.setattr(files, "render_gst_document", render)


@pytest.mark.usefixtures("slow_render")
async def test_a_render_past_the_timeout_sends_the_email_without_the_invoice(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.ERROR, logger=files.__name__):
        got = await files.invoice_attachment(
            NO_DB, "TB-SLOW01", make_settings(pdf_render_timeout=0.05)
        )
    assert got is None
    assert "could not be issued; emailing without it" in caplog.text


@pytest.mark.usefixtures("slow_render")
async def test_a_render_within_the_timeout_is_attached() -> None:
    got = await files.invoice_attachment(NO_DB, "TB-SLOW01", make_settings(pdf_render_timeout=5))
    assert got is not None and got.content == b"%PDF-slow"


class _OnePayment:
    """Just enough session for `extras_invoice_attachment`'s payment lookup."""

    async def execute(self, _stmt: Any) -> Any:
        return type("Result", (), {"scalar_one_or_none": lambda _self: "pmt_1"})()

    async def rollback(self) -> None:
        return None


@pytest.mark.usefixtures("slow_render")
async def test_the_extras_invoice_is_bounded_by_the_same_setting() -> None:
    db = cast(AsyncSession, _OnePayment())
    late = make_settings(pdf_render_timeout=0.05)
    assert await files.extras_invoice_attachment(db, "TB-SLOW01", "pay_X", late) is None
    got = await files.extras_invoice_attachment(db, "TB-SLOW01", "pay_X", make_settings())
    assert got is not None and got.content == b"%PDF-slow"


class _EnvOnlySettings(Settings):
    model_config = SettingsConfigDict(env_file=None)


def test_the_timeout_is_five_seconds_in_production_and_thirty_in_tests() -> None:
    assert _EnvOnlySettings().pdf_render_timeout == 5.0
    assert make_settings().pdf_render_timeout == TEST_PDF_RENDER_TIMEOUT == 30.0


@pytest.mark.parametrize("bad", ["0", "-1"])
def test_a_timeout_that_is_not_positive_is_refused(
    monkeypatch: pytest.MonkeyPatch, bad: str
) -> None:
    """0 would read as "no bound" in `document_pdf`, and a negative one drops every invoice."""
    monkeypatch.setenv("PDF_RENDER_TIMEOUT", bad)
    with pytest.raises(ValidationError):
        _EnvOnlySettings()
