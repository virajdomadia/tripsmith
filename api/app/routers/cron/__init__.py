"""Cron endpoints (05 §crons): Vercel calls them on the schedule in api/vercel.json with
`Authorization: Bearer $CRON_SECRET` — set automatically when the env var exists on the
project. Never in the public OpenAPI contract."""

import secrets

from fastapi import Request

from app.errors import ApiError


async def require_cron(request: Request) -> None:
    settings = request.app.state.settings
    expected = settings.cron_secret.get_secret_value() if settings.cron_secret else None
    given = request.headers.get("authorization", "")
    scheme, _, token = given.partition(" ")
    # `.encode()`: compare_digest on `str` requires ASCII-only input and raises `TypeError` on
    # anything else — a non-ASCII bearer token must be a 401, not a 500.
    matches = bool(expected) and secrets.compare_digest(token.encode(), expected.encode())
    if not expected or scheme.lower() != "bearer" or not matches:
        raise ApiError("unauthorized", "Cron secret missing or wrong")
