# F9 Enquiry Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor can enquire about a trip (package attached, Standard / Customise-this-trip) or send a general enquiry from the Contact page; the row lands in `enquiries` with `status=new`, spam is kept out (honeypot + 5/10 min/IP + 60 s dedupe), it works with JavaScript off, and a thanks page shows the reference. Emails (F10), the PDF (F11) and the sticky CTA bar / WhatsApp FAB (F12+F13) come next and hang off this.

**Architecture:** api: `schemas/enquiries.py` (`EnquiryCreate` with Indian-mobile normalisation, `EnquiryCreated`), `infra/ratelimit.py` (Upstash REST sliding window over httpx, null limiter when unset, stored on `app.state`), `services/enquiries.py` (`submit_enquiry`: honeypot → fake success, package lookup, dedupe, ref generation, insert), `POST /enquiries` (201). web: a zod mirror `lib/enquiry-schema.ts` proven equal to pydantic by a shared JSON case file, one client `EnquiryForm` (native form → `POST /enquire` route handler for no-JS; `fetch('/api/enquiries')` + inline `fieldErrors` with JS), the S6 page `/packages/[slug]/enquire` with a package summary, the S7 page `/enquiry/thanks`, and the Contact page swapping its WhatsApp stand-in for the real form.

**Tech Stack:** FastAPI + pydantic v2 + SQLAlchemy async (api); Upstash Redis REST via httpx (no new Python deps); Next.js 16 app router + zod (already a dep) + Tailwind 4 tokens (web). `pnpm gen:api` regenerates the contract (a POST operation is new).

**Spec:** `docs/07-plan.md` row F9; `docs/03-requirements.md` R5; `docs/06-data-and-api.md` A4 (table), C2 (`submitEnquiry`), C3 (`POST /enquire` proxy), Part D (`EnquiryCreate`); `docs/04-technical-design.md` §rate limiting; mockups `mockups/screens.html` S6 (form + summary) and S7 (thanks).

## Global Constraints

- Work in `.worktrees/f9-enquiry` on branch `feat/f9-enquiry`; one PR; never touch the main checkout; never run `next build` while `next dev` shares `.next/`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (root) green; `pnpm gen:api` output committed (freshness tests both sides).
- Tests seed `tests/fixture_content` (2 Goa packages) — never edit the fixture. Db tests use the `db` / `db_client` fixtures; unit tests need no database.
- Error envelope only: every non-2xx is `{ error: { code, message, fieldErrors? } }`; `fieldErrors` keys are the **camelCase wire names** (`packageSlug`, `travelMonth`). Rate limit → `429 rate_limited` with `Retry-After`.
- Phone rule (06 A4): after normalisation `^[6-9]\d{9}$`. Normalisation (both sides, identical): drop spaces, hyphens, dots, parentheses; drop a leading `+91` / `91` (when 12 digits) / `0` (when 11 digits).
- Limits from `app/schemas/meta.py`: `MAX_TRAVELLERS = 12` (adults + children), `ENQUIRY_MESSAGE_MAX = 1000`. Adults 1–12, children 0–11.
- Copy: short, concrete, Indian English; the callback promise is "a person calls you back within 2 hours, 10 am – 8 pm". No mention of emails or the PDF on the thanks page until F10/F11 ship. Business facts from `lib/business.ts`.
- Every colour/radius/shadow from `globals.css` tokens; form controls reuse the `field` class string pattern from the contact form (border-line, focus:border-primary).
- No new npm or Python dependencies.

---

## Design decisions (settled here so no task re-litigates them)

