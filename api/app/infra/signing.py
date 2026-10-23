"""The keys a signature is checked against (V6, OP-8).

Links and codes are always signed with `SESSION_SECRET`. During a rotation the old value sits
in `SESSION_SECRET_PREVIOUS`, so a link mailed yesterday still opens; verifiers take either a
single key (tests, local dev) or the tuple `Settings.verify_secrets()` returns.
"""

Keys = str | tuple[str, ...] | None


def keys_of(secret: Keys) -> tuple[str, ...]:
    """Non-empty keys, newest first. A bare `str` is one key, never a sequence of characters."""
    if secret is None:
        return ()
    if isinstance(secret, str):
        return (secret,) if secret else ()
    return tuple(k for k in secret if k)
