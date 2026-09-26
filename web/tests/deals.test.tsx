// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dealNotice, istToday } from '../src/components/admin/packages/DealPanel';
import { PackageCard } from '../src/components/site/PackageCard';
import { DeparturesTable } from '../src/components/site/package/DeparturesTable';
import { OccupancyPricing } from '../src/components/site/package/OccupancyPricing';
import { packageSchema, toInput } from '../src/lib/admin/package-schema';
import type { components } from '../src/lib/api-types';
import { afterDeal, dealEnds, dealLabel, shownPrice, type Deal } from '../src/lib/deal';
import { packageJsonLd } from '../src/lib/seo/package-jsonld';

afterEach(cleanup);

type Card = components['schemas']['PackageCard'];
type Departure = components['schemas']['DepartureOut'];
type PackageDetail = components['schemas']['PackageDetail'];

const deal: Deal = {
  label: 'Monsoon offer',
  endsOn: '2026-10-02',
  endsAt: '2026-10-02T18:30:00Z',
  offPaise: 3_000_00,
  pricePaise: 11_499_00,
};

const card = (over: Partial<Card> = {}): Card => ({
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  destination: 'Goa',
  nights: 3,
  days: 4,
  startingPricePaise: 14_499_00,
  deal: null,
  themes: ['beach'],
  coverUrl: 'https://blob.test/cover.jpg',
  highlights: ['Sunset from Chapora Fort'],
  badge: 'filling-fast',
  rating: null,
  ...over,
});

const departure = (over: Partial<Departure> = {}): Departure => ({
  id: 'd1',
  date: '2026-11-20',
  seatsTotal: 16,
  seatsLeft: 3,
  guaranteed: false,
  priceDoublePaise: 14_499_00,
  priceTriplePaise: 13_499_00,
  priceChildPaise: 2_000_00,
  singleSupplementPaise: 6_000_00,
  badge: 'filling-fast',
  ...over,
});

describe('deal helpers', () => {
  it('takes the flat amount off, never more than the price, and leaves on-request alone', () => {
    expect(afterDeal(14_499_00, deal)).toBe(11_499_00);
    expect(afterDeal(2_000_00, deal)).toBe(0);
    expect(afterDeal(0, deal)).toBe(0);
    expect(afterDeal(14_499_00, null)).toBe(14_499_00);
  });

  it('labels, end date and the shown price', () => {
    expect(dealLabel(deal)).toBe('Monsoon offer');
    expect(dealLabel({ ...deal, label: null })).toBe('Deal');
    expect(dealEnds(deal)).toBe('Ends 2 Oct');
    expect(shownPrice({ startingPricePaise: 14_499_00, deal })).toBe(11_499_00);
    expect(shownPrice({ startingPricePaise: 14_499_00, deal: null })).toBe(14_499_00);
  });

  it('IST today rolls over at 18:30 UTC', () => {
    expect(istToday(new Date('2026-10-02T18:29:00Z'))).toBe('2026-10-02');
    expect(istToday(new Date('2026-10-02T18:30:00Z'))).toBe('2026-10-03');
  });
});

describe('PackageCard with a deal', () => {
  it('strikes the starting price, shows the deal price, the label stamp and the end date', () => {
    render(<PackageCard card={card({ deal })} />);
    expect(screen.getByText('Monsoon offer')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /filling fast/i })).toBeNull();
    expect(document.querySelector('s')?.textContent).toContain('₹14,499');
    expect(screen.getByText('₹11,499', { exact: false })).toBeTruthy();
    expect(screen.getByText('Ends 2 Oct')).toBeTruthy();
  });

  it('keeps the seat stamp and plain price without one', () => {
    render(<PackageCard card={card()} />);
    expect(screen.getByRole('img', { name: /filling fast/i })).toBeTruthy();
    expect(document.querySelector('s')).toBeNull();
  });
});

