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
