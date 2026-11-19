/**
 * v4 R37: what `/developers` says about Tripsmith's MCP server (api `services/mcp`).
 *
 * `tests/developers.test.tsx` reads the api's source to check the tools, the prompt and the
 * limit here are the server's, so the page can't drift from what a client actually gets.
 */

/** The api's production domain (README) + `/mcp`. Confirmed at 4.0.6 by the deploy's MCP smoke. */
export const MCP_URL = 'https://tripsmith-api.virajdomadia.com/mcp';

/** Tool calls and prompt requests per connection per hour (api `server.MCP_LIMIT`). */
export const MCP_LIMIT = 60;

export const MCP_TOOLS = [
  {
    name: 'searchPackages',
    does: 'Finds holiday packages by destination, month, budget, length or theme.',
  },
  {
    name: 'checkAvailability',
    does: 'Lists a package’s upcoming dates with live prices and seats left.',
  },
  {
    name: 'startBooking',
    does: 'Checks a date for your group and returns a link to book it here. You pay on this site.',
  },
  {
    name: 'startEnquiry',
    does: 'Returns a link to our enquiry form with the month and group filled in, to talk to us.',
  },
] as const;

export const MCP_PROMPT = {
  name: 'plan-a-trip',
  does: 'Starts a planning conversation from what you know: destination, month, budget, who’s going.',
} as const;

export const MCP_CLIENTS = [
  {
    name: 'Claude (web and desktop)',
    how: 'Settings → Connectors → Add custom connector, then paste the URL.',
  },
  {
    name: 'Cursor',
    how: 'Add it to .cursor/mcp.json:',
    config: JSON.stringify({ mcpServers: { tripsmith: { url: MCP_URL } } }),
  },
  {
    name: 'ChatGPT and other MCP clients',
    how: 'Add a custom (remote) MCP connector with the URL. No sign-in is needed.',
  },
] as const;
