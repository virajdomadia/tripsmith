// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminBooking } from '../src/lib/admin/booking-filters';
import { emptyPackage, packageSchema, toInput } from '../src/lib/admin/package-schema';

/** P9b — the owner's side of R49: the booking's details panel and the package editor's
 * required fields + checklist on the wire. */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/admin/bookings/TB-7K2M9Q',
}));
const adminRequest = vi.fn(async () => ({}));
vi.mock('@/lib/admin/client', () => ({ adminRequest }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DetailsPanel } = await import('../src/components/admin/bookings/DetailsPanel');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = {
  travellerId: 'tvik',
  name: 'Vikram Rao',
  age: 36,
  occupancy: 'double' as const,
  idType: null,
  idMasked: null,
  dob: null,
  emergencyName: null,
  emergencyRelation: null,
  emergencyPhone: null,
  food: null,
  allergies: null,
  medical: null,
  missing: ['id' as const],
  complete: false,
};

function booking(over: Partial<AdminBooking> = {}): AdminBooking {
  return {
    ref: 'TB-7K2M9Q',
    leadEmail: 'asha@example.com',
    details: {
      state: 'locked',
      locksOn: '2099-11-10',
      required: ['id', 'emergency', 'food'],
      travellers: [card],
      complete: 0,
      purged: false,
    },
    canEditDetails: true,
    canSendDetailsLink: true,
    checklist: [{ key: 'rain', label: 'A light rain jacket each', note: '', done: true }],
    readiness: { percent: 33, parts: [] },
    ...over,
  } as AdminBooking;
}

describe('DetailsPanel (owner)', () => {
  it('shows readiness, the ticks, and lets the owner edit past the lock', async () => {
    render(<DetailsPanel booking={booking()} />);
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText('1 of 1 travellers missing details')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Pre-trip checklist' });
    expect(within(list).getByText('ticked')).toBeTruthy();
    expect(screen.getByText(/you can still edit them here/)).toBeTruthy();
    expect(screen.queryByText(/Demo site/)).toBeNull();

    const form = screen.getByRole('article', { name: 'Vikram Rao’s details' });
    await userEvent.type(within(form).getByLabelText(/ID number/), '0000 0000 7730');
    await userEvent.click(within(form).getByRole('button', { name: 'Save Vikram’s details' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(adminRequest).toHaveBeenCalledWith(
      '/admin/bookings/TB-7K2M9Q/travellers/tvik/details',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('sends the details link', async () => {
    render(<DetailsPanel booking={booking()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send details link' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/bookings/TB-7K2M9Q/details-link', {
        method: 'POST',
      }),
    );
  });

  it('says so once the details are deleted', () => {
    render(
      <DetailsPanel
        booking={booking({ details: { ...booking().details!, purged: true, travellers: [] } })}
      />,
    );
    expect(screen.getByText(/Deleted 30 days after the trip/)).toBeTruthy();
  });
});

describe('package form: traveller details', () => {
  it('sends the required fields and the checklist, keys kept or null', () => {
    const v = packageSchema.parse({
      ...emptyPackage('d-goa'),
      slug: 'konkan',
      name: 'Konkan',
      summary: 'x'.repeat(50),
      detailsRequired: ['id', 'medical'],
      checklist: [
        { key: 'rain', label: 'A rain jacket', note: '' },
        { key: null, label: 'Sunscreen', note: 'SPF 50' },
      ],
    });
    expect(toInput(v).travellerDetails).toEqual({
      required: ['id', 'medical'],
      checklist: [
        { key: 'rain', label: 'A rain jacket', note: '' },
        { key: null, label: 'Sunscreen', note: 'SPF 50' },
      ],
    });
  });

  it('defaults a new package to ID, emergency contact and food', () => {
    expect(emptyPackage('d').detailsRequired).toEqual(['id', 'emergency', 'food']);
  });
});
