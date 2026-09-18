"""EnquiryCreate rules (06 A4 / Part D) — the same case file drives the web's zod mirror."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.enquiries import EnquiryCreate, normalise_phone

CASES = json.loads((Path(__file__).parent / "fixtures" / "enquiry_cases.json").read_text("utf-8"))


def expand(body: dict[str, object]) -> dict[str, object]:
    return {k: ("a" * 1001 if v == "@@LONG_1001@@" else v) for k, v in body.items()}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9845022110", "9845022110"),
        ("98450 22110", "9845022110"),
        ("+91 98450-22110", "9845022110"),
        ("09845022110", "9845022110"),
        ("(+91) 98450.22110", "9845022110"),
        ("919845022110", "9845022110"),
        ("12345", "12345"),  # not normalised into something valid
    ],
)
def test_normalise_phone(raw: str, expected: str) -> None:
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("body", CASES["valid"], ids=lambda b: f"{b['type']}:{b['name']}")
def test_valid_cases_parse(body: dict[str, object]) -> None:
    e = EnquiryCreate.model_validate(expand(body))
    assert e.phone == "9845022110"
    assert e.email == e.email.lower().strip()


@pytest.mark.parametrize(
    "case", CASES["invalid"], ids=lambda c: f"{c['field']}:{c['body']['name']}"
)
def test_invalid_cases_name_the_field(case: dict[str, object]) -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryCreate.model_validate(expand(case["body"]))  # type: ignore[arg-type]
    fields = {".".join(str(p) for p in err["loc"]) for err in exc.value.errors()}
    assert case["field"] in fields, fields


def test_contact_drops_a_stray_package_slug_and_custom_keeps_its_fields() -> None:
    contact = EnquiryCreate.model_validate(CASES["valid"][3])
    assert contact.package_slug is None
    custom = EnquiryCreate.model_validate(CASES["valid"][1])
    assert custom.budget_paise == 25_000 * 100
    assert custom.travel_month is not None and custom.travel_month.isoformat() == "2027-01-01"


def test_honeypot_is_a_plain_string_that_defaults_to_empty() -> None:
    e = EnquiryCreate.model_validate({**CASES["valid"][2], "website": "http://spam"})
    assert e.website == "http://spam"
