"""argon2id hashing (argon2-cffi defaults). Verification always runs the full argon2 cost — an
unknown email checks against `dummy_hash()` — so timing does not reveal which emails exist."""

import functools

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

hasher = PasswordHasher()


@functools.cache
def dummy_hash() -> str:
    """Hashed once, lazily, on first use — not at import time (~64 MiB of argon2 work on every
    cold start otherwise) — then cached for the life of the process."""
    return hasher.hash("tripsmith-no-such-user")


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """True only for a real hash that matches. CPU-bound (~50 ms): call via `asyncio.to_thread`."""
    try:
        hasher.verify(password_hash or dummy_hash(), password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return bool(password_hash)


def needs_rehash(password_hash: str) -> bool:
    try:
        return hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True
