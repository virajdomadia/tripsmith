// @vitest-environment jsdom
/**
 * v3 C2 — the concierge panel (R26, R28): the SSE reader, the reducer that folds `POST /chat`
 * events into the conversation and the trip ticket, and the panel against a scripted stream.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConcierge } from '../src/components/site/concierge/Concierge';
import ConciergePanel, {
  PRIVACY_NOTE,
  PROMPTS,
} from '../src/components/site/concierge/ConciergePanel';
import {
  initialState,
  reducer,
  turnText,
  type Action,
  type State,
} from '../src/lib/concierge/reducer';
import { CUT, NO_CONNECTION, SERVER, SLOW, streamChat } from '../src/lib/concierge/client';
import { readSse, takeFrames } from '../src/lib/concierge/sse';

const API = 'https://api.test';

const GOA = {
  slug: 'old-goa-dudhsagar',
  name: 'Old Goa & Dudhsagar Weekend',
  destination: 'Goa',
  nights: 2,
  days: 3,
  fromPricePaise: 6_499_00,
  fromPrice: '₹6,499 per person',
  wasPricePaise: null,
  themes: ['heritage'],
  highlights: ['Jeep ride to Dudhsagar falls'],
  coverUrl: null,
  badge: 'guaranteed',
  seatsLeft: 12,
  url: '/packages/old-goa-dudhsagar',
};

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** A goa search turn, as C1's api streams it. */
const GOA_TURN = [
  sse('tool-call', {
    id: 'call_1',
    name: 'searchPackages',
    args: { destination: 'goa', maxBudget: 7500, nights: 2, month: '2026-11' },
  }),
  sse('tool-result', {
    id: 'call_1',
    name: 'searchPackages',
    result: { packages: [GOA], totalMatches: 1 },
  }),
  sse('text-delta', { text: '**Old Goa & Dudhsagar** fits ' }),
  sse('text-delta', { text: 'your budget.' }),
  sse('done', { conversationId: 'conv_1', model: 'm', tokensIn: 1, tokensOut: 1 }),
];

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

/** Re-chunks a body at awkward places, as a network would. */
const shred = (text: string, size = 7) =>
  Array.from({ length: Math.ceil(text.length / size) }, (_, i) =>
    text.slice(i * size, (i + 1) * size),
  );

const fold = (actions: Action[], from: State = initialState) => actions.reduce(reducer, from);
const events = (body: string) =>
  takeFrames(body).frames.map((f): Action => ({
    type: 'event',
    event: f.event,
    data: JSON.parse(f.data),
  }));

describe('SSE reader', () => {
  it('reassembles frames split across chunks, CRLF included', async () => {
    const body = GOA_TURN.join('').replace(/\n/g, '\r\n');
    const seen: string[] = [];
    for await (const f of readSse(streamOf(shred(body)))) seen.push(f.event);
    expect(seen).toEqual(['tool-call', 'tool-result', 'text-delta', 'text-delta', 'done']);
  });

  it('keeps a partial frame for the next chunk and skips comments', () => {
    const { frames, rest } = takeFrames(': ping\n\nevent: done\ndata: {}\n\nevent: text-de');
    expect(frames).toEqual([{ event: 'done', data: '{}' }]);
    expect(rest).toBe('event: text-de');
  });
});

