// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthPicker } from '../src/components/admin/destinations/MonthPicker';

afterEach(cleanup);

describe('MonthPicker', () => {
  it('renders twelve chips, pressed for the months in value', () => {
    render(<MonthPicker value={[1, 12]} onChange={vi.fn()} />);
    const jan = screen.getByRole('button', { name: 'Jan' });
    const dec = screen.getByRole('button', { name: 'Dec' });
    const feb = screen.getByRole('button', { name: 'Feb' });
    expect(jan.getAttribute('aria-pressed')).toBe('true');
    expect(dec.getAttribute('aria-pressed')).toBe('true');
    expect(feb.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByRole('button')).toHaveLength(12);
  });

  it('adds an unselected month on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthPicker value={[1]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Mar' }));
    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it('removes a selected month on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthPicker value={[1, 3, 5]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Mar' }));
    expect(onChange).toHaveBeenCalledWith([1, 5]);
  });

  it('carries role=group and the given aria attributes, but no aria-invalid', () => {
    render(
      <MonthPicker
        value={[]}
        onChange={vi.fn()}
        id="months"
        aria-describedby="months-desc"
        aria-labelledby="months-label"
      />,
    );
    const group = screen.getByRole('group');
    expect(group.id).toBe('months');
    expect(group.getAttribute('aria-describedby')).toBe('months-desc');
    expect(group.getAttribute('aria-labelledby')).toBe('months-label');
    expect(group.hasAttribute('aria-invalid')).toBe(false);
  });
});
