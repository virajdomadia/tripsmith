"""Vercel Blob over its REST API — there is no official Python SDK (04 §4).

`BlobStore.put` uploads one public object and returns its URL. `LocalStore` is the seed's
`--local` mode: no upload, just a URL the dev server can serve.
"""

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


class LocalStore:
    def __init__(self, base_url: str):
        self._base = base_url.rstrip("/")

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        return f"{self._base}/{pathname}"
