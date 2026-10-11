// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseReportParams, type Reports } from '../src/lib/admin/reports';

/** P12 (R55): the cockpit — KPIs, nine tiles, the drill-in panel, Chart/Table, CSV, the URL. */

const { ReportsCockpit } = await import('../src/components/admin/reports/ReportsCockpit');

const replaceState = vi.fn();
const scrollIntoView = vi.fn();
let wide = true;
beforeEach(() => {
  wide = true;
  vi.spyOn(history, 'replaceState').mockImplementation(replaceState);
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('min-width') ? wide : false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const L = 1_00_000_00; // ₹1 lakh in paise

const DATA: Reports = {
  range: {
    from: '2099-04-01',
    to: '2100-03-31',
    previousFrom: '2098-04-01',
    previousTo: '2099-03-31',
    today: '2099-10-11',
    demo: true,
    demoBookings: 12,
  },
  kpis: {
    bookedPaise: 10 * L,
    collectedPaise: 9 * L,
    refundedPaise: L,
    netPaise: 8 * L,
    balancePaise: 2 * L,
    bookings: 20,
    travellers: 50,
    seatsSold: 50,
    seatsTotal: 100,
    departures: 6,
    previous: { bookedPaise: 8 * L, netPaise: 7 * L, bookings: 25 },
  },
  money: {
    bookedPaise: 10 * L,
    collectedPaise: 9 * L,
    refundedPaise: L,
    netPaise: 8 * L,
    gstPaise: 38_095_24,
    balancePaise: 2 * L,
    balanceBookings: 3,
    months: [
      {
        month: '2099-05',
        bookings: 12,
        bookedPaise: 6 * L,
        collectedPaise: 5 * L,
        refundedPaise: L,
        netPaise: 4 * L,
        gstPaise: 19_047_62,
        balancePaise: 2 * L,
      },
      {
        month: '2099-06',
        bookings: 8,
        bookedPaise: 4 * L,
        collectedPaise: 4 * L,
        refundedPaise: 0,
        netPaise: 4 * L,
        gstPaise: 19_047_62,
        balancePaise: 0,
      },
    ],
    cash: { inPaise: 9 * L, outPaise: L, netPaise: 8 * L, months: [] },
  },
  packages: [
    {
      packageId: 'p1',
      name: 'Kasol Riverside Weekend',
      bookings: 12,
      travellers: 30,
      bookedPaise: 6 * L,
      netPaise: 5 * L,
      departures: 3,
      seatsSold: 30,
      seatsTotal: 48,
    },
    {
      packageId: 'p2',
      name: 'North Goa Beaches',
      bookings: 8,
      travellers: 20,
      bookedPaise: 4 * L,
      netPaise: 3 * L,
      departures: 3,
      seatsSold: 20,
      seatsTotal: 52,
    },
  ],
  occupancy: {
    upcoming: [],
    past: [
      {
        packageId: 'p1',
        name: 'Kasol Riverside Weekend',
        departures: 3,
        seatsSold: 30,
        seatsTotal: 48,
      },
    ],
    emptiest: [
      {
        departureId: 'd9',
        packageId: 'p2',
        packageName: 'North Goa Beaches',
        date: '2099-11-06',
        seatsTotal: 16,
        sold: 2,
        held: 1,
        free: 13,
        guaranteed: false,
        daysToGo: 26,
      },
    ],
  },
  funnel: {
    views: 4000,
    enquiries: 60,
    holds: 40,
    paid: 22,
    packages: [
      {
        packageId: 'p1',
        name: 'Kasol Riverside Weekend',
        views: 2500,
        enquiries: 30,
        holds: 25,
        paid: 15,
      },
    ],
  },
  cancellations: {
    paidBookings: 22,
    cancelled: 2,
    refundedPaise: L,
    keptPaise: 20_000_00,
    reasons: [
      {
        reason: 'cancellation_approved',
        label: 'Cancellation approved',
        bookings: 2,
        refundedPaise: L,
        keptPaise: 20_000_00,
      },
    ],
    lapsed: [
      {
        reason: 'hold_expired',
        label: 'Hold expired',
        bookings: 9,
        refundedPaise: 0,
        keptPaise: 0,
      },
    ],
  },
  discounts: {
    givenPaise: 50_000_00,
    discountedBookings: 6,
    bookings: 20,
    sources: [
      {
        source: 'coupon',
        label: 'WELCOME10',
        givenPaise: 50_000_00,
        bookings: 6,
        bookedPaise: 3 * L,
      },
    ],
  },
  addons: {
    revenuePaise: 30_000_00,
    withAny: 5,
    bookings: 20,
    addons: [{ name: 'Rafting', bookings: 5, eligible: 12, revenuePaise: 30_000_00 }],
  },
  channels: [
    { channel: 'web', bookings: 15, travellers: 38, bookedPaise: 7 * L },
    { channel: 'phone', bookings: 5, travellers: 12, bookedPaise: 3 * L },
    { channel: 'walk_in', bookings: 0, travellers: 0, bookedPaise: 0 },
    { channel: 'whatsapp', bookings: 0, travellers: 0, bookedPaise: 0 },
    { channel: 'enquiry', bookings: 0, travellers: 0, bookedPaise: 0 },
  ],
  customers: {
    bookings: 20,
    travellers: 50,
    party: [
      { label: '1', bookings: 2 },
      { label: '2', bookings: 12 },
      { label: '3', bookings: 2 },
      { label: '4', bookings: 3 },
      { label: '5+', bookings: 1 },
    ],
    lead: [
      { label: 'Under 7 days', bookings: 2 },
      { label: '7–29 days', bookings: 6 },
      { label: '30–89 days', bookings: 9 },
      { label: '90+ days', bookings: 3 },
    ],
    repeat: 4,
    first: 16,
  },
};

const params = parseReportParams({}, '2099-10-11');

describe('ReportsCockpit', () => {
  it('shows the KPIs with the change against the range before', () => {
    render(<ReportsCockpit data={DATA} params={params} />);
    expect(screen.getByRole('heading', { name: 'Reports', level: 1 })).toBeTruthy();
    expect(screen.getAllByText('₹10.0 L')).toHaveLength(2); // the KPI and the Money tile
    expect(screen.getByText(/\+25% vs the 365 days before/)).toBeTruthy();
    expect(screen.getByText(/−20% vs the 365 days before/)).toBeTruthy(); // bookings 20 vs 25
    expect(screen.getByRole('link', { name: /Demo history on · 12/ }).getAttribute('href')).toBe(
      '/admin/reports?demo=0',
    );
  });

  it('opens a section from its tile, rewrites the URL and keeps the panel numbers', async () => {
    render(<ReportsCockpit data={DATA} params={params} />);
    const tiles = within(screen.getByRole('group', { name: 'Report sections' })).getAllByRole(
      'button',
    );
    expect(tiles).toHaveLength(9);
    const panel = () => screen.getByRole('region', { name: /detail/ });
    expect(within(panel()).getByRole('heading', { name: 'Money' })).toBeTruthy();
    expect(
      within(panel())
        .getAllByRole('link', { name: /CSV/ })
        .map((a) => a.getAttribute('href')),
    ).toEqual([
      '/api/admin/reports/money.csv?from=2099-04-01&to=2100-03-31',
      '/api/admin/reports/cash.csv?from=2099-04-01&to=2100-03-31',
    ]);

    await userEvent.click(tiles[4]!); // Cancellations
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/admin/reports?s=cancellations');
    expect(scrollIntoView).not.toHaveBeenCalled(); // wide: the panel is beside the tiles
    expect(within(panel()).getByRole('heading', { name: 'Cancellations' })).toBeTruthy();
    expect(within(panel()).getByText(/2 of 22/)).toBeTruthy();
    expect(within(panel()).getByText(/Never paid \(9\)/)).toBeTruthy();

    // Every link now carries the open section (the server page was rendered for Money).
    expect(screen.getByRole('link', { name: 'Last month' }).getAttribute('href')).toBe(
      '/admin/reports?p=last&s=cancellations',
    );
    expect(screen.getByRole('link', { name: /Demo history/ }).getAttribute('href')).toBe(
      '/admin/reports?demo=0&s=cancellations',
    );

    await userEvent.click(within(panel()).getByRole('button', { name: 'table' }));
    const table = within(panel()).getByRole('table');
    expect(within(table).getByText('Hold expired')).toBeTruthy();
    expect(within(table).getByText('9.1%')).toBeTruthy(); // 2 of 22 in the total row
  });

  it('brings the panel into view on a narrow screen', async () => {
    wide = false;
    render(<ReportsCockpit data={DATA} params={params} />);
    const tiles = within(screen.getByRole('group', { name: 'Report sections' })).getAllByRole(
      'button',
    );
    await userEvent.click(tiles[3]!); // Funnel
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText('Package enquiries')).toBeTruthy();
  });
});