| Question | Decision |
|---|---|
| Routes | Form with a package: `/packages/[slug]/enquire` (S6, breadcrumb Home › package › Enquire). General enquiry: the existing `/contact` page (type `contact`, no toggle, no summary). Thanks: `/enquiry/thanks?ref=TS-XXXXXX&name=<first>&package=<slug>` (S7; `noindex`). No-JS proxy: `POST /enquire` (a route handler outside `(site)`, like `/revalidate`). |
| Types | `standard` / `custom` need `packageSlug`; `contact` must not carry one (a stray slug is dropped, not rejected). `custom` adds `preferredDates` (≤ 200), `budget` (rupees per person, 1,000–10,00,000, stored as paise), `changes` (≤ 1000). |
| Validation split | pydantic is the source of truth; zod mirrors it so the browser shows the same inline errors before a round trip and the no-JS proxy can reject junk without calling the api. `api/tests/fixtures/enquiry_cases.json` holds valid/invalid cases; pytest and vitest both run them, so drift fails CI. |
| Email | Regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, lowercased and trimmed — no `email-validator` dependency. |
| Honeypot | Hidden `website` field (off-screen, `tabIndex=-1`, `autoComplete="off"`, `aria-hidden`). Filled → `201` with a plausible ref and **no row** (bots learn nothing). |
| Rate limit | `infra/ratelimit.py`: `RateLimiter` protocol with `hit(key) -> RateLimitResult(allowed, retry_after)`; `UpstashRateLimiter` = sliding-window log via one REST `/pipeline` call (`ZREMRANGEBYSCORE`, `ZADD`, `ZCARD`, `PEXPIRE`); `NullRateLimiter` when the Upstash env is unset (dev/CI) — logs once. Upstash errors **fail open** (log + Sentry): a lost lead costs more than a spam row. Built in `create_app` onto `app.state.rate_limiter`; tests swap in a fake. Key `enquiry:{ip}`, 5 per 600 s. |
| Client IP | First value of `X-Forwarded-For` (Vercel sets it), else `request.client.host`. Stored as `sha256(ip)[:32]` in `ip_hash`. |
| Dedupe | Same normalised phone + same `package_id` (`NULL` counts as equal) within 60 s → return the existing enquiry (`201`, same ref). No second row, no second email later. |
| Ref | `TS-` + 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`secrets.choice`); on a unique-violation retry up to 5 times. |
| Response | `EnquiryCreated { ref, firstName, package: { slug, name } \| null }` — enough for the thanks page without a public read endpoint. |
| Thanks copy | "Thanks, {first} — we'll call you within 2 hours." + ref pill + office-hours line + three steps + WhatsApp (prefilled with the ref) + Browse more trips. Email/PDF sentences and the PDF button are added by F10/F11. |
| No-JS round trip | Proxy validates with zod; invalid → `303` back to the form URL with `?fieldErrors=<json>` + the posted values as query params (name/phone/email are the visitor's own; it is the fallback path). Valid → api; `201` → `303 /enquiry/thanks?…`; `400` → back with the api's `fieldErrors`; `429`/other → back with `?error=rate_limited` / `?error=internal`. The page reads `searchParams` and passes `defaultValues` + `fieldErrors` to the form. |
| JS path | `EnquiryForm` intercepts submit, runs zod, shows inline errors, `fetch('/api/enquiries')` (the existing `/api/*` rewrite), `router.push` to thanks on 201, envelope `fieldErrors` inline on 400, a banner on 429/other. The native `action`/`method` stay so the form is identical without JS. |
| `errorFromResponse` | Moves to `lib/api-errors.ts` (no `next/headers` import) so the client component can parse the envelope; `lib/api.ts` re-exports it — no caller changes. |
| Package page | `PriceBox` gains the primary **Enquire** button (link to `/packages/<slug>/enquire`); its "Enquiries open soon" sentence goes. The sticky mobile bar + FAB are F12+F13. |
| Contact page | `ContactForm` (WhatsApp stand-in), `lib/contact.ts` and `tests/contact.test.ts` are deleted; `<EnquiryForm kind="contact" …/>` takes the slot. Months list built server-side (`travelMonthOptions`). |
| Travel month | `travelMonthOptions(today)` = the next 12 months as `{ value: 'YYYY-MM', label: 'October 2026' }`; the api stores the first of the month. |
| Cache | `POST /enquiries` responds `Cache-Control: no-store`. The enquire page is `force-dynamic` (it reads `searchParams`); the package fetch inside is cached 1 h + tagged like the package page. |

---

## Local environment (do once, before Task 1)

`api/.env.local` and `web/.env.local` are already copied into the worktree. **`api/.env.local` `DATABASE_URL` is Neon production** — always pass `--database-url` / `DATABASE_URL=` for local work. Ports 3000/8000 may be Viraj's other projects — check `Get-CimInstance Win32_Process` CommandLine before killing anything; this row uses **api 8002, web 3001**.

The throwaway Postgres data dir from the F7+F8 run is in this session's scratchpad (`$SCRATCHPAD/pg`, stopped). Start it (own background call — `pg_ctl` hangs the bash tool otherwise):

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_ctl" -D "$SCRATCHPAD/pg" -o "-p 5499" -l "$SCRATCHPAD/pg/log" start
```

If the dir is gone: `initdb -U tripsmith -A trust -E UTF8 -D "$SCRATCHPAD/pg"`, start, then `createdb -p 5499 -U tripsmith tripsmith_test` and `tripsmith_dev`, `ALEMBIC_URL=$DEV_URL uv run alembic upgrade head`, `uv run python scripts/seed.py --local --database-url $DEV_URL` (from `api/`).

```bash
cd "/c/PORTFOLIO PROJECTS/projects/01-tripsmith/.worktrees/f9-enquiry"
export PATH="/c/Users/Viraj/AppData/Local/Microsoft/WinGet/Packages/astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
export TEST_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_test
export DEV_URL=postgresql+asyncpg://tripsmith@localhost:5499/tripsmith_dev
pnpm install --frozen-lockfile
uv run --directory api pytest -q -p no:cacheprovider   # baseline: 120 passed
pnpm --filter web test                                 # baseline: 63 passed
```

Dev servers (background calls): `DATABASE_URL=$DEV_URL uv run --directory api uvicorn app.main:app --reload --port 8002` and, from `web/`, `API_URL=http://localhost:8002 pnpm exec next dev -p 3001` (`pnpm --filter web dev -- -p` does not pass the flag). Seed photos 404 locally through `next/image` unless something serves them on 8000 — cosmetic. Kill by port afterwards.

Commit this plan first:

```bash
git add docs/superpowers/plans/2026-09-18-f9-enquiry-form.md
git commit -m "docs(F9): implementation plan for the enquiry form"
```

---

## File structure

**api**
- Create `app/schemas/enquiries.py` — `EnquiryCreate`, `EnquiryCreated`, `PackageRef`, `normalise_phone`, `EMAIL_RE`.
- Create `app/infra/ratelimit.py` — `RateLimitResult`, `RateLimiter` protocol, `UpstashRateLimiter`, `NullRateLimiter`, `build_rate_limiter(settings)`.
- Create `app/services/enquiries.py` — `submit_enquiry`, `make_ref`, `hash_ip`, `DEDUPE_WINDOW`.
- Create `app/routers/site/enquiries.py` — `POST /enquiries`.
- Modify `app/main.py` — `app.state.rate_limiter`, include the router.
- Create `tests/fixtures/enquiry_cases.json`, `tests/test_enquiry_schema.py`, `tests/test_ratelimit.py`, `tests/test_enquiries.py`.
- Regenerate `api/openapi.json`, `web/src/lib/api-types.ts`.

**web**
- Create `src/lib/api-errors.ts` (moved out of `api.ts`); modify `src/lib/api.ts` to re-export.
- Create `src/lib/enquiry-schema.ts` — zod mirror, `normalisePhone`, `enquiryFromForm`, `travelMonthOptions`, `TRAVELLERS`.
- Create `src/components/site/enquiry/{EnquiryForm,Field,PackageSummary}.tsx`.
- Create `src/app/(site)/packages/[slug]/enquire/page.tsx`, `src/app/(site)/enquiry/thanks/page.tsx`, `src/app/enquire/route.ts`.
- Modify `src/app/(site)/contact/page.tsx`, `src/components/site/package/PriceBox.tsx`.
- Delete `src/components/site/contact/ContactForm.tsx`, `src/lib/contact.ts`, `tests/contact.test.ts`.
- Create `tests/enquiry-schema.test.ts`, `tests/api-errors.test.ts` (moved assertions if any live in `api.test.ts`).

**docs**
- `docs/07-plan.md` row F9 marked in the final task.

---

### Task 1: `EnquiryCreate` — the pydantic model and the shared case file

**Files:**
- Create: `api/app/schemas/enquiries.py`
- Create: `api/tests/fixtures/enquiry_cases.json`
- Create: `api/tests/test_enquiry_schema.py`

**Interfaces:**
- Consumes: `ApiModel`, `EnquiryType`, `MAX_TRAVELLERS`, `ENQUIRY_MESSAGE_MAX` from `app.schemas.meta`.
- Produces: `normalise_phone(raw: str) -> str`; `EnquiryCreate` (fields below, wire names camelCase); `PackageRef { slug, name }`; `EnquiryCreated { ref, first_name, package: PackageRef | None }`; the case file format `{ "valid": [ {…body…} ], "invalid": [ { "body": {…}, "field": "phone" } ] }`.

- [ ] **Step 1: The case file (shared with the web mirror test in Task 6)**

`api/tests/fixtures/enquiry_cases.json`:

```json
{
  "valid": [
    {
      "type": "standard",
      "packageSlug": "north-goa-beaches",
      "name": "Priya Sharma",
      "phone": "98450 22110",
      "email": "Priya.S@Gmail.com",
      "travelMonth": "2026-11",
      "adults": 2,
      "children": 0,
      "message": "Looking at the 14 Nov departure. Are early check-ins possible?",
      "website": ""
    },
    {
      "type": "custom",
      "packageSlug": "goa-quiet-escape",
      "name": "Anand Kulkarni",
      "phone": "+91 98450-22110",
      "email": "anand@example.com",
      "travelMonth": "2027-01",
      "adults": 4,
      "children": 2,
      "message": "",
      "preferredDates": "Around Republic Day weekend",
      "budget": 25000,
      "changes": "One extra night at Palolem",
      "website": ""
    },
    {
      "type": "contact",
      "name": "Sneha Iyer",
      "phone": "09845022110",
      "email": "sneha@example.com",
      "adults": 1,
      "children": 0,
      "message": "Do you run anything in Coorg?",
      "website": ""
    },
    {
      "type": "contact",
      "packageSlug": "north-goa-beaches",
      "name": "Ignored Slug",
      "phone": "9845022110",
      "email": "x@y.io",
      "adults": 2,
      "children": 0,
      "website": ""
    }
  ],
  "invalid": [
    { "field": "phone", "body": { "type": "contact", "name": "Bad Phone", "phone": "12345", "email": "a@b.co", "adults": 1, "children": 0, "website": "" } },
    { "field": "phone", "body": { "type": "contact", "name": "Bad Phone", "phone": "5845022110", "email": "a@b.co", "adults": 1, "children": 0, "website": "" } },
    { "field": "phone", "body": { "type": "contact", "name": "Bad Phone", "phone": "+44 7700 900123", "email": "a@b.co", "adults": 1, "children": 0, "website": "" } },
    { "field": "email", "body": { "type": "contact", "name": "Bad Email", "phone": "9845022110", "email": "nope", "adults": 1, "children": 0, "website": "" } },
    { "field": "name", "body": { "type": "contact", "name": "A", "phone": "9845022110", "email": "a@b.co", "adults": 1, "children": 0, "website": "" } },
    { "field": "adults", "body": { "type": "contact", "name": "No Adults", "phone": "9845022110", "email": "a@b.co", "adults": 0, "children": 1, "website": "" } },
    { "field": "children", "body": { "type": "contact", "name": "Too Many", "phone": "9845022110", "email": "a@b.co", "adults": 10, "children": 5, "website": "" } },
    { "field": "travelMonth", "body": { "type": "contact", "name": "Bad Month", "phone": "9845022110", "email": "a@b.co", "travelMonth": "2026-13", "adults": 1, "children": 0, "website": "" } },
    { "field": "packageSlug", "body": { "type": "standard", "name": "No Package", "phone": "9845022110", "email": "a@b.co", "adults": 1, "children": 0, "website": "" } },
    { "field": "type", "body": { "type": "group", "name": "Wrong Type", "phone": "9845022110", "email": "a@b.co", "adults": 1, "children": 0, "website": "" } },
    { "field": "budget", "body": { "type": "custom", "packageSlug": "north-goa-beaches", "name": "Low Budget", "phone": "9845022110", "email": "a@b.co", "adults": 1, "children": 0, "budget": 500, "website": "" } },
    { "field": "message", "body": { "type": "contact", "name": "Long Message", "phone": "9845022110", "email": "a@b.co", "adults": 1, "children": 0, "message": "@@LONG_1001@@", "website": "" } }
  ]
}
```

`"@@LONG_1001@@"` is a marker both test runners replace with a 1001-character string before validating (keeps the file readable).

- [ ] **Step 2: The failing test**

`api/tests/test_enquiry_schema.py`:

```python
"""EnquiryCreate rules (06 A4 / Part D) — the same case file drives the web's zod mirror."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.enquiries import EnquiryCreate, normalise_phone

CASES = json.loads((Path(__file__).parent / "fixtures" / "enquiry_cases.json").read_text("utf-8"))


def expand(body: dict[str, object]) -> dict[str, object]:
    return {k: ("a" * 1001 if v == "@@LONG_1001@@" else v) for k, v in body.items()}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9845022110", "9845022110"),
        ("98450 22110", "9845022110"),
        ("+91 98450-22110", "9845022110"),
        ("09845022110", "9845022110"),
        ("(+91) 98450.22110", "9845022110"),
        ("919845022110", "9845022110"),
        ("12345", "12345"),  # not normalised into something valid
    ],
)
def test_normalise_phone(raw: str, expected: str) -> None:
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("body", CASES["valid"], ids=lambda b: f"{b['type']}:{b['name']}")
def test_valid_cases_parse(body: dict[str, object]) -> None:
    e = EnquiryCreate.model_validate(expand(body))
    assert e.phone == "9845022110"
    assert e.email == e.email.lower().strip()


@pytest.mark.parametrize("case", CASES["invalid"], ids=lambda c: f"{c['field']}:{c['body']['name']}")
def test_invalid_cases_name_the_field(case: dict[str, object]) -> None:
    with pytest.raises(ValidationError) as exc:
        EnquiryCreate.model_validate(expand(case["body"]))  # type: ignore[arg-type]
    fields = {".".join(str(p) for p in err["loc"]) for err in exc.value.errors()}
    assert case["field"] in fields, fields


def test_contact_drops_a_stray_package_slug_and_custom_keeps_its_fields() -> None:
    contact = EnquiryCreate.model_validate(CASES["valid"][3])
    assert contact.package_slug is None
    custom = EnquiryCreate.model_validate(CASES["valid"][1])
    assert custom.budget_paise == 25_000 * 100
    assert custom.travel_month is not None and custom.travel_month.isoformat() == "2027-01-01"


def test_honeypot_is_a_plain_string_that_defaults_to_empty() -> None:
    e = EnquiryCreate.model_validate({**CASES["valid"][2], "website": "http://spam"})
    assert e.website == "http://spam"
```

Run (from `api/`): `uv run pytest tests/test_enquiry_schema.py -q -p no:cacheprovider`
Expected: ImportError on `app.schemas.enquiries`.

- [ ] **Step 3: The model**

`api/app/schemas/enquiries.py`:

```python
"""`POST /enquiries` contract (06 C2, Part D). The zod mirror in web/src/lib/enquiry-schema.ts
must agree with every rule here — tests/fixtures/enquiry_cases.json is run by both sides."""

import datetime as dt
import re
from typing import Annotated, Self

from pydantic import Field, ValidationInfo, field_validator, model_validator

from app.schemas import ApiModel
from app.schemas.meta import ENQUIRY_MESSAGE_MAX, MAX_TRAVELLERS, EnquiryType

PHONE_RE = re.compile(r"^[6-9]\d{9}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
BUDGET_MIN_INR = 1_000
BUDGET_MAX_INR = 10_00_000

PHONE_MESSAGE = "Enter a 10-digit Indian mobile number"


def normalise_phone(raw: str) -> str:
    """`+91 98450-22110` / `09845022110` / `919845022110` → `9845022110`. Never invents digits."""
    digits = re.sub(r"[\s\-.()]", "", raw.strip())
    if digits.startswith("+91"):
        digits = digits[3:]
    elif len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


class PackageRef(ApiModel):
    slug: str
    name: str


class EnquiryCreate(ApiModel):
    type: EnquiryType
    package_slug: str | None = Field(
        default=None, pattern=r"^[a-z0-9-]+$", max_length=80, validate_default=True
    )
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: str = Field(max_length=120)
    travel_month: dt.date | None = Field(default=None, description="First of the month")
    adults: Annotated[int, Field(ge=1, le=MAX_TRAVELLERS)]
    children: Annotated[int, Field(ge=0, le=MAX_TRAVELLERS - 1)] = 0
    message: str | None = Field(default=None, max_length=ENQUIRY_MESSAGE_MAX)
    preferred_dates: str | None = Field(default=None, max_length=200)
    budget_paise: int | None = Field(
        default=None, alias="budget", description="Rupees per person on the wire; paise here"
    )
    changes: str | None = Field(default=None, max_length=ENQUIRY_MESSAGE_MAX)
    website: str = Field(default="", description="Honeypot — humans never fill it")

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("message", "preferred_dates", "changes", mode="before")
    @classmethod
    def _blank_to_none(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip() or None
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def _phone(cls, v: object) -> str:
        digits = normalise_phone(v) if isinstance(v, str) else ""
        if not PHONE_RE.match(digits):
            raise ValueError(PHONE_MESSAGE)
        return digits

    @field_validator("email", mode="before")
    @classmethod
    def _email(cls, v: object) -> str:
        s = v.strip().lower() if isinstance(v, str) else ""
        if not EMAIL_RE.match(s):
            raise ValueError("Enter a valid email address")
        return s

    @field_validator("travel_month", mode="before")
    @classmethod
    def _month(cls, v: object) -> dt.date | None:
        if v in (None, ""):
            return None
        if isinstance(v, str) and MONTH_RE.match(v):
            year, month = v.split("-")
            return dt.date(int(year), int(month), 1)
        raise ValueError("Pick a month")

    @field_validator("budget_paise", mode="before")
    @classmethod
    def _budget_to_paise(cls, v: object) -> object:
        if v in (None, ""):
            return None
        if isinstance(v, bool) or not isinstance(v, int | float | str):
            raise ValueError("Enter a budget in rupees")
        try:
            rupees = int(v)
        except ValueError as e:
            raise ValueError("Enter a budget in rupees") from e
        if not BUDGET_MIN_INR <= rupees <= BUDGET_MAX_INR:
            raise ValueError(f"Between ₹{BUDGET_MIN_INR:,} and ₹{BUDGET_MAX_INR:,} per person")
        return rupees * 100

    @field_validator("children")
    @classmethod
    def _party_size(cls, v: int, info: ValidationInfo) -> int:
        adults = info.data.get("adults")
        if isinstance(adults, int) and adults + v > MAX_TRAVELLERS:
            raise ValueError(f"Up to {MAX_TRAVELLERS} travellers per enquiry — for more, call us")
        return v

    @field_validator("package_slug")
    @classmethod
    def _package_matches_type(cls, v: str | None, info: ValidationInfo) -> str | None:
        kind = info.data.get("type")
        if kind == EnquiryType.CONTACT:
            return None  # a stray slug from a shared form is dropped, not rejected
        if kind in (EnquiryType.STANDARD, EnquiryType.CUSTOM) and not v:
            raise ValueError("Choose a trip to enquire about")
        return v

    @model_validator(mode="after")
    def _custom_only_fields(self) -> Self:
        if self.type != EnquiryType.CUSTOM:
            self.preferred_dates = None
            self.budget_paise = None
            self.changes = None
        return self

    @property
    def first_name(self) -> str:
        return self.name.split()[0]


class EnquiryCreated(ApiModel):
    ref: str = Field(examples=["TS-7F3K2Q"])
    first_name: str
    package: PackageRef | None
```

Notes for the implementer: field declaration order matters — `type` and `adults` are declared before the validators that read them from `info.data`; `validate_default=True` on `package_slug` is what makes "standard without a slug" fail (validators skip defaults otherwise). Error `loc`s use the wire alias (`packageSlug`, `budget`) because the body is validated by alias — that is what the tests and the web mirror key on.

- [ ] **Step 4: Run, then lint**

Run: `uv run pytest tests/test_enquiry_schema.py -q -p no:cacheprovider`
Expected: all pass (7 normalise + 4 valid + 12 invalid + 2 = 25).

Run: `uv run ruff format app tests && uv run ruff check app tests && uv run pyright`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas/enquiries.py api/tests/fixtures/enquiry_cases.json api/tests/test_enquiry_schema.py
git commit -m "feat(F9): EnquiryCreate with Indian-mobile normalisation + the shared case file"
```

---

### Task 2: `infra/ratelimit.py` — Upstash sliding window, null limiter, app wiring

**Files:**
- Create: `api/app/infra/ratelimit.py`
- Create: `api/tests/test_ratelimit.py`
- Modify: `api/app/main.py`

**Interfaces:**
- Produces: `RateLimitResult(allowed: bool, retry_after: int)`; `class RateLimiter(Protocol): async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult`; `UpstashRateLimiter(url, token, *, client: httpx.AsyncClient | None = None)`; `NullRateLimiter()`; `build_rate_limiter(settings) -> RateLimiter`; `app.state.rate_limiter`.

- [ ] **Step 1: The failing tests**

`api/tests/test_ratelimit.py`:

```python
"""Sliding-window limiter over Upstash REST; fails open; null when unconfigured (04 §rate limiting)."""

import json
import logging

import httpx
import pytest

from app.infra.ratelimit import NullRateLimiter, UpstashRateLimiter, build_rate_limiter
from tests.settings import make_settings


def pipeline_transport(counts: list[int], *, status: int = 200) -> httpx.MockTransport:
    """Answers each /pipeline call with ZCARD = the next value in `counts`."""
    calls: list[list[list[str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        if status != 200:
            return httpx.Response(status, text="boom")
        n = counts.pop(0)
        return httpx.Response(200, json=[{"result": 0}, {"result": 1}, {"result": n}, {"result": 1}])

    transport = httpx.MockTransport(handler)
    transport.calls = calls  # type: ignore[attr-defined]
    return transport


async def test_upstash_allows_up_to_the_limit_then_blocks() -> None:
    transport = pipeline_transport([1, 5, 6])
    limiter = UpstashRateLimiter(
        "https://x.upstash.io", "tok", client=httpx.AsyncClient(transport=transport)
    )
    first = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    fifth = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    sixth = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    assert first.allowed and fifth.allowed and not sixth.allowed
    assert sixth.retry_after == 600
    commands = transport.calls[0]  # type: ignore[attr-defined]
    assert [c[0] for c in commands] == ["ZREMRANGEBYSCORE", "ZADD", "ZCARD", "PEXPIRE"]
    assert commands[1][1] == "enquiry:1.2.3.4" and commands[3][2] == "600000"


async def test_upstash_sends_the_bearer_token() -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(200, json=[{"result": 0}, {"result": 1}, {"result": 1}, {"result": 1}])

    limiter = UpstashRateLimiter(
        "https://x.upstash.io/", "tok", client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    await limiter.hit("k", limit=1, window_seconds=1)
    assert seen == ["Bearer tok"]


async def test_upstash_fails_open_on_errors(caplog: pytest.LogCaptureFixture) -> None:
    limiter = UpstashRateLimiter(
        "https://x.upstash.io",
        "tok",
        client=httpx.AsyncClient(transport=pipeline_transport([], status=500)),
    )
    with caplog.at_level(logging.ERROR):
        result = await limiter.hit("k", limit=1, window_seconds=1)
    assert result.allowed
    assert "rate limiter" in caplog.text.lower()


async def test_null_limiter_always_allows() -> None:
    r = await NullRateLimiter().hit("k", limit=1, window_seconds=1)
    assert r.allowed and r.retry_after == 0


def test_build_picks_upstash_only_when_both_values_are_set() -> None:
    assert isinstance(build_rate_limiter(make_settings()), NullRateLimiter)
    assert isinstance(
        build_rate_limiter(
            make_settings(upstash_redis_rest_url="https://x.upstash.io", upstash_redis_rest_token="t")
        ),
        UpstashRateLimiter,
    )
```

Run: `uv run pytest tests/test_ratelimit.py -q -p no:cacheprovider`
Expected: ImportError.

- [ ] **Step 2: The module**

`api/app/infra/ratelimit.py`:

```python
"""Rate limiting over Upstash Redis REST (04 §rate limiting) as a sliding-window log.

One `/pipeline` round trip per hit: drop entries older than the window, add this hit, count,
refresh the TTL. Upstash being down never blocks a visitor — the limiter fails open and reports.
When the Upstash env is unset (dev, CI) `NullRateLimiter` allows everything and says so once.
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Protocol

import httpx
import sentry_sdk

from app.config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0  # seconds; 0 when allowed


class RateLimiter(Protocol):
    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult: ...


class NullRateLimiter:
    _warned = False

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        if not NullRateLimiter._warned:
            NullRateLimiter._warned = True
            log.warning("UPSTASH_REDIS_REST_URL/TOKEN unset — rate limiting is off")
        return RateLimitResult(allowed=True)


class UpstashRateLimiter:
    def __init__(self, url: str, token: str, *, client: httpx.AsyncClient | None = None) -> None:
        self._url = url.rstrip("/") + "/pipeline"
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = client or httpx.AsyncClient(timeout=3.0)

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        now_ms = int(time.time() * 1000)
        window_ms = window_seconds * 1000
        commands = [
            ["ZREMRANGEBYSCORE", key, "0", str(now_ms - window_ms)],
            ["ZADD", key, str(now_ms), f"{now_ms}-{uuid.uuid4().hex[:8]}"],
            ["ZCARD", key],
            ["PEXPIRE", key, str(window_ms)],
        ]
        try:
            res = await self._client.post(self._url, json=commands, headers=self._headers)
            res.raise_for_status()
            count = int(res.json()[2]["result"])
        except Exception as exc:  # noqa: BLE001 — any failure fails open, by design
            log.error("Rate limiter unavailable, allowing request: %s", exc)
            sentry_sdk.capture_exception(exc)
            return RateLimitResult(allowed=True)
        if count > limit:
            return RateLimitResult(allowed=False, retry_after=window_seconds)
        return RateLimitResult(allowed=True)


def build_rate_limiter(settings: Settings) -> RateLimiter:
    if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
        return UpstashRateLimiter(
            settings.upstash_redis_rest_url, settings.upstash_redis_rest_token.get_secret_value()
        )
    return NullRateLimiter()
```

- [ ] **Step 3: Wire it in `create_app`**

In `api/app/main.py` add `from app.infra.ratelimit import build_rate_limiter` and, right after `app.state.settings = settings`:

```python
    app.state.rate_limiter = build_rate_limiter(settings)  # swapped by tests; read by routers
```

- [ ] **Step 4: Run + lint**

Run: `uv run pytest tests/test_ratelimit.py tests/test_smoke.py -q -p no:cacheprovider`
Expected: 5 + smoke pass.

Run: `uv run ruff format app tests && uv run ruff check app tests && uv run pyright`
Expected: clean (if pyright objects to `transport.calls`, keep the `# type: ignore[attr-defined]` comments as written).

- [ ] **Step 5: Commit**

```bash
git add api/app/infra/ratelimit.py api/app/main.py api/tests/test_ratelimit.py
git commit -m "feat(F9): Upstash sliding-window rate limiter (fails open, null when unset)"
```

---

### Task 3: `services/enquiries.submit_enquiry` + `POST /enquiries`

**Files:**
- Create: `api/app/services/enquiries.py`
- Create: `api/app/routers/site/enquiries.py`
- Modify: `api/app/main.py`
- Create: `api/tests/test_enquiries.py`
- Regenerate: `api/openapi.json`, `web/src/lib/api-types.ts` (`pnpm gen:api` from the root)

**Interfaces:**
- Consumes: `EnquiryCreate`, `EnquiryCreated`, `PackageRef` (Task 1); `RateLimiter` on `app.state.rate_limiter` (Task 2); `Enquiry`, `Package` models; `get_session`; `ApiError`.
- Produces: `submit_enquiry(db, payload, *, ip, user_agent, now=None) -> EnquiryCreated`; `make_ref() -> str`; `hash_ip(ip) -> str`; `DEDUPE_WINDOW = timedelta(seconds=60)`; `ENQUIRY_LIMIT = 5`, `ENQUIRY_WINDOW_SECONDS = 600`; route `POST /enquiries` operationId `submitEnquiry` → `201 EnquiryCreated`.

- [ ] **Step 1: The failing tests**

`api/tests/test_enquiries.py`:

```python
"""POST /enquiries (06 C2): saves with status=new, dedupes 60 s, honeypot, rate limit, envelope."""

import datetime as dt
import re

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.ratelimit import RateLimitResult
from app.models import Enquiry
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.services.enquiries import make_ref
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

BODY = {
    "type": "standard",
    "packageSlug": "north-goa-beaches",
    "name": "Priya Sharma",
    "phone": "+91 98450 22110",
    "email": "Priya@Example.com",
    "travelMonth": "2026-11",
    "adults": 2,
    "children": 1,
    "message": "Early check-in possible?",
    "website": "",
}


class CountingLimiter:
    def __init__(self, limit: int = 5) -> None:
        self.limit, self.hits = limit, []  # type: ignore[var-annotated]

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        self.hits.append(key)
        n = self.hits.count(key)
        return RateLimitResult(allowed=n <= self.limit, retry_after=0 if n <= self.limit else 600)


async def seeded(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


async def count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(Enquiry))).scalar_one()


def test_make_ref_shape() -> None:
    for _ in range(50):
        assert re.fullmatch(r"TS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}", make_ref())


@pytest.mark.db
async def test_submit_saves_a_new_enquiry(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post(
        "/enquiries", json=BODY, headers={"X-Forwarded-For": "1.2.3.4, 10.0.0.1", "User-Agent": "UA"}
    )
    assert res.status_code == 201, res.text
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert re.fullmatch(r"TS-[A-Z2-9]{6}", body["ref"])
    assert body["firstName"] == "Priya"
    assert body["package"] == {"slug": "north-goa-beaches", "name": "North Goa Beaches"}

    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.ref == body["ref"]
    assert row.type == EnquiryType.STANDARD and row.status == EnquiryStatus.NEW
    assert row.email_status == EmailStatus.SKIPPED
    assert row.phone == "9845022110" and row.email == "priya@example.com"
    assert row.travel_month == dt.date(2026, 11, 1)
    assert row.adults == 2 and row.children == 1
    assert row.package_id is not None
    assert row.ip_hash and row.ip_hash != "1.2.3.4" and len(row.ip_hash) == 32
    assert row.user_agent == "UA"


@pytest.mark.db
async def test_contact_enquiry_has_no_package(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post(
        "/enquiries",
        json={**BODY, "type": "contact", "packageSlug": None, "travelMonth": None},
    )
    assert res.status_code == 201
    assert res.json()["package"] is None
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.package_id is None and row.type == EnquiryType.CONTACT


@pytest.mark.db
async def test_custom_enquiry_stores_the_extra_fields(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post(
        "/enquiries",
        json={
            **BODY,
            "type": "custom",
            "preferredDates": "14–18 Nov",
            "budget": 25000,
            "changes": "Add a night",
        },
    )
    assert res.status_code == 201
    row = (await db.execute(select(Enquiry))).scalar_one()
    assert row.preferred_dates == "14–18 Nov"
    assert row.budget_paise == 2_500_000
    assert row.changes == "Add a night"


@pytest.mark.db
async def test_validation_errors_use_wire_names(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post("/enquiries", json={**BODY, "phone": "12345", "packageSlug": None})
    assert res.status_code == 400
    err = res.json()["error"]
    assert err["code"] == "validation"
    assert set(err["fieldErrors"]) == {"phone", "packageSlug"}
    assert err["fieldErrors"]["phone"].endswith("Enter a 10-digit Indian mobile number")
    assert await count(db) == 0


@pytest.mark.db
async def test_unknown_or_draft_package_is_a_field_error(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post("/enquiries", json={**BODY, "packageSlug": "atlantis"})
    assert res.status_code == 400
    assert res.json()["error"]["fieldErrors"] == {"packageSlug": "That trip is no longer available"}


@pytest.mark.db
async def test_honeypot_returns_success_without_saving(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    res = await db_client.post("/enquiries", json={**BODY, "website": "http://spam.example"})
    assert res.status_code == 201
    assert re.fullmatch(r"TS-[A-Z2-9]{6}", res.json()["ref"])
    assert await count(db) == 0


@pytest.mark.db
async def test_duplicate_within_a_minute_returns_the_same_ref(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    first = await db_client.post("/enquiries", json=BODY)
    second = await db_client.post("/enquiries", json={**BODY, "message": "resent", "phone": "9845022110"})
    assert first.status_code == second.status_code == 201
    assert first.json()["ref"] == second.json()["ref"]
    assert await count(db) == 1
    # A different package (or none) is a different enquiry.
    third = await db_client.post("/enquiries", json={**BODY, "packageSlug": "goa-quiet-escape"})
    assert third.status_code == 201 and third.json()["ref"] != first.json()["ref"]
    assert await count(db) == 2


@pytest.mark.db
async def test_rate_limit_is_per_ip_and_returns_429(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seeded(db)
    limiter = CountingLimiter(limit=2)
    db_app.state.rate_limiter = limiter
    h = {"X-Forwarded-For": "9.9.9.9"}
    assert (await db_client.post("/enquiries", json=BODY, headers=h)).status_code == 201
    assert (await db_client.post("/enquiries", json={**BODY, "phone": "9000000001"}, headers=h)).status_code == 201
    res = await db_client.post("/enquiries", json={**BODY, "phone": "9000000002"}, headers=h)
    assert res.status_code == 429
    assert res.headers["retry-after"] == "600"
    assert res.json()["error"]["code"] == "rate_limited"
    assert limiter.hits == ["enquiry:9.9.9.9"] * 3
    # The limiter is consulted before validation, so junk cannot be used to probe rules for free.
    other = await db_client.post("/enquiries", json=BODY, headers={"X-Forwarded-For": "8.8.8.8"})
    assert other.status_code == 201
```

Run: `uv run pytest tests/test_enquiries.py -q -p no:cacheprovider`
Expected: ImportError.

- [ ] **Step 2: The service**

`api/app/services/enquiries.py`:

```python
"""submitEnquiry (06 C2): honeypot, package lookup, 60 s dedupe, ref, insert. Emails and the PDF
attach here in F10/F11 — this row only writes the row."""

import datetime as dt
import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Enquiry, Package
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType, PackageStatus
from app.schemas.enquiries import EnquiryCreate, EnquiryCreated, PackageRef

REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — refs are read out on the phone
DEDUPE_WINDOW = dt.timedelta(seconds=60)
PACKAGE_GONE = "That trip is no longer available"


def make_ref() -> str:
    return "TS-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def hash_ip(ip: str) -> str:
    """Abuse tracing without storing addresses (06 A4)."""
    return hashlib.sha256(ip.encode()).hexdigest()[:32]


async def _live_package(db: AsyncSession, slug: str) -> Package:
    pkg = (
        await db.execute(
            select(Package).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if pkg is None:
        raise ApiError("validation", "Request validation failed", field_errors={"packageSlug": PACKAGE_GONE})
    return pkg


async def _recent_duplicate(
    db: AsyncSession, phone: str, package_id: str | None, since: dt.datetime
) -> Enquiry | None:
    stmt = (
        select(Enquiry)
        .where(Enquiry.phone == phone, Enquiry.created_at >= since)
        .order_by(Enquiry.created_at.desc())
    )
    stmt = stmt.where(Enquiry.package_id == package_id) if package_id else stmt.where(Enquiry.package_id.is_(None))
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


async def submit_enquiry(
    db: AsyncSession,
    payload: EnquiryCreate,
    *,
    ip: str,
    user_agent: str | None,
    now: dt.datetime | None = None,
) -> EnquiryCreated:
    now = now or dt.datetime.now(dt.UTC)
    package = await _live_package(db, payload.package_slug) if payload.package_slug else None
    ref_of = PackageRef(slug=package.slug, name=package.name) if package else None

    if payload.website:
        # A bot filled the honeypot: look successful, keep nothing.
        return EnquiryCreated(ref=make_ref(), first_name=payload.first_name, package=ref_of)

    existing = await _recent_duplicate(
        db, payload.phone, package.id if package else None, now - DEDUPE_WINDOW
    )
    if existing is not None:
        return EnquiryCreated(ref=existing.ref, first_name=payload.first_name, package=ref_of)

    for _attempt in range(5):
        enquiry = Enquiry(
            ref=make_ref(),
            type=EnquiryType(payload.type.value),
            package_id=package.id if package else None,
            name=payload.name,
            phone=payload.phone,
            email=payload.email,
            travel_month=payload.travel_month,
            adults=payload.adults,
            children=payload.children,
            message=payload.message,
            preferred_dates=payload.preferred_dates,
            budget_paise=payload.budget_paise,
            changes=payload.changes,
            status=EnquiryStatus.NEW,
            email_status=EmailStatus.SKIPPED,
            ip_hash=hash_ip(ip),
            user_agent=(user_agent or "")[:300] or None,
        )
        db.add(enquiry)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()  # ref collision (1 in 2^30) — draw again
            continue
        return EnquiryCreated(ref=enquiry.ref, first_name=payload.first_name, package=ref_of)
    raise ApiError("internal", "Could not allocate an enquiry reference")
```

`schemas.meta.EnquiryType` and `models.enums.EnquiryType` are different enums with the same values (see the F3 note) — hence `EnquiryType(payload.type.value)`.

- [ ] **Step 3: The route**

`api/app/routers/site/enquiries.py`:

```python
"""POST /enquiries — public, rate-limited (04 §rate limiting: 5 / 10 min / IP)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.schemas.enquiries import EnquiryCreate, EnquiryCreated
from app.services.enquiries import submit_enquiry

ENQUIRY_LIMIT = 5
ENQUIRY_WINDOW_SECONDS = 600


def client_ip(request: Request) -> str:
    """Vercel puts the visitor first in X-Forwarded-For; locally there is no proxy."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimited(ApiError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "rate_limited",
            "Too many enquiries from this connection — try again in a few minutes, or WhatsApp us",
        )
        self.retry_after = retry_after


async def enquiry_rate_limit(request: Request) -> None:
    """Router dependency: FastAPI runs it before the body is parsed, so junk cannot probe for free."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"enquiry:{client_ip(request)}", limit=ENQUIRY_LIMIT, window_seconds=ENQUIRY_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(result.retry_after)


router = APIRouter(tags=["public"], dependencies=[Depends(enquiry_rate_limit)])


@router.post(
    "/enquiries",
    operation_id="submitEnquiry",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def post_enquiry(
    payload: EnquiryCreate,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> EnquiryCreated:
    response.headers["Cache-Control"] = "no-store"
    return await submit_enquiry(
        db, payload, ip=client_ip(request), user_agent=request.headers.get("user-agent")
    )
```

`RateLimited` needs the `Retry-After` header on the envelope. In `api/app/errors.py` change `_api_error` to:

```python
async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    retry_after = getattr(exc, "retry_after", None)
    headers = {"Retry-After": str(retry_after)} if retry_after else None
    return envelope(exc.code, exc.message, field_errors=exc.field_errors, headers=headers)
```

In `api/app/main.py`: `from app.routers.site import catalog, enquiries, health, meta` and `app.include_router(enquiries.router)` after `catalog.router`.

- [ ] **Step 4: Run, lint, regenerate the contract**

Run: `uv run pytest tests/test_enquiries.py -q -p no:cacheprovider`
Expected: 9 passed. `fieldErrors` keys are the wire aliases (`packageSlug`) — `field_errors_from` strips the `body` prefix and pydantic reports `loc` by alias. If a key ever comes out snake_case, the model is wrong, not the test.

Run: `uv run ruff format app tests && uv run ruff check app tests && uv run pyright`
Expected: clean.

Run (root): `pnpm gen:api && git status --short api/openapi.json web/src/lib/api-types.ts`
Expected: both modified — `paths['/enquiries']['post']` with `EnquiryCreate` / `EnquiryCreated` schemas. `uv run pytest tests/test_openapi.py -q` passes.

Run: `uv run pytest -q -p no:cacheprovider`
Expected: **120 + 25 + 5 + 9 = 159 passed**.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/enquiries.py api/app/routers/site/enquiries.py api/app/main.py api/app/errors.py api/tests/test_enquiries.py api/openapi.json web/src/lib/api-types.ts
git commit -m "feat(F9): POST /enquiries — honeypot, 60 s dedupe, refs, 5/10 min/IP rate limit"
```

---

### Task 4: Web — `api-errors.ts` split + the zod mirror + month options

**Files:**
- Create: `web/src/lib/api-errors.ts`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/lib/enquiry-schema.ts`
- Create: `web/tests/enquiry-schema.test.ts`

**Interfaces:**
- Produces: `api-errors.ts` exports `apiErrorResponseSchema`, `ApiRequestError`, `errorFromResponse` (moved verbatim); `api.ts` re-exports them (`export { ApiRequestError, apiErrorResponseSchema, errorFromResponse } from './api-errors'`).
- `enquiry-schema.ts`: `normalisePhone(raw: string): string`; `enquirySchema` (zod) whose output type equals `components['schemas']['EnquiryCreate']` on the wire (`satisfies`); `type EnquiryInput = z.input<typeof enquirySchema>`; `type EnquiryBody = z.output<typeof enquirySchema>`; `fieldErrorsOf(err: z.ZodError): Record<string, string>` (first message per top-level path); `enquiryFromForm(data: FormData): Record<string, string>` (raw strings, numbers still strings); `travelMonthOptions(today = new Date()): { value: string; label: string }[]` (12 entries); `TRAVELLERS = { maxTotal: 12, adults: [1..12], children: [0..11] }`; `MESSAGE_MAX = 1000`; `BUDGET = { min: 1000, max: 1000000 }`; `PHONE_MESSAGE`.

- [ ] **Step 1: Move the error helpers**

Create `web/src/lib/api-errors.ts` with the `ApiErrorResponse`/`ErrorCode` types, `apiErrorResponseSchema`, `ApiRequestError` and `errorFromResponse` **cut** from `api.ts` (identical code; imports: `import { z } from 'zod'; import type { components } from './api-types';`). In `api.ts` delete those definitions and add at the top:

```ts
export {
  ApiRequestError,
  apiErrorResponseSchema,
  errorFromResponse,
  type ApiErrorResponse,
  type ErrorCode,
} from './api-errors';
import { errorFromResponse } from './api-errors';
```

(`api.ts` still uses `errorFromResponse` inside `api()`.) Run `pnpm --filter web test` — `api.test.ts` and everything else still pass (63).

- [ ] **Step 2: The failing mirror test**

`web/tests/enquiry-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  enquirySchema,
  fieldErrorsOf,
  normalisePhone,
  travelMonthOptions,
} from '../src/lib/enquiry-schema';

type Case = Record<string, unknown>;
const CASES = JSON.parse(
  readFileSync(resolve(__dirname, '../../api/tests/fixtures/enquiry_cases.json'), 'utf8'),
) as { valid: Case[]; invalid: { field: string; body: Case }[] };

const expand = (body: Case) =>
  Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k, v === '@@LONG_1001@@' ? 'a'.repeat(1001) : v]),
  );

describe('enquirySchema mirrors EnquiryCreate (api/tests/fixtures/enquiry_cases.json)', () => {
  it.each(CASES.valid.map((b) => [`${b.type}:${b.name}`, b] as const))('accepts %s', (_, body) => {
    const parsed = enquirySchema.safeParse(expand(body));
    expect(parsed.success, JSON.stringify(parsed)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.phone).toBe('9845022110');
      expect(parsed.data.email).toBe(parsed.data.email.toLowerCase().trim());
    }
  });

  it.each(CASES.invalid.map((c) => [`${c.field}:${c.body.name}`, c] as const))(
    'rejects %s on that field',
    (_, c) => {
      const parsed = enquirySchema.safeParse(expand(c.body));
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(Object.keys(fieldErrorsOf(parsed.error))).toContain(c.field);
    },
  );

  it('drops a stray package on contact and keeps custom fields only for custom', () => {
    const contact = enquirySchema.parse(CASES.valid[3]);
    expect(contact.packageSlug).toBeUndefined();
    const standard = enquirySchema.parse({ ...CASES.valid[0], budget: 25000, changes: 'x' });
    expect(standard.budget).toBeUndefined();
    expect(standard.changes).toBeUndefined();
    const custom = enquirySchema.parse(CASES.valid[1]);
    expect(custom.budget).toBe(25000);
  });

  it('coerces the strings a native form posts', () => {
    const parsed = enquirySchema.parse({
      type: 'custom',
      packageSlug: 'north-goa-beaches',
      name: ' Priya ',
      phone: '98450 22110',
      email: 'P@X.IO',
      travelMonth: '',
      adults: '2',
      children: '0',
      message: '',
      preferredDates: '',
      budget: '20000',
      changes: '',
      website: '',
    });
    expect(parsed).toMatchObject({ name: 'Priya', adults: 2, children: 0, budget: 20000 });
    expect(parsed.travelMonth).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });
});

describe('normalisePhone', () => {
  it.each([
    ['9845022110', '9845022110'],
    ['+91 98450-22110', '9845022110'],
    ['09845022110', '9845022110'],
    ['919845022110', '9845022110'],
    ['(+91) 98450.22110', '9845022110'],
    ['12345', '12345'],
  ])('%s → %s', (raw, out) => expect(normalisePhone(raw)).toBe(out));
});

describe('travelMonthOptions', () => {
  it('lists the next twelve months from today, labelled for people', () => {
    const opts = travelMonthOptions(new Date('2026-09-18T10:00:00Z'));
    expect(opts).toHaveLength(12);
    expect(opts[0]).toEqual({ value: '2026-09', label: 'September 2026' });
    expect(opts[3]).toEqual({ value: '2026-12', label: 'December 2026' });
    expect(opts[11]).toEqual({ value: '2027-08', label: 'August 2027' });
  });
});
```

Run (from `web/`): `pnpm exec vitest run tests/enquiry-schema.test.ts`
Expected: fails to import.

- [ ] **Step 3: The mirror**

`web/src/lib/enquiry-schema.ts`:

```ts
import { z } from 'zod';
import type { components } from './api-types';

/**
 * zod mirror of the api's `EnquiryCreate` (api/app/schemas/enquiries.py) — same normalisation,
 * same limits, same messages — so the browser and the no-JS proxy can reject junk before a round
 * trip. api/tests/fixtures/enquiry_cases.json is run against both; drift fails CI.
 */

export const MESSAGE_MAX = 1000;
export const TRAVELLERS = {
  maxTotal: 12,
  adults: Array.from({ length: 12 }, (_, i) => i + 1),
  children: Array.from({ length: 12 }, (_, i) => i),
} as const;
export const BUDGET = { min: 1_000, max: 10_00_000 } as const;
export const PHONE_MESSAGE = 'Enter a 10-digit Indian mobile number';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `+91 98450-22110` / `09845022110` / `919845022110` → `9845022110`. Never invents digits. */
export function normalisePhone(raw: string): string {
  let digits = raw.trim().replace(/[\s\-.()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Native forms post '' for untouched fields; the api wants them absent. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const trimmed = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const int = (min: number, max: number, message?: string) =>
  z.coerce.number({ message }).int().min(min, message).max(max, message);

export const enquirySchema = z
  .object({
    type: z.enum(['standard', 'custom', 'contact']),
    packageSlug: z.preprocess(
      blankToUndefined,
      z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
    ),
    name: z.string().trim().min(2, 'Enter your name').max(80),
    phone: z
      .string()
      .transform(normalisePhone)
      .refine((p) => PHONE_RE.test(p), PHONE_MESSAGE),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(120)
      .refine((e) => EMAIL_RE.test(e), 'Enter a valid email address'),
    travelMonth: z.preprocess(blankToUndefined, z.string().regex(MONTH_RE, 'Pick a month').optional()),
    adults: int(1, TRAVELLERS.maxTotal, 'How many adults?'),
    children: z.preprocess((v) => (v === '' || v == null ? 0 : v), int(0, TRAVELLERS.maxTotal - 1)),
    message: trimmed(MESSAGE_MAX),
    preferredDates: trimmed(200),
    budget: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ message: 'Enter a budget in rupees' })
        .int()
        .min(BUDGET.min, `At least ₹${BUDGET.min.toLocaleString('en-IN')} per person`)
        .max(BUDGET.max)
        .optional(),
    ),
    changes: trimmed(MESSAGE_MAX),
    website: z.string().default(''),
  })
  .superRefine((v, ctx) => {
    if (v.adults + v.children > TRAVELLERS.maxTotal)
      ctx.addIssue({
        code: 'custom',
        path: ['children'],
        message: `Up to ${TRAVELLERS.maxTotal} travellers per enquiry — for more, call us`,
      });
    if (v.type !== 'contact' && !v.packageSlug)
      ctx.addIssue({ code: 'custom', path: ['packageSlug'], message: 'Choose a trip to enquire about' });
  })
  .transform((v) => ({
    ...v,
    packageSlug: v.type === 'contact' ? undefined : v.packageSlug,
    preferredDates: v.type === 'custom' ? v.preferredDates : undefined,
    budget: v.type === 'custom' ? v.budget : undefined,
    changes: v.type === 'custom' ? v.changes : undefined,
  }));

export type EnquiryInput = z.input<typeof enquirySchema>;
export type EnquiryBody = z.output<typeof enquirySchema>;
// The wire shape must stay assignable to the generated contract type.
export const _contract = (b: EnquiryBody): components['schemas']['EnquiryCreate'] => b;

/** First message per top-level field — the same shape as the api envelope's `fieldErrors`. */
export function fieldErrorsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? 'body');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Raw strings from a native form post, `website` included; numbers stay strings for zod. */
export function enquiryFromForm(data: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The next twelve months, this one first: `{ value: '2026-11', label: 'November 2026' }`. */
export function travelMonthOptions(today = new Date()): { value: string; label: string }[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    const month = d.getUTCMonth();
    return {
      value: `${d.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[month]} ${d.getUTCFullYear()}`,
    };
  });
}
```

If the generated `EnquiryCreate` types `budget`/`travelMonth` as `number | null` / `string | null` (pydantic `| None` → nullable), `_contract` will complain about `undefined`; then change the transform to emit `null` instead of `undefined` for those four optional fields and make `trimmed`/preprocess return `null` — keep whichever the contract says, and keep the tests' `toBeUndefined()` in step with it (`toBeNull()`). Check `api-types.ts` first.

- [ ] **Step 4: Run + lint**

Run (from `web/`): `pnpm exec vitest run tests/enquiry-schema.test.ts`
Expected: all pass (4 valid + 12 invalid + 2 + 6 + 1 = 25).

Run (root): `pnpm lint && pnpm typecheck`
Expected: clean (prettier will rewrap `MONTH_NAMES` — run `pnpm exec prettier --write src` from `web/` first).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api-errors.ts web/src/lib/api.ts web/src/lib/enquiry-schema.ts web/tests/enquiry-schema.test.ts
git commit -m "feat(F9): zod mirror of EnquiryCreate proven by the shared case file; api-errors split"
```

