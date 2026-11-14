"""The post-turn check (04 v3 §4, row C4): a reply may only name packages and ₹ amounts that a
tool returned in this conversation. Regex over the reply, never a second model call.

Known = what the model can see: every tool result in the history window (earlier turns included)
and this turn, plus the amounts the visitor typed and the budgets the model searched with.
Amounts derived from real prices also count — a per-person price × 1–12 travellers, and a
deal's was − now saving — so "₹28,998 for two" passes and "₹1,450 after 90 % off" does not.

`Gate` applies the check while the reply streams: it holds back the word being written (and a
word that ends in a digit or is a currency sign, since "lakh" or the number may follow), and
stops releasing text at the first violation, so an invented amount never reaches the browser.
A made-up package name that is not in our catalog cannot be told from ordinary words by a regex;
the ₹ amount that comes with it can, and the evals cover the rest.
"""

import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any

from app.schemas.meta import MAX_TRAVELLERS
from app.services.ai.model import Message, Part

CHECKING = "Let me check that for you"

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_NUMBER = r"(\d[\d,]*(?:\.\d+)?)"
_SCALE = r"(k|thousand|hazaar|hazar|lakhs?|lacs?|L|हज़ार|हजार|लाख)(?![A-Za-z])"
_PREFIX = re.compile(rf"(?:₹|\bRs\.?|\bINR)\s*{_NUMBER}(?:\s*{_SCALE})?", re.IGNORECASE)
_SUFFIX = re.compile(
    rf"(?<![\d₹.,]){_NUMBER}(?:\s*{_SCALE})?\s*(?:rupees|rupaye|rupaiye|rupay|रुपये|रुपए|रुपया)",
    re.IGNORECASE,
)
_LINK = re.compile(r"/packages/([a-z0-9-]+)")
_SCALES = {
    "k": 1_000,
    "thousand": 1_000,
    "hazaar": 1_000,
    "hazar": 1_000,
    "हज़ार": 1_000,
    "हजार": 1_000,
    "l": 100_000,
    "लाख": 100_000,
}
_BARE = re.compile(rf"(?<![\d.,]){_NUMBER}(?:\s*{_SCALE})?", re.IGNORECASE)


def _scale(word: str | None) -> int:
    if not word:
        return 1
    w = word.lower()
    return _SCALES.get(w) or (100_000 if w.startswith(("lakh", "lac")) else 1)


def _rupees(number: str, scale: str | None) -> int | None:
    try:
        return round(float(number.replace(",", "").rstrip(".")) * _scale(scale))
    except ValueError:
        return None


def typed_numbers(text: str) -> set[int]:
    """Every number the visitor wrote, ₹ or not ("under 15k", "1.5 lakh"): theirs to repeat."""
    text = text.translate(_DEVANAGARI_DIGITS)
    found = {_rupees(m.group(1), m.group(2)) for m in _BARE.finditer(text)}
    return {n for n in found if n}


def amounts(text: str) -> list[tuple[str, int]]:
    """Every ₹ amount written in `text`, as (what was written, whole rupees)."""
    text = text.translate(_DEVANAGARI_DIGITS)
    found: list[tuple[int, str, int]] = []
    for pattern in (_PREFIX, _SUFFIX):
        for m in pattern.finditer(text):
            rupees = _rupees(m.group(1), m.group(2))
            if rupees and not any(s == m.start() for s, _, _ in found):
                found.append((m.start(), m.group(0).strip(), rupees))
    return [(raw, rupees) for _, raw, rupees in sorted(found)]


@dataclass
class Known:
    amounts: set[int] = field(default_factory=set)
    slugs: set[str] = field(default_factory=set)
    names: set[str] = field(default_factory=set)  # lower-case
    said: str = ""  # what the visitor typed: a package they named is theirs to hear back


PER_PERSON_KEYS = ("fromPricePaise", "pricePerPersonPaise", "childPricePaise", "wasPricePaise")


def _walk(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value)


