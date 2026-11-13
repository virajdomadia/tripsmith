// @vitest-environment jsdom
/**
 * v3 C3 — book, hand off, notify (R27, R29, R30): the reducer's new parts, the in-memory hand-off
 * to the Book-now sheet, the panel's enquiry form (name and phone go to /api/enquiries, never to
 * /chat), a departure list's "Book", and the notify-me form.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotifyMe } from '../src/components/site/alerts/NotifyMe';
import { useConcierge } from '../src/components/site/concierge/Concierge';
import ConciergePanel from '../src/components/site/concierge/ConciergePanel';
import {
  onBookingRequest,
  parseBookUrl,
  requestBooking,
  takeBooking,
} from '../src/lib/concierge/book-request';
import { initialState, reducer, type Action, type State } from '../src/lib/concierge/reducer';
import { enquirySchema } from '../src/lib/enquiry-schema';

const API = 'https://api.test';
const SLUG = 'old-goa-dudhsagar';
const URL_ = `/packages/${SLUG}?date=2026-12-18&double=1&triple=0&single=0&children=0#book`;

const BOOKING = {
  packageSlug: SLUG,
  packageName: 'Old Goa & Dudhsagar Weekend',
  departureId: 'dep_1',
  date: '2026-12-18',
  adults: 2,
  children: 0,
  totalPaise: 12_998_00,
  total: '₹12,998',
  url: URL_,
};

const fold = (actions: Action[], from: State = initialState) => actions.reduce(reducer, from);
const turn = (...events: [string, unknown][]): Action[] => [
  { type: 'send', text: 'hi' },
  ...events.map(([event, data]): Action => ({ type: 'event', event, data })),
];
const lastParts = (s: State) => {
  const item = s.items.at(-1);
  return item?.kind === 'assistant' ? item.parts : [];
};

describe('reducer (C3)', () => {
  it('turns startBooking into a booking card and a sheet to open once the turn ends', () => {
    const s = fold(
      turn(
        [
          'tool-call',
          { id: 't1', name: 'startBooking', args: { departureId: 'dep_1', adults: 2 } },
        ],
        ['tool-result', { id: 't1', name: 'startBooking', result: BOOKING }],
      ),
    );
    expect(lastParts(s).map((p) => p.kind)).toEqual(['tool', 'booking']);
    expect(s.go?.url).toBe(URL_);
    expect(s.party).toEqual({ adults: 2, children: 0 });
    expect(s.busy).toBe(true); // the Concierge waits for `done` before it navigates
    expect(fold([{ type: 'went' }], s).go).toBeNull();
  });

  it('never follows a booking url that is not this package page', () => {
    for (const url of ['https://evil.test/x#book', `/packages/${SLUG}?date=x`, '/account#book']) {
      const s = fold(
        turn(['tool-result', { id: 't1', name: 'startBooking', result: { ...BOOKING, url } }]),
      );
      expect(s.go).toBeNull();
      expect(lastParts(s).some((p) => p.kind === 'booking')).toBe(false);
    }
  });

  it('opens the form pre-filled from createEnquiry, and closes it once sent', () => {
    const s = fold(
      turn([
        'tool-result',
        {
          id: 't1',
          name: 'createEnquiry',
          result: {
            form: 'enquiry',
            summary: 'Two adults, Goa in May',
            package: { slug: SLUG, name: 'Old Goa' },
            adults: 2,
            children: null,
            month: '2027-05',
          },
        },
      ]),
    );
    expect(s.form).toEqual({
      summary: 'Two adults, Goa in May',
      package: { slug: SLUG, name: 'Old Goa' },
      adults: 2,
      children: null,
      month: '2027-05',
    });
    const sent = fold(
      [{ type: 'handed-off', ref: 'TS-ABC234', firstName: 'Asha', emailed: true }],
      s,
    );
    expect(sent.form).toBeNull();
    expect(sent.items.at(-1)).toMatchObject({ kind: 'handed-off', ref: 'TS-ABC234' });
  });

  it('offers the new-dates alert a tool result carries', () => {
    const s = fold(
      turn(
        [
          'tool-result',
          {
            id: 't1',
            name: 'checkAvailability',
            result: {
              packageSlug: SLUG,
              departures: [],
              alertFor: { packageSlug: SLUG, name: 'Old Goa' },
            },
          },
        ],
        [
          'tool-result',
          {
            id: 't2',
            name: 'searchPackages',
            result: { packages: [], alertFor: { destinationSlug: 'goa', name: 'Goa' } },
          },
        ],
      ),
    );
    const offers = lastParts(s).flatMap((p) => (p.kind === 'alert' ? [p.offer] : []));
    expect(offers).toEqual([
      { target: 'package', slug: SLUG, name: 'Old Goa' },
      { target: 'destination', slug: 'goa', name: 'Goa' },
    ]);
  });
});

describe('book-request', () => {
  it('parses only package booking links', () => {
    expect(parseBookUrl(URL_)).toEqual({ slug: SLUG, search: URL_.slice(URL_.indexOf('?'), -5) });
    expect(parseBookUrl('https://x.test/packages/a#book')).toBeNull();
    expect(parseBookUrl('/packages/a?x=1')).toBeNull();
  });

  it('hands a request to the mounted page, or to the next one to mount, exactly once', () => {
    const seen: string[] = [];
    const off = onBookingRequest((r) => seen.push(r.slug));
    requestBooking(URL_);
    expect(seen).toEqual([SLUG]);
    off();
    expect(takeBooking('another-trip')).toBeNull();
    expect(takeBooking(SLUG)?.search).toContain('date=2026-12-18');
    expect(takeBooking(SLUG)).toBeNull();
  });
});

describe('enquirySchema (chat-handoff)', () => {
  const base = { name: 'Asha Rao', phone: '9876543210', email: 'asha@customer.in', adults: '2' };
  it('takes a handoff with or without a trip, and keeps its conversation', () => {
    const out = enquirySchema.parse({ ...base, type: 'chat-handoff', conversationId: 'c1' });
    expect(out).toMatchObject({ type: 'chat-handoff', conversationId: 'c1' });
    expect(out.packageSlug).toBeUndefined();
  });
  it('drops a conversation id on any other type', () => {
    const out = enquirySchema.parse({ ...base, type: 'contact', conversationId: 'c1' });
    expect(out.conversationId).toBeUndefined();
  });
});

// ---- the panel ---------------------------------------------------------------------------------

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const streamed = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
        c.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'x-conversation-id': 'conv_1' },
    },
  );
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

let latest: State = initialState;
function Harness() {
  const concierge = useConcierge(API);
  latest = concierge.state;
  const [open, setOpen] = useState(true);
  return <ConciergePanel open={open} onClose={() => setOpen(false)} {...concierge} />;
}

const DATES_TURN = [
  sse('tool-call', { id: 'c1', name: 'checkAvailability', args: { packageSlug: SLUG } }),
  sse('tool-result', {
    id: 'c1',
    name: 'checkAvailability',
    result: {
      packageSlug: SLUG,
      packageName: 'Old Goa',
      departures: [
        {
          departureId: 'dep_1',
          date: '2026-12-18',
          seatsLeft: 9,
          pricePerPersonPaise: 6_499_00,
          guaranteed: false,
        },
      ],
      more: 0,
    },
  }),
  sse('text-delta', { text: 'One date.' }),
  sse('done', { conversationId: 'conv_1' }),
];

describe('ConciergePanel (C3)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('talks to a person in a form: contact details go to /api/enquiries with the chat id', async () => {
    const fetchMock = mockFetch(
      streamed(DATES_TURN),
      json(201, { ref: 'TS-ABC234', firstName: 'Asha', package: null, emailed: true }),
    );
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the concierge' }), {
      target: { value: 'Goa dates?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('One date.');

    fireEvent.click(screen.getByRole('button', { name: 'Talk to a person' }));
    const form = screen.getByRole('form', { name: 'Talk to a person' });
    expect(screen.queryByRole('textbox', { name: 'Message the concierge' })).toBeNull();
    fireEvent.change(within(form).getByLabelText('Your name'), { target: { value: 'Asha Rao' } });
    fireEvent.change(within(form).getByLabelText('Mobile number'), {
      target: { value: '98765 43210' },
    });
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: 'asha@customer.in' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Send to the team' }));

    await screen.findByText(/it’s with our team/);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/enquiries');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      type: 'chat-handoff',
      conversationId: 'conv_1',
      name: 'Asha Rao',
      phone: '9876543210',
    });
    // Nothing personal ever went to the chat endpoint.
    expect(String(fetchMock.mock.calls[0]![1]?.body)).not.toContain('9876543210');
    expect(screen.getByText('TS-ABC234')).toBeTruthy();
  });

  it('books a date from the list through /api/chat/booking without a turn', async () => {
    const fetchMock = mockFetch(streamed(DATES_TURN), json(200, BOOKING));
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the concierge' }), {
      target: { value: 'Goa dates?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Book Fri 18 Dec' }));

    await waitFor(() => expect(latest.go?.url).toBe(URL_));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/chat/booking');
    expect(JSON.parse(String(init?.body))).toEqual({
      conversationId: 'conv_1',
      departureId: 'dep_1',
    });
  });

  it('says why a date cannot be booked', async () => {
    mockFetch(
      streamed(DATES_TURN),
      json(409, {
        error: { code: 'conflict', message: 'Not enough seats left on this date for your party' },
      }),
    );
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the concierge' }), {
      target: { value: 'Goa dates?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Book Fri 18 Dec' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Not enough seats');
    expect(latest.go).toBeNull();
  });
});

describe('NotifyMe', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('posts the alert for its target and confirms it is one email', async () => {
    const fetchMock = mockFetch(json(201, { target: 'destination', slug: 'goa', name: 'Goa' }));
    render(<NotifyMe offer={{ target: 'destination', slug: 'goa', name: 'Goa' }} />);
    const box = screen.getByLabelText('Email me when new dates are added for Goa');
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: ' Asha@Customer.in ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect((await screen.findByRole('status')).textContent).toContain('once');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/alerts');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'asha@customer.in',
      destinationSlug: 'goa',
    });
  });
});