describe('package page tables with a deal', () => {
  it('every departure row shows its own price struck and the price after the deal', () => {
    render(
      <DeparturesTable
        departures={[departure(), departure({ id: 'd2', priceDoublePaise: 17_499_00 })]}
        deal={deal}
      />,
    );
    const struck = [...document.querySelectorAll('s')].map((s) => s.textContent);
    expect(struck).toEqual(['was ₹14,499', 'was ₹17,499']);
    expect(screen.getByText('₹11,499')).toBeTruthy();
    expect(screen.getByText('₹14,499', { selector: 'b' })).toBeTruthy();
  });

  it('occupancy prices come off, capped per traveller; the supplement does not', () => {
    render(<OccupancyPricing departures={[departure()]} deal={deal} />);
    expect(screen.getByText('₹11,499')).toBeTruthy();
    expect(screen.getByText('₹10,499')).toBeTruthy();
    expect(screen.getByText('₹0')).toBeTruthy();
    expect(screen.getByText('+ ₹6,000')).toBeTruthy();
  });
});

describe('JSON-LD Offer.price', () => {
  it('reflects the running deal on every offer and lapses with it', () => {
    const pkg = {
      name: 'X',
      summary: 'y',
      images: [],
      themes: [],
      itinerary: [],
      deal,
      departures: [departure(), departure({ id: 'd2', priceDoublePaise: 0 })],
    } as unknown as PackageDetail;
    const ld = packageJsonLd(pkg, 'https://t/p') as { offers: Record<string, string>[] };
    expect(ld.offers).toHaveLength(1);
    expect(ld.offers[0]).toMatchObject({ price: '11499', priceValidUntil: '2026-10-02' });
    const plain = packageJsonLd({ ...pkg, deal: null }, 'https://t/p') as typeof ld;
    expect(plain.offers[0].price).toBe('14499');
    expect(plain.offers[0]).not.toHaveProperty('priceValidUntil');
  });
});

describe('the form schema', () => {
  const base = {
    slug: 'konkan-coast',
    destinationId: 'd-goa',
    name: 'Konkan Coast',
    summary: 'Three slow nights on the Konkan coast with one free beach day and a fort sunset.',
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
  };
  const issues = (over: object) => {
    const r = packageSchema.safeParse({ ...base, ...over });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('sends blank fields as no deal', () => {
    const r = packageSchema.parse({ ...base, dealPricePaise: '', dealLabel: ' ', dealEndsOn: '' });
    expect(toInput(r)).toMatchObject({ dealPricePaise: null, dealLabel: null, dealEndsOn: null });
  });

  it('pairs price and end date, and refuses a label on its own or over 24 characters', () => {
    expect(issues({ dealPricePaise: 10_000_00, dealEndsOn: '' })).toEqual(['dealEndsOn']);
    expect(issues({ dealPricePaise: '', dealEndsOn: '2026-10-02' })).toEqual(['dealPricePaise']);
    expect(issues({ dealPricePaise: '', dealEndsOn: '', dealLabel: 'Sale' })).toEqual([
      'dealLabel',
    ]);
    expect(
      issues({ dealPricePaise: 10_000_00, dealEndsOn: '2026-10-02', dealLabel: 'x'.repeat(25) }),
    ).toEqual(['dealLabel']);
    const ok = packageSchema.parse({
      ...base,
      dealPricePaise: 10_000_00,
      dealEndsOn: '2026-10-02',
      dealLabel: ' Diwali ',
    });
    expect(toInput(ok)).toMatchObject({
      dealPricePaise: 10_000_00,
      dealEndsOn: '2026-10-02',
      dealLabel: 'Diwali',
    });
  });
});

describe('the owner notice', () => {
  const row = {
    dealPricePaise: 12_000_00,
    dealEndsOn: '2026-10-02',
    dealBasePaise: 14_499_00,
  };
  it('says running, ended or inactive with the starting price', () => {
    expect(dealNotice({ ...row, dealState: 'active' })?.text).toBe(
      'Running: ₹2,499 off per traveller until Fri 2 Oct 2026',
    );
    expect(dealNotice({ ...row, dealState: 'ended' })?.text).toBe('Deal ended on Fri 2 Oct 2026');
    expect(dealNotice({ ...row, dealState: 'inactive', dealBasePaise: 11_000_00 })?.text).toBe(
      'Deal inactive: ₹12,000 is not below the starting price ₹11,000',
    );
    expect(dealNotice({ ...row, dealPricePaise: null, dealEndsOn: null, dealState: 'none' })).toBe(
      null,
    );
  });
});
