// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PriceLadder } from '../src/components/site/booking/PriceLadder';
import type { BookingFlow } from '../src/components/site/booking/use-booking';
import { PackageCard } from '../src/components/site/PackageCard';
import { DeparturesTable } from '../src/components/site/package/DeparturesTable';
import { packageSchema, toInput } from '../src/lib/admin/package-schema';
import type { components } from '../src/lib/api-types';
import { lineLabel, type Quote } from '../src/lib/booking';
import { afterDiscounts, type EarlyBird, tierFor, tierLabel } from '../src/lib/early-bird';

afterEach(cleanup);

type Card = components['schemas']['PackageCard'];
type Departure = components['schemas']['DepartureOut'];

/** R47 (P17): 90 days out −₹1,500, 45 days out −₹750. */
const EB: EarlyBird = {
  tiers: [
    { days: 90, offPaise: 1_500_00 },
    { days: 45, offPaise: 750_00 },
  ],
};
const DATE = '2027-02-12'; // tier 1 book by 14 Nov, tier 2 book by 29 Dec

describe('tierFor — the IST booking day against departure − N', () => {
  it.each([
    ['2026-11-14', 1, '2026-11-14'], // the book-by day itself
    ['2026-11-15', 2, '2026-12-29'],
    ['2026-12-29', 2, '2026-12-29'],
    ['2026-12-30', null, null],
  ])('booked on %s → tier %s', (today, tier, bookBy) => {
    const t = tierFor(EB, DATE, today);
    expect(t?.tier ?? null).toBe(tier);
    expect(t?.bookBy ?? null).toBe(bookBy);
  });

  it('is null when the package has no early-bird', () => {
    expect(tierFor(null, DATE, '2026-09-28')).toBeNull();
  });

  it('labels a date as the mockup does', () => {
    expect(tierLabel(tierFor(EB, DATE, '2026-09-28')!)).toBe('Early bird −₹1,500 · book by 14 Nov');
  });
});

describe('afterDiscounts — deal first, then early-bird, never below ₹1', () => {
  const deal = {
    label: null,
    endsOn: '2099-01-01',
    endsAt: '2099-01-01T18:30:00Z',
    offPaise: 3_000_00,
    pricePaise: 0,
  };
  const t1 = tierFor(EB, DATE, '2026-09-28');
  it('takes both off', () => {
    expect(afterDiscounts(22_999_00, deal, t1)).toBe(22_999_00 - 3_000_00 - 1_500_00);
  });
  it('keeps ₹1 when the tier is bigger than what the deal left', () => {
    expect(afterDiscounts(3_500_00, deal, t1)).toBe(100);
  });
  it('leaves an unpriced date at 0', () => {
    expect(afterDiscounts(0, deal, t1)).toBe(0);
  });
});

it('names the early-bird quote line', () => {
  expect(
    lineLabel({
      kind: 'early_bird',
      occupancy: 'child',
      count: 1,
      unitPaise: -750_00,
      amountPaise: -750_00,
    }),
  ).toBe('Early bird · child 5–11');
});

describe('the price ladder', () => {
  const quote = (ladder: Quote['ladder']): Quote =>
    ({
      departureId: 'd1',
      packageSlug: 'munnar',
      date: DATE,
      seatsLeft: 10,
      lines: [],
      deal: null,
      earlyBird: null,
      coupon: null,
      addons: [],
      ladder,
      subtotalPaise: 0,
      discountPaise: 0,
      addonsPaise: 0,
      totalPaise: 0,
    }) as Quote;
  const flow = (q: Quote) =>
    ({
      quote: { status: 'ok', quote: q },
      departure: { id: 'd1', date: DATE },
      reason: null,
      party: 2,
    }) as unknown as BookingFlow;
  const tier = (n: number, off: number, bookBy: string) => ({
    tier: n,
    days: n === 1 ? 90 : 45,
    perTravellerPaise: off,
    bookBy,
  });

  it('shows today, then each step up with the tier (and a deal) that ended', () => {
    render(
      <PriceLadder
        flow={flow(
          quote([
            {
              fromOn: null,
              earlyBird: tier(1, 1_500_00, '2026-11-14'),
              deal: true,
              farePaise: 42_998_00,
            },
            {
              fromOn: '2026-11-15',
              earlyBird: tier(2, 750_00, '2026-12-29'),
              deal: true,
              farePaise: 44_498_00,
            },
            { fromOn: '2026-12-30', earlyBird: null, deal: false, farePaise: 45_998_00 },
          ]),
        )}
      />,
    );
    const list = within(screen.getByRole('list', { name: /Price ladder/ }));
    const rungs = list.getAllByRole('listitem').map((li) => li.textContent);
    expect(rungs[0]).toContain('Book today');
    expect(rungs[0]).toContain('Early bird −₹1,500 each');
    expect(rungs[1]).toContain('From 15 Nov');
    expect(rungs[1]).toContain('+₹1,500 · tier 1 ends 14 Nov');
    expect(rungs[2]).toContain('+₹3,000 · tier 2 ends 29 Dec · deal ends');
    expect(screen.getByText(/Trip fare for 2 travellers, add-ons extra/)).toBeTruthy();
  });

  it('says so when every tier has ended, and is absent without early-bird', () => {
    const { container, rerender } = render(
      <PriceLadder
        flow={flow(quote([{ fromOn: null, earlyBird: null, deal: false, farePaise: 45_998_00 }]))}
      />,
    );
    expect(screen.getByText(/No early bird left on 12 Feb/)).toBeTruthy();
    rerender(<PriceLadder flow={flow(quote([]))} />);
    expect(container.textContent).toBe('');
  });
});

