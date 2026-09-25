"""Toolchain smoke test (S3a): proves pytest runs on the pinned interpreter and that
api/.env.example still lists exactly the keys documented in docs/04-technical-design.md §12."""

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent

# docs/04-technical-design.md §12 — api/ keys (16) + the dev/CI-only TEST_DATABASE_URL.
EXPECTED_ENV_KEYS = {
    "DATABASE_URL",
    "TEST_DATABASE_URL",
    "SESSION_SECRET",
    "OWNER_EMAIL",
    "OWNER_PASSWORD",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "OWNER_NOTIFY_EMAIL",
    "WHATSAPP_NUMBER",
    "BLOB_READ_WRITE_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "SENTRY_DSN",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "CRON_SECRET",
    "WEB_URL",
    "REVALIDATE_SECRET",
    "SITE_URL",
}


def parse_env_example(path: Path) -> dict[str, str]:
    """Minimal dotenv parser: `KEY=value` lines, `#` comments and blanks ignored."""
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        assert sep, f"malformed line in {path.name}: {raw!r}"
        values[key.strip()] = value.strip()
    return values


def test_python_is_3_12() -> None:
    assert sys.version_info[:2] == (3, 12)


def test_env_example_has_the_20_documented_keys() -> None:
    keys = parse_env_example(API_ROOT / ".env.example")
    assert len(keys) == 20
    assert set(keys) == EXPECTED_ENV_KEYS
