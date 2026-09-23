"""F21 CSV export: the owner opens this in Excel, so encoding and formula safety are the spec."""

import csv
import datetime as dt
import io

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.schemas.admin_enquiries import EnquiryFilters
from app.services import admin_enquiries as svc
from tests.test_admin_enquiries import make_enquiry, make_package

# --- injection ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("=cmd|'/c calc'!A0", "'=cmd|'/c calc'!A0"),
        ("+1234", "'+1234"),
        ("-1+1", "'-1+1"),
        ("@SUM(A1:A9)", "'@SUM(A1:A9)"),
        ("\tTabbed", "'\tTabbed"),
        ("\rCarriage", "'\rCarriage"),
        ("Priya Sharma", "Priya Sharma"),
        ("₹26,499 please", "₹26,499 please"),
        ("", ""),
        ("Nov 2026", "Nov 2026"),
    ],
)
def test_csv_safe_neutralises_every_formula_prefix(raw: str, expected: str) -> None:
    assert svc.csv_safe(raw) == expected


# --- rendering ------------------------------------------------------------------------------------


def test_the_file_starts_with_a_bom_and_uses_crlf_and_quotes_everything() -> None:
    text = "".join(svc.csv_lines([["TS-AAA111", "Priya, Sharma"]]))
    assert text.startswith("﻿")
    assert text.count("\r\n") == 2  # header + one row
    assert '"TS-AAA111","Priya, Sharma"' in text
    assert '"Ref"' in text and '"Received (IST)"' in text


def test_a_rupee_sign_survives_a_round_trip_through_utf8_sig() -> None:
    text = "".join(svc.csv_lines([["₹26,499", "Priya Sharma"]]))
    decoded = text.encode("utf-8").decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(decoded)))
    assert rows[1] == ["₹26,499", "Priya Sharma"]


def test_the_filename_carries_the_ist_day() -> None:
    name = svc.csv_filename()
    assert name.startswith("tripsmith-enquiries-") and name.endswith(".csv")
    assert svc.ist_today().isoformat() in name


# --- rows -----------------------------------------------------------------------------------------


@pytest.mark.db
async def test_records_render_the_submitted_fields_the_way_a_person_reads_them(
    db: AsyncSession,
) -> None:
    pkg = await make_package(db)
    await make_enquiry(
        db,
        ref="TS-CSV111",
        package_id=pkg.id,
        type=EnquiryType.CUSTOM,
        status=EnquiryStatus.CONTACTED,
        travel_month=dt.date(2026, 11, 1),
        budget_paise=2_500_000,
        adults=2,
        children=1,
        message="Landing at 9 am",
        email_status=EmailStatus.SENT,
    )
    await db.commit()

    (record,) = await svc.csv_records(db, EnquiryFilters())
    row = dict(zip(svc.CSV_HEADERS, record, strict=True))

    assert row["Ref"] == "TS-CSV111"
    assert row["Status"] == "Contacted" and row["Type"] == "Customise"
    assert row["Phone"] == "9845022110"  # ten digits: no `+` for csv_safe to escape
    assert row["Package"] == "North Goa Beaches"
    assert row["Travel month"] == "Nov 2026"
    assert row["Adults"] == "2" and row["Children"] == "1"
    assert row["Budget (₹)"] == "25000"  # rupees, not paise
    assert row["Emails"] == "Sent"
    assert row["Message"] == "Landing at 9 am"


@pytest.mark.db
async def test_records_honour_the_filters_but_not_the_page(db: AsyncSession) -> None:
    for i in range(55):
        await make_enquiry(db, ref=f"TS-C{i:05d}", status=EnquiryStatus.NEW)
    await make_enquiry(db, ref="TS-CLOSED1", status=EnquiryStatus.CLOSED)
    await db.commit()

    everything = await svc.csv_records(db, EnquiryFilters(page=2))
    only_new = await svc.csv_records(db, EnquiryFilters.model_validate({"status": "new"}))

    assert len(everything) == 56  # page is ignored: an export is the whole filtered view
    assert len(only_new) == 55


@pytest.mark.db
async def test_a_dangerous_message_is_escaped_in_the_rendered_row(db: AsyncSession) -> None:
    await make_enquiry(db, ref="TS-EVIL11", message="=cmd|'/c calc'!A0", name="-Bobby")
    await db.commit()

    (record,) = await svc.csv_records(db, EnquiryFilters())
    row = dict(zip(svc.CSV_HEADERS, record, strict=True))

    assert row["Message"].startswith("'=")
    assert row["Name"] == "'-Bobby"