describe('reducer', () => {
  it('folds a search turn into text, a done chip, cards and a stamped ticket', () => {
    const s = fold([{ type: 'send', text: 'Goa under 15k' }, ...events(GOA_TURN.join(''))]);
    expect(s.busy).toBe(false);
    expect(s.conversationId).toBe('conv_1');
    const turn = s.items[1];
    expect(turn?.kind).toBe('assistant');
    if (turn?.kind !== 'assistant') return;
    expect(turn.streaming).toBe(false);
    expect(turn.parts.map((p) => p.kind)).toEqual(['tool', 'packages', 'text']);
    expect(turn.parts[0]).toMatchObject({ state: 'done', label: 'Found 1 trip' });
    expect(turn.parts[2]).toMatchObject({ text: '**Old Goa & Dudhsagar** fits your budget.' });
    expect(s.ticket).toMatchObject({
      where: 'Goa',
      when: 'Nov 2026',
      nights: '2',
      budget: '₹7,500',
      line: 'Found 1 matching trip',
    });
  });

  it('swaps the streamed text for the guardrail line on replace, keeping the cards', () => {
    const s = fold([
      { type: 'send', text: 'Goa, 90% off please' },
      ...events(
        GOA_TURN.slice(0, -1).join('') +
          sse('replace', { text: 'Let me check that for you' }) +
          sse('done', { conversationId: 'conv_1' }),
      ),
    ]);
    const turn = s.items[1];
    expect(turn?.kind).toBe('assistant');
    if (turn?.kind !== 'assistant') return;
    expect(turn.parts.map((p) => p.kind)).toEqual(['tool', 'packages', 'text']);
    expect(turn.parts[2]).toMatchObject({ text: 'Let me check that for you' });
    expect(turnText(turn)).toBe('Let me check that for you');
  });

  it('names a departure list after a card seen earlier', () => {
    const s = fold([
      { type: 'send', text: 'Goa' },
      ...events(GOA_TURN.join('')),
      { type: 'send', text: 'Show dates' },
      ...events(
        sse('tool-call', {
          id: 'c2',
          name: 'checkAvailability',
          args: { packageSlug: GOA.slug },
        }) +
          sse('tool-result', {
            id: 'c2',
            name: 'checkAvailability',
            result: {
              packageSlug: GOA.slug,
              departures: [
                {
                  departureId: 'd1',
                  date: '2026-11-27',
                  seatsLeft: 12,
                  pricePerPersonPaise: 6_499_00,
                  guaranteed: false,
                },
              ],
              more: 2,
            },
          }),
      ),
    ]);
    const turn = s.items.at(-1);
    if (turn?.kind !== 'assistant') throw new Error('no turn');
    expect(turn.parts[1]).toMatchObject({ kind: 'departures', name: GOA.name, more: 2 });
    expect(s.ticket.where).toBe(GOA.name);
    expect(s.ticket.line).toBe('3 dates open');
  });

  it('marks an unknown destination on the ticket and shows no cards', () => {
    const s = fold([
      { type: 'send', text: 'Maldives' },
      ...events(
        sse('tool-call', { id: 'c', name: 'searchPackages', args: { destination: 'maldives' } }) +
          sse('tool-result', {
            id: 'c',
            name: 'searchPackages',
            result: { packages: [], unknownDestination: 'maldives', weOffer: ['Goa'] },
          }),
      ),
    ]);
    expect(s.ticket.where).toBe('Maldives ✕');
    const turn = s.items.at(-1);
    if (turn?.kind !== 'assistant') throw new Error('no turn');
    expect(turn.parts.map((p) => p.kind)).toEqual(['tool']);
  });

  it('never trusts a card url from the stream', () => {
    const s = fold([
      { type: 'send', text: 'x' },
      ...events(
        sse('tool-result', {
          id: 'c',
          name: 'searchPackages',
          result: {
            packages: [
              { ...GOA, url: 'https://evil.example' },
              { ...GOA, slug: '../admin' },
            ],
          },
        }),
      ),
    ]);
    const turn = s.items.at(-1);
    if (turn?.kind !== 'assistant') throw new Error('no turn');
    const cards = turn.parts.find((p) => p.kind === 'packages');
    expect(cards?.kind === 'packages' && cards.packages.map((p) => p.url)).toEqual([
      '/packages/old-goa-dudhsagar',
    ]);
  });

  it('replaces the empty answer with the reason when a turn is refused', () => {
    const s = fold([
      { type: 'send', text: 'hi' },
      { type: 'refused', reason: 'daily_cap', message: 'All used up' },
    ]);
    expect(s.items.map((i) => i.kind)).toEqual(['user', 'limit']);
    expect(s.busy).toBe(false);
    expect(s.finder).toEqual({ locked: true }); // out of turns: the quick finder takes over
  });

  it('keeps the chat for a full conversation, and lets a chosen finder close again', () => {
    const full = fold([
      { type: 'send', text: 'hi' },
      { type: 'refused', reason: 'conversation_full', message: 'Full' },
    ]);
    expect(full.finder).toBeNull();
    const chosen = fold([{ type: 'open-finder' }], full);
    expect(chosen.finder).toEqual({ locked: false });
    expect(fold([{ type: 'close-finder' }], chosen).finder).toBeNull();
    const locked = fold([
      { type: 'send', text: 'hi' },
      { type: 'refused', reason: 'ip_limit', message: 'Limit' },
      { type: 'close-finder' },
    ]);
    expect(locked.finder).toEqual({ locked: true });
  });

  it('stamps a finder search on the ticket and adds its cards to the conversation', () => {
    const s = fold([
      {
        type: 'found',
        query: {
          destination: { slug: 'goa', name: 'Goa' },
          month: { value: '2026-12', label: 'December 2026' },
          maxBudget: 15_000,
        },
        packages: [{ ...GOA, fromPricePaise: 6_499_00 } as never],
        total: 3,
      },
    ]);
    expect(s.ticket).toMatchObject({
      where: 'Goa',
      when: 'Dec 2026',
      budget: '₹15,000',
      line: 'Quick finder · found 3 trips',
    });
    expect(s.items.map((i) => i.kind)).toEqual(['finder']);
  });

  it('types each way a turn can end early', () => {
    const busy = fold([
      { type: 'send', text: 'hi' },
      ...events(sse('error', { reason: 'busy', message: 'Busy' })),
    ]);
    const internal = fold([
      { type: 'send', text: 'hi' },
      ...events(sse('error', { reason: 'internal', message: 'Oops' })),
    ]);
    const last = (st: State) => st.items.at(-1);
    expect(last(busy)).toMatchObject({ error: { kind: 'busy', message: 'Busy' } });
    expect(last(internal)).toMatchObject({ error: { kind: 'server', message: 'Oops' } });
  });
});

