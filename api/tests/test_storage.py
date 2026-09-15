"""infra/storage.py — Vercel Blob over its REST API (04 §4)."""

from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.infra.storage import BlobStore, LocalStore, StorageNotConfigured
from tests.settings import make_settings


def _settings(token: str | None = "tok") -> Settings:
    return make_settings(blob_read_write_token=token)


async def test_put_sends_the_documented_headers_and_returns_the_public_url() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"url": "https://x.public.blob.vercel-storage.com/a/b.jpg"})

    store = BlobStore(_settings(), transport=httpx.MockTransport(handler))
    url = await store.put("packages/goa/b.jpg", b"\xff\xd8", "image/jpeg")

    assert url == "https://x.public.blob.vercel-storage.com/a/b.jpg"
    req = calls[0]
    assert req.method == "PUT"
    assert str(req.url) == "https://blob.vercel-storage.com/packages/goa/b.jpg"
    assert req.headers["authorization"] == "Bearer tok"
    assert req.headers["x-api-version"] == "7"
    assert req.headers["x-content-type"] == "image/jpeg"
    assert req.headers["x-add-random-suffix"] == "0"
    assert req.headers["x-allow-overwrite"] == "1"
    assert req.content == b"\xff\xd8"


async def test_put_raises_on_a_non_2xx() -> None:
    store = BlobStore(
        _settings(), transport=httpx.MockTransport(lambda r: httpx.Response(403, text="nope"))
    )
    with pytest.raises(httpx.HTTPStatusError):
        await store.put("x.jpg", b"", "image/jpeg")


def test_blob_store_needs_the_token() -> None:
    with pytest.raises(StorageNotConfigured):
        BlobStore(_settings(None))


async def test_local_store_mirrors_the_object_to_disk_under_its_pathname(tmp_path: Path) -> None:
    # Same pathname semantics as Blob, so the dev server can serve what the seed wrote.
    store = LocalStore(base_url="http://localhost:8000/seed-photos", directory=tmp_path)
    url = await store.put("packages/goa/b.jpg", b"JPEGDATA", "image/jpeg")
    assert url == "http://localhost:8000/seed-photos/packages/goa/b.jpg"
    assert (tmp_path / "packages" / "goa" / "b.jpg").read_bytes() == b"JPEGDATA"
