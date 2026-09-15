"""Error envelope `{ error: { code, message, fieldErrors? } }` (docs/06 Part C0).

Product routes are never faked here: each case registers a throwaway route on the
per-test app, so the tests exercise the real handlers wired by create_app().
"""

from fastapi import FastAPI, HTTPException
from httpx import AsyncClient
from pydantic import BaseModel

from app.errors import ApiError


async def test_unknown_route_is_not_found_envelope(client: AsyncClient) -> None:
    res = await client.get("/definitely-not-a-route")
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "not_found", "message": "Not Found"}}


async def test_wrong_method_is_not_found_envelope(client: AsyncClient) -> None:
    # 405 is not one of the seven codes; a route that does not exist for this method
    # is reported as not_found so the contract stays closed.
    res = await client.post("/health")
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "not_found", "message": "Not Found"}}
    assert "allow" not in res.headers


async def test_validation_error_envelope_with_field_errors(
    app: FastAPI, client: AsyncClient
) -> None:
    @app.get("/_test/validation")
    async def _route(n: int) -> dict[str, int]:
        return {"n": n}

    res = await client.get("/_test/validation", params={"n": "not-a-number"})
    assert res.status_code == 400
    body = res.json()
    assert body["error"]["code"] == "validation"
    assert body["error"]["message"]
    assert list(body["error"]["fieldErrors"]) == ["n"]
    assert isinstance(body["error"]["fieldErrors"]["n"], str)


async def test_validation_field_errors_use_dotted_body_paths(
    app: FastAPI, client: AsyncClient
) -> None:
    class Day(BaseModel):
        title: str

    class Body(BaseModel):
        itinerary: list[Day]

    @app.post("/_test/body")
    async def _route(body: Body) -> dict[str, int]:
        return {"days": len(body.itinerary)}

    res = await client.post(
        "/_test/body",
        json={"itinerary": [{"title": "a"}, {"title": "b"}, {"nope": 1}]},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation"
    assert list(res.json()["error"]["fieldErrors"]) == ["itinerary.2.title"]


async def test_api_error_is_rendered_as_envelope(app: FastAPI, client: AsyncClient) -> None:
    @app.get("/_test/conflict")
    async def _route() -> None:
        raise ApiError("conflict", "Slug already taken", field_errors={"slug": "taken"})

    res = await client.get("/_test/conflict")
    assert res.status_code == 409
    assert res.json() == {
        "error": {
            "code": "conflict",
            "message": "Slug already taken",
            "fieldErrors": {"slug": "taken"},
        }
    }


async def test_api_error_omits_field_errors_when_none(app: FastAPI, client: AsyncClient) -> None:
    @app.get("/_test/forbidden")
    async def _route() -> None:
        raise ApiError("forbidden", "Owner only")

    res = await client.get("/_test/forbidden")
    assert res.status_code == 403
    assert res.json() == {"error": {"code": "forbidden", "message": "Owner only"}}


def test_every_code_maps_to_its_documented_status() -> None:
    assert ApiError("validation", "x").status == 400
    assert ApiError("unauthorized", "x").status == 401
    assert ApiError("forbidden", "x").status == 403
    assert ApiError("not_found", "x").status == 404
    assert ApiError("conflict", "x").status == 409
    assert ApiError("rate_limited", "x").status == 429
    assert ApiError("internal", "x").status == 500


async def test_http_exception_404_becomes_not_found(app: FastAPI, client: AsyncClient) -> None:
    @app.get("/_test/missing")
    async def _route() -> None:
        raise HTTPException(status_code=404, detail="Package not found")

    res = await client.get("/_test/missing")
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "not_found", "message": "Package not found"}}


async def test_unhandled_exception_is_internal_without_leaking(
    app: FastAPI, client: AsyncClient
) -> None:
    @app.get("/_test/boom")
    async def _route() -> None:
        raise RuntimeError("database password is hunter2")

    res = await client.get("/_test/boom", headers={"X-Request-Id": "trace-me"})
    assert res.status_code == 500
    assert res.json() == {"error": {"code": "internal", "message": "Internal server error"}}
    assert "hunter2" not in res.text
    assert res.headers["x-request-id"] == "trace-me"


async def test_http_exception_500_never_leaks_detail(app: FastAPI, client: AsyncClient) -> None:
    @app.get("/_test/http500")
    async def _route() -> None:
        raise HTTPException(status_code=500, detail="db password is hunter2")

    res = await client.get("/_test/http500")
    assert res.status_code == 500
    assert res.json() == {"error": {"code": "internal", "message": "Internal server error"}}


async def test_unmapped_4xx_keeps_status_and_headers(app: FastAPI, client: AsyncClient) -> None:
    # e.g. Starlette's 413 from RequestBodyLimitMiddleware once image upload sets max_body_size
    @app.get("/_test/too-large")
    async def _route() -> None:
        raise HTTPException(status_code=413, detail="Too large", headers={"Retry-After": "1"})

    res = await client.get("/_test/too-large")
    assert res.status_code == 413
    assert res.json() == {"error": {"code": "validation", "message": "Too large"}}
    assert res.headers["retry-after"] == "1"


async def test_invalid_json_body_is_keyed_body(app: FastAPI, client: AsyncClient) -> None:
    class Body(BaseModel):
        title: str

    @app.post("/_test/json")
    async def _route(body: Body) -> None:
        return None

    res = await client.post(
        "/_test/json", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    assert res.status_code == 400
    assert list(res.json()["error"]["fieldErrors"]) == ["body"]


async def test_blank_query_params_are_treated_as_absent(app: FastAPI, client: AsyncClient) -> None:
    # docs/06 C0: no-JS GET forms send empty selects; `?page=` must not be a 400.
    @app.get("/_test/blank")
    async def _route(page: int | None = None, q: str = "default") -> dict[str, object]:
        return {"page": page, "q": q}

    res = await client.get("/_test/blank", params={"page": "", "q": ""})
    assert res.status_code == 200
    assert res.json() == {"page": None, "q": "default"}


def test_contract_error_codes_match_the_handler_codes() -> None:
    from typing import get_args

    from app.errors import ErrorCode as HandlerCodes
    from app.schemas.errors import ErrorCode as ContractCodes

    assert [c.value for c in ContractCodes] == list(get_args(HandlerCodes))
