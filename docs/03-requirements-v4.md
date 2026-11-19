# Tripsmith v4 — Requirements & Scope ("Tripsmith anywhere" — MCP server)

> ▶ **Un-parked 2026-11-19 (Viraj) — the final version.** Parked 2026-11-12 when v3 was declared the last stage; v3 closed 2026-11-14 (#161).
> **Step-3 re-validation done 2026-11-19** against `main` and the current MCP SDK/spec. Its decisions are below and **override anything older in this file**: `createEnquiry` → **`startEnquiry` (a handoff link)**, MCP Python SDK **v2 (`MCPServer`)**, core scope ≈ 9 h with resources moved to optional.

**Lifecycle step:** 3 of 17 for v4 · **Locked:** 2026-09-12, re-validated 2026-11-19
**Builds on:** the v3 tool registry as built — `api/app/services/ai/tools.py` (`TOOLS`, `run_tool`, pydantic `ToolArgs` with `extra="forbid"`) driven by Tripsmith's own Gemini tool loop (`services/ai/loop.py`; no pydantic-ai). User-facing name of the v3 chat: **"trip planner"**. Design: [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md) §v4, [06-data-and-api.md](06-data-and-api.md) §C8.

## What v4 is
Tripsmith exposes itself as a **remote MCP server**, so any MCP client (Claude Desktop, ChatGPT, Cursor, others) can search Tripsmith's real catalogue from inside the customer's own assistant and hand the customer over to Tripsmith's site to book or enquire. No new business logic: the MCP layer is an adapter over the v3 tools, which proves the domain layer was built as a reusable core.

**The boundary, stated once:** MCP exposes **no payment, reservation or lead-creation operation**. Every tool either reads the public catalogue or returns a link to Tripsmith's own site, where the customer completes the action themselves.

## Boundaries (Viraj, 2026-11-19)
| # | Boundary |
|---|---|
| 1 | **Four tools, all read-only towards Tripsmith's data:** `searchPackages`, `checkAvailability`, `startBooking`, `startEnquiry`. The last two are **handoff tools**. They return a link to the site and never pay, hold seats, reserve or create a record. |
| 2 | **The MCP layer is an adapter.** Each tool calls the same function the v3 chat calls (`run_tool` / the `*_tool` functions). `services/mcp` holds no pricing, availability, filtering or enquiry rules. The only additions are transport concerns: absolute URLs, the enquiry link, error mapping. A parity test pins this per tool. |
| 3 | Pydantic validation on every tool (the v3 `ToolArgs`, `extra="forbid"`), a per-IP rate limit, a sanitised `mcp_requests` row per call, MCP tool errors (never stack traces). |
| 4 | **Identity is not authentication.** The rate limit keys on the **server-derived client IP** (`infra/client_ip.py`, Vercel's forwarded header; client-supplied IP headers are never trusted). MCP client name/version (from per-request metadata, or the legacy `initialize`) and `User-Agent` are recorded as **diagnostic metadata only**. They are caller-supplied and can be spoofed. |
| 5 | **No contact details pass through MCP.** Name, phone and email are typed by the customer on Tripsmith's site, exactly as in the v3 chat. |
| 6 | **No tenancy:** one agency, one catalogue. |
| 7 | MCP OAuth + `myBookings` / `getVoucher` (R38) stay a **stretch goal**. |
| 8 | **≈ 9 h core** (re-estimated at step 3, up from the 6 h prototype target). This is a planning estimate, not a commitment; deployment debugging and client compatibility can add to it. |

## Actors
- **MCP client:** an assistant acting for a customer; anonymous.
- **Customer:** the person behind the client; finishes booking or enquiring on the site.
- **Owner:** sees MCP usage (optional dashboard tile).

---

### R34. MCP server & tools (core)
- Endpoint `/mcp` on the api, Streamable HTTP via the official MCP Python SDK **v2** (`MCPServer`), mounted in the existing FastAPI app, stateless. Server name `tripsmith`, version from `pyproject.toml`. Works with clients on the 2026-07-28 spec (per-request metadata, no handshake) and older clients that still send `initialize`.
- `searchPackages`, `checkAvailability`: the v3 tools unchanged.
- `startBooking`: the v3 tool (it runs the existing booking quote for the departure and party) with the URL made **absolute** (`{WEB_URL}/packages/{slug}?…#book`). It opens the Book-now sheet pre-filled; the customer pays there. It does not hold seats or take payment.
- **`startEnquiry`** (replaces v3's `createEnquiry` for MCP): takes what the chat's `createEnquiry` takes (a summary, package slug?, month?, adults?, children?; never contact details) and returns an absolute link to the site's own enquiry form (`/packages/{slug}/enquire?travelMonth=…&adults=…&children=…`, or `/contact?…#enquire` without a live package) with the month and party pre-filled, plus the redacted summary for the assistant to suggest as the message. **It creates nothing.** The lead is created only when the customer submits the form, through the existing `POST /enquiries` → `submit_enquiry()` with its existing protections (5 / 10 min / IP, 60-s dedupe, emails). The v3 chat keeps its own `createEnquiry` panel behaviour unchanged.
- Tool descriptions written for models: what each tool is for, when to call it, units (₹, nights), and that the two `start*` tools return links for the customer to open.
- **Accept:** a client lists exactly 4 tools and no payment, reservation, lead-creation or authenticated tool; each tool returns the same data as the chat tool for the same arguments (parity test), except for the absolute URL; `startEnquiry` writes no row to `enquiries`; Claude Desktop answers "3 days in Goa under ₹15k" with real packages only.

### R34a. Enquiry form pre-fill from a link (web, core)
*Built 2026-11-19 (4.0.3) on what the site already had; replaces the earlier `enquire=1` / `note` design.*
- The site's enquiry pages (`/packages/{slug}/enquire` and `/contact#enquire`) already pre-fill their **choice** fields from the query string for the no-JS round trip: `formStateFrom` reads only `PUBLIC_FIELDS` (`type`, `travelMonth`, `adults`, `children`, `budget`). `startEnquiry` links use `travelMonth`, `adults` and `children`.
- **Nothing a person writes goes in a URL**, the site's existing rule (history, server logs, analytics, `Referer`): name, phone, email, message, preferred dates and changes are never read from the query. So no `note` travels in the link; the assistant gets the redacted summary back and suggests it as the message.
- Invalid values are harmless: a month or count that matches no option leaves the select on its default, and the form's zod schema validates everything on submit.
- **Accept:** a `startEnquiry` link opens the right page with the month and party filled (web unit test); `message`/`note`/`email` in the URL have no effect; the submitted enquiry is identical to one typed by hand.

### R35. Prompt (core if it stays ≈ 0.5 h) and resources (optional)
- Prompt `plan-a-trip(destination?, month?, budget?, party?)` returns one guided planning message. Core only if it fits ≈ 0.5 h; otherwise it moves to optional. *Built (4.0.5), core: `services/mcp/prompts.py`. One user message: what the customer knows so far, then how to use the four tools (only quote what they return; never ask for name, phone or email). Arguments are trimmed, redacted (`pii.redact()`) and cut to 120 chars; an unknown argument or prompt name is an `INVALID_PARAMS` error. `prompts/get` counts against the same `mcp:{ip}` limit, fails closed the same way, and is logged as `prompts/get`.*
- *Optional add-on:* resources `tripsmith://packages`, `tripsmith://packages/{slug}`, `tripsmith://destinations/{slug}` as markdown. This needs a **new** catalogue markdown renderer (`services/catalog/markdown.py` does not exist yet), tested on published data only, so drafts are never exposed.

### R36. Limits, logging, errors (core)
- Rate limit: `mcp:{ip}` ≤ 60 tool calls / hour (its own key in `infra/ratelimit.py`). No enquiry cap is needed in MCP, because MCP creates no enquiries; the site's form keeps its own limit.
- **Limiter outage policy:** if Upstash is unreachable, the MCP limiter fails **closed** (it returns a clear "try again shortly" MCP error), unlike the site, which fails open. MCP is anonymous and read-heavy, so refusing briefly is safer than serving unlimited calls. The same goes for a deployment with no Upstash configured at all (local dev and CI still work without it). *As built (4.0.4): the limiter result carries `degraded`; the site ignores it, MCP refuses on it.*
- `mcp_requests` row per call: method, tool/prompt name, args with free text redacted (`pii.redact()` on the `summary` field), latency, outcome, `ip_hash`, and diagnostic client name/version/User-Agent as reported. *As built (4.0.4): every string in the args is redacted and bounded (a caller can send any keys), and a refused call (over the limit, limiter down) writes no row, only a function-log warning, so a flood cannot fill the table.*
- Errors: MCP tool errors with a short message; pydantic issues summarised, never raw; no stack traces.
- **Accept:** call 61 in an hour returns a clear MCP error; with Redis down, calls are refused, not unlimited; every served call is logged; no phone number or email appears in stored args.

### R37. Developer page & proof (core)
- `/developers`: what the server does, one-line client config (Claude Desktop / Cursor / ChatGPT), the tool list, limits, and a privacy note ("no contact details or payments go through MCP"). *Built (4.0.6): static page from `web/src/lib/mcp.ts`; `tests/developers.test.tsx` reads the api's source so the tools, prompt and limit can't drift. Linked from the footer and the sitemap.*
- README section with a 30-second GIF: Claude Desktop → "plan 3 days in Goa" → real packages → a booking link that opens Tripsmith.
- *Optional:* owner dashboard tile "trips planned via MCP" (7 / 30 days, top tools).

### R38 (stretch). Authenticated tools
- MCP OAuth (an own OAuth 2.1 authorization server over the api's `users` / `sessions`) for `myBookings` and `getVoucher`. Unchanged; still stretch.

## Deployment gates (unverified until production; must pass before v4 is called shipped)
- The api's Vercel project: plan, Fluid Compute on, root directory and the resolved Python entrypoint. The function timeout is the api project's **default function timeout of 60 s** (set in the Vercel project, `resourceConfig.functionDefaultTimeout`, since #165; not in `api/vercel.json`), which is ample for request/response MCP calls. Deploys are GitHub Actions prebuilt deploys only; Vercel's own Git deployments are off (`git.deploymentEnabled: false`, #167). Confirm both on the new account.
- The MCP SDK's session manager runs inside FastAPI's `lifespan`. A mounted app's own lifespan does not run, so `/mcp` would exist but fail on its first request.
- The SDK's **Host/Origin allowlist** is configured for the production host. Its defaults are localhost-oriented and are expected to reject other hosts (e.g. `421 Misdirected Request`); confirm the behaviour on preview. Origin is validated as the Streamable HTTP spec requires.
- **Production URL:** candidate `https://tripsmith-api.virajdomadia.com/mcp` (the README's api domain). Marked confirmed only after the domain resolves to the new Vercel project and a real client completes a catalogue query against it.
- Client compatibility: one current-spec client and one legacy (`initialize`) client both list and call the tools.

## Explicitly out of scope for v4
Lead creation, payments, seat holds or any write via MCP · writing to the catalogue · contact details in links · an MCP *client* inside Tripsmith · multi-tenancy · stdio distribution (remote only) · running the v3 Gemini evals "through MCP". The client's model isn't ours to evaluate; parity tests prove the tools are the same.

## Budget
**≈ 9 h core** (milestone 4.0, planning estimate) + optional ≈ 3 h (resources + renderer 2, dashboard tile 0.5, prompt 0.5 if it leaves core) + 3 h stretch (R38). Cost: ₹0. Streamable HTTP inside the existing FastAPI function on Vercel; builds on GitHub Actions.
