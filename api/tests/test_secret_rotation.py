"""V6 (OP-8): SESSION_SECRET rotation. Everything is signed with SESSION_SECRET; while
SESSION_SECRET_PREVIOUS is set, what the old key signed still verifies — and nothing else."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.signing import keys_of
from app.models.enums import EmailType
from app.services.auth.otp import check_code, issue_code
from app.services.booking import calendar, voucher, waitlist
from app.services.email import unsubscribe
from tests.settings import make_settings

OLD, NEW, STRANGER = "old-key", "new-key", "someone-else"
ROTATING = (NEW, OLD)


def test_keys_of_treats_a_string_as_one_key() -> None:
    assert keys_of("abc") == ("abc",)
    assert keys_of(("a", "", "b")) == ("a", "b")
    assert keys_of(None) == () and keys_of("") == ()


def test_verify_secrets_is_current_then_previous() -> None:
    assert make_settings(session_secret=NEW).verify_secrets() == (NEW,)
    rotating = make_settings(session_secret=NEW, session_secret_previous=OLD)
    assert rotating.verify_secrets() == ROTATING
    # A previous key alone verifies nothing: without SESSION_SECRET nothing is signed either.
    assert make_settings(session_secret_previous=OLD).verify_secrets() == ()
    assert make_settings().verify_secrets() == ()


def _query(path: str) -> tuple[int, str]:
    exp, sig = path.split("?", 1)[1].split("&")
    return int(exp.removeprefix("exp=")), sig.removeprefix("sig=")


def test_voucher_and_calendar_links_signed_by_the_old_key_still_open() -> None:
    exp, sig = _query(voucher.voucher_path("TB-ABC123", OLD) or "")
    assert voucher.link_is_valid("TB-ABC123", exp, sig, ROTATING)
    assert not voucher.link_is_valid("TB-ABC123", exp, sig, NEW)
    assert not voucher.link_is_valid("TB-ABC123", exp, sig, (NEW, STRANGER))

    cal = calendar.calendar_path("TB-ABC123", "ics", OLD, exp=exp) or ""
    exp, sig = _query(cal)
    assert calendar.link_is_valid("TB-ABC123", exp, sig, ROTATING)
    assert not calendar.link_is_valid("TB-ABC123", exp, sig, NEW)


def test_waitlist_and_unsubscribe_tokens_signed_by_the_old_key_still_read() -> None:
    claim = waitlist.claim_token("entry1", 2, OLD) or ""
    assert waitlist.read_token(claim, ROTATING) == ("entry1", 2)
    assert waitlist.read_token(claim, NEW) is None

    unsub = unsubscribe.token_for("A@Example.test", EmailType.REVIEW_REQUEST, OLD) or ""
    assert unsubscribe.read_token(unsub, ROTATING) == ("a@example.test", EmailType.REVIEW_REQUEST)
    assert unsubscribe.read_token(unsub, NEW) is None
    assert unsubscribe.read_token(unsub, ()) is None


@pytest.mark.db
async def test_a_sign_in_code_issued_before_the_rotation_still_signs_in(db: AsyncSession) -> None:
    email = "rotate@example.test"
    issued = await issue_code(db, email, secret=OLD)
    assert not (await check_code(db, email, issued.code, secret=NEW)).ok
    assert (await check_code(db, email, issued.code, secret=ROTATING)).ok