describe('the card tag and the dates table', () => {
  const card: Card = {
    slug: 'munnar',
    name: 'Munnar',
    destination: 'Kerala',
    nights: 4,
    days: 5,
    startingPricePaise: 22_999_00,
    themes: ['hills'],
    coverUrl: null,
    highlights: ['Tea'],
    badge: null,
    deal: null,
    earlyBird: true,
    rating: null,
  };

  it('tags a card with early-bird savings', () => {
    render(<PackageCard card={card} />);
    expect(screen.getByText('Early-bird savings')).toBeTruthy();
  });

  it('labels a date that still earns a tier and prices it after the tier', () => {
    const dep: Departure = {
      id: 'd1',
      date: '2099-06-12',
      seatsTotal: 16,
      seatsLeft: 16,
      guaranteed: false,
      priceDoublePaise: 22_999_00,
      priceTriplePaise: 20_999_00,
      priceChildPaise: 12_999_00,
      singleSupplementPaise: 7_999_00,
      badge: null,
    };
    render(<DeparturesTable departures={[dep]} earlyBird={EB} />);
    expect(screen.getByText(/^Early bird −₹1,500 · book by/)).toBeTruthy();
    expect(screen.getByText('₹21,499')).toBeTruthy();
  });
});

describe('the form sends the tiers the api expects', () => {
  const base = {
    slug: 'munnar',
    destinationId: 'd',
    name: 'Munnar',
    summary: 's'.repeat(40),
    themes: [],
    nights: 3,
    departureCity: 'Ex-Mumbai',
    highlights: [],
    inclusions: [],
    exclusions: [],
    hotels: [],
    faq: [],
    featured: false,
    itinerary: [],
    departures: [],
    addons: [],
    dealPricePaise: '',
    dealLabel: '',
    dealEndsOn: '',
  };

  it('packs filled tiers, furthest first', () => {
    const v = packageSchema.parse({
      ...base,
      ebOn: true,
      eb1Days: '90',
      eb1OffPaise: 1_500_00,
      eb2Days: '',
      eb2OffPaise: '',
    });
    expect(toInput(v).earlyBird).toEqual({ on: true, tiers: [{ days: 90, offPaise: 1_500_00 }] });
  });

  it.each([
    [{ ebOn: true }, 'eb1Days', 'Add a tier, or switch early-bird off'],
    [
      { eb1Days: 45, eb1OffPaise: 750_00, eb2Days: 90, eb2OffPaise: 500_00 },
      'eb2Days',
      'fewer days',
    ],
    [{ eb1Days: 90, eb1OffPaise: 750_00, eb2Days: 45, eb2OffPaise: 750_00 }, 'eb2OffPaise', 'less'],
    [{ eb1Days: 90 }, 'eb1OffPaise', 'Add the amount off'],
    [{ eb1Days: 2, eb1OffPaise: 100_00 }, 'eb1Days', 'Days before departure, 3–365'],
  ])('refuses %o on %s', (over, path, message) => {
    const r = packageSchema.safeParse({
      ...base,
      ebOn: false,
      eb1Days: '',
      eb1OffPaise: '',
      eb2Days: '',
      eb2OffPaise: '',
      ...over,
    });
    expect(r.success).toBe(false);
    const issue = r.error!.issues.find((i) => i.path.join('.') === path);
    expect(issue?.message).toContain(message);
  });
});
