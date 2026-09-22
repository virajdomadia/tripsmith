// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { DeparturesEditor } from '../src/components/admin/packages/DeparturesEditor';
import { blankDeparture, type PackageFieldValues } from '../src/lib/admin/package-schema';

afterEach(cleanup);

const soon = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

let latest: PackageFieldValues | undefined;

function Harness({ rows = 1 }: { rows?: number }) {
  const form = useForm<PackageFieldValues>({
    defaultValues: {
      departures: Array.from({ length: rows }, (_, i) => ({
        ...blankDeparture(),
        id: `dep-${i}`,
        date: soon(30 + i * 30),
        priceDoublePaise: 1_499_900,
        priceTriplePaise: 1_349_900,
        priceChildPaise: 899_900,
        singleSupplementPaise: 600_000,
      })),
    } as PackageFieldValues,
  });
  latest = form.watch();
  return (
    <FormProvider {...form}>
      <DeparturesEditor />
    </FormProvider>
  );
}

describe('DeparturesEditor', () => {
  it('shows prices in rupees while state stays in paise', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/double, departure 1/i)).toHaveProperty('value', '14999');
    expect(latest?.departures[0]?.priceDoublePaise).toBe(1_499_900);
  });

  it('writes paise back when the owner types rupees', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const double = screen.getByLabelText(/double, departure 1/i);
    await user.clear(double);
    await user.type(double, '16500');
    expect(latest?.departures[0]?.priceDoublePaise).toBe(1_650_000);
  });

  it('adds and removes a departure', async () => {
    const user = userEvent.setup();
    render(<Harness rows={1} />);
    await user.click(screen.getByRole('button', { name: /add departure/i }));
    expect(latest?.departures).toHaveLength(2);
    expect(latest?.departures[1]?.id).toBeNull();
    await user.click(screen.getByRole('button', { name: /remove departure 2/i }));
    expect(latest?.departures).toHaveLength(1);
  });

  it('keeps the api row id on an existing departure', async () => {
    const user = userEvent.setup();
    render(<Harness rows={1} />);
    const seats = screen.getByLabelText(/seats total, departure 1/i);
    await user.clear(seats);
    await user.type(seats, '20');
    expect(latest?.departures[0]?.id).toBe('dep-0');
    expect(latest?.departures[0]?.seatsTotal).toBe('20');
  });

  it('says seats left is computed, never typed', () => {
    render(<Harness />);
    expect(screen.getByText(/seats left is computed/i)).toBeDefined();
  });

  it('explains an empty list', () => {
    render(<Harness rows={0} />);
    expect(screen.getByText(/no departures yet/i)).toBeDefined();
  });
});
