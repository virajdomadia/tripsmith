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
    """The provider refused or failed: try the next model in the chain.

    `transient` (the default): a 408/429/499 or 5xx, a timeout or a dropped connection — worth
    another try after a short pause (loop.py `RETRY_BACKOFF_SECONDS`). False: any other 4xx (QA
    2026-11-19 found a bare `ClientError` ending a turn) — the next model gets one immediate try,
    since a refusal can be model-specific (a retired model, a signature it won't accept).
    The message names the model and the status or exception type only — never the request, the
    response body or the key — because it is logged and stored in `conversations.last_error`.
    """

    def __init__(self, message: str, *, transient: bool = True) -> None:
        super().__init__(message)
        self.transient = transient


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
