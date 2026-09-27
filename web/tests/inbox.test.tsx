// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/enquiries',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  Composer,
  FollowUpControl,
  StageControl,
} from '@/components/admin/enquiries/InboxControls';
import { InboxList } from '@/components/admin/enquiries/InboxList';
import {
  followUp,
  snippets,
  source,
  templates,
  thread,
  waiting,
  type AdminEnquiry,
  type EnquiryRow,
  type TripFacts,
} from '@/lib/admin/inbox';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => refresh.mockReset());

const NOW = new Date('2026-09-27T10:50:00Z'); // 4:20 pm IST
const TODAY = '2026-09-27';

const enquiry = (over: Partial<AdminEnquiry> = {}): AdminEnquiry =>
  ({
    id: 'enq_1',
    ref: 'TS-7F3K2Q',
    type: 'custom',
    status: 'new',
    name: 'Neha Kapoor',
    phone: '9845066120',
    email: 'neha.kapoor@customer.in',
    travelMonth: '2026-11-01',
    adults: 2,
    children: 1,
    message: 'Is the houseboat safe for a 6 year old?',
    preferredDates: 'Around 14–19 Nov',
    budgetPaise: 30_000_00,
    changes: null,
    package: {
      slug: 'munnar-alleppey-houseboat',
      name: 'Munnar & Alleppey Houseboat',
      nights: 4,
      days: 5,
      startingPricePaise: 19_799_00,
      coverUrl: null,
      status: 'live',
    },
    emailStatus: 'sent',
    device: 'Mobile',
    userAgent: null,
    createdAt: '2026-09-27T10:02:00Z',
    updatedAt: '2026-09-27T10:02:00Z',
    notes: [],
    messages: [],
    related: [],
    followUpOn: null,
    lostReason: null,
    bookings: [],
    ...over,
  }) as AdminEnquiry;

const TRIP: TripFacts = {
  name: 'Munnar & Alleppey Houseboat',
  nights: 4,
  fromPaise: 19_799_00,
  dates: [
    ['Sun 18 Oct', 4],
    ['Sun 15 Nov', 12],
  ],
};

describe('inbox helpers', () => {
  it('measures waiting against the 2-hour target, and only for unanswered new enquiries', () => {
    const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
    expect(waiting({ status: 'new', replied: false, createdAt: at(12) }, NOW)).toEqual({
      tone: 'ok',
      text: 'Waiting 12 min · on target',
    });
    expect(waiting({ status: 'new', replied: false, createdAt: at(60) }, NOW)?.tone).toBe('warn');
    expect(waiting({ status: 'new', replied: false, createdAt: at(300) }, NOW)).toEqual({
      tone: 'bad',
      text: 'Waiting 5 h · over target',
    });
    expect(waiting({ status: 'new', replied: true, createdAt: at(300) }, NOW)).toBeNull();
    expect(waiting({ status: 'contacted', replied: false, createdAt: at(300) }, NOW)).toBeNull();
  });

  it('words a follow-up by the IST day, and only on open enquiries', () => {
    expect(followUp({ status: 'new', followUpOn: TODAY }, TODAY)).toEqual({
      due: true,
      text: 'Follow up today',
    });
    expect(followUp({ status: 'contacted', followUpOn: '2026-09-28' }, TODAY)?.text).toBe(
      'Follow up tomorrow',
    );
    expect(followUp({ status: 'contacted', followUpOn: '2026-10-01' }, TODAY)?.text).toBe(
      'Follow up Thu 1 Oct',
    );
    expect(followUp({ status: 'contacted', followUpOn: '2026-09-25' }, TODAY)).toEqual({
      due: true,
      text: 'Follow-up overdue · Fri 25 Sep',
    });
    expect(followUp({ status: 'converted', followUpOn: TODAY }, TODAY)).toBeNull();
  });

  it('reads the source off the type', () => {
    expect(source('callback').label).toBe('Callback');
    expect(source('chat-handoff').label).toBe('Concierge');
    expect(source('standard').label).toBe('Form');
  });

  it('threads the form, replies, notes and status pills oldest first', () => {
    const t = thread(
      enquiry({
        notes: [
          {
            id: 'n2',
            body: 'Called, wants two nights on the boat',
            createdAt: '2026-09-27T11:10:00Z',
          },
          {
            id: 'n1',
            body: 'Status changed from New to Contacted',
            createdAt: '2026-09-27T11:00:00Z',
          },
        ],
        messages: [
          {
            id: 'm1',
            subject: 'Your enquiry',
            body: 'Hi Neha',
            sentAt: '2026-09-27T10:40:00Z',
            sent: true,
            error: null,
            attachment: null,
          },
        ],
      }),
    );
    expect(t.map((i) => i.kind)).toEqual(['in', 'out', 'sys', 'note']);
    expect(t[2]).toMatchObject({ body: 'Moved from New to Contacted' });
  });

  it('calls the closing moves Won and Lost, in old notes too', () => {
    const t = thread(
      enquiry({
        notes: [
          {
            id: 'n1',
            body: 'Status changed from Contacted to Closed · lost: Price too high',
            createdAt: '2026-09-27T11:00:00Z',
          },
          {
            id: 'n2',
            body: 'Status changed from Closed to Converted',
            createdAt: '2026-09-27T12:00:00Z',
          },
        ],
        messages: [],
      }),
    );
    expect(t.slice(1).map((i) => ('body' in i ? i.body : null))).toEqual([
      'Moved from Contacted to Lost · lost: Price too high',
      'Moved from Lost to Won',
    ]);
  });

  it('drops real trip facts into snippets and templates', () => {
    const e = enquiry();
    const [price, dates] = snippets(e, TRIP);
    expect(price!.text).toBe(
      'Munnar & Alleppey Houseboat starts at ₹19,799 per person for 4 nights. For 2 adults, 1 child that comes to about ₹59,397.',
    );
    expect(dates!.text).toBe('Next dates with seats: Sun 18 Oct (4 left), Sun 15 Nov (12 left).');
    expect(snippets(e, null)[1]!.text).toBe('I will send the next dates as soon as they open.');
    const first = templates(e, TRIP, 'Viraj, Tripsmith')[0]!;
    expect(first.text.startsWith('Hi Neha,\n\nThanks for your enquiry. Munnar')).toBe(true);
    expect(first.text.endsWith('Viraj, Tripsmith')).toBe(true);
  });
});

