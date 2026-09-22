// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { BasicsPanel } from '../src/components/admin/packages/BasicsPanel';
import { emptyPackage, type PackageFieldValues } from '../src/lib/admin/package-schema';
import type { components } from '../src/lib/api-types';

afterEach(cleanup);

type AdminDestination = components['schemas']['AdminDestination'];

const destination = (id: string, name: string): AdminDestination => ({
  id,
  slug: name.toLowerCase(),
  name,
  tagline: 'A place',
  intro: 'x'.repeat(50),
  coverUrl: 'https://blob.test/c.jpg',
  region: 'India',
  bestMonths: [11],
  position: 0,
  packageCount: 1,
  livePackageCount: 1,
  updatedAt: '2026-09-20T10:00:00Z',
});

const DESTINATIONS = [destination('d-goa', 'Goa'), destination('d-kerala', 'Kerala')];

let latest: PackageFieldValues | undefined;

function Harness({ destinationId = 'd-kerala' }: { destinationId?: string }) {
  const form = useForm<PackageFieldValues>({
    defaultValues: { ...emptyPackage(destinationId), name: 'Backwaters', nights: 4 },
  });
  latest = form.watch();
  return (
    <FormProvider {...form}>
      <BasicsPanel destinations={DESTINATIONS} editing />
    </FormProvider>
  );
}

describe('BasicsPanel', () => {
  it('shows the package’s current destination as the selected option', () => {
    // Regression: the first cut used a Radix Select whose trigger rendered blank and never
    // opened, so the owner could neither see nor change a package's destination.
    render(<Harness />);
    const select = screen.getByLabelText(/destination/i) as HTMLSelectElement;
    expect(select.value).toBe('d-kerala');
    expect(screen.getByRole('option', { name: 'Goa' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Kerala' })).toBeDefined();
  });

  it('writes the chosen destination back to the form', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText(/destination/i), 'd-goa');
    expect(latest?.destinationId).toBe('d-goa');
  });

  it('derives the day count from nights', () => {
    render(<Harness />);
    expect(screen.getByText('5 days')).toBeDefined();
  });

  it('toggles a theme chip and records it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const beach = screen.getByRole('button', { name: 'Beach' });
    expect(beach.getAttribute('aria-pressed')).toBe('false');
    await user.click(beach);
    expect(latest?.themes).toEqual(['beach']);
    await user.click(beach);
    expect(latest?.themes).toEqual([]);
  });

  it('names the theme group and the featured switch without misusing <label>', () => {
    // Regression: both were <FormLabel>, which emits <label for> — invalid against a
    // role="group" div and a Radix <button role="switch">.
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Themes' })).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Featured' })).toBeDefined();
  });
});
