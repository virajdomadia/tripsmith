// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaitlistPanel } from '../src/components/admin/bookings/WaitlistPanel';

/** R44 (P6b): the owner's waitlist on the manifest page — offer by hand, remove, refusals. */

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const entry = (over: Record<string, unknown>) => ({
  id: 'e1',
  position: 1,
  name: 'Asha Rao',
  email: 'asha@customer.in',
  party: 4,
  state: 'waiting',
  offerExpiresAt: null,
  offerNo: 0,
  offeredByOwner: false,
  autoOffersDone: false,
  joinedAt: '2026-10-01T05:00:00Z',
  lastEvent: 'Joined · party of 4',
  ...over,
});
const LIST = {
  departureId: 'd1',
  seatsLeft: 2,
  canOffer: true,
  offerEndsAt: '2026-10-02T05:00:00Z',
  live: [
    entry({}),
    entry({ id: 'e2', position: 2, name: 'Bina Shah', email: 'bina@customer.in', party: 2 }),
  ],
  done: [],
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('WaitlistPanel', () => {
  it('offers by hand only to a party that fits the free seats', async () => {
    const after = {
      ...LIST,
      seatsLeft: 0,
      live: [LIST.live[0], { ...LIST.live[1], state: 'offered', offeredByOwner: true }],
    };
    fetchMock.mockResolvedValue(json(200, after));
    const user = userEvent.setup();
    render(<WaitlistPanel initial={LIST as never} />);

    const [asha, bina] = screen.getAllByRole('listitem');
    const askAsha = within(asha!).getByRole('button', { name: 'Offer seats to Asha Rao' });
    expect((askAsha as HTMLButtonElement).disabled).toBe(true);
    expect(askAsha.getAttribute('aria-describedby')).toBe('why-e1');
    expect(within(asha!).getByText('Needs 4 seats — 2 free')).toBeTruthy();

    await user.click(within(bina!).getByRole('button', { name: 'Offer seats to Bina Shah' }));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/waitlist/e2/offer');
    expect(await screen.findByText('Offered · by hand')).toBeTruthy();
  });

  it('asks before removing, and shows the api’s refusal', async () => {
    fetchMock.mockResolvedValue(
      json(409, { error: { code: 'conflict', message: 'This place is already removed' } }),
    );
    const user = userEvent.setup();
    render(<WaitlistPanel initial={LIST as never} />);
    await user.click(screen.getByRole('button', { name: 'Remove Asha Rao from the waitlist' }));
    expect(fetchMock).not.toHaveBeenCalled();
    // Focus moves to the safe choice.
    expect(document.activeElement?.textContent).toBe('Keep');
    await user.click(screen.getByRole('button', { name: 'Yes, remove Asha Rao' }));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/waitlist/e1/remove');
    expect((await screen.findByRole('alert')).textContent).toContain('already removed');
    // Refused: the list is read again, since the place moved on somewhere else.
    expect(String(fetchMock.mock.calls[1]![0])).toBe('/api/admin/departures/d1/waitlist');
  });

  it('says when offers have closed for the date', () => {
    render(<WaitlistPanel initial={{ ...LIST, canOffer: false, offerEndsAt: null } as never} />);
    expect(screen.getByText(/offers have closed for this date/)).toBeTruthy();
  });
});
