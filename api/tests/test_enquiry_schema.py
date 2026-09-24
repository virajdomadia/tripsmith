"""EnquiryCreate rules (06 A4 / Part D) — the same case file drives the web's zod mirror."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.enquiries import NAME_CONTROL_MESSAGE, EnquiryCreate, normalise_phone

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


def test_unicode_digits_are_not_a_phone_number() -> None:
    arabic_indic = "9" + "".join(chr(0x0660 + d) for d in range(1, 10))
    with pytest.raises(ValidationError):
        EnquiryCreate.model_validate({**CASES["valid"][2], "phone": arabic_indic})


def test_travel_month_accepts_a_full_date_as_the_contract_documents() -> None:
    e = EnquiryCreate.model_validate({**CASES["valid"][2], "travelMonth": "2026-11-20"})
    assert e.travel_month is not None and e.travel_month.isoformat() == "2026-11-01"


def test_budget_accepts_what_a_number_input_can_post() -> None:
    e = EnquiryCreate.model_validate({**CASES["valid"][1], "budget": "1e3"})
    assert e.budget_paise == 100_000


@pytest.mark.parametrize("budget", ["inf", "-inf", "nan", "1e400", float("inf"), 10**400])
def test_a_non_finite_budget_is_a_field_error_not_a_500(budget: object) -> None:
    with pytest.raises(ValidationError) as err:
        EnquiryCreate.model_validate({**CASES["valid"][1], "budget": budget})
    assert "Enter a budget in rupees" in str(err.value)


def test_a_json_budget_of_1e400_is_a_field_error() -> None:
    body = json.dumps(CASES["valid"][1]).rstrip("}") + ', "budget": 1e400}'
    with pytest.raises(ValidationError) as err:
        EnquiryCreate.model_validate_json(body)
    assert "Enter a budget in rupees" in str(err.value)


def test_honeypot_is_a_plain_string_that_defaults_to_empty() -> None:
    e = EnquiryCreate.model_validate({**CASES["valid"][2], "website": "http://spam"})
    assert e.website == "http://spam"


@pytest.mark.parametrize(
    "name", ["Priya\r\nBcc: x@evil.test", "Priya\nSharma", "Pri\x00ya", "Priya\u2028S"]
)
def test_a_name_is_one_line_with_a_friendly_message(name: str) -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryCreate.model_validate({**CASES["valid"][2], "name": name})
    (err,) = exc.value.errors()
    assert err["loc"] == ("name",)
    assert NAME_CONTROL_MESSAGE in err["msg"]


def test_surrounding_newlines_are_trimmed_not_rejected() -> None:
    e = EnquiryCreate.model_validate({**CASES["valid"][2], "name": "\r\n Sneha Iyer \n"})
    assert e.name == "Sneha Iyer"
