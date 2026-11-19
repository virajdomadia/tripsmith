"""Google Gemini through the official `google-genai` SDK — the only module that imports a model SDK.

The SDK costs ~0.9 s of import on a cold start (measured, 03 decision 3), so it is imported inside
`GeminiModel.stream`, i.e. on the first chat turn of an instance, never at app import. Swapping
provider = rewriting this file against `model.ChatModel`.

Free tier, billing off: each model allows 15 RPM · 250K TPM · 500 RPD. The SDK's own retries are
off (one attempt): a 429 is a per-minute burst, and the loop answers it by switching to
`AI_MODEL_FALLBACK`, which has its own quota, after a short pause (loop.py) rather than sleeping
on a Vercel function's clock.

Every provider failure leaves here as `ModelUnavailable` (`unavailable()`), so the loop — not a
generic `except Exception` in chat.py — decides about retries, and the logged reason carries the
HTTP status or exception type (QA 2026-11-19: three turns ended as "turn: ClientError" or a run of
ReadTimeouts with nothing saying which status).
"""

import base64
import logging
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

from app.config import Settings
from app.services.ai.model import (
    ChatModel,
    FunctionCall,
    Message,
    ModelEvent,
    ModelUnavailable,
    TextChunk,
    ToolSpec,
    Usage,
)

if TYPE_CHECKING:
    from google.genai import types

log = logging.getLogger(__name__)

# One model call. Measured 2026-11-12: first chunk in 4–6 s; a stuck call sends nothing at all, so
# give up early and let the loop try the other model (api/vercel.json maxDuration is 60 s).
TIMEOUT_MS = 12_000
TEMPERATURE = 0.4
# Tool choice needs little reasoning; `minimal` shaved ~1 s off the first chunk (measured).
THINKING_LEVEL = "MINIMAL"  # types.ThinkingLevel.MINIMAL
# Worth another try: request timeout, the per-minute 429 burst, Google's 499 CANCELLED (its front
# end dropping a stream) — and every 5xx.
TRANSIENT_STATUSES = frozenset({408, 429, 499})


def unavailable(model: str, exc: Exception) -> ModelUnavailable | None:
    """A provider failure → `ModelUnavailable` naming the model and the status or exception type
    (no message text: an SDK error can echo the request). None = not a provider failure (a bug
    of ours), which the caller re-raises."""
    from google.genai import errors

    if isinstance(exc, errors.APIError):
        code = exc.code or 0
        transient = code in TRANSIENT_STATUSES or code >= 500
        return ModelUnavailable(f"{model}: {code} {exc.status or ''}".rstrip(), transient=transient)
    if isinstance(exc, TimeoutError):
        return ModelUnavailable(f"{model}: timeout")
    # httpx transport errors (connect/read timeouts, resets) come through unwrapped.
    if type(exc).__module__.startswith(("httpx", "httpcore")):
        return ModelUnavailable(f"{model}: {type(exc).__name__}")
    return None


def _b64(raw: bytes | None) -> str | None:
    return base64.b64encode(raw).decode() if raw else None


def _unb64(text: str | None) -> bytes | None:
    return base64.b64decode(text) if text else None


# Google's documented stand-in for a function call whose signature came from another model (a
# turn the fallback answered, replayed to the primary, or the reverse): signatures only verify
# against the model that issued them, and Gemini 3 rejects a current-turn call without one.
FOREIGN_SIGNATURE = b"skip_thought_signature_validator"


def to_contents(history: list[Message], model: str) -> list["types.Content"]:
    """Stored messages → Gemini contents. An assistant turn's parts alternate between the model
    side (text, function calls) and our side (function responses, sent as role `user`), so each
    switch of side starts a new Content; signatures go back on the part they came with when
    `model` issued them."""
    from google.genai import types

    contents: list[types.Content] = []

    def push(role: str, part: types.Part) -> None:
        if contents and contents[-1].role == role:
            (contents[-1].parts or []).append(part)
        else:
            contents.append(types.Content(role=role, parts=[part]))

    for message in history:
        if message["role"] == "user":
            for part in message["parts"]:
                push("user", types.Part(text=part["text"]))
            continue
        for part in message["parts"]:
            own = part.get("model") in (None, model)
            sig = _unb64(part.get("signature")) if own else None
            match part["type"]:
                case "text":
                    if part["text"] or sig:
                        push("model", types.Part(text=part["text"], thought_signature=sig))
                case "tool-call":
                    call = types.FunctionCall(
                        name=part["name"], args=part["args"], id=part.get("callId")
                    )
                    if not own:
                        sig = FOREIGN_SIGNATURE
                    push("model", types.Part(function_call=call, thought_signature=sig))
                case "tool-result":
                    # `user`, not `tool`: the Gemini API's role for function responses.
                    response = types.FunctionResponse(
                        name=part["name"], response=part["result"], id=part.get("callId")
                    )
                    push("user", types.Part(function_response=response))
    return contents


class GeminiModel:
    def __init__(self, api_key: str, name: str) -> None:
        self.name = name
        self._api_key = api_key

    async def stream(
        self,
        system: str,
        history: list[Message],
        tools: list[ToolSpec],
        *,
        allow_tools: bool,
    ) -> AsyncIterator[ModelEvent]:
        from google import genai
        from google.genai import types

        client = genai.Client(
            api_key=self._api_key,
            http_options=types.HttpOptions(
                timeout=TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=1)
            ),
        )
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=TEMPERATURE,
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel(THINKING_LEVEL)
            ),
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=t.name,
                            description=t.description,
                            parameters_json_schema=t.parameters,
                        )
                        for t in tools
                    ]
                )
            ],
            tool_config=types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(
                    mode=types.FunctionCallingConfigMode.AUTO
                    if allow_tools
                    else types.FunctionCallingConfigMode.NONE
                )
            ),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        usage: Any = None
        try:
            stream = await client.aio.models.generate_content_stream(
                model=self.name, contents=to_contents(history, self.name), config=config
            )
            async for chunk in stream:
                usage = chunk.usage_metadata or usage
                candidate = chunk.candidates[0] if chunk.candidates else None
                parts = (candidate.content.parts if candidate and candidate.content else None) or []
                for part in parts:
                    sig = _b64(part.thought_signature)
                    if part.function_call:
                        call = part.function_call
                        yield FunctionCall(
                            name=call.name or "",
                            args=dict(call.args or {}),
                            call_id=call.id,
                            signature=sig,
                        )
                    elif part.thought:
                        continue  # thought summaries are not shown (none are requested)
                    elif part.text or sig:
                        yield TextChunk(part.text or "", signature=sig)
        except Exception as exc:
            failure = unavailable(self.name, exc)
            if failure is None:
                raise
            raise failure from exc
        finally:
            await client.aio.aclose()
        if usage is not None:
            yield Usage(
                tokens_in=usage.prompt_token_count or 0,
                tokens_out=(usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0),
            )


def models_from_settings(settings: Settings) -> list[ChatModel] | None:
    """The primary model, then the fallback. None = no key: the concierge is off."""
    if settings.gemini_api_key is None or not settings.gemini_api_key.get_secret_value():
        return None
    key = settings.gemini_api_key.get_secret_value()
    names = [settings.ai_model]
    if settings.ai_model_fallback and settings.ai_model_fallback != settings.ai_model:
        names.append(settings.ai_model_fallback)
    return [GeminiModel(key, name) for name in names]
