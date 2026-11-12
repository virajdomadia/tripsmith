"""The contract between the tool loop and a model provider.

History is a list of stored messages — `{"role": "user" | "assistant", "parts": [...]}` — in the
same part shapes the stream emits and `messages.parts` keeps:

- `{"type": "text", "text": str, "signature"?: str, "model"?: str}`
- `{"type": "tool-call", "id": str, "name": str, "args": dict, "model": str, "callId"?: str,
  "signature"?: str}`
- `{"type": "tool-result", "id": str, "name": str, "result": dict}`

`signature` is the model's opaque thought signature (base64), replayed so a multi-step turn and
later turns keep the model's reasoning context; `model` names the model that issued it (a
signature only verifies against its own model). `callId` is the provider's own call id, if any.
A provider turns that history into its own request; `tests/` drives the loop with a scripted
fake of the same protocol, so no real model runs in CI.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol

Part = dict[str, Any]
Message = dict[str, Any]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema (object)


@dataclass(frozen=True)
class TextChunk:
    text: str
    signature: str | None = None


@dataclass(frozen=True)
class FunctionCall:
    name: str
    args: dict[str, Any] = field(default_factory=dict)
    call_id: str | None = None
    signature: str | None = None


@dataclass(frozen=True)
class Usage:
    tokens_in: int
    tokens_out: int


ModelEvent = TextChunk | FunctionCall | Usage


class ModelUnavailable(Exception):  # noqa: N818 — reads as a state, like the other ApiErrors
    """The provider refused or failed (429 burst, 5xx, timeout): try the fallback model."""


class ChatModel(Protocol):
    name: str

    def stream(
        self,
        system: str,
        history: list[Message],
        tools: list[ToolSpec],
        *,
        allow_tools: bool,
    ) -> AsyncIterator[ModelEvent]:
        """One model call. `allow_tools=False` = the declarations are sent (the history holds
        calls) but the model must answer in text — the loop's last allowed call."""
        ...
