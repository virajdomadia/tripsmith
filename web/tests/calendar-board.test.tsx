// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarMonth } from '../src/lib/admin/calendar';
import { dep, pkg } from './calendar-fixtures';

/** P11 (R50): the calendar board — grid and "+N more", filters in the URL, keyboard, add. */

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn() }),
  usePathname: () => '/admin/calendar',
}));

const { CalendarBoard } = await import('../src/components/admin/calendar/CalendarBoard');

const fetchMock = vi.fn();
const replaceState = vi.fn();
let wide = true;
beforeEach(() => {
  wide = true;
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(history, 'replaceState').mockImplementation(replaceState);
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('min-width') ? wide : false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const MONTH: CalendarMonth = {
  month: '2099-11',
  today: '2099-11-02',
  departures: [
    dep({ id: 'a', date: '2099-11-06' }),
    dep({ id: 'b', date: '2099-11-06', packageId: 'p2' }),
    dep({ id: 'c', date: '2099-11-06', packageId: 'p2', sold: 20, held: 0, free: 0, waiting: 3 }),
    dep({ id: 'd', date: '2099-11-06', leaderId: 'l1' }),
    dep({ id: 'e', date: '2099-11-13' }),
    dep({ id: 'f', date: '2099-11-20', packageId: 'p2' }),
  ],
  packages: [
    pkg({ leaderId: 'l1' }),
    pkg({ id: 'p2', name: 'Goa Beach Week', destinationId: 'x2', destinationName: 'Goa' }),
  ],
  leaders: [
    { id: 'l1', slug: 'tenzin', name: 'Tenzin Norbu', photoUrl: null, active: true },
    { id: 'l2', slug: 'kavya', name: 'Kavya Rawat', photoUrl: null, active: true },
  ],
  leaderTrips: [
    { leaderId: 'l1', departureId: 'd', packageName: 'Kasol Weekend Camp', date: '2099-11-06', returns: '2099-11-09' },
  ],
  nextBusyMonth: '2099-12',
  prevBusyMonth: null,
};

const board = (over: Partial<CalendarMonth> = {}) =>
  render(
    <CalendarBoard
      data={{ ...MONTH, ...over }}
      params={{ month: '2099-11', dep: null, dest: '', pkg: '', leader: '' }}
      initialPanel={null}
    />,
  );

const chips = () => document.querySelectorAll<HTMLElement>('.ga-chip');

describe('the month grid', () => {
  it('shows three chips a day, then "+N more" opens the day', async () => {
    board();
    expect(chips()).toHaveLength(5); // 3 on the 6th + the 13th + the 20th
    await userEvent.click(screen.getByRole('button', { name: '+1 more' }));
    const panel = screen.getByRole('complementary', { name: 'Calendar panel' });
    expect(within(panel).getByText(/Fri 6 · 4 departures/)).toBeTruthy();
    expect(within(panel).getAllByRole('button', { name: /Goa Beach Week|Kasol/ })).toHaveLength(4);
  });

  it('labels a chip with its seats and waitlist', () => {
    board();
    const full = chips()[2]!;
    expect(full.getAttribute('aria-label')).toContain('Sold out');
    expect(full.getAttribute('aria-label')).toContain('20 of 20 sold, 0 held, 0 free');
    expect(full.getAttribute('aria-label')).toContain('3 on the waitlist');
  });

  it('points to the next busy month when the month is empty', () => {
    board({ departures: [] });
    expect(screen.getByRole('link', { name: /Next busy month → December 2099/ })).toBeTruthy();
  });
});

describe('filters', () => {
  it('apply in the browser, re-sum the strip and land in the URL', async () => {
    board();
    expect(screen.getByText(/Showing/).textContent).toContain('6 of 6');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Destination' }), 'x2');
    expect(screen.getByText(/Showing/).textContent).toContain('3 of 6');
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/admin/calendar?month=2099-11&dest=x2');
    const strip = screen.getByRole('region', { name: 'November at a glance' });
    expect(within(strip).getByText('3')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText(/Showing/).textContent).toContain('6 of 6');
  });
});

describe('keyboard', () => {
  it('moves along the chips and jumps a week with the arrows', () => {
    board();
    const [first] = chips();
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('data-dep')).toBe('b');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-dep')).toBe('e');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('data-day')).toBe('2099-11-06');
  });

  it('changes month with Page Down', () => {
    board();
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(push).toHaveBeenCalledWith('/admin/calendar?month=2099-12', { scroll: false });
  });
});

describe('adding a departure', () => {
  it('prefills from the package and greys out a leader already on a trip', async () => {
    board();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Package' }), 'p1');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add departure on Sat 7 Nov' })[0]!);
    const form = screen.getByRole('form', { name: 'Add departure' });
    expect((within(form).getByLabelText('Seats') as HTMLInputElement).value).toBe('20');
    const leader = within(form).getByLabelText('Trip leader') as HTMLSelectElement;
    const tenzin = [...leader.options].find((o) => o.value === 'l1')!;
    expect(tenzin.disabled).toBe(true);
    expect(tenzin.textContent).toContain('on Kasol Weekend Camp till Mon 9 Nov');
    expect(leader.value).toBe('l2'); // the package's own leader is busy: the next free one

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'n1', packageId: 'p1', date: '2099-11-07' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await userEvent.click(within(form).getByRole('button', { name: 'Create departure' }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/packages/p1/departures');
    expect(JSON.parse(init.body as string)).toEqual({
      date: '2099-11-07',
      seatsTotal: 20,
      priceDoublePaise: 6_499_00,
      priceTriplePaise: 5_999_00,
      priceChildPaise: 3_499_00,
      singleSupplementPaise: 2_000_00,
      leaderId: 'l2',
    });
    expect(refresh).toHaveBeenCalled();
  });
});

describe('a phone', () => {
  it('lists the month by week and keeps the overview below', () => {
    wide = false;
    board();
    expect(screen.getByRole('region', { name: /Week of Sun 1 Nov/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'November overview' })).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Calendar panel' })).toBeNull();
  });
});
