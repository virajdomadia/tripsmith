"""B11 — reply from the inbox (R23): subject + body, an optional itinerary PDF of any live
package, the demo-mode redirect, every try kept in the enquiry's thread in order — a failed one
visible with its reason and sendable again — and a first reply moving `new` to `contacted`.
The db tests need TEST_DATABASE_URL."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Enquiry, EnquiryMessage, Package
from app.models.enums import EnquiryStatus, PackageStatus
from app.schemas.admin_enquiries import EnquiryReplyInput
from app.services.enquiry_reply import ERR_OFF, ERR_REJECTED, NOT_A_LIVE_PACKAGE
from tests.test_bookings_desk import owner_cookie
from tests.test_email_send import FakeSender
from tests.test_enquiries import BODY, mailing, seeded, with_pdf
from tests.test_pdf_service import FakeBlobStore

VISITOR = "priya@example.com"
REPLY = {
    "subject": "Your Goa trip — dates and the itinerary",
    "body": "Hi Priya,\n\nThe 14 Nov departure has room for three. Early check-in is fine."
    "\n\nMeera",
}


def test_the_reply_input_is_plain_text() -> None:
    ok = EnquiryReplyInput.model_validate({**REPLY, "packageSlug": "  "})
    assert ok.package_slug is None and ok.body.startswith("Hi Priya,\n\n")
    for bad in (
        {**REPLY, "subject": " "},
        {**REPLY, "subject": "Two\nlines"},
        {**REPLY, "body": ""},
        {**REPLY, "body": "bell\x07"},
        {**REPLY, "subject": "x" * 151},
        {**REPLY, "body": "x" * 5001},
    ):
        with pytest.raises(ValidationError):
            EnquiryReplyInput.model_validate(bad)


async def enquiry(db: AsyncSession, db_app: FastAPI, client: AsyncClient) -> str:
    await seeded(db)
    res = await client.post("/enquiries", json=BODY)
    assert res.status_code == 201, res.text
    return (
        await db.execute(select(Enquiry.id).where(Enquiry.ref == res.json()["ref"]))
    ).scalar_one()


def reply(client: AsyncClient, id: str, owner: dict[str, str], **body: object):  # noqa: ANN201
    return client.post(f"/admin/enquiries/{id}/reply", json={**REPLY, **body}, headers=owner)


@pytest.mark.db
async def test_a_reply_goes_to_the_enquirer_with_the_itinerary_and_marks_it_contacted(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    id = await enquiry(db, db_app, db_client)
    owner = await owner_cookie(db)
    sender = mailing(db_app, FakeSender())
    with_pdf(db_app, FakeBlobStore())

    res = await reply(db_client, id, owner, packageSlug="north-goa-beaches")
    assert res.status_code == 201, res.text
    out = res.json()
    [m] = out["messages"]
    assert (m["subject"], m["body"], m["sent"], m["error"]) == (
        REPLY["subject"],
        REPLY["body"],
        True,
        None,
    )
    assert m["attachment"]["slug"] == "north-goa-beaches"
    assert out["status"] == "contacted"
    assert out["notes"][-1]["body"] == "Status changed from New to Contacted"

    [mail] = sender.sent
    assert (mail.to, mail.subject, mail.reply_to) == (
        VISITOR,
        REPLY["subject"],
        "owner@example.com",
    )
    assert "The 14 Nov departure has room for three." in mail.text
    assert "itinerary is attached" in mail.text
    [pdf] = mail.attachments
    assert pdf.filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert pdf.content.startswith(b"%PDF-")

    # A second reply: the thread keeps both, in order; the status stays contacted, no new note.
    notes = len(out["notes"])
    res = await reply(db_client, id, owner, subject="One more thing")
    out = res.json()
    assert [m["subject"] for m in out["messages"]] == [REPLY["subject"], "One more thing"]
    first, second = out["messages"]
    assert first["sentAt"] <= second["sentAt"] and second["attachment"] is None
    assert len(out["notes"]) == notes
    detail = (await db_client.get(f"/admin/enquiries/{id}", headers=owner)).json()
    assert [m["id"] for m in detail["messages"]] == [first["id"], second["id"]]


@pytest.mark.db
async def test_any_live_package_can_be_attached_and_nothing_else(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    id = await enquiry(db, db_app, db_client)
    owner = await owner_cookie(db)
    sender = mailing(db_app, FakeSender())
    with_pdf(db_app, FakeBlobStore())
    other = (
        await db.execute(
            select(Package.slug, Package.name).where(
                Package.status == PackageStatus.LIVE, Package.slug != "north-goa-beaches"
            )
        )
    ).first()
    assert other is not None
    res = await reply(db_client, id, owner, packageSlug=other.slug)
    assert res.status_code == 201, res.text
    assert res.json()["messages"][0]["attachment"] == {"slug": other.slug, "name": other.name}
    assert sender.sent[0].attachments[0].filename == f"Tripsmith-{other.slug}-itinerary.pdf"

    sender.sent.clear()
    await db.execute(update(Package).where(Package.slug == other.slug).values(status="draft"))
    await db.commit()
    for slug in (other.slug, "no-such-trip"):
        res = await reply(db_client, id, owner, packageSlug=slug)
        assert res.status_code == 400
        assert res.json()["error"]["fieldErrors"]["packageSlug"] == NOT_A_LIVE_PACKAGE
    assert sender.sent == []
    count = select(func.count()).select_from(EnquiryMessage)
    assert (await db.execute(count)).scalar_one() == 1


@pytest.mark.db
async def test_demo_mode_redirects_the_reply_to_the_owner_inbox(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    id = await enquiry(db, db_app, db_client)
    owner = await owner_cookie(db)
    sender = mailing(db_app, FakeSender(), email_from="Tripsmith <onboarding@resend.dev>")
    res = await reply(db_client, id, owner)
    assert res.status_code == 201 and res.json()["messages"][0]["sent"] is True
    [mail] = sender.sent
    assert mail.to == "owner@example.com"
    assert mail.subject == f"[Test → {VISITOR}] {REPLY['subject']}"


@pytest.mark.db
async def test_a_failed_send_is_logged_and_can_be_sent_again(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    id = await enquiry(db, db_app, db_client)
    owner = await owner_cookie(db)
    mailing(db_app, FakeSender(fail_for=frozenset({VISITOR})))
    res = await reply(db_client, id, owner)
    assert res.status_code == 201, res.text
    out = res.json()
    [m] = out["messages"]
    assert (m["sent"], m["error"]) == (False, ERR_REJECTED)
    assert out["status"] == "new"  # nothing reached the customer

    sender = mailing(db_app, FakeSender())
    res = await db_client.post(f"/admin/enquiries/{id}/messages/{m['id']}/resend", headers=owner)
    assert res.status_code == 200, res.text
    out = res.json()
    [again] = out["messages"]
    assert (again["id"], again["sent"], again["error"]) == (m["id"], True, None)
    assert again["sentAt"] >= m["sentAt"]
    assert out["status"] == "contacted"
    assert [x.subject for x in sender.sent] == [REPLY["subject"]]

    res = await db_client.post(f"/admin/enquiries/{id}/messages/{m['id']}/resend", headers=owner)
    assert res.status_code == 409 and res.json()["error"]["reason"] == "sent"
    res = await db_client.post(f"/admin/enquiries/{id}/messages/nope/resend", headers=owner)
    assert res.status_code == 404


@pytest.mark.db
async def test_email_switched_off_is_a_visible_failure_and_status_is_kept(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    id = await enquiry(db, db_app, db_client)
    owner = await owner_cookie(db)
    await db.execute(update(Enquiry).where(Enquiry.id == id).values(status=EnquiryStatus.CLOSED))
    await db.commit()
    mailing(db_app, FakeSender(off=True))
    out = (await reply(db_client, id, owner)).json()
    assert (out["messages"][0]["sent"], out["messages"][0]["error"]) == (False, ERR_OFF)
    mailing(db_app, FakeSender())
    out = (await reply(db_client, id, owner)).json()
    assert out["messages"][1]["sent"] is True
    assert out["status"] == "closed"  # only `new` moves on a reply


@pytest.mark.db
async def test_reply_routes_are_owner_only(db: AsyncSession, db_client: AsyncClient) -> None:
    assert (await db_client.post("/admin/enquiries/x/reply", json=REPLY)).status_code == 401
    res = await db_client.post("/admin/enquiries/x/messages/y/resend")
    assert res.status_code == 401
    owner = await owner_cookie(db)
    assert (await reply(db_client, "missing", owner)).status_code == 404


@pytest.mark.db
async def test_send_again_goes_without_a_pdf_that_can_no_longer_be_made(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    id = await enquiry(db, db_app, db_client)
    owner = await owner_cookie(db)
    mailing(db_app, FakeSender(fail_for=frozenset({VISITOR})))
    with_pdf(db_app, FakeBlobStore())
    out = (await reply(db_client, id, owner, packageSlug="north-goa-beaches")).json()
    [m] = out["messages"]
    assert m["sent"] is False and m["attachment"]["slug"] == "north-goa-beaches"
    await db.execute(
        update(Package).where(Package.slug == "north-goa-beaches").values(status="draft")
    )
    await db.commit()
    sender = mailing(db_app, FakeSender())
    res = await db_client.post(f"/admin/enquiries/{id}/messages/{m['id']}/resend", headers=owner)
    assert res.status_code == 200, res.text
    [again] = res.json()["messages"]
    assert (again["sent"], again["attachment"]) == (True, None)
    assert sender.sent[0].attachments == ()
