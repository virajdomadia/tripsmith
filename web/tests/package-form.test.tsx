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
  dealPricePaise: null,
  dealLabel: null,
  dealEndsOn: null,
  dealState: 'none',
  dealBasePaise: 1_499_900,
  enquiryCount: 0,
  publishRules: [],
  canPublish: false,
  slugLocked: false,
  editedAt: '2026-09-20T10:00:00.123456Z',
  updatedAt: '2026-09-20T11:00:00Z',
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
    // The real reason, not the envelope's generic "Request validation failed".
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('A 3-night trip has 4 days at most'),
    );
  });
});

describe('PackageForm — stale edits', () => {
  it('sends the version it loaded with every save', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValue(fixture({ editedAt: '2026-09-21T09:00:00Z' }));
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalled());
    const [, init] = adminRequest.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(init.body.expectedEditedAt).toBe('2026-09-20T10:00:00.123456Z');

    // The next save goes out against the version the first one produced.
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(2));
    const [, again] = adminRequest.mock.calls[1] as [string, { body: Record<string, unknown> }];
    expect(again.body.expectedEditedAt).toBe('2026-09-21T09:00:00Z');
  });

  it('keeps the version it loaded when a publish or gallery change refreshes the page', () => {
    const { rerender } = renderForm();
    // Status / photo change: same editedAt, new updatedAt, so nothing to follow or fear.
    rerender(
      <PackageForm
        mode="edit"
        pkg={fixture({ status: 'live', updatedAt: '2026-09-22T00:00:00Z' })}
        destinations={[destination]}
      />,
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('North Goa Beaches');
  });

  it('offers a reload when another tab saved first', async () => {
    const user = userEvent.setup();
    const stale =
      'This package was changed in another tab or by someone else — reload to see the latest';
    adminRequest.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'conflict',
        message: stale,
        fieldErrors: { expectedEditedAt: stale },
      }),
    );
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderForm();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Mine');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    type Opts = {
      action: { label: string; onClick: () => void };
      cancel: { label: string; onClick: () => void };
    };
    const [message, opts] = toastError.mock.calls[0] as [string, Opts];
    expect(message).toBe(stale);
    expect(opts.action.label).toBe('Reload, keep my edits');
    expect(opts.cancel.label).toBe('Discard mine');

    // Keeping: the edits are parked for the reloaded page, which lays them on the new version.
    opts.action.onClick();
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
    cleanup();
    renderForm(fixture({ name: 'Theirs', editedAt: '2026-09-23T00:00:00Z' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Mine');
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Restored your edits over the latest version — saving replaces it',
      ),
    );
    adminRequest.mockResolvedValue(fixture({ name: 'Mine', editedAt: '2026-09-24T00:00:00Z' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(2));
    const [, init] = adminRequest.mock.calls[1] as [string, { body: Record<string, unknown> }];
    expect(init.body.expectedEditedAt).toBe('2026-09-23T00:00:00Z');
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

  it('keeps the parked version even when a newer one arrives on refresh', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      'tripsmith:admin-draft:package:p1',
      JSON.stringify({
        savedAt: Date.now(),
        values: { ...fixture(), name: 'Parked' },
        expectedVersion: '2026-09-20T10:00:00.123456Z',
      }),
    );
    const { rerender } = renderForm(fixture({ editedAt: '2026-09-21T00:00:00Z' }));
    rerender(
      <PackageForm
        mode="edit"
        pkg={fixture({ editedAt: '2026-09-22T00:00:00Z' })}
        destinations={[destination]}
      />,
    );
    adminRequest.mockResolvedValue(fixture({ editedAt: '2026-09-23T00:00:00Z' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalled());
    const [, init] = adminRequest.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(init.body.expectedEditedAt).toBe('2026-09-20T10:00:00.123456Z');
    expect(init.body.name).toBe('Parked');
  });
});

describe('PackageForm — typing while a save is in flight', () => {
  it('keeps the keystrokes and stays dirty on top of the saved version', async () => {
    const user = userEvent.setup();
    let resolve: (v: AdminPackage) => void = () => {};
    adminRequest.mockReturnValue(new Promise<AdminPackage>((r) => (resolve = r)));
    renderForm();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, 'Saved name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalled());

    await user.type(name, ' plus more');
    resolve(fixture({ name: 'Saved name', editedAt: '2026-09-21T00:00:00Z' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(name.value).toBe('Saved name plus more');

    // Still dirty: leaving now would lose the extra words, so the browser prompt stays armed.
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
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

  it('does not overwrite a hand-written slug after a restored draft', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      'tripsmith:admin-draft:package:new',
      JSON.stringify({
        savedAt: Date.now(),
        values: { ...fixture(), name: 'Goa', slug: 'my-own-slug' },
        expectedVersion: null,
      }),
    );
    render(<PackageForm mode="create" destinations={[destination]} />);
    const slug = screen.getByLabelText('Slug') as HTMLInputElement;
    await waitFor(() => expect(slug.value).toBe('my-own-slug'));
    await user.type(screen.getByLabelText('Name'), ' beaches');
    expect(slug.value).toBe('my-own-slug');
  });

  it('follows the name on a create form while the slug is still the derived one', async () => {
    const user = userEvent.setup();
    render(<PackageForm mode="create" destinations={[destination]} />);
    await user.type(screen.getByLabelText('Name'), 'Goa Beaches');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('goa-beaches');
  });
});
