"""Guard against layouts Vercel's Python builder silently drops from the function bundle."""

from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def test_no_package_is_named_public() -> None:
    # Vercel treats any directory named `public` as CDN static assets and leaves it out of the
    # Python function bundle — at any depth. `app/routers/public/` built green, then every
    # request 500'd with `ModuleNotFoundError: app.routers.public` (found 2026-09-15, S4b).
    offenders = sorted(p.relative_to(APP_DIR) for p in APP_DIR.rglob("public") if p.is_dir())
    assert offenders == [], f"rename these packages, Vercel will not bundle them: {offenders}"
