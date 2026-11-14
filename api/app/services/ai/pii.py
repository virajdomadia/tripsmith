"""Contact details never reach the model or the log (v3 C6 security pass, R28).

The panel asks visitors not to share personal details and the enquiry form collects them, but a
visitor can still type a phone number or an email into the chat. `redact` swaps both out before
the message is stored or sent to Gemini, so neither the model, `messages`, `conversations.
first_user_message` nor the owner's log ever holds them. The same goes for `createEnquiry`'s
summary, which the model writes.

Names can't be told from place names or ordinary words by a pattern, so they are not redacted:
the privacy note and the enquiry form are the defence there (docs/12 v3, accepted risk).

What counts as a phone: a run of 10–13 digits, single spaces or hyphens allowed between them,
optionally after a `+` country code. A travel chat's other numbers stay under that: budgets are
≤ 8 digits and written with commas (`1,20,000`), dates are 8 digits, nights and party sizes are
one or two. A run with a date in it (`2026-11-20`, `20-11-2026`) is left alone.
"""

import re

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
# A run of digits joined by single spaces or hyphens, optionally after a `+`; judged below.
DIGIT_RUN = re.compile(r"(?<![\d,.₹/-])\+?\d(?:[\s-]?\d)+(?![\d,])")
DATE = re.compile(r"\d{4}-\d\d-\d\d|\d\d-\d\d-\d{4}")

EMAIL_GONE = "[email removed]"
PHONE_GONE = "[phone removed]"


def _phone(match: re.Match[str]) -> str:
    run = match.group()
    digits = sum(c.isdigit() for c in run)
    return PHONE_GONE if 10 <= digits <= 13 and not DATE.search(run) else run


def redact(text: str) -> str:
    """`text` with every email and phone number replaced by a marker."""
    return DIGIT_RUN.sub(_phone, EMAIL.sub(EMAIL_GONE, text))
