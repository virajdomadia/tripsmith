"""Business facts the emails print — must agree with web/src/lib/business.ts."""

import pytest

from app.business import BUSINESS, whatsapp_href
from tests.test_config import EnvOnlySettings


def test_business_facts_match_the_web() -> None:
    assert BUSINESS["name"] == "Tripsmith"
    assert BUSINESS["phone_display"] == "+91 98450 12345"
    assert BUSINESS["phone_e164"] == "+919845012345"
    assert BUSINESS["hours"] == "10 am – 8 pm, every day"
    assert BUSINESS["callback_promise"] == "A person calls you back within two hours"


def test_whatsapp_href_encodes_the_text() -> None:
    assert whatsapp_href("919845012345") == "https://wa.me/919845012345"
    assert (
        whatsapp_href("919845012345", "Hi Tripsmith, enquiry TS-ABC234")
        == "https://wa.me/919845012345?text=Hi%20Tripsmith%2C%20enquiry%20TS-ABC234"
    )


def test_whatsapp_number_setting_defaults_to_the_web_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("WHATSAPP_NUMBER", raising=False)
    assert EnvOnlySettings().whatsapp_number == "919845012345"
