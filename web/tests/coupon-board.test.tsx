// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CouponInsight } from '@/components/admin/coupons/CouponInsight';
import { CouponTicket } from '@/components/admin/coupons/CouponTicket';
import {
  boardHref,
  endsSoon,
  lanes,
  meter,
  needsLook,
  parseSel,
  perRupee,
  returnBand,
  sparkPoints,
  when,
  type CouponResults,
} from '@/lib/admin/coupon-board';
import type { AdminCoupon } from '@/lib/admin/coupon-schema';

const refresh = vi.fn();
const adminRequest = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/coupons',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  adminRequest.mockReset();
  refresh.mockClear();
});

/** R59 · P20 — Coupons B, the campaign board. */
const TODAY = '2026-09-27';
const coupon = (over: Partial<AdminCoupon> = {}): AdminCoupon => ({
  id: 'c1',
  code: 'WELCOME10',
  kind: 'percent',
  amountPaise: null,
  percent: 10,
  capPaise: 1_000_00,
  minPaise: null,
  startsOn: '2026-09-15',
  endsOn: '2027-09-14',
  useLimit: 1000,
  allPackages: true,
  packages: [],
  active: true,
  state: 'active',
  uses: 37,
  liveHolds: 2,
  locked: true,
  createdAt: '2026-09-15T10:00:00Z',
  givenPaise: 34_390_00,
  bookedPaise: 11_48_200_00,
  weekly: [0, 0, 0, 0, 0, 0, 15, 22],
  ...over,
});

describe('board helpers', () => {
  it('groups tickets into lanes by what they are doing now, dropping empty lanes', () => {
    const got = lanes([
      coupon({ id: 'a', state: 'expired' }),
      coupon({ id: 'b' }),
      coupon({ id: 'c', state: 'used_up' }),
      coupon({ id: 'd', state: 'paused' }),
    ]);
    expect(got.map((l) => [l.title, l.items.map((c) => c.id)])).toEqual([
      ['Running now', ['b']],
      ['Paused', ['d']],
      ['Ended', ['a', 'c']],
    ]);
  });

  it('keeps the open ticket in ?sel=', () => {
    expect(boardHref()).toBe('/admin/coupons');
    expect(boardHref('c 1')).toBe('/admin/coupons?sel=c%201');
    expect(parseSel({ sel: ['c1', 'c2'] })).toBe('c1');
    expect(parseSel({ sel: '  ' })).toBeUndefined();
  });

  it('says when each code opens, ends or ended, and flags one ending soon', () => {
    expect(when(coupon(), TODAY)).toBe('Ends 14 Sep 2027 · 352 days left');
    expect(when(coupon({ endsOn: null }), TODAY)).toBe('No end date');
    expect(when(coupon({ state: 'scheduled', startsOn: '2026-10-15' }), TODAY)).toBe(
      'Opens in 18 days · 15 Oct 2026',
    );
    expect(when(coupon({ state: 'expired', endsOn: '2026-08-31' }), TODAY)).toBe(
      'Ended 31 Aug 2026',
    );
    expect(when(coupon({ state: 'used_up', useLimit: 25 }), TODAY)).toBe('All 25 uses taken');
    expect(endsSoon(coupon({ endsOn: '2026-10-05' }), TODAY)).toBe(true);
    expect(endsSoon(coupon({ endsOn: '2026-10-05', state: 'paused' }), TODAY)).toBe(false);
    expect(endsSoon(coupon(), TODAY)).toBe(false);
  });

  it('works out bookings per ₹1, the meter with holds after the uses, and the sparkline', () => {
    expect(perRupee(coupon())).toBe('₹33'); // ₹11,48,200 ÷ ₹34,390
    expect(perRupee(coupon({ givenPaise: 0 }))).toBe('—');
    expect(meter(coupon({ uses: 24, liveHolds: 2, useLimit: 25 }))).toEqual({ used: 96, held: 4 });
    expect(meter(coupon({ uses: 25, liveHolds: 3, useLimit: 25 }))).toEqual({ used: 100, held: 0 });
    expect(meter(coupon({ useLimit: null }))).toBeNull();
    expect(sparkPoints([0, 2], 10, 10)).toBe('0.0,8.0 10.0,4.0');
    expect(sparkPoints([0, 0, 0], 10, 10)).toBe('0.0,8.0 5.0,8.0 10.0,8.0');
  });

  it('sums the return band and names what needs a look', () => {
    const items = [
      coupon(),
      coupon({
        id: 'b',
        code: 'HONEY5',
        state: 'used_up',
        useLimit: 25,
        uses: 25,
        liveHolds: 0,
        givenPaise: 61_300_00,
        bookedPaise: 17_18_900_00,
      }),
      coupon({
        id: 'c',
        code: 'LADAKH',
        state: 'paused',
        active: false,
        useLimit: 100,
        uses: 4,
        liveHolds: 0,
        givenPaise: 0,
        bookedPaise: 0,
      }),
    ];
    const band = returnBand(items);
    expect(band).toEqual({ given: 95_690_00, booked: 28_67_100_00, uses: 66, share: 3.2 });
    expect(returnBand([]).share).toBe(0);
    expect(needsLook(items).map((l) => `${l.label} ${l.code}: ${l.text}`)).toEqual([
      'In checkout WELCOME10: 2 checkouts holding a use right now',
      'Used up HONEY5: took all 25 uses · raise the limit to keep it going',
      'Paused LADAKH: 4 used, 96 left when you switch it on',
    ]);
  });
});