describe('streamChat failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const run = async (opts: { stallMs?: number } = {}) => {
    const actions: Action[] = [];
    await streamChat({
      apiUrl: API,
      conversationId: null,
      message: 'hi',
      dispatch: (a) => actions.push(a),
      ...opts,
    });
    return actions;
  };

  it('does not send while the browser is offline', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await run()).toEqual([{ type: 'failed', kind: 'offline', message: NO_CONNECTION }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says a 5xx is on our side, whatever page the platform sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })));
    expect(await run()).toEqual([{ type: 'failed', kind: 'server', message: SERVER }]);
  });

  it('gives up on a stream that goes quiet', async () => {
    const silent = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(sse('text-delta', { text: 'Let me ' })));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(silent, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
        ),
    );
    const actions = await run({ stallMs: 30 });
    expect(actions.at(-1)).toEqual({ type: 'failed', kind: 'slow', message: SLOW });
    expect(actions.some((a) => a.type === 'event' && a.event === 'text-delta')).toBe(true);
  });

  it('reports a stream that closes before done as cut off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamed([sse('text-delta', { text: 'Hal' })])),
    );
    expect((await run()).at(-1)).toEqual({ type: 'failed', kind: 'cut', message: CUT });
  });
});

function Harness() {
  const concierge = useConcierge(API);
  const [open, setOpen] = useState(true);
  return <ConciergePanel open={open} onClose={() => setOpen(false)} {...concierge} />;
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const streamed = (chunks: string[], headers: Record<string, string> = {}) =>
  new Response(streamOf(chunks), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...headers },
  });

