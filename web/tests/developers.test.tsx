// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DevelopersPage from '../src/app/(site)/developers/page';
import { MCP_CLIENTS, MCP_LIMIT, MCP_PROMPT, MCP_TOOLS, MCP_URL } from '../src/lib/mcp';

const API = resolve(__dirname, '../../api/app/services/mcp');
const source = (file: string) => readFileSync(resolve(API, file), 'utf8');

afterEach(cleanup);

describe('/developers matches the MCP server (v4 R37)', () => {
  it('lists exactly the tools, the prompt and the limit the api serves', () => {
    // adapter.py: SEARCH, AVAILABILITY, BOOKING, ENQUIRY = ("searchPackages", ...)
    const tuple = /SEARCH, AVAILABILITY, BOOKING, ENQUIRY = \(([^)]*)\)/.exec(source('adapter.py'));
    const served = [...(tuple?.[1] ?? '').matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(served);
    expect(source('prompts.py')).toContain(`PLAN_A_TRIP = "${MCP_PROMPT.name}"`);
    expect(source('server.py')).toMatch(new RegExp(`^MCP_LIMIT = ${MCP_LIMIT}\\b`, 'm'));
    expect(source('server.py')).toContain('PATH = "/mcp"');
    expect(MCP_URL).toMatch(/^https:\/\/[^/]+\/mcp$/);
  });

  it('shows the URL, every tool and client, and the privacy note', () => {
    render(<DevelopersPage />);
    expect(screen.getAllByText(MCP_URL).length).toBeGreaterThan(0);
    for (const tool of MCP_TOOLS) expect(screen.getByText(tool.name)).toBeTruthy();
    expect(screen.getByText(MCP_PROMPT.name)).toBeTruthy();
    for (const client of MCP_CLIENTS) expect(screen.getByText(client.name)).toBeTruthy();
    expect(screen.getByText(/No contact details or payments go through MCP/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${MCP_LIMIT} requests an hour`))).toBeTruthy();
  });

  it('gives Cursor a config that parses and points at the server', () => {
    const cursor = MCP_CLIENTS.find((c) => c.name === 'Cursor');
    const config = JSON.parse(cursor && 'config' in cursor ? cursor.config : '{}');
    expect(config).toEqual({ mcpServers: { tripsmith: { url: MCP_URL } } });
  });
});
