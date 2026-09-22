"""F21 enquiries inbox: schemas, service and `/admin/enquiries*` routes (06 §A4, §C-REST)."""

import datetime as dt

import pytest
from pydantic import ValidationError

from app.models.enums import EnquiryStatus
from app.schemas.admin_enquiries import EnquiryFilters, EnquiryNoteInput, EnquiryStatusInput

# --- filters --------------------------------------------------------------------------------------


def test_filters_default_to_the_unfiltered_first_page() -> None:
    f = EnquiryFilters()
    assert f.page == 1
    assert (f.status, f.type, f.package_id, f.from_, f.to, f.q) == (None,) * 6


def test_filters_read_the_wire_names() -> None:
    f = EnquiryFilters.model_validate(
        {
            "status": "new",
            "type": "custom",
            "packageId": "pkg_1",
            "from": "2026-09-01",
            "to": "2026-09-30",
            "q": "Priya",
            "page": "3",
        }
    )
    assert f.status == EnquiryStatus.NEW
    assert f.package_id == "pkg_1"
    assert f.from_ == dt.date(2026, 9, 1) and f.to == dt.date(2026, 9, 30)
    assert f.page == 3


def test_filters_reject_a_backwards_date_range_under_the_to_field() -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryFilters.model_validate({"from": "2026-09-30", "to": "2026-09-01"})
    assert exc.value.errors()[0]["loc"] == ("to",)


def test_filters_reject_nonsense_values() -> None:
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"status": "archived"})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"page": 0})
    with pytest.raises(ValidationError):
        EnquiryFilters.model_validate({"q": "x" * 81})


# --- writes ---------------------------------------------------------------------------------------


def test_status_input_takes_the_four_v1_statuses() -> None:
    assert EnquiryStatusInput.model_validate({"status": "converted"}).status == (
        EnquiryStatus.CONVERTED
    )


def test_note_input_strips_and_refuses_an_empty_body() -> None:
    assert EnquiryNoteInput.model_validate({"body": "  Called back  "}).body == "Called back"
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "   "})
    with pytest.raises(ValidationError):
        EnquiryNoteInput.model_validate({"body": "x" * 2001})
