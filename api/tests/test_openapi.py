"""`python -m app.openapi` dumps the contract to api/openapi.json (05 §2)."""

import json
import subprocess
import sys
from pathlib import Path

from app.openapi import OPENAPI_PATH, build_document, render_document

API_DIR = Path(__file__).resolve().parents[1]


def test_document_exposes_the_v1_enums_and_operations() -> None:
    doc = build_document()
    schemas = doc["components"]["schemas"]
    assert schemas["Theme"]["enum"] == [
        "beach",
        "hills",
        "honeymoon",
        "family",
        "adventure",
        "heritage",
    ]
    assert schemas["Badge"]["enum"] == ["filling-fast", "sold-out", "guaranteed"]
    assert schemas["EnquiryType"]["enum"] == ["standard", "custom", "contact"]
    assert doc["paths"]["/health"]["get"]["operationId"] == "getHealth"
    assert doc["paths"]["/meta"]["get"]["operationId"] == "getMeta"
    assert doc["paths"]["/auth/login"]["post"]["operationId"] == "login"
    assert doc["paths"]["/auth/logout"]["post"]["operationId"] == "logout"
    assert doc["paths"]["/auth/session"]["get"]["operationId"] == "getSession"
    assert schemas["UserRole"]["enum"] == ["owner", "customer"]
    admin = doc["paths"]["/admin/destinations"]
    assert admin["get"]["operationId"] == "listAdminDestinations"
    assert admin["post"]["operationId"] == "createDestination"
    one = doc["paths"]["/admin/destinations/{id}"]
    assert one["get"]["operationId"] == "getAdminDestination"
    assert one["put"]["operationId"] == "updateDestination"
    assert one["delete"]["operationId"] == "deleteDestination"
    assert doc["paths"]["/admin/destinations/cover"]["post"]["operationId"] == (
        "uploadDestinationCover"
    )
    packages = doc["paths"]["/admin/packages"]
    assert packages["get"]["operationId"] == "listAdminPackages"
    assert packages["post"]["operationId"] == "createPackage"
    one_package = doc["paths"]["/admin/packages/{id}"]
    assert one_package["get"]["operationId"] == "getAdminPackage"
    assert one_package["put"]["operationId"] == "updatePackage"
    assert one_package["delete"]["operationId"] == "deletePackage"
    assert doc["paths"]["/admin/packages/{id}/status"]["post"]["operationId"] == "setPackageStatus"
    assert doc["paths"]["/admin/packages/{id}/duplicate"]["post"]["operationId"] == (
        "duplicatePackage"
    )
    images = doc["paths"]["/admin/packages/{id}/images"]
    assert images["post"]["operationId"] == "uploadPackageImage"
    assert images["patch"]["operationId"] == "reorderPackageImages"
    one_image = doc["paths"]["/admin/packages/{id}/images/{image_id}"]
    assert one_image["patch"]["operationId"] == "updatePackageImage"
    assert one_image["delete"]["operationId"] == "deletePackageImage"
    assert schemas["PackageStatus"]["enum"] == ["draft", "live"]


def test_rendered_document_is_stable_and_newline_terminated() -> None:
    text = render_document()
    assert text == render_document()
    assert text.endswith("}\n")
    assert json.loads(text) == build_document()


def test_committed_openapi_json_is_fresh() -> None:
    # Regenerate with `pnpm gen:api` (root) or `uv run python -m app.openapi` after a route change.
    assert OPENAPI_PATH == API_DIR / "openapi.json"
    assert OPENAPI_PATH.read_text(encoding="utf-8") == render_document()


def test_module_entrypoint_writes_the_file(tmp_path: Path) -> None:
    target = tmp_path / "openapi.json"
    proc = subprocess.run(
        [sys.executable, "-m", "app.openapi", str(target)],
        cwd=API_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    assert target.read_text(encoding="utf-8") == render_document()


# --- S5: the error envelope is part of the contract -------------------------------------------


def test_error_envelope_schema_is_in_components() -> None:
    schemas = build_document()["components"]["schemas"]
    envelope = schemas["ApiErrorResponse"]
    assert envelope["required"] == ["error"]
    error = schemas["ApiErrorBody"]
    assert error["properties"]["code"]["$ref"] == "#/components/schemas/ErrorCode"
    assert schemas["ErrorCode"]["enum"] == [
        "validation",
        "unauthorized",
        "forbidden",
        "not_found",
        "rate_limited",
        "conflict",
        "internal",
    ]
    assert set(error["required"]) == {"code", "message"}
    # Optional, never null: the handlers omit the key, so the TS type must not say `| null`.
    assert error["properties"]["fieldErrors"]["type"] == "object"
    assert "anyOf" not in error["properties"]["fieldErrors"]


def test_every_operation_declares_the_envelope_as_its_default_response() -> None:
    doc = build_document()
    for path, methods in doc["paths"].items():
        for method, op in methods.items():
            default = op["responses"].get("default")
            assert default, f"{method.upper()} {path} has no default (error) response"
            ref = default["content"]["application/json"]["schema"]["$ref"]
            assert ref == "#/components/schemas/ApiErrorResponse"


def test_fastapi_422_is_not_in_the_contract() -> None:
    # Request validation failures are a 400 `validation` envelope (errors.py), so the automatic
    # 422 / HTTPValidationError FastAPI adds for parameterised routes must not leak into the doc.
    from app.main import create_app

    app = create_app()

    @app.get("/_test/param")
    async def _route(n: int) -> dict[str, int]:
        return {"n": n}

    doc = app.openapi()
    assert "422" not in doc["paths"]["/_test/param"]["get"]["responses"]
    assert "HTTPValidationError" not in doc["components"]["schemas"]
    assert "ValidationError" not in doc["components"]["schemas"]