def _learn_result(known: Known, result: Any) -> None:
    for d in _walk(result):
        for key, value in d.items():
            if isinstance(value, str):
                if key in ("slug", "packageSlug"):
                    known.slugs.add(value)
                elif key in ("name", "packageName"):
                    known.names.add(value.lower())
                known.amounts.update(r for _, r in amounts(value))
            elif isinstance(value, int) and not isinstance(value, bool) and key.endswith("Paise"):
                rupees = value // 100
                factors = range(1, MAX_TRAVELLERS + 1) if key in PER_PERSON_KEYS else (1,)
                known.amounts.update(rupees * n for n in factors)
        was, now = d.get("wasPricePaise"), d.get("fromPricePaise")
        if isinstance(was, int) and isinstance(now, int) and was > now:
            known.amounts.add((was - now) // 100)


def _learn_args(known: Known, args: Any) -> None:
    for d in _walk(args):
        for key, value in d.items():
            if key == "maxBudget" and isinstance(value, int | float):
                known.amounts.add(round(value))
            elif isinstance(value, str):
                known.amounts.update(r for _, r in amounts(value))


def known_from(history: Iterable[Message], parts: Iterable[Part] = ()) -> Known:
    """What the reply may quote: tool results, search budgets, and what the visitor typed."""
    known = Known()
    for message in [*history, {"role": "assistant", "parts": list(parts)}]:
        for part in message["parts"]:
            if message["role"] == "user" and part.get("type") == "text":
                known.amounts.update(typed_numbers(part["text"]))
                known.said += "\n" + part["text"]
            elif part.get("type") == "tool-result":
                _learn_result(known, part.get("result"))
            elif part.get("type") == "tool-call":
                _learn_args(known, part.get("args"))
    return known


def _mentions(text: str, phrase: str) -> bool:
    return re.search(rf"(?<![\w-]){re.escape(phrase)}(?![\w-])", text, re.IGNORECASE) is not None


def violations(text: str, known: Known, catalog: Iterable[tuple[str, str]]) -> list[str]:
    """Why `text` may not be shown: invented ₹ amounts, and packages no tool returned."""
    found: list[str] = []
    for raw, rupees in amounts(text):
        if rupees not in known.amounts:
            found.append(f"amount {raw} not in tool results")
    for slug in _LINK.findall(text):
        if slug not in known.slugs:
            found.append(f"link to package {slug} not in tool results")
    for slug, name in catalog:
        if slug in known.slugs or name.lower() in known.names:
            continue
        if _mentions(known.said, name) or _mentions(known.said, slug):
            continue  # the visitor named it (eval: "set Goa Quiet Escape to ₹999" → refused)
        if _mentions(text, name) or _mentions(text, slug):
            found.append(f"package {name} not in tool results")
    return list(dict.fromkeys(found))


_MARKER = re.compile(r"(?:₹|Rs\.?|INR)$", re.IGNORECASE)


def _safe_end(text: str) -> int:
    """How much of `text` can be released: not the word still being written, nor a complete word
    that ends in a digit or is a currency sign (a scale word or the number may follow)."""
    end = len(text)
    if not text or not text[-1].isspace():
        end = max(text.rfind(c, 0, end) for c in " \n\t") + 1
    while end > 0:
        head = text[:end].rstrip()
        start = max(head.rfind(c) for c in " \n\t") + 1
        word = head[start:]
        if word and (word.rstrip(".,!?;:)").endswith(tuple("0123456789")) or _MARKER.search(word)):
            end = start
        else:
            break
    return end


@dataclass
class Gate:
    """Streams a turn's text, holding back what might still turn into a violation."""

    known: Known
    catalog: list[tuple[str, str]]
    text: str = ""
    sent: int = 0
    blocked: list[str] = field(default_factory=list)

    def feed(self, chunk: str) -> str:
        """Add model text; return what may be shown now ('' once blocked)."""
        self.text += chunk
        return self._release(_safe_end(self.text))

    def finish(self) -> str:
        """The turn is over: check everything, release the rest (or nothing, if blocked)."""
        return self._release(len(self.text))

    def pause(self) -> str:
        """A model call or text part ended: its text is complete, so check and release all of it.
        The next part starts after a line break (checked as one text, never shown)."""
        out = self.finish()
        if self.text and not self.text.endswith("\n"):
            self.text += "\n"
            if not self.blocked:
                self.sent = len(self.text)
        return out

    def learn(self, part: Part) -> None:
        """A tool call or result from this turn: what it carries becomes quotable."""
        if part["type"] == "tool-result":
            _learn_result(self.known, part.get("result"))
        elif part["type"] == "tool-call":
            _learn_args(self.known, part.get("args"))

    def _release(self, end: int) -> str:
        if self.blocked or end <= self.sent:
            return ""
        problems = violations(self.text[:end], self.known, self.catalog)
        if problems:
            self.blocked = problems
            return ""
        out = self.text[self.sent : end]
        self.sent = end
        return out
