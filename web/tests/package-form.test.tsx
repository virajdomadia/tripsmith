// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';
import type { components } from '../src/lib/api-types';

type AdminPackage = components['schemas']['AdminPackage'];
type AdminDestination = components['schemas']['AdminDestination'];

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/packages/p1',
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

vi.mock('next/image', () => ({
  default: ({ fill, sizes, priority, alt, ...rest }: Record<string, unknown>) => {
    void fill;
    void sizes;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt as string} {...rest} />;
  },
}));

const adminRequest = vi.fn();
vi.mock('@/lib/admin/client', () => ({ adminRequest, uploadPackageImage: vi.fn() }));

// Radix's Switch measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { PackageForm } = await import('../src/components/admin/packages/PackageForm');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

const soon = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const day = (n: number) => ({
  dayNo: n,
  title: `Day ${n}`,
  description: `What happens on day ${n}.`,
  meals: { breakfast: true, lunch: false, dinner: false },
  stay: 'Candolim',
});

const destination: AdminDestination = {
  id: 'd-goa',
  slug: 'goa',
  name: 'Goa',
  tagline: 'Sun and sand',
  intro: 'x'.repeat(50),
  coverUrl: 'https://blob.test/c.jpg',
  region: 'West India',
  bestMonths: [11],
  position: 0,
  packageCount: 1,
  livePackageCount: 0,
  slugLocked: false,
  updatedAt: '2026-09-20T10:00:00Z',
};

const fixture = (over: Partial<AdminPackage> = {}): AdminPackage => ({
  id: 'p1',
  slug: 'north-goa-beaches',
  destinationId: 'd-goa',
  destination: { slug: 'goa', name: 'Goa' },
  name: 'North Goa Beaches',
  summary: 'Three slow nights on the Konkan coast with a free beach day and a fort sunset.',
  themes: ['beach'],
  nights: 3,
  days: 4,
  departureCity: 'Ex-Mumbai',
  highlights: ['Fort sunset'],
  inclusions: ['Breakfast'],
  exclusions: ['Flights'],
  hotels: [],
  faq: [],
  itinerary: [day(1), day(2), day(3), day(4)],
  departures: [
    {
      id: 'dep-1',
      date: soon(30),
      seatsTotal: 16,
      seatsLeft: 16,
      guaranteed: false,
      priceDoublePaise: 1_499_900,
      priceTriplePaise: 1_349_900,
      priceChildPaise: 899_900,
      singleSupplementPaise: 600_000,
    },
  ],
  images: [],
  coverImageId: null,
  status: 'draft',
  featured: false,
  startingPricePaise: 1_499_900,
  enquiryCount: 0,
  publishRules: [],
  canPublish: false,
  slugLocked: false,
  updatedAt: '2026-09-20T10:00:00.123456Z',
  ...over,
});

const renderForm = (pkg = fixture()) =>
  render(<PackageForm mode="edit" pkg={pkg} destinations={[destination]} />);

describe('PackageForm — errors that belong to a whole list', () => {
  it('shows the itinerary-length error when nights drop below the written days', async () => {
    const user = userEvent.setup();
    renderForm();
    const nights = screen.getByLabelText('Nights');
    await user.clear(nights);
    await user.type(nights, '2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('A 2-night trip has 3 days at most')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe('A 2-night trip has 3 days at most');
    expect(toastError).toHaveBeenCalledWith('Could not save — fix the highlighted fields');
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('shows a server DUPLICATE_DEPARTURE on the departures list and toasts', async () => {
    const user = userEvent.setup();
    adminRequest.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'conflict',
        message: 'Two departures cannot share the same date',
        fieldErrors: { departures: 'Two departures cannot share the same date' },
      }),
    );
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Two departures cannot share the same date',
      ),
    );
    expect(toastError).toHaveBeenCalledWith('Two departures cannot share the same date');
    expect(push).not.toHaveBeenCalled();
  });

  it('toasts a server error that has no field to sit under', async () => {
    const user = userEvent.setup();
    adminRequest.mockRejectedValue(
      new ApiRequestError(400, {
        code: 'validation',
        message: 'Request validation failed',
        fieldErrors: { body: 'A 3-night trip has 4 days at most' },
      }),
    );
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Request validation failed'));
  });
});

describe('PackageForm — stale edits', () => {
  it('sends the version it loaded with every save', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValue(fixture({ updatedAt: '2026-09-21T09:00:00Z' }));
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalled());
    const [, init] = adminRequest.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(init.body.expectedUpdatedAt).toBe('2026-09-20T10:00:00.123456Z');
  });

  it('offers a reload when another tab saved first', async () => {
    const user = userEvent.setup();
    const stale =
      'This package was changed in another tab or by someone else — reload to see the latest';
    adminRequest.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'conflict',
        message: stale,
        fieldErrors: { expectedUpdatedAt: stale },
      }),
    );
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const [message, opts] = toastError.mock.calls[0] as [string, { action: { label: string } }];
    expect(message).toBe(stale);
    expect(opts.action.label).toBe('Reload');
  });
});

describe('PackageForm — an expired session', () => {
  it('parks the unsaved values, signs in, and restores them after', async () => {
    const user = userEvent.setup();
    adminRequest.mockRejectedValue(
      new ApiRequestError(401, { code: 'unauthorized', message: 'Sign in to continue' }),
    );
    renderForm();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Goa, slowly');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const [target] = push.mock.calls[0] as [string];
    expect(target).toContain('/admin/login?next=%2Fadmin%2Fpackages%2Fp1');
    expect(window.sessionStorage.getItem('tripsmith:admin-draft:package:p1')).toContain(
      'Goa, slowly',
    );

    cleanup();
    renderForm();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Goa, slowly');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Restored unsaved changes'));
    expect(window.sessionStorage.getItem('tripsmith:admin-draft:package:p1')).toBeNull();
  });
});

describe('PackageForm — slug', () => {
  it('is read-only once the trip has been published', () => {
    renderForm(fixture({ slugLocked: true, status: 'live' }));
    expect((screen.getByLabelText('Slug') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText('The URL is fixed once a trip has been published.')).toBeTruthy();
  });

  it('stays editable on a draft that has never been live', () => {
    renderForm();
    expect((screen.getByLabelText('Slug') as HTMLInputElement).readOnly).toBe(false);
  });
});
