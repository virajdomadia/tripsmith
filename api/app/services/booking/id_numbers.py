"""Traveller ID numbers (R49, P9): checked, encrypted at rest, shown masked.

A number is normalised (spaces and hyphens out, upper case), checked against its type's shape
only — no checksums, so the made-up numbers the demo asks for pass — then encrypted with Fernet
under `ID_NUMBER_KEY`. Its last four characters are kept in plain beside it, so every list,
email, CSV and page shows `XXXX XXXX 4821` without decrypting. `reveal` is for the owner's
printable manifest alone.

The key setting may hold several Fernet keys, newest first (MultiFernet): the first encrypts and
any of them decrypts, so a key can be rotated without losing the numbers saved under the old one.
"""

import re
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.config import Settings
from app.errors import ApiError
from app.models.enums import IdType

SHAPES: dict[IdType, tuple[re.Pattern[str], str]] = {
    IdType.AADHAAR: (re.compile(r"\d{12}"), "An Aadhaar number has 12 digits"),
    IdType.PASSPORT: (
        re.compile(r"[A-Z]\d{7}"),
        "A passport number is a letter and 7 digits, like A1234567",
    ),
    IdType.DRIVING_LICENCE: (
        re.compile(r"[A-Z0-9]{10,16}"),
        "A driving licence number has 10–16 letters and digits",
    ),
    IdType.VOTER_ID: (
        re.compile(r"[A-Z]{3}\d{7}"),
        "A voter ID is 3 letters and 7 digits, like ABC1234567",
    ),
}
ID_LABEL = {
    IdType.AADHAAR: "Aadhaar",
    IdType.PASSPORT: "Passport",
    IdType.DRIVING_LICENCE: "Driving licence",
    IdType.VOTER_ID: "Voter ID",
}
NO_KEY = "ID numbers can't be saved right now — the rest of the details can"


@dataclass(frozen=True)
class SealedId:
    enc: str
    last4: str


def normalise(raw: str) -> str:
    return re.sub(r"[\s-]+", "", raw).upper()


def check(id_type: IdType, raw: str) -> str:
    """The normalised number, or the type's shape as a message (ValueError)."""
    number = normalise(raw)
    shape, message = SHAPES[id_type]
    if not shape.fullmatch(number):
        raise ValueError(message)
    return number


def _fernet(settings: Settings) -> MultiFernet | None:
    secret = settings.id_number_key
    keys = [k.strip() for k in secret.get_secret_value().split(",")] if secret else []
    keys = [k for k in keys if k]
    return MultiFernet([Fernet(k.encode()) for k in keys]) if keys else None


def seal(settings: Settings, number: str) -> SealedId:
    """Encrypt an already-checked number; refused (503) when no key is set."""
    fernet = _fernet(settings)
    if fernet is None:
        raise ApiError("internal", NO_KEY, reason="id_key_missing", status=503)
    return SealedId(enc=fernet.encrypt(number.encode()).decode(), last4=number[-4:])


def reveal(settings: Settings, enc: str) -> str | None:
    """The number in full — the owner's printable manifest only. None when it can't be read
    (no key, or a key that's gone)."""
    fernet = _fernet(settings)
    if fernet is None:
        return None
    try:
        return fernet.decrypt(enc.encode()).decode()
    except InvalidToken:
        return None


def masked(id_type: IdType, last4: str) -> str:
    """`XXXX XXXX 4821` for Aadhaar (its printed shape), `XXXX 4821` for the others."""
    return f"XXXX XXXX {last4}" if id_type == IdType.AADHAAR else f"XXXX {last4}"


def spaced(id_type: IdType, number: str) -> str:
    """The full number as it's printed: Aadhaar in groups of four."""
    if id_type == IdType.AADHAAR:
        return " ".join(number[i : i + 4] for i in range(0, len(number), 4))
    return number
