// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DestinationCards } from '@/components/admin/destinations/DestinationCards';
import { PasswordInput } from '@/components/admin/login/PasswordInput';
import { PackageCatalogue } from '@/components/admin/packages/PackageCatalogue';
import { PackagePreview, previewPrice } from '@/components/admin/packages/PackagePreview';
import { type AdminPackageRow, health, matches, needsLook, sortRows } from '@/lib/admin/catalogue';
import { emptyPackage, type PackageFieldValues } from '@/lib/admin/package-schema';
import type { components } from '@/lib/api-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/packages',
}));

afterEach(cleanup);

/** R59 · P20c — Packages B, Package editor B's preview, Destinations A and Sign in B. */
const ok = (key: 'images' | 'itinerary' | 'departures' | 'prices', pass = true, detail = '') => ({
  key,
  label: key,
  ok: pass,
  detail: detail || `${key} fine`,
});
const RULES = [ok('images'), ok('itinerary'), ok('departures'), ok('prices')];

const row = (over: Partial<AdminPackageRow> = {}): AdminPackageRow => ({
  id: 'p1',
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  coverUrl: null,
  destination: { slug: 'goa', name: 'Goa' },
  nights: 3,
  days: 4,
  startingPricePaise: 1_499_900,
  dealPricePaise: null,
  dealEndsOn: null,
  dealState: 'none',
  dealBasePaise: 1_499_900,
  departureCount: 4,
  recentEnquiryCount: 11,
  status: 'live',
  featured: true,
  updatedAt: '2026-09-20T10:00:00Z',
  imageCount: 7,
  publishRules: RULES,
  nextDeparture: { date: '2026-11-20', seats: 16, taken: 9 },
  ...over,
});

describe('package health', () => {
  it('names the one thing to do, in order', () => {
    expect(health(row())).toMatchObject({ tone: 'ok', word: 'Healthy' });
    const draft = row({
      status: 'draft',
      publishRules: [
        ok('images'),
        ok('itinerary', false, '4 of 6 days written'),
        ok('departures'),
        ok('prices'),
      ],
    });
    expect(health(draft)).toMatchObject({
      tone: 'bad',
      word: 'Can’t publish',
      why: 'Still to do: 4 of 6 days written.',
      action: 'Finish it',
    });
    expect(health(row({ status: 'draft' })).word).toBe('Ready to publish');
    expect(
      health(row({ dealState: 'inactive', dealPricePaise: 1_999_900, dealEndsOn: '2026-10-31' })),
    ).toMatchObject({ tone: 'warn', word: 'Needs a fix', action: 'Fix the deal' });
    expect(
      health(row({ nextDeparture: { date: '2026-12-18', seats: 4, taken: 3 } })),
    ).toMatchObject({
      word: 'Almost full',
      why: '18 Dec: 1 seat left of 4. Add seats or open another date.',
    });
    expect(
      health(row({ featured: false, nextDeparture: { date: '2026-12-18', seats: 12, taken: 0 } })),
    ).toMatchObject({ word: 'No bookings yet', action: 'Feature it' });
    expect(needsLook(row())).toBe(false);
  });

  it('filters by pill, destination and search, and sorts', () => {
    const a = row();
    const b = row({
      id: 'p2',
      name: 'Munnar Tea Trails',
      destination: { slug: 'kerala', name: 'Kerala' },
      featured: false,
      recentEnquiryCount: 20,
      nextDeparture: { date: '2026-10-02', seats: 10, taken: 1 },
    });
    const c = row({ id: 'p3', name: 'Andaman draft', status: 'draft', nextDeparture: null });
    expect(matches(b, { pill: 'featured', q: '', dest: '' })).toBe(false);
    expect(matches(b, { pill: 'all', q: 'kera', dest: '' })).toBe(true);
    expect(matches(a, { pill: 'all', q: '', dest: 'kerala' })).toBe(false);
    expect(sortRows([a, b, c], 'next').map((r) => r.id)).toEqual(['p2', 'p1', 'p3']);
    expect(sortRows([a, b, c], 'enquiries')[0]!.id).toBe('p2');
    expect(sortRows([a, b, c], 'emptiest').map((r) => r.id)).toEqual(['p2', 'p1', 'p3']);
  });
});