---

### Task 5: `EnquiryForm` + `PackageSummary` + the enquire page + the no-JS proxy

**Files:**
- Create: `web/src/components/site/enquiry/Field.tsx`, `EnquiryForm.tsx`, `PackageSummary.tsx`
- Create: `web/src/app/(site)/packages/[slug]/enquire/page.tsx`
- Create: `web/src/app/enquire/route.ts`

**Interfaces:**
- Consumes: `enquirySchema`, `fieldErrorsOf`, `enquiryFromForm`, `travelMonthOptions`, `TRAVELLERS`, `MESSAGE_MAX`, `BUDGET` (Task 4); `errorFromResponse`, `ApiRequestError` (`lib/api-errors`); `PageHead`, `Container`, `Photo`, `inr`, `duration`, `formatDate`, `whatsappHref`, `BUSINESS`.
- Produces: `EnquiryForm({ kind: 'package' | 'contact', pkg?: { slug: string; name: string }, months, defaultValues?, fieldErrors?, error?: 'rate_limited' | 'internal' })`; `PackageSummary({ pkg })`; `enquireHref(slug)`; the thanks URL builder `thanksHref({ ref, firstName, packageSlug })` exported from `EnquiryForm.tsx` for the route handler.

- [ ] **Step 1: `lib/enquiry-form-state.ts` — the URL glue shared by the form, the pages and the proxy**

