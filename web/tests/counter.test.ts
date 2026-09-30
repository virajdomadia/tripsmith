import { describe, expect, it } from 'vitest';
import {
  blockers,
  bookingBody,
  canAddCounter,
  childAgeError,
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
    expect(blockers(draft(), true)).toEqual([]);
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
        false,
      ),
    ).toEqual([
      'Pick a departure',
      'Give a reason for the manual discount',
      'Pick or create a customer',
      'Deposit closes 30 days before departure: take the full amount',
      'Add the UPI reference (UTR)',
    ]);
    expect(blockers(draft({ method: 'cash', reference: '' }), true)).toEqual([]);
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
