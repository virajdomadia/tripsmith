"""argon2 verification: constant shape whether or not the user exists (04 §Auth)."""

from app.schemas.auth import LoginRequest
from app.services.auth.passwords import hash_password, needs_rehash, verify_password


def test_round_trip() -> None:
    h = hash_password("demo-fd8c57c3")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "demo-fd8c57c3")
    assert not verify_password(h, "demo-fd8c57c4")
    assert not needs_rehash(h)


def test_missing_or_broken_hash_never_verifies() -> None:
    assert not verify_password(None, "anything")
    assert not verify_password("", "anything")
    assert not verify_password("not-a-hash", "anything")


def test_login_request_normalises_email() -> None:
    req = LoginRequest.model_validate({"email": "  Owner@Tripsmith.DEMO ", "password": "x"})
    assert req.email == "owner@tripsmith.demo"
