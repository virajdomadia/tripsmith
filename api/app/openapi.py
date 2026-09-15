"""Dump the OpenAPI document to `api/openapi.json` — the committed contract (05 §2).

    uv run python -m app.openapi            # writes api/openapi.json
    uv run python -m app.openapi out.json   # or elsewhere

`web/src/lib/api-types.ts` is generated from that file by `pnpm gen:api` (root), which runs this
first. CI (S7) regenerates both and fails on a diff; `tests/test_openapi.py` checks freshness
locally.
"""

import json
import sys
from pathlib import Path
from typing import Any

from app.main import create_app

OPENAPI_PATH = Path(__file__).resolve().parents[1] / "openapi.json"


def build_document() -> dict[str, Any]:
    return create_app().openapi()


def render_document() -> str:
    # Stable key order + trailing newline so regeneration never produces a spurious diff.
    return json.dumps(build_document(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def write_document(path: Path = OPENAPI_PATH) -> Path:
    path.write_text(render_document(), encoding="utf-8", newline="\n")
    return path


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else OPENAPI_PATH
    print(f"wrote {write_document(target)}")
