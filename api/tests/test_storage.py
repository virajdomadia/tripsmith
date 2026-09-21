"""infra/storage.py — Vercel Blob over its REST API (04 §4)."""

from pathlib import Path

import httpx
import pytest

from app.config import Settings
from app.infra.storage import (
    LIST_MAX_PAGES,
    BlobInfo,
    BlobStore,
    LocalStore,
    StorageNotConfigured,
    build_store,
)
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


async def test_list_follows_the_cursor_and_returns_pathnames() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.params.get("cursor") == "c1":
            return httpx.Response(
                200,
                json={
                    "blobs": [
                        {
                            "url": "https://x/pdf/b/2/f.pdf",
                            "pathname": "pdf/b/2/f.pdf",
                            "size": 2,
                        }
                    ],
                    "hasMore": False,
                },
            )
        return httpx.Response(
            200,
            json={
                "blobs": [
                    {
                        "url": "https://x/pdf/a/1/f.pdf",
                        "pathname": "pdf/a/1/f.pdf",
                        "size": 1,
                    }
                ],
                "cursor": "c1",
                "hasMore": True,
            },
        )

    store = BlobStore(_settings(), transport=httpx.MockTransport(handler))
    blobs = await store.list("pdf/")

    assert blobs == [
        BlobInfo(url="https://x/pdf/a/1/f.pdf", pathname="pdf/a/1/f.pdf", size=1),
        BlobInfo(url="https://x/pdf/b/2/f.pdf", pathname="pdf/b/2/f.pdf", size=2),
    ]
    first = calls[0]
    assert first.method == "GET" and str(first.url).startswith("https://blob.vercel-storage.com/?")
    assert first.url.params["prefix"] == "pdf/" and first.url.params["limit"] == "1000"
    assert first.headers["authorization"] == "Bearer tok"
    assert first.headers["x-api-version"] == "7"
    assert calls[1].url.params["cursor"] == "c1"


async def test_delete_posts_urls_in_batches_and_skips_empty() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={})

    store = BlobStore(_settings(), transport=httpx.MockTransport(handler))
    await store.delete([])
    assert calls == []
    await store.delete([f"https://x/{i}" for i in range(150)])
    assert [c.method for c in calls] == ["POST", "POST"]
    assert str(calls[0].url) == "https://blob.vercel-storage.com/delete"
    assert calls[0].headers["content-type"] == "application/json"
    import json

    assert len(json.loads(calls[0].content)["urls"]) == 100
    assert len(json.loads(calls[1].content)["urls"]) == 50


async def test_list_raises_on_a_non_2xx() -> None:
    store = BlobStore(
        _settings(), transport=httpx.MockTransport(lambda r: httpx.Response(500, text="x"))
    )
    with pytest.raises(httpx.HTTPStatusError):
        await store.list("pdf/")


async def test_list_stops_after_the_page_cap_and_raises() -> None:
    """A `hasMore: true` that never clears (a broken or malicious endpoint) must not spin the
    request forever."""
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"blobs": [], "cursor": "c", "hasMore": True})

    store = BlobStore(_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError, match="did not terminate"):
        await store.list("pdf/")
    assert calls == LIST_MAX_PAGES


def test_build_store_is_none_without_a_token() -> None:
    assert build_store(_settings(None)) is None
    assert isinstance(build_store(_settings()), BlobStore)
