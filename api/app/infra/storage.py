"""Vercel Blob over its REST API — there is no official Python SDK (04 §4).

`BlobStore.put` uploads one public object and returns its URL; `list` / `delete` serve the PDF
cache (services/pdf). `LocalStore` is the seed's `--local` mode: objects are mirrored to
`api/.seed-photos/` and served by the dev api. `build_store` is what the app mounts on
`app.state.store` — None without a token, and every caller degrades gracefully.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings

BLOB_API = "https://blob.vercel-storage.com"
TIMEOUT_SECONDS = 60.0  # the seed's uploads
APP_TIMEOUT_SECONDS = 10.0  # inside a request
LIST_PAGE = 1000
LIST_MAX_PAGES = 100  # a `hasMore: true` that never clears must not spin the request forever
DELETE_BATCH = 100


class StorageNotConfigured(RuntimeError):
    pass


class Store(Protocol):
    async def put(self, pathname: str, data: bytes, content_type: str) -> str: ...


@dataclass(frozen=True)
class BlobInfo:
    url: str
    pathname: str
    size: int


class BlobStore:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = TIMEOUT_SECONDS,
    ):
        if settings.blob_read_write_token is None:
            raise StorageNotConfigured("BLOB_READ_WRITE_TOKEN is not set")
        self._token = settings.blob_read_write_token.get_secret_value()
        self._transport = transport
        self._timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "x-api-version": "7"}

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self._transport, timeout=self._timeout)

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        headers = {
            **self._headers(),
            "x-content-type": content_type,
            "x-add-random-suffix": "0",  # stable, predictable pathnames
            "x-allow-overwrite": "1",  # re-seeding overwrites in place
        }
        async with self._client() as client:
            res = await client.put(f"{BLOB_API}/{pathname}", content=data, headers=headers)
        res.raise_for_status()
        return str(res.json()["url"])

    async def list(self, prefix: str) -> list[BlobInfo]:
        """Every object under `prefix`, following the cursor, capped at `LIST_MAX_PAGES`."""
        out: list[BlobInfo] = []
        cursor: str | None = None
        async with self._client() as client:
            for _ in range(LIST_MAX_PAGES):
                params = {"prefix": prefix, "limit": str(LIST_PAGE)}
                if cursor:
                    params["cursor"] = cursor
                res = await client.get(
                    f"{BLOB_API}/",
                    params=params,
                    headers=self._headers(),
                )
                res.raise_for_status()
                body = res.json()
                out.extend(
                    BlobInfo(
                        url=str(b["url"]),
                        pathname=str(b["pathname"]),
                        size=int(b.get("size", 0)),
                    )
                    for b in body.get("blobs", [])
                )
                cursor = body.get("cursor") if body.get("hasMore") else None
                if not cursor:
                    return out
        raise RuntimeError("Blob list did not terminate")

    async def delete(self, urls: Sequence[str]) -> None:
        if not urls:
            return
        async with self._client() as client:
            for i in range(0, len(urls), DELETE_BATCH):
                res = await client.post(
                    f"{BLOB_API}/delete",
                    json={"urls": list(urls[i : i + DELETE_BATCH])},
                    headers=self._headers(),
                )
                res.raise_for_status()


def public_host(token: str) -> str | None:
    """The host this store serves public objects from, derived from its read-write token:
    `vercel_blob_rw_<storeId>_<secret>` → `<storeid>.public.blob.vercel-storage.com` (the same
    split @vercel/blob does for the store id). None for a token not in that shape."""
    parts = token.split("_", 4)
    if len(parts) != 5 or parts[:3] != ["vercel", "blob", "rw"] or not parts[3].isalnum():
        return None
    return f"{parts[3].lower()}.public.blob.vercel-storage.com"


def build_store(settings: Settings) -> BlobStore | None:
    if settings.blob_read_write_token is None:
        return None
    return BlobStore(settings, timeout=APP_TIMEOUT_SECONDS)


# Dev mirror of the Blob store: the seed writes objects here and the api mounts it at /seed-photos.
LOCAL_STORE_DIR = Path(__file__).resolve().parents[2] / ".seed-photos"


class LocalStore:
    def __init__(self, base_url: str, directory: Path = LOCAL_STORE_DIR):
        self._base = base_url.rstrip("/")
        self._dir = directory

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        target = self._dir / pathname
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return f"{self._base}/{pathname}"
