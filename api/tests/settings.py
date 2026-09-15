"""Settings for tests: pure field defaults plus explicit overrides — never the process env or
api/.env.local. (`Settings.model_validate({})` still reads both for unspecified fields.)"""

from typing import Any

from pydantic import SecretStr

from app.config import Settings

SECRET_FIELDS = {
    name for name, f in Settings.model_fields.items() if "SecretStr" in str(f.annotation)
}


def make_settings(**overrides: Any) -> Settings:
    fields = {
        k: SecretStr(v) if k in SECRET_FIELDS and isinstance(v, str) else v
        for k, v in overrides.items()
    }
    return Settings.model_construct(None, **fields)