`web/src/lib/enquiry-form-state.ts`:

```ts
/** Pure helpers shared by EnquiryForm, the enquire/contact pages and the POST /enquire proxy. */

export type ServerError = 'rate_limited' | 'internal';

export type FormState = {
  defaultValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  error?: ServerError;
};

export const enquireHref = (slug: string) => `/packages/${slug}/enquire`;

export function thanksHref(p: { ref: string; firstName: string; packageSlug?: string | null }) {
  const q = new URLSearchParams({ ref: p.ref, name: p.firstName });
  if (p.packageSlug) q.set('package', p.packageSlug);
  return `/enquiry/thanks?${q}`;
}

/** The fields the proxy echoes back so a no-JS visitor does not retype everything. */
export const ECHOED_FIELDS = [
  'type', 'name', 'phone', 'email', 'travelMonth', 'adults', 'children',
  'message', 'preferredDates', 'budget', 'changes',
] as const;

type Search = Record<string, string | string[] | undefined>;

/** `?fieldErrors=<json>&name=…&error=rate_limited` (from `POST /enquire`) → form props; junk is ignored. */
export function formStateFrom(sp: Search): FormState {
  const one = (k: string) => (typeof sp[k] === 'string' ? sp[k] : undefined);
  let fieldErrors: Record<string, string> = {};
  try {
    const raw: unknown = one('fieldErrors') ? JSON.parse(one('fieldErrors') as string) : {};
    if (raw && typeof raw === 'object')
      fieldErrors = Object.fromEntries(
        Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
  } catch {
    /* not JSON — no errors to show */
  }
  const defaultValues: Record<string, string> = {};
  for (const k of ECHOED_FIELDS) {
    const v = one(k);
    if (v !== undefined) defaultValues[k] = v;
  }
  const e = one('error');
  return { defaultValues, fieldErrors, error: e === 'rate_limited' || e === 'internal' ? e : undefined };
}
```

