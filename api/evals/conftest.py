"""Fixtures for the real-model evals (`uv run pytest -m evals evals/`, from api/, by hand only).

Needs, in api/.env.local (copied in only for the run): `GEMINI_EVALS_API_KEY` — the second
Google project's key, so the live site's quota is untouched — and `DATABASE_URL` pointing at the
local dev database (refused if it isn't localhost). Writes `evals/last-run.md` (gitignored): the
results table for docs/12.
"""

import datetime as dt
from collections.abc import AsyncIterator
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from dotenv import dotenv_values
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.infra.db import make_engine
from app.services.ai.gemini import GeminiModel
from evals.harness import Chat, Paced, Pacer

RESULTS = Path(__file__).parent / "last-run.md"
PACER = Pacer()
ROWS: list[tuple[str, str, str, str]] = []


def _evals_key() -> str | None:
    import os

    return os.environ.get("GEMINI_EVALS_API_KEY") or dotenv_values(".env.local").get(
        "GEMINI_EVALS_API_KEY"
    )


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]


@pytest.fixture(scope="session")
def models(settings: Settings) -> list[Paced]:
    key = _evals_key()
    if not key:
        pytest.skip("GEMINI_EVALS_API_KEY is not set (api/.env.local or the environment)")
    names = dict.fromkeys([settings.ai_model, settings.ai_model_fallback])
    return [Paced(GeminiModel(key, name), PACER) for name in names if name]


@pytest.fixture
async def db(settings: Settings) -> AsyncIterator[AsyncSession]:
    url = settings.database_url.get_secret_value() if settings.database_url else ""
    if urlsplit(url).hostname not in ("localhost", "127.0.0.1"):
        pytest.skip("evals read the local dev catalog only — DATABASE_URL is not localhost")
    engine = make_engine(url)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def chat(db: AsyncSession, models: list[Paced], request: pytest.FixtureRequest) -> Chat:
    c = Chat(db, models)
    request.node.chat = c
    return c


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo[None]):  # noqa: ANN201
    report = yield
    c: Chat | None = getattr(item, "chat", None)
    if report.when == "call" or (report.when == "setup" and report.outcome != "passed"):
        if report.skipped:
            return report
        notes = ""
        if report.failed and call.excinfo is not None:
            notes = str(call.excinfo.value).splitlines()[0][:160]
        if c is not None:
            fired = sum(r.guardrail for r in c.replies)
            extra = f"{len(c.replies)} turns" + (f", guardrail fired {fired}×" if fired else "")
            notes = f"{extra}; {notes}" if notes else extra
        case = item.name.removeprefix("test_")
        ROWS.append((case, "pass" if report.passed else "FAIL", c.model_names if c else "", notes))
    return report


def pytest_sessionfinish(session: pytest.Session) -> None:
    if not ROWS:
        return
    today = dt.date.today().isoformat()
    passed = sum(r[1] == "pass" for r in ROWS)
    lines = [
        f"Run {today}: {passed}/{len(ROWS)} passed · {PACER.calls} model calls",
        "",
        "| Case | Result | Model | Date | Notes |",
        "|---|---|---|---|---|",
        *(f"| {c} | {r} | {m} | {today} | {n.replace('|', '/')} |" for c, r, m, n in ROWS),
    ]
    RESULTS.write_text("\n".join(lines) + "\n", encoding="utf-8")
