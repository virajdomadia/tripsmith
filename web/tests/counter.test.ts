import { describe, expect, it } from 'vitest';
import {
  blockers,
  bookingBody,
  canAddCounter,
  childAgeError,
  countdown,
  linkAmount,
  linkMessage,
  linkProblem,
  counterTravellers,
  manualInput,
  newCustomerErrors,
  type Draft,
} from '@/lib/admin/counter';

const draft = (over: Partial<Draft> = {}): Draft => ({
  departureId: 'dep_1',
  rooms: { double: 1, triple: 0, single: 0, children: 0 },
  names: {},
  detailsNow: false,
  picks: {},
  coupon: null,
  manual: { mode: 'inr', value: '', reason: '' },
  customer: {
    kind: 'new',
    draft: { name: 'Priya Nair', phone: '98450 11223', email: 'Priya@Customer.in', state: '' },
  },
  settle: 'paid',
  linkPay: 'full',
  method: 'upi',
  reference: '4271 9953 0187',
  channel: 'phone',
  ...over,
});

describe('counter party', () => {
  it('is capped by the seats left, not the website’s 12', () => {
    const rooms = { double: 7, triple: 0, single: 0, children: 0 };
    expect(canAddCounter(rooms, 'double', 16)).toBe(true); // 16 travellers
    expect(canAddCounter(rooms, 'double', 15)).toBe(false);
    expect(canAddCounter({ ...rooms, double: 0 }, 'children', 20)).toBe(false); // no adult
  });

  it('sends a child’s age with the quote, and nothing for adults', () => {
    const rooms = { double: 1, triple: 0, single: 0, children: 1 };
    expect(counterTravellers(rooms, { 'child-0': { name: '', age: '8' } })).toEqual([
      { occupancy: 'double' },
      { occupancy: 'double' },
      { occupancy: 'child', age: 8 },
    ]);
    expect(childAgeError('')).toMatch(/Age needed/);
    expect(childAgeError('12')).toMatch(/5–11/);
    expect(childAgeError('7')).toBeNull();
  });
});

describe('manual discount', () => {
  it('is left out while empty or zero, and keeps its reason', () => {
    expect(manualInput({ mode: 'inr', value: '', reason: 'x' })).toBeNull();
    expect(manualInput({ mode: 'inr', value: '0', reason: 'x' })).toBeNull();
    expect(manualInput({ mode: 'percent', value: '5', reason: ' Repeat ' })).toEqual({
      mode: 'percent',
      value: 5,
      reason: 'Repeat',
    });
  });
});

describe('what still stops the booking', () => {
  it('is nothing on a complete draft', () => {
    expect(blockers(draft(), { deposit: true })).toEqual([]);
  });

  it('names each missing piece in step order', () => {
    expect(
      blockers(
        draft({
          departureId: null,
          manual: { mode: 'inr', value: '2000', reason: '' },
          customer: null,
          settle: 'deposit',
          reference: '',
        }),
        { deposit: false },
      ),
    ).toEqual([
      'Pick a departure',
      'Give a reason for the manual discount',
      'Pick or create a customer',
      'Deposit closes 30 days before departure: take the full amount',
      'Add the UPI reference (UTR)',
    ]);
    expect(blockers(draft({ method: 'cash', reference: '' }), { deposit: true })).toEqual([]);
    expect(newCustomerErrors({ name: 'P', phone: '12345', email: 'nope', state: '' })).toEqual({
      name: 'Enter their name',
      phone: 'Enter a 10-digit Indian mobile',
      email: 'Enter a valid email',
    });
  });
});

describe('the booking request', () => {
  it('normalises the new customer and leaves names for later', () => {
    const body = bookingBody(
      draft({
        rooms: { double: 1, triple: 0, single: 0, children: 1 },
        names: { 'child-0': { name: '', age: '7' } },
      }),
      'enq_1',
    );
    expect(body.contact).toEqual({
      name: 'Priya Nair',
      phone: '9845011223',
      email: 'priya@customer.in',
      state: null,
    });
    expect(body.travellers).toEqual([
      { occupancy: 'double', name: null, age: null },
      { occupancy: 'double', name: null, age: null },
      { occupancy: 'child', name: null, age: 7 },
    ]);
    expect(body).toMatchObject({ enquiryId: 'enq_1', settle: 'paid', method: 'upi', manual: null });
  });

  it('sends names and ages when taken now', () => {
    const body = bookingBody(
      draft({
        detailsNow: true,
        names: {
          'double-0-0': { name: ' Priya Nair ', age: '34' },
          'double-0-1': { name: '', age: '' },
        },
      }),
      null,
    );
    expect(body.travellers).toEqual([
      { occupancy: 'double', name: 'Priya Nair', age: 34 },
      { occupancy: 'double', name: null, age: null },
    ]);
  });
});

describe('payment links (P18b)', () => {
  const offer = {
    deposit: true,
    totalPaise: 40_000_00,
    depositPaise: 10_000_00,
    linkUntil: '2026-10-02T06:00:00Z',
    linkMaxPaise: 15_000_00,
  };

  it('asks for the total or the deposit, and says why a link can’t go', () => {
    expect(linkAmount({ linkPay: 'deposit' }, offer)).toBe(10_000_00);
    expect(linkAmount({ linkPay: 'full' }, offer)).toBe(40_000_00);
    expect(linkProblem({ linkPay: 'deposit' }, offer)).toBeNull();
    expect(linkProblem({ linkPay: 'full' }, offer)).toMatch(/caps a link at ₹15,000/);
    expect(linkProblem({ linkPay: 'deposit' }, { ...offer, deposit: false })).toMatch(
      /Deposit closes/,
    );
    expect(linkProblem({ linkPay: 'deposit' }, { ...offer, linkUntil: null })).toMatch(
      /Too close to departure/,
    );
    expect(linkProblem({ linkPay: 'full' }, { ...offer, linkMaxPaise: null })).toBeNull();
  });

  it('needs no method or reference, and sends none', () => {
    const d = draft({ settle: 'link', linkPay: 'deposit', method: 'upi', reference: '' });
    expect(blockers(d, offer)).toEqual([]);
    expect(bookingBody(d, null)).toMatchObject({
      settle: 'link',
      linkPay: 'deposit',
      method: null,
      reference: null,
    });
    expect(blockers({ ...d, linkPay: 'full' }, offer)).toEqual([
      "Razorpay's test mode caps a link at ₹15,000: send the deposit link, or take the payment now",
    ]);
  });

  it('counts down and words the WhatsApp message', () => {
    expect(countdown(7 * 3600_000 + 42 * 60_000 + 10_000)).toBe('07:42:10');
    expect(countdown(-5)).toBe('00:00:00');
    expect(
      linkMessage({
        firstName: 'Priya',
        packageName: 'Munnar',
        when: 'Fri 13 Nov 2026',
        party: '3 travellers',
        amount: '₹15,875',
        deposit: true,
        held: '14:12 · Thu 1 Oct 2026',
        url: 'https://rzp.io/rzp/x',
      }),
    ).toBe(
      'Hi Priya, here is your Tripsmith payment link for Munnar (Fri 13 Nov 2026, 3 travellers): ₹15,875 deposit. Your seats are held until 14:12 · Thu 1 Oct 2026. https://rzp.io/rzp/x',
    );
  });
});
