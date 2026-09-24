// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';
import type { components } from '../src/lib/api-types';

type AdminDestination = components['schemas']['AdminDestination'];

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/destinations/d1',
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

vi.mock('next/image', () => ({
  // Strip the DOM-unknown next/image props; keep `alt` (and everything else) so React doesn't
  // warn about unknown attributes and jsx-a11y sees a real alt.
  default: ({ fill, sizes, priority, alt, ...rest }: Record<string, unknown>) => {
    void fill;
    void sizes;
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt as string} {...rest} />;
  },
}));

const adminRequest = vi.fn();
const uploadCover = vi.fn();
vi.mock('@/lib/admin/client', () => ({ adminRequest, uploadCover }));

const { DestinationForm } = await import('../src/components/admin/destinations/DestinationForm');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fixture: AdminDestination = {
  id: 'd1',
  slug: 'goa',
  name: 'Goa',
  tagline: 'Sun, sand, and sea',
  intro: 'Goa is a coastal paradise known for its beaches, forts, and vibrant nightlife scene.',
  coverUrl: 'https://blob.test/goa.jpg',
  region: 'West India',
  bestMonths: [11, 12, 1],
  position: 3,
  packageCount: 0,
  livePackageCount: 0,
  slugLocked: false,
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('DestinationForm — create', () => {
  it('submitting the empty form validates without calling the api', async () => {
    const user = userEvent.setup();
    render(<DestinationForm mode="create" />);
    await user.click(screen.getByRole('button', { name: 'Create destination' }));

    await waitFor(() => expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('Upload a cover photo')).toBeTruthy();
    expect(adminRequest).not.toHaveBeenCalled();
    expect(uploadCover).not.toHaveBeenCalled();
  });

  it('follows the Name field into the Slug field until the Slug is edited by hand', async () => {
    const user = userEvent.setup();
    render(<DestinationForm mode="create" />);
    const name = screen.getByLabelText('Name');
    const slug = screen.getByLabelText('Slug') as HTMLInputElement;

    await user.type(name, 'Rishikesh Hills');
    expect(slug.value).toBe('rishikesh-hills');

    await user.clear(slug);
    await user.type(slug, 'my-own-slug');
    await user.type(name, ' Extra');
    expect(slug.value).toBe('my-own-slug');
  });
});

describe('DestinationForm — edit', () => {
  it('submits the eight wire fields and navigates back on success', async () => {
    const user = userEvent.setup();
    adminRequest.mockResolvedValue(undefined);
    render(<DestinationForm mode="edit" destination={fixture} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(1));
    expect(adminRequest).toHaveBeenCalledWith('/admin/destinations/d1', {
      method: 'PUT',
      body: {
        slug: 'goa',
        name: 'Goa',
        tagline: 'Sun, sand, and sea',
        intro:
          'Goa is a coastal paradise known for its beaches, forts, and vibrant nightlife scene.',
        coverUrl: 'https://blob.test/goa.jpg',
        region: 'West India',
        bestMonths: [1, 11, 12],
        position: 3,
      },
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/destinations'));
  });

  it('pins a 409 fieldErrors.slug message under the Slug field, does not navigate, and focuses it', async () => {
    const user = userEvent.setup();
    adminRequest.mockRejectedValue(
      new ApiRequestError(409, {
        code: 'conflict',
        message: 'A destination with this slug already exists',
        fieldErrors: { slug: 'A destination with this slug already exists' },
      }),
    );
    render(<DestinationForm mode="edit" destination={fixture} />);
    const slug = screen.getByLabelText('Slug');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(screen.getByText('A destination with this slug already exists')).toBeTruthy(),
    );
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(slug);
  });

  it('redirects to /admin/login with a next param on a 401', async () => {
    const user = userEvent.setup();
    adminRequest.mockRejectedValue(
      new ApiRequestError(401, { code: 'unauthorized', message: 'Sign in to continue' }),
    );
    render(<DestinationForm mode="edit" destination={fixture} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const [target] = push.mock.calls[0] as [string];
    expect(target.startsWith('/admin/login')).toBe(true);
    expect(target).toContain('next=');
  });

  it('rejects a cleared Order field without calling the api', async () => {
    const user = userEvent.setup();
    render(<DestinationForm mode="edit" destination={fixture} />);
    const order = screen.getByLabelText('Order');
    await user.clear(order);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Enter a number from 0 to 999')).toBeTruthy());
    expect(adminRequest).not.toHaveBeenCalled();
  });
});
