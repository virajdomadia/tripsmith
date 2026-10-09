// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarBlock, Readiness, TripPack } from '../src/lib/account';
import { dayRange } from '../src/lib/account';

/**
 * P10 (R48) — My trips: the trip pack coupon (locked under "Opens later" with what's inside;
 * open, everything for the road, read the first time it opens) and the calendar coupon with its
 * two signed buttons.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { TripCoupons } = await import('../src/components/site/account/TripCoupons');
const { TripPackPanel } = await import('../src/components/site/account/TripPackPanel');
const { CalendarPanel } = await import('../src/components/site/account/CalendarPanel');

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const LOCKED: TripPack = {
  state: 'locked',
  opensOn: '2099-11-06',
  needsPayment: true,
  readAt: null,
  content: null,
};

const OPEN: TripPack = {
  state: 'open',
  opensOn: '2099-11-06',
  needsPayment: false,
  readAt: null,
  content: {
    meeting: {
      place: 'Cochin International Airport, Arrivals Gate 3 (T1)',
      time: '11:00:00',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cochin',
      note: 'Look for the blue Tripsmith board',
    },
    leader: {
      name: 'Meera Nair',
      slug: 'meera-nair',
      languages: ['Malayalam', 'English'],
      phone: '+91 98450 12345',
      photoUrl: null,
    },
    hotels: [
      {
        name: 'Tea Valley Resort',
        city: 'Munnar',
        stars: 4,
        nights: 2,
        address: 'Pothamedu, Munnar, Kerala 685612',
        phone: '+91 98450 12345',
      },
    ],
    days: [
      {
        dayNo: 1,
        date: '2099-11-13',
        title: 'Arrive Kochi, drive up to the tea country',
        description: 'The climb into the Ghats.',
        stay: 'Munnar',
        meals: 'Dinner',
      },
    ],
    knowBefore: [{ key: 'cash', label: 'Cash', text: 'Carry ₹3,000 in small notes.' }],
    emergencyPhone: '+91 98450 12345',
    emergencyE164: '+919845012345',
  },
};

const CAL: CalendarBlock = {
  googleUrl: '/calendar/TB-7K2M9Q/google?exp=1&sig=a',
  icsUrl: '/calendar/TB-7K2M9Q.ics?exp=1&sig=a',
  addedAt: null,
  via: null,
  stale: false,
  starts: '2099-11-13',
  ends: '2099-11-17',
  location: 'Cochin International Airport',
};

const READY: Readiness = {
  percent: 25,
  parts: [
    {
      key: 'details',
      kind: 'details',
      label: 'Traveller details',
      note: '',
      fraction: 1,
      done: true,
    },
    { key: 'balance', kind: 'balance', label: 'Balance paid', note: '', fraction: 1, done: true },
    {
      key: 'pack',
      kind: 'pack',
      label: 'Trip pack read',
      note: 'Opens Fri 6 Nov',
      fraction: 0,
      done: false,
    },
    {
      key: 'calendar',
      kind: 'calendar',
      label: 'Added to calendar',
      note: 'Google Calendar or an .ics file',
      fraction: 0,
      done: false,
    },
  ],
};

function coupons(pack: TripPack) {
  render(
    <TripCoupons
      bookingRef="TB-7K2M9Q"
      readiness={READY}
      details={<p>the details</p>}
      balance={null}
      pack={pack}
      packPanel={<p>the pack</p>}
      calendar={<p>the calendar</p>}
      locksOn="2099-11-10"
      departs="2099-11-13"
      balanceDueOn={null}
    />,
  );
}

describe('TripCoupons with the pack and the calendar', () => {
  it('files the locked pack under "Opens later" and lets you look inside without reading it', async () => {
    coupons(LOCKED);
    const later = screen.getByText('Opens later').nextElementSibling as HTMLElement;
    expect(within(later).getByText('Trip pack read')).toBeTruthy();
    expect(within(later).getByText('Opens 6 Nov')).toBeTruthy();
    expect(screen.getByText('Any time')).toBeTruthy();
    expect(screen.getByText('2 to tear off')).toBeTruthy();
    // The calendar is the first thing to do now; the locked pack waits.
    expect(screen.getByText('the calendar').closest('[hidden]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Look inside/ }));
    expect(screen.getByText('the pack').closest('[hidden]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks the open pack read the first time it opens', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    coupons(OPEN);
    expect(screen.queryByText('Opens later')).toBeNull();
    expect(screen.getByText('Open now')).toBeTruthy();
    const pack = screen.getByText('Trip pack read').closest('li') as HTMLElement;
    await userEvent.click(within(pack).getByRole('button', { name: /Open/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/bookings/TB-7K2M9Q/pack/read');
    expect(init.method).toBe('PUT');
    // Closing and opening again doesn't ask twice.
    await userEvent.click(within(pack).getByRole('button', { name: /Close/ }));
    await userEvent.click(within(pack).getByRole('button', { name: /Open|View/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('TripPackPanel', () => {
  it('locked: when it opens, what is still to pay and what will be inside', () => {
    render(
      <TripPackPanel
        bookingRef="TB-7K2M9Q"
        pack={LOCKED}
        owedPaise={1_150_000}
        departs="2099-11-13"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Unlocks Fri 6 Nov 2099' })).toBeTruthy();
    expect(screen.getByText('₹11,500')).toBeTruthy();
    const inside = screen.getByRole('list', { name: 'What will be inside' });
    expect(within(inside).getAllByRole('listitem')).toHaveLength(7);
    expect(screen.queryByText('+91 98450 12345')).toBeNull();
  });

  it('open: meeting point, leader phone, hotels, days, notes, the 24×7 line and the PDF', () => {
    render(<TripPackPanel bookingRef="TB-7K2M9Q" pack={OPEN} owedPaise={0} departs="2099-11-13" />);
    expect(screen.getByText('Cochin International Airport, Arrivals Gate 3 (T1)')).toBeTruthy();
    expect(screen.getByText(/Fri 13 Nov 2099 · 11:00/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open in Google Maps/ }).getAttribute('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Cochin',
    );
    expect(screen.getByText('Meera Nair')).toBeTruthy();
    const phones = screen.getAllByRole('link', { name: /\+91 98450 12345/ });
    expect(phones.map((a) => a.getAttribute('href'))).toContain('tel:+919845012345');
    expect(screen.getByText('Pothamedu, Munnar, Kerala 685612')).toBeTruthy();
    expect(screen.getByText('Arrive Kochi, drive up to the tea country')).toBeTruthy();
    expect(screen.getByText('Carry ₹3,000 in small notes.')).toBeTruthy();
    expect(screen.getByText(/24×7 emergency/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /PDF/ }).getAttribute('href')).toBe(
      '/api/account/bookings/TB-7K2M9Q/trip-pack.pdf',
    );
  });

  it('open with no leader yet: says so and points at the 24×7 line', () => {
    const pack = { ...OPEN, content: { ...OPEN.content!, leader: null, meeting: null } };
    render(<TripPackPanel bookingRef="TB-7K2M9Q" pack={pack} owedPaise={0} departs="2099-11-13" />);
    expect(screen.getByText(/Your leader will be confirmed soon/)).toBeTruthy();
    expect(screen.getByText(/We’ll share the meeting point here/)).toBeTruthy();
  });
});

describe('CalendarPanel', () => {
  it('links both signed buttons through the site and refreshes after a click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CalendarPanel calendar={CAL} />);
    expect(screen.getByText(/All-day, 13–17 Nov, at Cochin International Airport/)).toBeTruthy();
    const ics = screen.getByRole('link', { name: /Apple \/ Outlook/ });
    expect(ics.getAttribute('href')).toBe('/api/calendar/TB-7K2M9Q.ics?exp=1&sig=a');
    const google = screen.getByRole('link', { name: /Google Calendar/ });
    expect(google.getAttribute('href')).toBe('/api/calendar/TB-7K2M9Q/google?exp=1&sig=a');
    ics.addEventListener('click', (e) => e.preventDefault()); // jsdom can't navigate
    await userEvent.click(ics);
    vi.advanceTimersByTime(1600);
    expect(refresh).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('after a date change asks for the .ics, which replaces the old event', () => {
    render(<CalendarPanel calendar={{ ...CAL, stale: true, via: 'google' }} />);
    expect(screen.getByRole('heading', { name: /Your trip moved/ })).toBeTruthy();
    expect(screen.getByText(/replaces the old event/)).toBeTruthy();
  });

  it('shows nothing without signed links (local dev)', () => {
    const { container } = render(
      <CalendarPanel calendar={{ ...CAL, googleUrl: null, icsUrl: null }} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('dayRange', () => {
  it('shares the month, or spells both', () => {
    expect(dayRange('2099-11-13', '2099-11-17')).toBe('13–17 Nov');
    expect(dayRange('2099-11-30', '2099-12-04')).toBe('30 Nov – 4 Dec');
  });
});