describe('InboxList', () => {
  const row = (over: Partial<EnquiryRow> = {}): EnquiryRow =>
    ({
      id: 'enq_1',
      ref: 'TS-7F3K2Q',
      type: 'callback',
      status: 'new',
      name: 'Neha Kapoor',
      phone: '9845066120',
      package: { slug: 'munnar', name: 'Munnar & Alleppey Houseboat' },
      travelMonth: '2026-11-01',
      adults: 2,
      children: 1,
      createdAt: new Date(Date.now() - 48 * 60_000).toISOString(),
      replied: false,
      followUpOn: null,
      lostReason: null,
      estimatePaise: 59_397_00,
      ...over,
    }) as EnquiryRow;

  it('shows who, the trip, the estimate and the chips, and opens the panel', () => {
    render(
      <InboxList items={[row()]} today={TODAY} hrefFor={(id) => `/admin/enquiries?sel=${id}`} />,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/admin/enquiries?sel=enq_1');
    const r = within(link);
    expect(r.getByText('Munnar & Alleppey Houseboat · Nov 2026 · 2 adults, 1 child')).toBeDefined();
    expect(r.getByText('₹59,397')).toBeDefined(); // below a lakh: rupees
    expect(r.getByText('Callback')).toBeDefined();
    expect(r.getByText(/^Waiting 48 min · 1 h to target$/)).toBeDefined();
    expect(r.getByText('New')).toBeDefined();
  });

  it('names a lost enquiry’s reason and says so when a view is empty', () => {
    render(
      <InboxList
        items={[row({ status: 'closed', lostReason: 'Price too high' })]}
        today={TODAY}
        hrefFor={(id) => id}
      />,
    );
    expect(screen.getByText('Lost · Price too high')).toBeDefined();
    cleanup();
    render(<InboxList items={[]} today={TODAY} hrefFor={(id) => id} />);
    expect(screen.getByText(/Every enquiry in this view is answered/)).toBeDefined();
  });
});

describe('StageControl', () => {
  it('offers only the legal moves and asks why before marking lost', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);
    render(<StageControl e={enquiry({ status: 'contacted' })} />);
    expect((screen.getByRole('button', { name: /^New$/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lost' }));
    fireEvent.change(screen.getByLabelText('Why was it lost?'), {
      target: { value: 'Price too high' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark lost' }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/enquiries/enq_1/status');
    expect(JSON.parse(String(init.body))).toEqual({
      status: 'closed',
      lostReason: 'Price too high',
    });
  });
});

describe('FollowUpControl', () => {
  it('saves a typed date on blur or Enter only, and never a past one', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);
    render(<FollowUpControl e={enquiry({ followUpOn: null })} today={TODAY} />);
    const box = screen.getByLabelText('Pick a follow-up date');
    fireEvent.change(box, { target: { value: '0002-10-05' } }); // a year half typed
    fireEvent.change(box, { target: { value: '2026-10-05' } });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '2026-09-01' } });
    fireEvent.blur(box);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '2026-10-05' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/enquiries/enq_1/follow-up');
    expect(JSON.parse(String(init.body))).toEqual({ followUpOn: '2026-10-05' });
  });
});

describe('Composer', () => {
  it('inserts a snippet, applies a template and sends the reply with the itinerary', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const e = enquiry();
    render(
      <Composer
        e={e}
        subject="Your Tripsmith enquiry TS-7F3K2Q"
        snippets={snippets(e, TRIP)}
        templates={templates(e, TRIP, 'Viraj, Tripsmith')}
        canAttach
      />,
    );
    const box = screen.getByLabelText('Reply') as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('button', { name: '+ Call time' }));
    expect(box.value).toBe('Hi Neha,\n\nWhat time suits you for a 10-minute call today?');
    fireEvent.change(screen.getByLabelText('Insert a template'), { target: { value: 'nudge' } });
    expect(box.value.startsWith('Hi Neha,\n\nJust checking in on the Munnar')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Send reply/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/enquiries/enq_1/reply');
    expect(JSON.parse(String(init.body))).toMatchObject({
      subject: 'Your Tripsmith enquiry TS-7F3K2Q',
      packageSlug: 'munnar-alleppey-houseboat',
    });
  });

  it('saves an internal note to the notes endpoint', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);
    render(<Composer e={enquiry()} subject="s" snippets={[]} templates={[]} canAttach={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Internal note/ }));
    fireEvent.change(screen.getByLabelText('Internal note'), {
      target: { value: 'Called, will decide by Friday' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save note/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/enquiries/enq_1/notes');
    expect(JSON.parse(String(init.body))).toEqual({ body: 'Called, will decide by Friday' });
  });
});
