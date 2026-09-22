// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { ItineraryEditor } from '../src/components/admin/packages/ItineraryEditor';
import { blankDay, type PackageFieldValues } from '../src/lib/admin/package-schema';

afterEach(cleanup);

function Harness({ days = 2, nights = 3 }: { days?: number; nights?: number }) {
  const form = useForm<PackageFieldValues>({
    defaultValues: {
      nights,
      itinerary: Array.from({ length: days }, (_, i) => ({
        ...blankDay(),
        title: `Day ${i + 1} title`,
      })),
    } as PackageFieldValues,
  });
  return (
    <FormProvider {...form}>
      <ItineraryEditor />
    </FormProvider>
  );
}

describe('ItineraryEditor', () => {
  it('numbers the days and shows how many the trip needs', () => {
    render(<Harness />);
    expect(screen.getByText(/2 of 4 days/i)).toBeDefined();
    expect(screen.getByDisplayValue('Day 1 title')).toBeDefined();
  });

  it('adds a day and stops at the trip length', async () => {
    const user = userEvent.setup();
    render(<Harness days={3} nights={3} />);
    const add = screen.getByRole('button', { name: /add day/i });
    await user.click(add);
    expect(screen.getByText(/4 of 4 days/i)).toBeDefined();
    expect(add).toHaveProperty('disabled', true);
  });

  it('removes a day', async () => {
    const user = userEvent.setup();
    render(<Harness days={2} />);
    await user.click(screen.getByRole('button', { name: /remove day 1/i }));
    expect(screen.queryByDisplayValue('Day 1 title')).toBeNull();
    expect(screen.getByText(/1 of 4 days/i)).toBeDefined();
  });

  it('gives every row a focusable drag handle with a useful name', () => {
    render(<Harness days={2} />);
    // dnd-kit's KeyboardSensor is the accessible reorder path (space to lift, arrows to move,
    // space to drop), so the handle must be a real focusable button — there is deliberately no
    // parallel set of up/down buttons to keep in sync. jsdom has no layout, so the drag itself
    // cannot be simulated here; `movedIndices` + `reorder` are unit-tested in sortable.test.ts.
    const handle = screen.getByRole('button', { name: /reorder day 1/i });
    expect(handle.tagName).toBe('BUTTON');
    expect(handle.getAttribute('tabindex')).not.toBe('-1');
    expect(screen.getByRole('button', { name: /reorder day 2/i })).toBeDefined();
  });

  it('scopes each row so its fields are findable by day', () => {
    render(<Harness days={2} />);
    const rows = screen.getAllByRole('group', { name: /^day \d$/i });
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByDisplayValue('Day 1 title')).toBeDefined();
    expect(within(rows[1]!).getByDisplayValue('Day 2 title')).toBeDefined();
  });

  it('explains an empty itinerary', () => {
    render(<Harness days={0} />);
    expect(screen.getByText(/no days yet/i)).toBeDefined();
  });

  it('labels each meal checkbox with a real label element', async () => {
    // Regression: these were Radix checkboxes (a <button role="checkbox">), which a
    // <label for> cannot legally point at — Chrome flagged "Incorrect use of <label>".
    const user = userEvent.setup();
    render(<Harness days={1} />);
    const breakfast = screen.getByRole('checkbox', { name: /Breakfast, day 1/i });
    expect(breakfast.tagName).toBe('INPUT');
    expect((breakfast as HTMLInputElement).checked).toBe(false);
    await user.click(breakfast);
    expect((breakfast as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Lunch, day 1/i })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /Dinner, day 1/i })).toBeDefined();
  });
});
