"""Where a destination cover may live — the runtime half of `COVER_URL_PATTERN`
(schemas/catalog.py), checked by the admin routes against the app's own settings.

The pattern stays environment-free (it is the published contract); this narrows it: a
`http://localhost` cover only off Vercel (nobody else could load it), and a Blob cover only
from this deployment's own store once a token is configured — another store's object can
vanish or change under us. Without a token (dev, CI) any `*.public.blob.vercel-storage.com`
host passes, as the pattern says.
"""

from urllib.parse import urlsplit

from app.config import Settings
from app.errors import ApiError
from app.infra.storage import public_host

LOCALHOST_MESSAGE = "Upload the cover image — a localhost URL only works in development"
OTHER_STORE_MESSAGE = "Upload the cover image here — links to other image stores are not used"


def cover_url_problem(url: str, settings: Settings, *, on_vercel: bool) -> str | None:
    """The owner-facing reason `url` is refused, or None when it is fine."""
    host = urlsplit(url).hostname or ""
    if host == "localhost":
        return LOCALHOST_MESSAGE if on_vercel else None
    token = settings.blob_read_write_token
    own = public_host(token.get_secret_value()) if token else None
    if own is not None and host != own:
        return OTHER_STORE_MESSAGE
    return None


def check_cover_url(url: str, settings: Settings, *, on_vercel: bool) -> None:
    """Raise the `validation` envelope under `fieldErrors.coverUrl` when refused."""
    problem = cover_url_problem(url, settings, on_vercel=on_vercel)
    if problem:
        raise ApiError("validation", problem, field_errors={"coverUrl": problem})
