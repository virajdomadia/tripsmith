"""Vercel Blob over its REST API — there is no official Python SDK (04 §4).

`BlobStore.put` uploads one public object and returns its URL. `LocalStore` is the seed's
`--local` mode: objects are mirrored to `api/.seed-photos/` and served by the dev api.
"""

from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings

BLOB_API = "https://blob.vercel-storage.com"
TIMEOUT_SECONDS = 60.0


class StorageNotConfigured(RuntimeError):
    pass


class Store(Protocol):
    async def put(self, pathname: str, data: bytes, content_type: str) -> str: ...


class BlobStore:
    def __init__(self, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None):
        if settings.blob_read_write_token is None:
            raise StorageNotConfigured("BLOB_READ_WRITE_TOKEN is not set")
        self._token = settings.blob_read_write_token.get_secret_value()
        self._transport = transport

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        headers = {
            "Authorization": f"Bearer {self._token}",
            "x-api-version": "7",
            "x-content-type": content_type,
            "x-add-random-suffix": "0",  # stable, predictable pathnames
            "x-allow-overwrite": "1",  # re-seeding overwrites in place
        }
        async with httpx.AsyncClient(transport=self._transport, timeout=TIMEOUT_SECONDS) as client:
            res = await client.put(f"{BLOB_API}/{pathname}", content=data, headers=headers)
        res.raise_for_status()
        return str(res.json()["url"])


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
