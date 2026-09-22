"""Shared `Cache-Control` values (06 §C0/C-REST): public reads are edge-cacheable
(`public, s-maxage=60, stale-while-revalidate=300`); admin and auth responses are never
cached (`no-store`). Every router that sets a `Cache-Control` header imports from here."""

PUBLIC_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300"
NO_STORE = {"Cache-Control": "no-store"}
