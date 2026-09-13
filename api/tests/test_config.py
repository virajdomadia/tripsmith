"""app/config.py: pydantic-settings over every key in docs/04 §12."""

import pytest
from pydantic_settings import SettingsConfigDict

from app.config import Settings, get_settings
from tests.test_smoke import EXPECTED_ENV_KEYS


class EnvOnlySettings(Settings):
    """Same fields, but ignores api/.env.local so tests see only the process env."""

    model_config = SettingsConfigDict(env_file=None)


def test_settings_declare_exactly_the_documented_keys() -> None:
    assert {name.upper() for name in Settings.model_fields} == EXPECTED_ENV_KEYS


def test_settings_load_with_no_env_at_all(monkeypatch: pytest.MonkeyPatch) -> None:
    # CI has no secrets (04 §10); constructing must not fail.
    for key in EXPECTED_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    s = EnvOnlySettings()
    assert s.database_url is None
    assert s.session_secret is None
    assert s.sentry_dsn is None
    assert s.web_url == "http://localhost:3000"
    assert s.site_url == "http://localhost:3000"


def test_settings_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WEB_URL", "https://tripsmith.vercel.app")
    monkeypatch.setenv("SESSION_SECRET", "s3cret")
    s = EnvOnlySettings()
    assert s.web_url == "https://tripsmith.vercel.app"
    assert s.session_secret is not None
    assert s.session_secret.get_secret_value() == "s3cret"


def test_secrets_never_repr_their_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_SECRET", "s3cret")
    assert "s3cret" not in repr(EnvOnlySettings())


def test_get_settings_is_cached() -> None:
    get_settings.cache_clear()
    assert get_settings() is get_settings()
