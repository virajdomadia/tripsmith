# Tripsmith v4 — Requirements & Scope ("Tripsmith anywhere" — MCP server)

> ▶ **Un-parked 2026-11-19 (Viraj) — the final version.** Parked 2026-11-12 when v3 was declared the last stage; v3 closed 2026-11-14 (#161) and v4 is now the next stage, re-entering at step 3. The boundaries below override anything older in this file.

**Lifecycle step:** 3 of 17 for v4 · **Locked:** 2026-09-12 (re-validated when v4 starts)
**Builds on:** v3 tools (R27) as built — Gemini (`google-genai`) with Tripsmith's own tool loop over the typed functions in `api/app/services/ai/tools.py` (no pydantic-ai, dropped at the v3 re-validation). User-facing name of the v3 chat: **"trip planner"** (#162); "concierge" stays the internal/code name. Design: [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md) §v4, [06-data-and-api.md](06-data-and-api.md) §C8.

## What v4 is
Tripsmith exposes itself as a **remote MCP server**. Any MCP client — Claude Desktop, ChatGPT, Cursor, others — can add the api's `/mcp` endpoint (FastAPI, api domain; the exact URL is confirmed at step 3 after the Vercel account move, #164/#165) and plan or book a Tripsmith trip from inside the customer's own assistant. No new business logic: the v3 tools are re-exposed over MCP, proving the domain layer was designed as a reusable core.

## Boundaries (Viraj, 2026-11-19)
| # | Boundary |
|---|---|
| 1 | **Public-catalogue tools only** in the initial release: `searchPackages`, `checkAvailability`, `startBooking` (returns a checkout URL), `createEnquiry`. **No payment execution through MCP, ever** — the customer pays in the site's Razorpay checkout. |
| 2 | **The MCP layer is an adapter.** Each MCP tool calls the existing domain service — the same function the v3 chat tool loop calls in `services/ai/tools.py` — and contains no business logic of its own (no pricing, availability, filtering or enquiry rules in `services/mcp`). A test pins this per tool. |
| 3 | Pydantic validation on every tool (the v3 `ToolArgs` models, `extra="forbid"`), per-client rate limits, a structured `mcp_requests` row per call, error mapping to MCP tool errors. |
| 4 | **`createEnquiry` is the only tool that writes.** It gets the same abuse protection as the web enquiry form and the v3 chat handoff: it goes through the same enquiry service and the same limiter as `POST /enquiries` (5 / 10 min / IP, the 60-second dedupe; docs/12 v1 audit), the v3 `services/ai/pii.py` `redact()` on the model-written summary (docs/12 v3 close, check #3), the v3 field caps (pydantic bounds), plus the MCP cap of 5 / day / IP (R36). Name and phone are stripped from the logged args. |
| 5 | **No tenancy:** Tripsmith is a single agency; there is no per-agency key, catalogue or config. |
| 6 | MCP OAuth + `myBookings` / `getVoucher` (R38) stay a **stretch goal**. |
| 7 | **≈ 6 h is a prototype target**, re-estimated at the step-3 re-validation. |

## Actors
- **MCP client** — an assistant acting for a customer; anonymous by default.
- **Customer** — the person behind the client; optionally authenticated (stretch).
- **Owner** — sees MCP usage in the dashboard.

---

### R34. MCP server & tools
- Endpoint `POST /mcp` on the api (Streamable HTTP via the official `mcp` Python SDK, mounted in FastAPI, stateless per request), server name `tripsmith`, version from `pyproject.toml`.
- Tools, identical schemas and behaviour to R27: `searchPackages`, `checkAvailability`, `startBooking` (returns a checkout URL; **never** takes payment), `createEnquiry` (rate-limited; collects only name, phone, summary).
- Tool descriptions written for models: what the tool is for, when to call it, what it returns, units (₹, nights).
- **Accept:** the MCP Inspector lists 4 tools and can call each; Claude Desktop with the server configured answers "3 days in Goa under ₹15k" with real packages only; the v3 eval conversations (23 at the v3 close) pass when driven through MCP.

### R35. Resources & prompts
- Resources: `tripsmith://packages/{slug}` (package as markdown: itinerary, inclusions, departures, prices) and `tripsmith://destinations/{slug}`; a `tripsmith://packages` listing resource.
- Prompt `plan-a-trip` with arguments destination?, month?, budget?, party? → a guided planning message.
- **Accept:** a client can read a package resource and quote its price without any tool call; drafts are never listed.

### R36. Guardrails, limits, logging
- Same catalog-only rules; tool inputs validated with pydantic (the v3 models); errors returned as MCP tool errors, never stack traces.
- Rate limits per client IP: 60 tool calls / hour; `createEnquiry` 5 / day.
- `mcp_requests` log: client name/version (from `initialize`), tool/resource, args (PII-stripped), latency, outcome. Dashboard tile: "trips planned via MCP" (7 / 30 days), top tools.
- **Accept:** exceeding a limit returns a clear MCP error; the log shows every call; no phone numbers appear in stored args.

### R37. Developer page & proof
- `/developers`: what the server does, the one-line client config for Claude Desktop / Cursor / ChatGPT, tool list, limits, privacy note.
- README section with a 30-second GIF: Claude Desktop → "plan 3 days in Goa" → cards → checkout link.
- **Accept:** a stranger can install the server from the page in under a minute.

### R38 (stretch). Authenticated tools
- MCP OAuth (an own OAuth 2.1 authorization server over the api's `users` / `sessions`) so a customer can call `myBookings` and `getVoucher` from their assistant.
- **Accept:** unauthenticated calls to these tools return an auth challenge; authenticated calls return only that customer's bookings.

## Explicitly out of scope for v4
Writing to the catalog via MCP · payments via MCP · an MCP *client* inside Tripsmith (the trip planner consuming external servers) · multi-tenancy (other agencies) · stdio distribution (remote only).

## Budget
≈ 6 h (milestone 4.0, prototype target — re-estimated at the step-3 re-validation) + 3 h stretch (R38). Cost: ₹0 — Streamable HTTP mounted in the FastAPI app on Vercel (builds on GitHub Actions, no Vercel build minutes).