describe('PackageCatalogue', () => {
  it('shows each card with its checks, next date and actions, and a Needs a look row', async () => {
    const items = [
      row(),
      row({
        id: 'p2',
        slug: 'munnar',
        name: 'Munnar draft',
        status: 'draft',
        featured: false,
        publishRules: [
          ok('images', false, 'No photos yet'),
          ok('itinerary'),
          ok('departures'),
          ok('prices'),
        ],
      }),
    ];
    render(<PackageCatalogue items={items} />);
    const card = screen.getByRole('article', { name: 'North Goa Beaches' });
    expect(within(card).getByLabelText('4 of 4 publish checks done')).toBeTruthy();
    expect(card.textContent).toContain('9 of 16 taken');
    expect(card.textContent).toContain('₹14,999');
    expect(within(card).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/admin/packages/p1',
    );
    expect(within(card).getByRole('link', { name: 'View' }).getAttribute('href')).toBe(
      '/packages/north-goa-beaches',
    );
    const look = screen.getByRole('region', { name: /Needs a look/ });
    expect(
      within(look)
        .getByRole('link', { name: /Finish it/ })
        .getAttribute('href'),
    ).toBe('/admin/packages/p2');

    await userEvent.setup().click(screen.getByRole('button', { name: /^Draft/ }));
    expect(screen.queryByRole('article', { name: 'North Goa Beaches' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search packages'), { target: { value: 'nothing' } });
    expect(screen.getByText(/No packages match/)).toBeTruthy();
  });
});

describe('Package editor B preview', () => {
  it('prices from the cheapest date from today and hides a deal that is not below it', () => {
    const deps = [
      { date: '2026-08-01', priceDoublePaise: 100_00 }, // past: never "from"
      { date: '2026-11-13', priceDoublePaise: 22_999_00 },
      { date: '2027-01-15', priceDoublePaise: '21999' + '00' },
    ];
    expect(previewPrice(deps, 19_999_00, '2026-10-31', '2026-09-27')).toMatchObject({
      from: 21_999_00,
      deal: 19_999_00,
      hiddenDeal: null,
    });
    expect(previewPrice(deps, 23_000_00, '2026-10-31', '2026-09-27')).toMatchObject({
      deal: null,
      hiddenDeal: 23_000_00,
    });
    expect(previewPrice(deps, 19_999_00, '2026-09-01', '2026-09-27').deal).toBeNull(); // ended
  });

  function Harness({ values, onPick }: { values: PackageFieldValues; onPick: () => void }) {
    const form = useForm<PackageFieldValues>({ defaultValues: values });
    return (
      <FormProvider {...form}>
        <input aria-label="Name" {...form.register('name')} />
        <PackagePreview destination="Kerala" coverUrl={null} photos={[]} onPick={onPick} />
      </FormProvider>
    );
  }

  it('updates as the owner types and opens a section from the page', () => {
    const onPick = vi.fn();
    const values: PackageFieldValues = {
      ...emptyPackage('d1'),
      name: 'Munnar Houseboat',
      highlights: ['A night on the backwaters'],
      itinerary: [
        {
          title: 'Arrive in Kochi',
          description: 'x',
          meals: { breakfast: false, lunch: false, dinner: true },
          stay: 'Tea Valley',
        },
      ],
    };
    render(<Harness values={values} onPick={onPick} />);
    const preview = screen.getByRole('region', { name: 'Live preview of the customer page' });
    expect(within(preview).getByRole('heading', { name: 'Munnar Houseboat' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Munnar & Alleppey' } });
    expect(within(preview).getByRole('heading', { name: 'Munnar & Alleppey' })).toBeTruthy();
    expect(preview.textContent).toContain('Tea Valley · Dinner');
    fireEvent.click(within(preview).getByRole('button', { name: 'Edit Day by day' }));
    expect(onPick).toHaveBeenCalledWith('itinerary');
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(within(preview).queryByRole('heading')).toBeNull();
  });
});

describe('DestinationCards', () => {
  type Dest = components['schemas']['AdminDestination'];
  const dest = (over: Partial<Dest> = {}): Dest => ({
    id: 'd1',
    slug: 'kerala',
    name: 'Kerala',
    tagline: 'Backwaters, tea hills and a slow coast',
    intro: 'x',
    coverUrl: 'https://blob.test/k.jpg',
    region: 'South India',
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    position: 2,
    packageCount: 3,
    livePackageCount: 2,
    nextDepartureOn: '2026-11-13',
    slugLocked: true,
    updatedAt: '2026-09-20T10:00:00Z',
    ...over,
  });

  it('links each card to the editor beside it and says what it holds', () => {
    render(
      <DestinationCards
        items={[
          dest(),
          dest({
            id: 'd2',
            name: 'Ladakh',
            packageCount: 0,
            livePackageCount: 0,
            nextDepartureOn: null,
          }),
        ]}
        selected="d1"
      />,
    );
    const [kerala, ladakh] = screen.getAllByRole('link');
    expect(kerala!.getAttribute('href')).toBe('/admin/destinations?sel=d1#edit');
    expect(kerala!.getAttribute('aria-current')).toBe('true');
    expect(kerala!.textContent).toContain('2 live · 1 draft');
    expect(kerala!.textContent).toContain('Next departure 13 Nov');
    expect(within(kerala!).getByRole('img', { name: /Best months: Sep/ })).toBeTruthy();
    expect(ladakh!.textContent).toContain('No packages');
    expect(ladakh!.textContent).toContain('No dates on sale');
  });
});

describe('Sign in B password', () => {
  it('shows and hides the password, and warns about Caps Lock', () => {
    render(<PasswordInput defaultValue="secret" />);
    const input = document.getElementById('password') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.type).toBe('text');
    fireEvent.keyUp(input, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock is on.')).toBeTruthy();
  });
});
