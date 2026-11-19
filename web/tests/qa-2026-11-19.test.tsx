// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '../src/lib/api-types';
import { RULES } from './rules';
import { withRules } from './with-rules';

/** QA 2026-11-19: the read-only demo owner (web side), and the "too soon" departure rows. */

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));

const { ReadOnlyBanner, ReadOnlyProvider } = await import('../src/lib/admin/read-only');
const { reportAdminError } = await import('../src/lib/admin/errors');
const { ApiRequestError } = await import('../src/lib/api-errors');
const { DeparturesTable } = await import('../src/components/site/package/DeparturesTable');
const { addDays, istToday } = await import('../src/lib/booking');

afterEach(() => {
  cleanup();
  toastError.mockReset();
});

describe('read-only demo owner', () => {
  it('shows the banner only for a read-only session', () => {
    const { rerender } = render(
      <ReadOnlyProvider readOnly={false}>
        <ReadOnlyBanner />
      </ReadOnlyProvider>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <ReadOnlyProvider readOnly>
        <ReadOnlyBanner />
      </ReadOnlyProvider>,
    );
    expect(screen.getByRole('status').textContent).toContain('Demo owner — read-only');
  });

  it('toasts the api’s read-only message once (a stable id), never as a session expiry', () => {
    const router = { push: vi.fn() } as unknown as Parameters<typeof reportAdminError>[1]['router'];
    const message =
      'The demo owner account is read-only — you can look around, but changes aren’t saved.';
    const err = new ApiRequestError(403, { code: 'forbidden', message, reason: 'demo_read_only' });
    reportAdminError(err, { router, pathname: '/admin/packages', fallback: 'nope' });
    expect(toastError).toHaveBeenCalledWith(message, { id: 'demo_read_only' });
    expect(router.push).not.toHaveBeenCalled();
  });
});

type Departure = components['schemas']['DepartureOut'];
const departure = (over: Partial<Departure>): Departure => ({
  id: 'd1',
  date: '2026-11-20',
  seatsTotal: 4,
  seatsLeft: 4,
  guaranteed: false,
  priceDoublePaise: 14_499_00,
  priceTriplePaise: 13_499_00,
  priceChildPaise: 2_000_00,
  singleSupplementPaise: 6_000_00,
  badge: null,
  waiting: 0,
  waitlistOpen: false,
  ...over,
});

describe('Dates & prices table', () => {
  it('marks a date inside the online-booking cutoff "call to book", like the sheet', () => {
    const today = istToday();
    render(
      <DeparturesTable
        departures={[
          departure({ id: 'soon', date: addDays(today, RULES.leadDays - 1) }),
          departure({ id: 'later', date: addDays(today, RULES.leadDays + 5) }),
        ]}
      />,
      withRules,
    );
    const rows = [...document.querySelectorAll('tbody tr')];
    expect(rows[0]!.getAttribute('data-too-soon')).toBe('true');
    expect(rows[0]!.textContent).toContain('Departs too soon · call to book');
    expect(rows[1]!.hasAttribute('data-too-soon')).toBe(false);
  });
});