- [ ] **Step 2: `Field`**

`web/src/components/site/enquiry/Field.tsx`:

```tsx
import type { ReactNode } from 'react';

export const control =
  'w-full rounded-btn border-[1.5px] border-line bg-bg px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-mute/70 focus:border-primary aria-invalid:border-warn';

type Props = { label: string; name: string; error?: string; hint?: string; children: ReactNode };

/** Label + control + inline error (S6 `.form label` / `.err`). The control gets `id={name}`. */
export function Field({ label, name, error, hint, children }: Props) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={name} className="label-caps text-mute">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-xs font-semibold text-warn">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-mute">{hint}</p>
      )}
    </div>
  );
}
```

(`label-caps` and `text-warn` already exist in `globals.css` — check `--color-warn`; if `aria-invalid:` variant is unsupported by the Tailwind version, use `data-[invalid=true]:border-warn` and set `data-invalid` instead.)

- [ ] **Step 3: `EnquiryForm` (client)**

`web/src/components/site/enquiry/EnquiryForm.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { errorFromResponse } from '@/lib/api-errors';
import { BUSINESS, whatsappHref } from '@/lib/business';
import {
  BUDGET,
  enquiryFromForm,
  enquirySchema,
  fieldErrorsOf,
  MESSAGE_MAX,
  TRAVELLERS,
} from '@/lib/enquiry-schema';
import { type ServerError, thanksHref } from '@/lib/enquiry-form-state';
import { control, Field } from './Field';

export type EnquiryKind = 'package' | 'contact';
export type Mode = 'standard' | 'custom';

export type EnquiryFormProps = {
  kind: EnquiryKind;
  pkg?: { slug: string; name: string };
  months: { value: string; label: string }[];
  /** Re-fill after a no-JS round trip (raw strings from the proxy's redirect). */
  defaultValues?: Record<string, string>;
  fieldErrors?: Record<string, string>;
  error?: ServerError;
};

const MESSAGES: Record<ServerError, string> = {
  rate_limited: 'Too many enquiries from this connection — try again in a few minutes, or WhatsApp us.',
  internal: 'Something went wrong on our side. Please try again, or call us.',
};

/**
 * S6. A native form (`action="/enquire"`) so it works without JavaScript; with it, the submit is
 * intercepted, validated by the zod mirror, posted to the api through the `/api` rewrite and the
 * visitor is taken to the thanks page. `kind="package"` shows the Standard / Customise toggle.
 */
export function EnquiryForm({ kind, pkg, months, defaultValues = {}, fieldErrors = {}, error }: EnquiryFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultValues.type === 'custom' ? 'custom' : 'standard');
  const [errors, setErrors] = useState<Record<string, string>>(fieldErrors);
  const [banner, setBanner] = useState<string | undefined>(error && MESSAGES[error]);
  const [busy, setBusy] = useState(false);
  const bannerId = useId();
  const type = kind === 'contact' ? 'contact' : mode;
  const d = defaultValues;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = enquiryFromForm(new FormData(e.currentTarget));
    const parsed = enquirySchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setBanner(undefined);
    setBusy(true);
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 201) {
        const body = (await res.json()) as { ref: string; firstName: string; package: { slug: string } | null };
        router.push(thanksHref({ ref: body.ref, firstName: body.firstName, packageSlug: body.package?.slug }));
        return;
      }
      const err = errorFromResponse(res.status, res.statusText, await res.json().catch(() => undefined));
      if (err.body.code === 'validation' && err.body.fieldErrors) setErrors(err.body.fieldErrors);
      else setBanner(err.body.code === 'rate_limited' ? MESSAGES.rate_limited : MESSAGES.internal);
    } catch {
      setBanner(MESSAGES.internal);
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name: string) => (errors[name] ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` } : {});

  return (
    <form
      action="/enquire"
      method="post"
      onSubmit={onSubmit}
      noValidate
      aria-describedby={banner ? bannerId : undefined}
      className="grid gap-4 rounded-card border border-line p-6"
    >
      <input type="hidden" name="type" value={type} />
      {pkg && <input type="hidden" name="packageSlug" value={pkg.slug} />}

      {kind === 'package' && (
        <div role="tablist" aria-label="Enquiry type" className="flex rounded-[12px] bg-bg2 p-1">
          {(['standard', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-[9px] px-3 py-2.5 text-sm font-bold transition-colors ${
                mode === m ? 'bg-bg text-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)]' : 'text-mute hover:text-ink'
              }`}
            >
              {m === 'standard' ? 'Standard trip' : 'Customise this trip'}
            </button>
          ))}
        </div>
      )}

      {banner && (
        <p id={bannerId} role="alert" className="rounded-btn border border-warn/40 bg-warn-soft px-3.5 py-2.5 text-sm font-semibold text-warn">
          {banner}{' '}
          <a href={whatsappHref(pkg ? `Hi Tripsmith, I'm interested in ${pkg.name}` : 'Hi Tripsmith, I want to plan a trip')} className="underline">
            WhatsApp us
          </a>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" error={errors.name}>
          <input id="name" name="name" defaultValue={d.name} autoComplete="name" required className={control} {...invalid('name')} />
        </Field>
        <Field label="Mobile number" name="phone" error={errors.phone} hint="We call this number">
          <input id="phone" name="phone" defaultValue={d.phone} inputMode="tel" autoComplete="tel" required className={`num ${control}`} {...invalid('phone')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" error={errors.email}>
          <input id="email" name="email" type="email" defaultValue={d.email} autoComplete="email" required className={control} {...invalid('email')} />
        </Field>
        <Field label="Travel month" name="travelMonth" error={errors.travelMonth}>
          <select id="travelMonth" name="travelMonth" defaultValue={d.travelMonth ?? ''} className={control} {...invalid('travelMonth')}>
            <option value="">Not sure yet</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Adults" name="adults" error={errors.adults}>
          <select id="adults" name="adults" defaultValue={d.adults ?? '2'} className={control} {...invalid('adults')}>
            {TRAVELLERS.adults.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Children (5–11)" name="children" error={errors.children}>
          <select id="children" name="children" defaultValue={d.children ?? '0'} className={control} {...invalid('children')}>
            {TRAVELLERS.children.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {type === 'custom' && (
        <>
          <Field label="Preferred dates" name="preferredDates" error={errors.preferredDates} hint="Rough is fine — “second week of December”">
            <input id="preferredDates" name="preferredDates" defaultValue={d.preferredDates} maxLength={200} className={control} {...invalid('preferredDates')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget per person (₹)" name="budget" error={errors.budget} hint={`Between ₹${BUDGET.min.toLocaleString('en-IN')} and ₹${BUDGET.max.toLocaleString('en-IN')}`}>
              <input id="budget" name="budget" type="number" inputMode="numeric" min={BUDGET.min} max={BUDGET.max} step={500} defaultValue={d.budget} className={`num ${control}`} {...invalid('budget')} />
            </Field>
          </div>
          <Field label="What would you change?" name="changes" error={errors.changes}>
            <textarea id="changes" name="changes" rows={3} defaultValue={d.changes} maxLength={MESSAGE_MAX} placeholder="A different hotel, an extra night, skip the coach…" className={control} {...invalid('changes')} />
          </Field>
        </>
      )}

      <Field label={kind === 'contact' ? 'What are you looking for?' : 'Anything we should know?'} name="message" error={errors.message}>
        <textarea id="message" name="message" rows={4} defaultValue={d.message} maxLength={MESSAGE_MAX} placeholder={kind === 'contact' ? 'Where, when, how many of you, rough budget…' : 'Dates you are looking at, flights, anything special…'} className={control} {...invalid('message')} />
      </Field>

      {/* Honeypot: off-screen, unlabeled for AT, skipped by the tab order. Bots fill it; people never see it. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-btn bg-action px-5 py-3 font-bold text-action-ink transition-[filter] hover:brightness-105 disabled:opacity-60"
      >
        {busy ? 'Sending…' : kind === 'contact' ? 'Send message' : 'Send enquiry'}
      </button>
      <p className="text-[13px] text-mute">
        By sending, you agree to our <Link href="/privacy">privacy policy</Link>. We never share your
        number. A person calls you back within 2 hours, {BUSINESS.hours}.
      </p>
    </form>
  );
}
```

The form needs `relative` on itself for the honeypot's absolute positioning — add `relative` to the `<form>` className. Check `globals.css` for `--color-action` / `--color-action-ink` (the marigold button used by the home search's "Search trips") and `--color-warn` / `--color-warn-soft`; use exactly those token names.

- [ ] **Step 4: `PackageSummary`**

`web/src/components/site/enquiry/PackageSummary.tsx`:

```tsx
import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { duration, formatDate, inr } from '@/lib/format';
import { Photo } from '../Photo';

type PackageDetail = components['schemas']['PackageDetail'];

/** S6 `.summary`: cover, name, duration, next departure, from-price, first hotel. The PDF button joins in F11. */
export function PackageSummary({ pkg }: { pkg: PackageDetail }) {
  const next = pkg.departures.find((d) => d.seatsLeft > 0) ?? pkg.departures[0];
  const rows: [string, string][] = [
    ['Duration', duration(pkg.nights, pkg.days)],
    ...(next ? [['Next departure', formatDate(next.date)] as [string, string]] : []),
    ['From', pkg.startingPricePaise ? `${inr(pkg.startingPricePaise)} / person` : 'On request'],
    ...(pkg.hotels[0] ? [['Hotel', pkg.hotels[0].name] as [string, string]] : []),
  ];
  return (
    <aside className="overflow-hidden rounded-card border border-line bg-bg">
      {pkg.cover && (
        <Photo src={pkg.cover.url} alt={pkg.cover.alt} sizes="(min-width: 1024px) 380px, 100vw" className="aspect-[16/10]" />
      )}
      <div className="grid gap-2.5 p-5">
        <h2 className="text-xl">
          <Link href={`/packages/${pkg.slug}`} className="text-ink no-underline hover:underline">
            {pkg.name}
          </Link>
        </h2>
        <dl className="grid gap-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line pb-1.5 last:border-0">
              <dt className="text-mute">{k}</dt>
              <dd className="num font-bold text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: The enquire page**

`web/src/app/(site)/packages/[slug]/enquire/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/site/Container';
import { EnquiryForm } from '@/components/site/enquiry/EnquiryForm';
import { PackageSummary } from '@/components/site/enquiry/PackageSummary';
import { api, ApiRequestError } from '@/lib/api';
import { BUSINESS } from '@/lib/business';
import { formStateFrom } from '@/lib/enquiry-form-state';
import { travelMonthOptions } from '@/lib/enquiry-schema';

type Params = { slug: string };
type Search = Record<string, string | string[] | undefined>;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Reads searchParams (the no-JS round trip re-fills the form), so it renders per request. */
export const dynamic = 'force-dynamic';

async function loadPackage(slug: string) {
  try {
    return await api('/packages/{slug}', { params: { slug }, tags: [`package:${slug}`], revalidate: 3600 });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const pkg = await loadPackage(slug);
  return {
    title: `Enquire · ${pkg.name}`,
    description: `Ask about ${pkg.name} — a person calls you back within 2 hours, ${BUSINESS.hours}.`,
    alternates: { canonical: `${SITE_URL}/packages/${pkg.slug}/enquire` },
    robots: { index: false },
  };
}

export default async function EnquirePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const pkg = await loadPackage(slug);
  const state = formStateFrom(sp);

  return (
    <Container className="pb-20">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">Home</Link>
        <span aria-hidden>›</span>
        <Link href={`/packages/${pkg.slug}`} className="hover:text-ink">{pkg.name}</Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">Enquire</span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Enquire about this trip</h1>
        <p className="mt-1.5 max-w-[60ch] text-base text-mute">
          Fill this in and a person calls you back within two hours, {BUSINESS.hours}. Nothing to pay now.
        </p>
      </header>
      <div className="mt-5 grid items-start gap-10 lg:grid-cols-[1fr_380px]">
        <EnquiryForm kind="package" pkg={{ slug: pkg.slug, name: pkg.name }} months={travelMonthOptions()} {...state} />
        <PackageSummary pkg={pkg} />
      </div>
    </Container>
  );
}
```

Add to `web/tests/enquiry-schema.test.ts`:

```ts
import { formStateFrom } from '../src/lib/enquiry-form-state';

describe('formStateFrom', () => {
  it('reads the proxy redirect and ignores junk', () => {
    expect(formStateFrom({ fieldErrors: '{"phone":"bad"}', name: 'Priya', error: 'rate_limited', website: 'x' })).toEqual({
      defaultValues: { name: 'Priya' },
      fieldErrors: { phone: 'bad' },
      error: 'rate_limited',
    });
    expect(formStateFrom({ fieldErrors: 'not json', error: 'nope' })).toEqual({ defaultValues: {}, fieldErrors: {}, error: undefined });
  });
});
```

- [ ] **Step 6: The no-JS proxy**

`web/src/app/enquire/route.ts`:

```ts
import { errorFromResponse } from '@/lib/api-errors';
import { ECHOED_FIELDS, thanksHref } from '@/lib/enquiry-form-state';
import { enquiryFromForm, enquirySchema, fieldErrorsOf } from '@/lib/enquiry-schema';

/**
 * `POST /enquire` — the no-JavaScript path (06 C3). A native form post lands here; the zod mirror
 * rejects junk locally, otherwise the body goes to the api. Every outcome is a 303 redirect: the
 * thanks page on success, back to the form (values + errors in the query) otherwise.
 */

const API_URL = (process.env.API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function formUrl(raw: Record<string, string>, request: Request): URL {
  const back = raw.packageSlug && /^[a-z0-9-]+$/.test(raw.packageSlug) ? `/packages/${raw.packageSlug}/enquire` : '/contact';
  return new URL(back, request.url);
}

function backWith(url: URL, raw: Record<string, string>, extra: Record<string, string>): Response {
  for (const k of ECHOED_FIELDS) if (raw[k]) url.searchParams.set(k, raw[k]);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (url.pathname === '/contact') url.hash = 'enquire';
  return Response.redirect(url, 303);
}

export async function POST(request: Request): Promise<Response> {
  const raw = enquiryFromForm(await request.formData());
  const url = formUrl(raw, request);
  const parsed = enquirySchema.safeParse(raw);
  if (!parsed.success) return backWith(url, raw, { fieldErrors: JSON.stringify(fieldErrorsOf(parsed.error)) });

  const forwarded = request.headers.get('x-forwarded-for');
  const res = await fetch(`${API_URL}/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(forwarded ? { 'X-Forwarded-For': forwarded } : {}),
      'User-Agent': request.headers.get('user-agent') ?? 'tripsmith-web',
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  }).catch(() => undefined);

  if (res?.status === 201) {
    const body = (await res.json()) as { ref: string; firstName: string; package: { slug: string } | null };
    return Response.redirect(new URL(thanksHref({ ref: body.ref, firstName: body.firstName, packageSlug: body.package?.slug }), request.url), 303);
  }
  if (!res) return backWith(url, raw, { error: 'internal' });
  const err = errorFromResponse(res.status, res.statusText, await res.json().catch(() => undefined));
  if (err.body.code === 'validation' && err.body.fieldErrors) return backWith(url, raw, { fieldErrors: JSON.stringify(err.body.fieldErrors) });
  return backWith(url, raw, { error: err.body.code === 'rate_limited' ? 'rate_limited' : 'internal' });
}
```

- [ ] **Step 7: Look — JS on, JS off**

With the dev servers up, open `http://localhost:3001/packages/north-goa-beaches/enquire`:
- Two columns on desktop: form left (toggle, six fields, message, marigold "Send enquiry"), summary right (cover, name, Duration / Next departure / From / Hotel).
- Submit empty → inline "Enter your name", phone error, email error; no network call.
- Fill valid → lands on `/enquiry/thanks?ref=TS-…&name=…&package=north-goa-beaches` (a 404 until Task 6 — check the URL).
- Toggle "Customise this trip" → three more fields; submit with budget `500` → inline "At least ₹1,000 per person".
- JS off (DevTools → Command palette → "Disable JavaScript"): submitting bad data returns to the page with the errors shown and values kept; valid data redirects to the thanks URL.
- Mobile 390 px: single column, summary below the form.

Run (root): `pnpm lint && pnpm typecheck && pnpm test`
Expected: clean; vitest 63 + 25 + 1 = 89 passed.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/site/enquiry web/src/lib/enquiry-form-state.ts "web/src/app/(site)/packages/[slug]/enquire" web/src/app/enquire web/tests/enquiry-schema.test.ts
git commit -m "feat(F9): enquiry form (S6) with package summary, works with JS off via POST /enquire"
```

---

### Task 6: Thanks page, Contact page swap, package-page Enquire button

**Files:**
- Create: `web/src/app/(site)/enquiry/thanks/page.tsx`
- Modify: `web/src/app/(site)/contact/page.tsx`
- Delete: `web/src/components/site/contact/ContactForm.tsx`, `web/src/lib/contact.ts`, `web/tests/contact.test.ts`
- Modify: `web/src/components/site/package/PriceBox.tsx`

**Interfaces:**
- Consumes: `EnquiryForm`, `travelMonthOptions`, `formStateFrom`, `enquireHref`, `whatsappHref`, `BUSINESS`, `Check` icon (`components/site/package/icons.tsx`), `WhatsApp` icon (`home/icons.tsx`).

- [ ] **Step 1: The thanks page**

`web/src/app/(site)/enquiry/thanks/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { WhatsApp } from '@/components/site/home/icons';
import { Check } from '@/components/site/package/icons';
import { api } from '@/lib/api';
import { BUSINESS, whatsappHref } from '@/lib/business';

type Search = Record<string, string | string[] | undefined>;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Thanks — we’ll call you',
  robots: { index: false, follow: false },
};

const REF_RE = /^TS-[A-Z2-9]{6}$/;

async function packageName(slug: string | undefined): Promise<string | undefined> {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return undefined;
  try {
    return (await api('/packages/{slug}', { params: { slug }, tags: [`package:${slug}`], revalidate: 3600 })).name;
  } catch {
    return undefined;
  }
}

const STEPS: [string, string][] = [
  ['We call you', `From ${BUSINESS.phoneDisplay} — save the number so you know it is us.`],
  ['We confirm the details', 'Dates, room type, flights if you want them.'],
  ['You decide', 'No payment until you say so.'],
];

/** S7. Everything it shows comes from the URL the form sent it to; a bad ref shows a neutral page. */
export default async function ThanksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const ref = REF_RE.test(one('ref') ?? '') ? one('ref') : undefined;
  const first = (one('name') ?? '').trim().slice(0, 40);
  const pkgSlug = one('package');
  const pkgName = await packageName(pkgSlug);
  const wa = whatsappHref(
    `Hi Tripsmith, this is ${first || 'a visitor'}${pkgName ? ` about ${pkgName}` : ''}${ref ? ` (enquiry ${ref})` : ''}.`,
  );

  return (
    <Container className="grid max-w-[640px] justify-items-center gap-3.5 py-16 text-center">
      <span aria-hidden className="grid size-18 place-items-center rounded-full bg-ok-soft text-ok">
        <Check className="size-8" />
      </span>
      <h1 className="text-[clamp(28px,3.4vw,36px)]">
        Thanks{first ? `, ${first}` : ''} — we’ll call you within 2 hours.
      </h1>
      {ref && (
        <>
          <p className="text-mute">Your enquiry reference is</p>
          <span className="num rounded-btn bg-bg2 px-3.5 py-2 font-extrabold tracking-wide">{ref}</span>
        </>
      )}
      <p className="text-mute">
        {pkgName ? `We have your enquiry about ${pkgName}. ` : ''}Our office hours are {BUSINESS.hours}; if it is later than that, we call first thing tomorrow.
      </p>
      <ol className="mt-3 grid w-full gap-3 text-left sm:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="rounded-[14px] border border-line p-4">
            <b className="block">{i + 1} · {title}</b>
            <span className="text-sm text-mute">{text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <a href={wa} className="inline-flex items-center gap-2 rounded-btn bg-wa px-5 py-3 font-bold text-white no-underline shadow-[0_8px_20px_-10px_rgb(37_211_102/0.7)] hover:brightness-105">
          <WhatsApp className="size-5" />
          Chat on WhatsApp
        </a>
        {pkgSlug && pkgName && (
          <Link href={`/packages/${pkgSlug}`} className="rounded-btn border border-line px-5 py-3 font-bold text-ink no-underline hover:border-ink">
            Back to {pkgName}
          </Link>
        )}
        <Link href="/packages" className="rounded-btn border border-line px-5 py-3 font-bold text-ink no-underline hover:border-ink">
          Browse more trips
        </Link>
      </div>
    </Container>
  );
}
```

(`bg-ok-soft` / `text-ok` are K tokens — confirm the names in `globals.css`; `size-18` needs Tailwind 4's dynamic spacing, which the project uses elsewhere, e.g. `size-27`.)

- [ ] **Step 2: Contact page**

In `web/src/app/(site)/contact/page.tsx`: replace the `ContactForm` import with `import { EnquiryForm } from '@/components/site/enquiry/EnquiryForm'; import { formStateFrom } from '@/lib/enquiry-form-state'; import { travelMonthOptions } from '@/lib/enquiry-schema';`, make the page `async` taking `{ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }`, add `export const dynamic = 'force-dynamic';`, and render:

```tsx
        <div id="enquire">
          <EnquiryForm kind="contact" months={travelMonthOptions()} {...formStateFrom(await searchParams)} />
        </div>
```

in place of `<ContactForm />`. Delete `web/src/components/site/contact/ContactForm.tsx`, `web/src/lib/contact.ts`, `web/tests/contact.test.ts`. The `ContactInfo` and `MapEmbed` stay.

- [ ] **Step 3: Enquire button on the package page**

In `web/src/components/site/package/PriceBox.tsx` add `import { enquireHref } from '@/lib/enquiry-form-state';` and replace the paragraph `Enquiries open soon — … Nothing to pay online.` with:

```tsx
      <Link
        href={enquireHref(pkg.slug)}
        className="block rounded-btn bg-action px-5 py-3 text-center font-bold text-action-ink no-underline transition-[filter] hover:brightness-105"
      >
        Enquire about this trip
      </Link>
      <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-mute">
        A person calls you back within 2 hours, {BUSINESS.hours}. Nothing to pay online.
      </p>
```

(add `import { BUSINESS } from '@/lib/business';`). Update the docstring: `/** Sticky price box (desktop): from-price, next departure, Enquire (F9). PDF + WhatsApp join in F11/F12. */`.

- [ ] **Step 4: Look + verify**

- `/contact`: the real form (no toggle, "Send message"), JS on and off; a valid submit lands on `/enquiry/thanks?ref=…&name=…` with no package.
- `/enquiry/thanks?ref=TS-ABC234&name=Priya&package=north-goa-beaches`: tick, heading, ref pill, package sentence, three steps, WhatsApp (check the prefilled text in the link), back + browse buttons. `/enquiry/thanks` with no params: neutral heading, no pill.
- `/packages/north-goa-beaches`: the price box shows the marigold Enquire button → the enquire page.
- Local DB: `psql -p 5499 -U tripsmith tripsmith_dev -c "select ref, type, phone, status from enquiries order by created_at desc limit 5"` shows the rows you created.

Run (root): `pnpm lint && pnpm typecheck && pnpm test`
Expected: clean; vitest **87** (89 − 2 contact tests).

- [ ] **Step 5: Commit**

```bash
git add -A web/src "web/tests"
git commit -m "feat(F9): thanks page (S7), real form on /contact, Enquire button on the package page"
```

---

### Task 7: Docs, verification, PR, review, merge, tracker

**Files:**
- Modify: `docs/07-plan.md:61` — `**Enquiry form**` → `**Enquiry form** ✅ PR #27` (use the real number after `gh pr create`).

- [ ] **Step 1: Everything green from the root**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm gen:api && git diff --exit-code api/openapi.json web/src/lib/api-types.ts`
Expected: pytest **159**, vitest **87**, no contract diff.

Stop `next dev`, then from `web/`: `API_URL=http://localhost:8002 pnpm exec next build`
Expected: builds; `/enquire` listed as `ƒ` (route handler), `/packages/[slug]/enquire`, `/enquiry/thanks` and `/contact` as `ƒ` (dynamic).

- [ ] **Step 2: Vercel env check (names only)**

`vercel env ls tripsmith-api production` must list `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (S2 added them). If missing, add from `api/.env.local` with `printf '%s' "$VALUE" | vercel env add NAME production --force` (per the CLI gotchas in memory).

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/f9-enquiry
gh pr create --title "feat(F9): enquiry form — POST /enquiries, works without JS, thanks page" --body "$(cat <<'BODY'
## Summary
- **api:** `POST /enquiries` (`submitEnquiry`, 201 `{ ref, firstName, package }`): `EnquiryCreate` with Indian-mobile normalisation (`+91`/`0` prefixes, spaces), email/month/party-size rules, custom-only fields; honeypot → fake success, no row; same phone + package within 60 s → same ref; refs `TS-XXXXXX` (no 0/O/1/I); `infra/ratelimit.py` Upstash sliding window 5 / 10 min / IP (fails open, null when unset); `Retry-After` on 429. Contract regenerated.
- **web:** zod mirror `lib/enquiry-schema.ts` proven against the api by the shared `api/tests/fixtures/enquiry_cases.json` (both test runners); `EnquiryForm` (Standard / Customise-this-trip toggle, inline `fieldErrors`, native `action="/enquire"` so it works with JS off, `fetch('/api/enquiries')` with it); `/packages/[slug]/enquire` (S6, package summary); `/enquiry/thanks` (S7); `/contact` swaps the WhatsApp stand-in for the real form; package price box gets **Enquire**. `errorFromResponse` moved to `lib/api-errors.ts` (no `next/headers`) for client use.
- Not here: emails (F10), PDF (F11), sticky CTA bar + FAB (F12+F13).

## Test plan
- [ ] `pnpm lint && pnpm typecheck && pnpm test` — pytest 159, vitest 87; `pnpm gen:api` no diff
- [ ] Local: JS on/off submits from the package and contact forms land on thanks with a row in `enquiries`; dedupe + rate limit exercised by tests
- [ ] Prod after merge: submit one real enquiry from `/packages/leh-turtuk/enquire` (own number), confirm the row in Neon and the 429 after 5 rapid posts via curl

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 4: Review, merge, verify**

From this worktree's cwd: `/code-review <pr> high`; fix real findings; push. Merge with `gh pr merge <pr> --squash --delete-branch`. After both deploys are Ready:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tripsmith.vercel.app/packages/leh-turtuk/enquire   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://tripsmith.vercel.app/contact                       # 200
curl -s -X POST https://tripsmith-api.vercel.app/enquiries -H 'Content-Type: application/json' -d '{"type":"contact","name":"Curl Test","phone":"12345","email":"a@b.co","adults":1,"children":0,"website":""}'   # 400 with fieldErrors.phone
```

Then one real submit through the browser from the live enquire page (Viraj's own number), confirm the row: `psql "$NEON_PROD_URL" -c "select ref, type, status, created_at from enquiries order by created_at desc limit 3"` (the URL is `DATABASE_URL` in `api/.env.local`; use the `postgresql://` form for psql — strip `+asyncpg`). Five rapid curl posts with a valid body must produce a `429` on the sixth (the Upstash key is live in prod).

- [ ] **Step 5: Tracker + memory**

Tracker row `F9` → done with the PR number (artifact db `rows/F9`). Update `tripsmith-status` memory: F9 done, main sha, next = **F10 Emails** (Resend SDK + Jinja2 — both are new deps; `email_status` on the enquiry; confirmation + owner notification). Kill dev servers by port; stop the throwaway Postgres.

---

## Summary

- api: `EnquiryCreate`/`EnquiryCreated`, `infra/ratelimit.py`, `services/enquiries.py`, `POST /enquiries`; tests 120 → 159.
- web: `lib/api-errors.ts` split, `lib/enquiry-schema.ts` (+ shared case file mirror test), `lib/enquiry-form-state.ts`, `EnquiryForm`/`Field`/`PackageSummary`, `/packages/[slug]/enquire`, `/enquiry/thanks`, `POST /enquire`, Contact swap, price-box Enquire; tests 63 → 87.

## Test plan

| Task | Automated | Manual |
|---|---|---|
| 1 | schema unit (25) incl. the shared case file | — |
| 2 | limiter unit (5): window commands, bearer, fail-open, null, builder | — |
| 3 | HTTP (9): save, contact, custom, wire-name errors, unknown package, honeypot, dedupe, 429 | — |
| 4 | zod mirror (25) over the same case file; month options | — |
| 5 | form-state parse | enquire page JS on/off, mobile |
| 6 | — | thanks page, contact form, price box; rows in the local DB |
| 7 | root lint/typecheck/test/gen:api; `next build` | prod: pages 200, 400 envelope, one real enquiry, 429 |