describe('CouponTicket', () => {
  it('shows what the code earned and opens "what it did" from the whole ticket', () => {
    render(<CouponTicket c={coupon()} today={TODAY} open={false} />);
    const t = screen.getByRole('article', { name: 'WELCOME10, Active' });
    expect(within(t).getByRole('link', { name: 'WELCOME10' }).getAttribute('href')).toBe(
      '/admin/coupons?sel=c1#did',
    );
    expect(t.textContent).toContain('10 % off, up to ₹1,000');
    expect(t.textContent).toContain('Every package');
    expect(within(t).getByText('₹34,390')).toBeTruthy();
    expect(within(t).getByText('₹33')).toBeTruthy();
    expect(t.textContent).toContain('37 of 1,000 used · 2 in checkout');
    expect(t.querySelector('[data-meter]')?.getAttribute('data-meter')).toBe('4/0');
    expect(within(t).getByRole('switch', { name: 'WELCOME10 on' })).toBeTruthy();
    expect(within(t).queryByText('Ends soon')).toBeNull();
  });

  it('closes when open, and the switch still pauses the code', async () => {
    adminRequest.mockResolvedValue({});
    render(<CouponTicket c={coupon({ endsOn: '2026-10-01' })} today={TODAY} open />);
    expect(screen.getByRole('link', { name: 'WELCOME10' }).getAttribute('href')).toBe(
      '/admin/coupons',
    );
    expect(screen.getByText('Ends soon')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('switch', { name: 'WELCOME10 on' }));
    expect(adminRequest).toHaveBeenCalledWith('/admin/coupons/c1/active', {
      method: 'POST',
      body: { active: false },
    });
  });
});

describe('CouponInsight', () => {
  const results: CouponResults = {
    trips: [
      { packageId: 'p1', name: 'Kasol Riverside Weekend', coverUrl: null, uses: 12 },
      { packageId: 'p2', name: 'North Goa Beaches', coverUrl: null, uses: 9 },
    ],
    otherTripUses: 4,
    latest: [
      {
        at: '2026-09-27T12:22:00Z',
        ref: 'TB-1',
        name: 'Rahul Verma',
        email: 'rahul@customer.in',
        packageName: 'North Goa Beaches',
        travellers: 2,
        offPaise: 1_000_00,
        holding: true,
      },
      {
        at: '2026-09-26T04:35:00Z',
        ref: 'TB-2',
        name: 'Neha Pillai',
        email: 'neha@customer.in',
        packageName: 'Kasol Riverside Weekend',
        travellers: 1,
        offPaise: 1_000_00,
        holding: false,
      },
    ],
  };

  it('lists the trips it sold and its latest uses, holds marked, with Edit terms and Close', () => {
    render(<CouponInsight c={coupon()} results={results} today={TODAY} />);
    const s = screen.getByRole('region', { name: 'What WELCOME10 did' });
    expect(within(s).getByRole('link', { name: 'Edit terms' }).getAttribute('href')).toBe(
      '/admin/coupons/c1',
    );
    expect(within(s).getByRole('link', { name: 'Close' }).getAttribute('href')).toBe(
      '/admin/coupons',
    );
    expect(s.textContent).toContain('+4 on other trips');
    const uses = within(s).getAllByRole('listitem').slice(-2);
    expect(uses[0].textContent).toContain('Today');
    expect(uses[0].textContent).toContain('In checkout');
    expect(uses[0].textContent).toContain('holding one use until paid');
    expect(uses[1].textContent).toContain('26 Sep');
    expect(uses[1].textContent).toContain('1 traveller · −₹1,000');
    expect(s.textContent).toContain('Website vs counter: with counter booking, a later row.');
  });

  it('says when a code has not been used yet', () => {
    render(
      <CouponInsight
        c={coupon({ state: 'scheduled', startsOn: '2026-10-15', uses: 0 })}
        results={{ trips: [], otherTripUses: 0, latest: [] }}
        today={TODAY}
      />,
    );
    expect(screen.getByText(/It opens on 15 Oct 2026 for Every package/)).toBeTruthy();
  });
});
