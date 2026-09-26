// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BookingsTable } from '@/components/admin/bookings/BookingsTable';
import type { BookingRow } from '@/lib/admin/booking-filters';

afterEach(() => {
  cleanup();
});

const row = (over: Partial<BookingRow> = {}): BookingRow => ({
  ref: 'TB-7F3K2Q',
  status: 'pending',
  cancelReason: null,
  holdExpiresAt: '2026-09-26T06:22:00Z',
  holdLive: false,
  refundNeeded: false,
  cancellation: null,
  packageName: 'Old Goa & Dudhsagar Weekend',
  departureId: 'dep_1',
  departs: '2026-11-06',
  travellers: 3,
  leadName: 'Zoya Khan',
  leadPhone: '9000000101',
  totalPaise: 1_699_700,
  paidPaise: 0,
  couponCode: null,
  bookedAt: '2026-09-22T06:12:00Z',
  ...over,
});

describe('BookingsTable', () => {
  it('shows the lead, the trip, the money and a lapsed hold', () => {
    render(<BookingsTable items={[row()]} />);
    const [, body] = screen.getAllByRole('row');
    const cells = within(body!);
    expect(cells.getByText('TB-7F3K2Q')).toBeDefined();
    expect(cells.getByText('90000 00101')).toBeDefined();
    expect(cells.getByText(/Fri 6 Nov 2026 · 3 travellers/)).toBeDefined();
    expect(cells.getByText('Pending · hold lapsed')).toBeDefined();
    expect(cells.getByRole('link', { name: 'Open TB-7F3K2Q' }).getAttribute('href')).toBe(
      '/admin/bookings/TB-7F3K2Q',
    );
  });

  it('flags a refund and an open cancellation request', () => {
    render(
      <BookingsTable
        items={[
          row({ status: 'cancelled', cancelReason: 'seats_gone', refundNeeded: true }),
          row({ ref: 'TB-AAAAAA', status: 'confirmed', cancellation: 'requested' }),
        ]}
      />,
    );
    expect(screen.getByText('Cancelled · Seats gone')).toBeDefined();
    expect(screen.getByText('Refund needed')).toBeDefined();
    expect(screen.getByText('Cancel requested')).toBeDefined();
  });

  it('explains an empty desk', () => {
    render(<BookingsTable items={[]} />);
    expect(screen.getByText(/no bookings match/i)).toBeDefined();
  });
});