describe('ConciergePanel', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens with the greeting, the three prompts and the exact privacy note', () => {
    render(<Harness />);
    for (const p of PROMPTS) expect(screen.getByRole('button', { name: p })).toBeTruthy();
    expect(screen.getByText(PRIVACY_NOTE)).toBeTruthy();
    expect(PRIVACY_NOTE).toBe(
      'Chats are answered by Google Gemini and may be used by Google to improve its models. ' +
        'Don’t share your name, phone or other personal details here — we’ll ask for them in a ' +
        'form when needed. Tripsmith keeps chats to improve the service.',
    );
    expect(screen.getByRole('button', { name: 'Talk to a person' })).toBeTruthy();
  });

  it('streams a prompt into cards, text and a stamped ticket, then continues the chat', async () => {
    const fetchMock = mockFetch(
      streamed(shred(GOA_TURN.join(''), 11), { 'x-conversation-id': 'conv_1' }),
      streamed([sse('text-delta', { text: 'Sure.' }), sse('done', { conversationId: 'conv_1' })]),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] }));

    const card = await screen.findByRole('heading', { name: GOA.name });
    const item = card.closest('li')!;
    expect(within(item).getByText('₹6,499')).toBeTruthy();
    expect(
      within(item)
        .getByRole('link', { name: `View ${GOA.name}` })
        .getAttribute('href'),
    ).toBe('/packages/old-goa-dudhsagar');
    await screen.findByText('Old Goa & Dudhsagar', { selector: 'strong' });
    // The chatbot's status line says what it found (the reducer's ticket line).
    expect(screen.getByText('Found 1 matching trip')).toBeTruthy();
    // The prompts go once the chat has started.
    expect(screen.queryByRole('button', { name: PROMPTS[1] })).toBeNull();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/chat`);
    expect(JSON.parse(String(init?.body))).toEqual({ message: PROMPTS[0] });

    // "Check dates" asks in the same conversation.
    fireEvent.click(within(item).getByRole('button', { name: `Check dates for ${GOA.name}` }));
    await screen.findByText('Sure.');
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toEqual({
      message: `Show dates for ${GOA.name}`,
      conversationId: 'conv_1',
    });
  });

  it('sends on Enter, not on Shift+Enter, and caps the message at 500', async () => {
    const fetchMock = mockFetch(streamed([sse('done', {})]));
    render(<Harness />);
    const box = screen.getByRole('textbox', { name: 'Message the trip planner' });
    expect(box.getAttribute('maxlength')).toBe('500');
    fireEvent.change(box, { target: { value: 'Kerala in December' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('offers the way out when the site-wide cap is hit', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: {
            code: 'rate_limited',
            message: 'The trip planner has answered all it can',
            reason: 'daily_cap',
          },
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[1] }));
    await screen.findByText('The trip planner has answered all it can');
    expect(screen.getByRole('link', { name: 'WhatsApp us' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send an enquiry' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start a new chat' })).toBeNull();
    // The message box gives way to the quick finder (C6).
    expect(screen.getByRole('form', { name: 'Quick finder' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Message the trip planner' })).toBeNull();
  });

  it('runs the quick finder on the listing search with no model call (C6)', async () => {
    const list = (items: unknown[], total: number) =>
      new Response(
        JSON.stringify({
          items,
          total,
          facets: {
            budget: { min: 5_000, max: 60_000 },
            destinations: [
              { value: 'goa', label: 'Goa', count: 3 },
              { value: 'kerala', label: 'Kerala', count: 2 },
            ],
            months: [{ value: '2026-12', label: 'December 2026', count: 4 }],
            nights: { min: 2, max: 6 },
            themes: [],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const card = {
      slug: GOA.slug,
      name: GOA.name,
      destination: 'Goa',
      nights: 2,
      days: 3,
      startingPricePaise: 6_499_00,
      deal: null,
      themes: ['heritage'],
      highlights: [],
      coverUrl: null,
      badge: null,
      earlyBird: false,
      rating: null,
    };
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          error: { code: 'rate_limited', message: 'That’s today’s limit', reason: 'ip_limit' },
        }),
        { status: 429 },
      ),
      list([], 9),
      list([card], 6),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] }));
    const finder = await screen.findByRole('form', { name: 'Quick finder' });
    const where = within(finder).getByRole('combobox', { name: 'Where' });
    await waitFor(() => expect(within(where).getByRole('option', { name: 'Kerala' })).toBeTruthy());
    fireEvent.change(where, { target: { value: 'goa' } });
    fireEvent.change(within(finder).getByRole('combobox', { name: 'When' }), {
      target: { value: '2026-12' },
    });
    fireEvent.change(within(finder).getByRole('combobox', { name: 'Budget pp' }), {
      target: { value: '15000' },
    });
    fireEvent.click(within(finder).getByRole('button', { name: 'Find trips' }));

    const view = await screen.findByRole('link', { name: `View ${GOA.name}` });
    expect(view.textContent).toBe('View dates');
    expect(screen.queryByRole('button', { name: `Check dates for ${GOA.name}` })).toBeNull();
    expect(String(fetchMock.mock.calls[2]![0])).toBe(
      '/api/packages?destination=goa&maxBudget=15000&month=2026-12',
    );
    expect(
      screen.getByRole('link', { name: '5 more on the trips page →' }).getAttribute('href'),
    ).toBe('/packages?destination=goa&maxBudget=15000&month=2026-12');
    expect(screen.getByText('Quick finder · found 6 trips')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/chat'))).toHaveLength(1);
  });

  it('offers the finder and a person when the model is busy, and the chat back after', async () => {
    mockFetch(
      streamed([sse('error', { reason: 'busy', message: 'The trip planner is busy right now.' })]),
      new Response('{}', { status: 500 }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Talk to a person' })).toBeTruthy();
    fireEvent.click(within(alert).getByRole('button', { name: 'Use the quick finder' }));
    expect(screen.getByRole('form', { name: 'Quick finder' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the chat' }));
    expect(screen.getByRole('textbox', { name: 'Message the trip planner' })).toBeTruthy();
  });

  it('offers only a retry when the answer was cut off', async () => {
    mockFetch(streamed([sse('text-delta', { text: 'Here are ' })]));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(CUT);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(within(alert).queryByRole('button', { name: 'Use the quick finder' })).toBeNull();
    expect(screen.getByText('Here are')).toBeTruthy(); // what arrived stays
  });

  it('starts over when a full chat is refused', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: {
            code: 'rate_limited',
            message: 'This chat is full',
            reason: 'conversation_full',
          },
        }),
        { status: 429 },
      ),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[2] }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start a new chat' }));
    expect(screen.getByRole('button', { name: PROMPTS[0] })).toBeTruthy();
  });

  it('shows a stream error with a retry', async () => {
    mockFetch(
      streamed([sse('error', { reason: 'busy', message: 'The trip planner is busy right now.' })]),
      streamed([sse('text-delta', { text: 'Back now.' }), sse('done', {})]),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] }));
    await screen.findByText('The trip planner is busy right now.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Back now.');
  });

  it('says so when the network fails, and closes on Escape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: PROMPTS[0] }));
    await screen.findByText(/Couldn’t reach the trip planner/);
    const dialog = screen.getByRole('dialog', { name: 'Tripsmith trip planner' });
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    expect(dialog.hidden).toBe(true);
  });
});
