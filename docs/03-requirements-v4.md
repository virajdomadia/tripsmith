# Tripsmith v4 — Requirements & Scope ("Tripsmith anywhere" — MCP server)

**Lifecycle step:** 3 of 17 for v4 · **Locked:** 2026-09-12 (re-validated when v4 starts)
**Builds on:** v3 tools (R27). Design: [04-technical-design-v2-v3.md](04-technical-design-v2-v3.md) §v4, [06-data-and-api.md](06-data-and-api.md) §C8.

## What v4 is
Tripsmith exposes itself as a **remote MCP server**. Any MCP client — Claude Desktop, ChatGPT, Cursor, others — can add `https://tripsmith.virajdomadia.com/api/mcp` and plan or book a Tripsmith trip from inside the customer's own assistant. No new business logic: the v3 tools are re-exposed over MCP, proving the domain layer was designed as a reusable core.

## Actors
- **MCP client** — an assistant acting for a customer; anonymous by default.
- **Customer** — the person behind the client; optionally authenticated (stretch).
- **Owner** — sees MCP usage in the dashboard.

---

### R34. MCP server & tools
- Endpoint `POST /api/mcp` (Streamable HTTP, stateless per request), server name `tripsmith`, version from `package.json`.
- Tools, identical schemas and behaviour to R27: `searchPackages`, `checkAvailability`, `startBooking` (returns a checkout URL; **never** takes payment), `createEnquiry` (rate-limited; collects only name, phone, summary).
- Tool descriptions written for models: what the tool is for, when to call it, what it returns, units (₹, nights).
- **Accept:** the MCP Inspector lists 4 tools and can call each; Claude Desktop with the server configured answers "3 days in Goa under ₹15k" with real packages only; the same 20 v3 eval conversations pass when driven through MCP.

### R35. Resources & prompts
- Resources: `tripsmith://packages/{slug}` (package as markdown: itinerary, inclusions, departures, prices) and `tripsmith://destinations/{slug}`; a `tripsmith://packages` listing resource.
- Prompt `plan-a-trip` with arguments destination?, month?, budget?, party? → a guided planning message.
- **Accept:** a client can read a package resource and quote its price without any tool call; drafts are never listed.

### R36. Guardrails, limits, logging
- Same catalog-only rules; tool inputs validated with zod; errors returned as MCP tool errors, never stack traces.
- Rate limits per client IP: 60 tool calls / hour; `createEnquiry` 5 / day.
- `mcp_requests` log: client name/version (from `initialize`), tool/resource, args (PII-stripped), latency, outcome. Dashboard tile: "trips planned via MCP" (7 / 30 days), top tools.
- **Accept:** exceeding a limit returns a clear MCP error; the log shows every call; no phone numbers appear in stored args.

### R37. Developer page & proof
- `/developers`: what the server does, the one-line client config for Claude Desktop / Cursor / ChatGPT, tool list, limits, privacy note.
- README section with a 30-second GIF: Claude Desktop → "plan 3 days in Goa" → cards → checkout link.
- **Accept:** a stranger can install the server from the page in under a minute.

### R38 (stretch). Authenticated tools
- MCP OAuth (authorization server = Better Auth) so a customer can call `myBookings` and `getVoucher` from their assistant.
- **Accept:** unauthenticated calls to these tools return an auth challenge; authenticated calls return only that customer's bookings.

## Explicitly out of scope for v4
Writing to the catalog via MCP · payments via MCP · an MCP *client* inside Tripsmith (the concierge consuming external servers) · stdio distribution (remote only).

## Budget
≈ 6 h (milestone 4.0) + 3 h stretch (R38). Cost: ₹0 — Streamable HTTP on a Vercel route handler.
