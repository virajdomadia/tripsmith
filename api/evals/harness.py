"""Real-model eval harness (03 R33 / 04 v3 §5): drives `run_turn` against Gemini on the second
Google project's key and the local dev catalog. Never imported by `tests/`, never run in CI.

Each `Chat` is one conversation held in memory, exactly as `chat.py` would replay it, but without
`/chat`: no per-IP limit, no `chat_budget` row, no stored messages. The tools are read-only (the
v2 quote behind `startBooking` writes nothing), and every turn's read transaction is rolled back.

"Invented" is judged on the model's own words, before the guardrail: a reply the guardrail had to
replace is a failure here, so 0 invented means the model, not the safety net.
"""

import asyncio
import datetime as dt
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.guardrail import known_from, violations
from app.services.ai.loop import FORCED, ChatUnavailable, Turn, run_turn
from app.services.ai.model import ChatModel, Message, ModelEvent, TextChunk, ToolSpec
from app.services.ai.tools import ToolContext, package_names
from app.services.analytics import ist_today

# Free tier: 15 RPM per model. One call every 5 s keeps the whole run at ≤ 12 RPM, whichever
# model answers.
MIN_GAP_S = 5.0
BUSY_WAIT_S = 30.0


class Pacer:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.last = 0.0
        self.calls = 0

    async def wait(self) -> None:
        async with self.lock:
            gap = MIN_GAP_S - (time.monotonic() - self.last)
            if gap > 0:
                await asyncio.sleep(gap)
            self.last = time.monotonic()
            self.calls += 1


class Paced:
    """A `ChatModel` that waits its turn and keeps the raw text it streamed."""

    def __init__(self, model: ChatModel, pacer: Pacer) -> None:
        self.name = model.name
        self.model = model
        self.pacer = pacer
        self.raw: list[str] = []

    async def stream(
        self, system: str, history: list[Message], tools: list[ToolSpec], *, allow_tools: bool
    ) -> AsyncIterator[ModelEvent]:
        await self.pacer.wait()
        async for event in self.model.stream(system, history, tools, allow_tools=allow_tools):
            if isinstance(event, TextChunk):
                self.raw.append(event.text)
            yield event


@dataclass
class Call:
    name: str
    args: dict[str, Any]
    result: dict[str, Any]


@dataclass
class Reply:
    text: str  # what the visitor saw (after the guardrail)
    raw: str  # what the model wrote
    calls: list[Call]
    errors: list[str]
    model: str | None
    invented: list[str] = field(default_factory=list)

    @property
    def guardrail(self) -> bool:
        return any(e.startswith("guardrail") for e in self.errors)

    def called(self, name: str) -> list[Call]:
        return [c for c in self.calls if c.name == name]


class Chat:
    def __init__(self, db: AsyncSession, models: list[Paced]) -> None:
        self.db = db
        self.models = models
        self.history: list[Message] = []
        self.replies: list[Reply] = []

    async def say(self, text: str) -> Reply:
        self.history.append({"role": "user", "parts": [{"type": "text", "text": text}]})
        for attempt in (1, 2):
            turn = Turn()
            for m in self.models:
                m.raw.clear()
            now = dt.datetime.now(dt.UTC)
            ctx = ToolContext(db=self.db, today=ist_today(now), now=now)
            try:
                async for _ in run_turn(list(self.models), self.history, ctx, turn):
                    pass
                break
            except ChatUnavailable:
                await self.db.rollback()
                if attempt == 2:
                    raise
                await asyncio.sleep(BUSY_WAIT_S)
        catalog = await package_names(self.db)
        await self.db.rollback()
        forced = {p["id"] for p in turn.parts if p.get("model") == FORCED}
        own = [p for p in turn.parts if p.get("id") not in forced]
        raw = "".join(chunk for m in self.models for chunk in m.raw)
        results = {p["id"]: p["result"] for p in own if p["type"] == "tool-result"}
        reply = Reply(
            text=turn.text,
            raw=raw,
            calls=[
                Call(p["name"], p["args"], results.get(p["id"], {}))
                for p in own
                if p["type"] == "tool-call"
            ],
            errors=turn.errors,
            model=turn.model,
            invented=violations(raw, known_from(self.history, own), catalog),
        )
        self.history.append({"role": "assistant", "parts": turn.parts})
        self.replies.append(reply)
        return reply

    @property
    def model_names(self) -> str:
        return ", ".join(sorted({r.model for r in self.replies if r.model}))


# --- what the assertions look for ----------------------------------------------------------------

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
HINGLISH = {
    "hai", "hain", "aap", "aapke", "aapko", "ke", "liye", "mein", "ka", "ki", "ko", "se", "bhi",
    "nahi", "nahin", "chahiye", "kar", "karein", "karte", "sakte", "yeh", "ye", "woh", "accha",
    "acha", "bahut", "toh", "aur", "kya", "hum", "batao", "bataiye", "dekhiye", "milega", "wala",
    "wali",
}  # fmt: skip


def hinglish_words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower())) & HINGLISH


def is_hinglish(text: str) -> bool:
    return len(hinglish_words(text)) >= 3 and not DEVANAGARI.search(text)


def is_hindi(text: str) -> bool:
    return len(DEVANAGARI.findall(text)) >= 10


def is_english(text: str) -> bool:
    return not DEVANAGARI.search(text) and len(hinglish_words(text)) <= 1
