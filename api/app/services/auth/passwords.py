"""argon2id hashing (argon2-cffi defaults). Verification always runs the full argon2 cost — an
unknown email checks against `DUMMY_HASH` — so timing does not reveal which emails exist."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

hasher = PasswordHasher()

# Hashed once per process; verified whenever there is no real hash to check.
DUMMY_HASH = hasher.hash("tripsmith-no-such-user")


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """True only for a real hash that matches. CPU-bound (~50 ms): call via `asyncio.to_thread`."""
    try:
        hasher.verify(password_hash or DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return bool(password_hash)


def needs_rehash(password_hash: str) -> bool:
    try:
        return hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
