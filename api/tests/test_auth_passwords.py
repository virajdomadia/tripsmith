"""argon2 verification: constant shape whether or not the user exists (04 §Auth)."""

from app.schemas.auth import LoginRequest
from app.services.auth.passwords import dummy_hash, hash_password, needs_rehash, verify_password


def test_round_trip() -> None:
    h = hash_password("owner-pw-for-tests")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "owner-pw-for-tests")
    assert not verify_password(h, "owner-pw-for-tests2")
    assert not needs_rehash(h)


def test_missing_or_broken_hash_never_verifies() -> None:
    assert not verify_password(None, "anything")
    assert not verify_password("", "anything")
    assert not verify_password("not-a-hash", "anything")
    assert verify_password(None, "x") is False


def test_dummy_hash_is_computed_lazily_and_cached() -> None:
    assert dummy_hash() is dummy_hash()


def test_login_request_normalises_email() -> None:
    req = LoginRequest.model_validate({"email": "  Owner@Tripsmith.DEMO ", "password": "x"})
    assert req.email == "owner@tripsmith.demo"
