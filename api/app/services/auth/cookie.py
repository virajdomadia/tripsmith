"""The session cookie (04 §Auth): HttpOnly, SameSite=Lax, Secure on https, host-only.

No `Domain`: the browser receives it from the site origin (the web's route handlers copy the
api's Set-Cookie through), so a host-only cookie is exactly right.
"""

import datetime as dt

from fastapi import Response

from app.config import Settings

COOKIE_NAME = "ts_session"


def _secure(settings: Settings) -> bool:
    return settings.site_url.startswith("https://")


def set_session_cookie(
    response: Response, token: str, expires_at: dt.datetime, settings: Settings
) -> None:
    max_age = max(0, int((expires_at - dt.datetime.now(dt.UTC)).total_seconds()))
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=max_age,
        path="/",
        httponly=True,
        samesite="lax",
        secure=_secure(settings),
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=_secure(settings)
    )
