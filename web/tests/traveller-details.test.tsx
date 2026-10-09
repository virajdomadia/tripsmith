// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Readiness, TravellerDetailsBlock, TravellerDetailsOut } from '../src/lib/account';

/**
 * P9 (R49) — My trips: a card per traveller (the ID masked, never in full), a form for the ones
 * still missing something, the lock 3 days out; and the tear-off coupons with their ticks.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { TravellerDetails } = await import('../src/components/site/account/TravellerDetails');
const { TripCoupons } = await import('../src/components/site/account/TripCoupons');

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ASHA: TravellerDetailsOut = {
  travellerId: 'tasha',
  name: 'Asha Rao',
  age: 34,
  occupancy: 'double',
  idType: 'aadhaar',
  idMasked: 'XXXX XXXX 4821',
  dob: '1992-03-12',
  emergencyName: 'Sunita Rao',
  emergencyRelation: 'mother',
  emergencyPhone: '9845012763',
  food: 'veg',
  allergies: null,
  medical: 'None',
  missing: [],
  complete: true,
};
const MIRA: TravellerDetailsOut = {
  ...ASHA,
  travellerId: 'tmira',
  name: 'Mira Rao',
  age: 8,
  occupancy: 'child',
  idType: null,
  idMasked: null,
  missing: ['id'],
  complete: false,
};
const BLOCK: TravellerDetailsBlock = {
  state: 'open',
  locksOn: '2099-11-10',
  required: ['id', 'emergency', 'food'],
  travellers: [ASHA, MIRA],
  complete: 1,
  purged: false,
};

describe('TravellerDetails', () => {
  it('shows a complete card masked and opens the missing one as a form', () => {
    render(<TravellerDetails bookingRef="TB-7K2M9Q" block={BLOCK} />);
    const asha = screen.getByRole('article', { name: 'Asha Rao’s details' });
    expect(within(asha).getByText('XXXX XXXX 4821')).toBeTruthy();
    expect(within(asha).getByText('Complete')).toBeTruthy();
    const mira = screen.getByRole('article', { name: 'Mira Rao’s details' });
    expect(within(mira).getByText('1 field left')).toBeTruthy();
    expect(within(mira).getByRole('button', { name: 'Save Mira’s details' })).toBeTruthy();
    expect(screen.getByText(/Demo site: use made-up ID numbers only/)).toBeTruthy();
  });

  it('saves the card through the api and shows its field error', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: {
          code: 'validation',
          message: 'An Aadhaar number has 12 digits',
          fieldErrors: { idNumber: 'An Aadhaar number has 12 digits' },
        },
      }),
    );
    render(<TravellerDetails bookingRef="TB-7K2M9Q" block={BLOCK} />);
    const mira = screen.getByRole('article', { name: 'Mira Rao’s details' });
    await userEvent.type(within(mira).getByLabelText(/ID number/), '1234');
    await userEvent.click(within(mira).getByRole('button', { name: 'Save Mira’s details' }));
    await within(mira).findByText('An Aadhaar number has 12 digits');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/bookings/TB-7K2M9Q/travellers/tmira/details');
    expect(init.method).toBe('PUT');
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ name: 'Mira Rao', idType: 'aadhaar', idNumber: '1234' });
    expect(refresh).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      json(200, {
        ...MIRA,
        idType: 'aadhaar',
        idMasked: 'XXXX XXXX 5519',
        missing: [],
        complete: true,
      }),
    );
    await userEvent.clear(within(mira).getByLabelText(/ID number/));
    await userEvent.type(within(mira).getByLabelText(/ID number/), '0000 0000 5519');
    await userEvent.click(within(mira).getByRole('button', { name: 'Save Mira’s details' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('keeps a saved ID when the number is left blank', async () => {
    fetchMock.mockResolvedValueOnce(json(200, ASHA));
    render(<TravellerDetails bookingRef="TB-7K2M9Q" block={BLOCK} />);
    const asha = screen.getByRole('article', { name: 'Asha Rao’s details' });
    await userEvent.click(within(asha).getByRole('button', { name: 'Edit my details' }));
    expect(within(asha).getByText(/Saved as XXXX XXXX 4821/)).toBeTruthy();
    await userEvent.click(within(asha).getByRole('button', { name: 'Save Asha’s details' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.idType).toBe('aadhaar');
    expect(sent.idNumber).toBeNull();
  });

  it('is read-only once locked', () => {
    render(<TravellerDetails bookingRef="TB-7K2M9Q" block={{ ...BLOCK, state: 'locked' }} />);
    expect(screen.getByText(/Locked since/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save|Edit/ })).toBeNull();
    expect(screen.getByText('Needed')).toBeTruthy();
  });
});

const READY: Readiness = {
  percent: 38,
  parts: [
    {
      key: 'details',
      kind: 'details',
      label: 'Traveller details',
      note: '1 of 2 complete',
      fraction: 0.5,
      done: false,
    },
    {
      key: 'balance',
      kind: 'balance',
      label: 'Balance paid',
      note: '₹25,500 due',
      fraction: 0,
      done: false,
    },
    {
      key: 'item:rain',
      kind: 'item',
      label: 'A light rain jacket each',
      note: '',
      fraction: 0,
      done: false,
    },
    {
      key: 'item:tabs',
      kind: 'item',
      label: 'Motion-sickness tablets',
      note: '',
      fraction: 1,
      done: true,
    },
  ],
};

describe('TripCoupons', () => {
  function coupons() {
    render(
      <TripCoupons
        bookingRef="TB-7K2M9Q"
        readiness={READY}
        details={<p>the details</p>}
        balance={<p>the balance</p>}
        pack={null}
        packPanel={null}
        calendar={null}
        locksOn="2099-11-10"
        departs="2099-11-13"
        balanceDueOn="2099-10-14"
      />,
    );
  }

  it('numbers the coupons, opens the first task and tears off the done ones', async () => {
    coupons();
    expect(screen.getByText('3 to tear off')).toBeTruthy();
    expect(screen.getByText('Locks 10 Nov')).toBeTruthy();
    expect(screen.getByText('Due 14 Oct')).toBeTruthy();
    expect(screen.getByText('the details')).toBeTruthy();
    expect(screen.getByText('the balance').closest('[hidden]')).not.toBeNull();
    expect(screen.getByText(/Torn off/, { selector: 'h3' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Pay/ }));
    expect(screen.getByText('the balance').closest('[hidden]')).toBeNull();
  });

  it('ticks an item through the api', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    coupons();
    await userEvent.click(screen.getByLabelText('Done: A light rain jacket each'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/bookings/TB-7K2M9Q/checklist/rain');
    expect(JSON.parse(init.body)).toEqual({ done: true });
    expect(screen.getByText('2 to tear off')).toBeTruthy();
  });

  it('puts a failed tick back', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { error: { code: 'conflict', message: 'This checklist is closed' } }),
    );
    coupons();
    await userEvent.click(screen.getByLabelText('Done: A light rain jacket each'));
    await screen.findByText('This checklist is closed');
    expect(
      (screen.getByLabelText('Done: A light rain jacket each') as HTMLInputElement).checked,
    ).toBe(false);
  });
});
