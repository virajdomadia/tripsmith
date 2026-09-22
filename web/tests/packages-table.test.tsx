// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackagesTable } from '../src/components/admin/packages/PackagesTable';
import type { components } from '../src/lib/api-types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/packages',
}));

afterEach(cleanup);

type Row = components['schemas']['AdminPackageRow'];

const row = (over: Partial<Row>): Row => ({
  id: 'p1',
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  coverUrl: 'https://blob.test/a.jpg',
  destination: { slug: 'goa', name: 'Goa' },
  nights: 3,
  days: 4,
  startingPricePaise: 1_499_900,
  departureCount: 4,
  recentEnquiryCount: 18,
  status: 'live',
  featured: true,
  updatedAt: '2026-09-20T10:00:00Z',
  ...over,
});

const items = [
  row({}),
  row({
    id: 'p2',
    slug: 'munnar-tea-trails',
    name: 'Munnar Tea Trails',
    status: 'draft',
    startingPricePaise: 0,
    departureCount: 0,
    recentEnquiryCount: 0,
    featured: false,
    destination: { slug: 'kerala', name: 'Kerala' },
  }),
];

describe('PackagesTable', () => {
  it('shows every package with its price and status', () => {
    render(<PackagesTable items={items} />);
    expect(screen.getByText('North Goa Beaches')).toBeDefined();
    expect(screen.getByText('₹14,999')).toBeDefined();
    expect(screen.getByText('Munnar Tea Trails')).toBeDefined();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('filters by the Live and Draft tabs', async () => {
    const user = userEvent.setup();
    render(<PackagesTable items={items} />);
    await user.click(screen.getByRole('tab', { name: /draft/i }));
    expect(screen.queryByText('North Goa Beaches')).toBeNull();
    expect(screen.getByText('Munnar Tea Trails')).toBeDefined();
    await user.click(screen.getByRole('tab', { name: /live/i }));
    expect(screen.getByText('North Goa Beaches')).toBeDefined();
    expect(screen.queryByText('Munnar Tea Trails')).toBeNull();
  });

  it('searches by name and by destination', async () => {
    const user = userEvent.setup();
    render(<PackagesTable items={items} />);
    const search = screen.getByRole('searchbox', { name: /search packages/i });
    await user.type(search, 'munnar');
    expect(screen.queryByText('North Goa Beaches')).toBeNull();
    await user.clear(search);
    await user.type(search, 'goa');
    expect(screen.getByText('North Goa Beaches')).toBeDefined();
    expect(screen.queryByText('Munnar Tea Trails')).toBeNull();
  });

  it('explains an empty result rather than showing a bare table', async () => {
    const user = userEvent.setup();
    render(<PackagesTable items={items} />);
    await user.type(screen.getByRole('searchbox', { name: /search packages/i }), 'zzz');
    expect(screen.getByText(/no packages match/i)).toBeDefined();
  });

  it('only offers View for a live package', () => {
    render(<PackagesTable items={items} />);
    const view = screen.getAllByRole('link', { name: 'View' });
    expect(view).toHaveLength(1);
    expect(view[0]?.getAttribute('href')).toBe('/packages/north-goa-beaches');
  });

  it('explains a catalogue with no packages at all', () => {
    render(<PackagesTable items={[]} />);
    expect(screen.getByText(/no packages yet/i)).toBeDefined();
  });
});
