// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EnquiriesTable } from '@/components/admin/enquiries/EnquiriesTable';
import type { components } from '@/lib/api-types';

afterEach(() => {
  cleanup();
});

type Row = components['schemas']['EnquiryRow'];

const row = (over: Partial<Row> = {}): Row => ({
  id: 'enq_1',
  ref: 'TS-7F3K2Q',
  type: 'standard',
  status: 'new',
  name: 'Priya Sharma',
  phone: '9845022110',
  package: { slug: 'north-goa-beaches', name: 'North Goa Beaches' },
  travelMonth: '2026-11-01',
  adults: 2,
  children: 0,
  createdAt: '2026-09-22T06:12:00Z',
  ...over,
});

describe('EnquiriesTable', () => {
  it('renders the A6 columns for one enquiry', () => {
    render(<EnquiriesTable items={[row()]} />);
    const line = screen.getByRole('row', { name: /Priya Sharma/ });
    expect(within(line).getByText('TS-7F3K2Q')).toBeTruthy();
    expect(within(line).getByText('98450 22110')).toBeTruthy();
    expect(within(line).getByText('North Goa Beaches')).toBeTruthy();
    expect(within(line).getByText('Standard')).toBeTruthy();
    expect(within(line).getByText('Nov 2026 · 2 adults')).toBeTruthy();
    expect(within(line).getByText('New')).toBeTruthy();
  });

  it('counts children in the party line', () => {
    render(<EnquiriesTable items={[row({ adults: 2, children: 2 })]} />);
    expect(screen.getByText('Nov 2026 · 2 adults, 2 children')).toBeTruthy();
  });

  it('dashes the package and month of a general enquiry', () => {
    render(<EnquiriesTable items={[row({ type: 'contact', package: null, travelMonth: null })]} />);
    const line = screen.getByRole('row', { name: /Priya Sharma/ });
    expect(within(line).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('links each row to its detail page', () => {
    render(<EnquiriesTable items={[row()]} />);
    expect(screen.getByRole('link', { name: /Open/ }).getAttribute('href')).toBe(
      '/admin/enquiries/enq_1',
    );
  });

  it('says so when a filter matches nothing', () => {
    render(<EnquiriesTable items={[]} />);
    expect(screen.getByText('No enquiries match these filters.')).toBeTruthy();
  });
});
