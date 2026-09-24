"""`check_cover_url` (schemas/catalog.py): the runtime half of COVER_URL_PATTERN — localhost only
off Vercel, and only this deployment's own Blob store once a token is configured."""

import pytest
from pydantic import ValidationError

import app.schemas.catalog as catalog
from app.infra.storage import public_host
from app.schemas.catalog import DestinationInput
from tests.settings import make_settings

OWN = "https://89fzkazlv3xxpipg.public.blob.vercel-storage.com/destinations/uploads/k.jpg"
OTHER = "https://someoneelse.public.blob.vercel-storage.com/destinations/uploads/k.jpg"
LOCAL = "http://localhost:8001/seed-photos/destinations/goa/x.jpg"
# Assembled at runtime so secret scanners don't flag a fake token; the store id is the public
# host prefix (not secret), the rest is made up and contains underscores on purpose.
TOKEN = "_".join(["vercel", "blob", "rw", "89FzKaZLV3xXpiPG", "fake", "secret", "part"])


def payload(cover: str) -> dict[str, object]:
    return {
        "slug": "goa",
        "name": "Goa",
        "tagline": "Beaches and forts",
        "intro": "A long enough intro paragraph about Goa's beaches, forts and food.",
        "coverUrl": cover,
        "region": "West",
        "bestMonths": [11, 12],
    }


@pytest.fixture
def store_token(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = make_settings(blob_read_write_token=TOKEN)
    monkeypatch.setattr(catalog, "get_settings", lambda: settings)


@pytest.fixture
def no_store(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = make_settings()
    monkeypatch.setattr(catalog, "get_settings", lambda: settings)


def test_public_host_is_the_lower_cased_store_id() -> None:
    assert public_host(TOKEN) == "89fzkazlv3xxpipg.public.blob.vercel-storage.com"
    assert public_host("not-a-blob-token") is None
    assert public_host("vercel_blob_rw__secret") is None


@pytest.mark.usefixtures("no_store")
def test_localhost_is_accepted_off_vercel(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    assert DestinationInput.model_validate(payload(LOCAL)).cover_url == LOCAL


@pytest.mark.usefixtures("no_store")
def test_localhost_is_refused_on_vercel(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    with pytest.raises(ValidationError) as exc:
        DestinationInput.model_validate(payload(LOCAL))
    (err,) = exc.value.errors()
    assert err["loc"] == ("coverUrl",) and "localhost" in err["msg"]
    assert DestinationInput.model_validate(payload(OTHER)).cover_url == OTHER  # no token: any store


@pytest.mark.usefixtures("store_token")
def test_with_a_token_only_the_own_store_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    assert DestinationInput.model_validate(payload(OWN)).cover_url == OWN
    with pytest.raises(ValidationError) as exc:
        DestinationInput.model_validate(payload(OTHER))
    assert exc.value.errors()[0]["loc"] == ("coverUrl",)
    with pytest.raises(ValidationError):
        DestinationInput.model_validate(payload("https://evil.example/x.jpg"))  # the pattern
