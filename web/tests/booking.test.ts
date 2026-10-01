import { describe, expect, it } from 'vitest';
import {
  type Addon,
  addonChoices,
  addonDetail,
  addonUnit,
  canAdd,
  canRemove,
  type Departure,
  formErrors,
  holdSecondsLeft,
  isAddonGone,
  istToday,
  orderBody,
  partySize,
  quoteTravellers,
  type Rooms,
  slotsFor,
  unbookableReason,
} from '../src/lib/booking';

/** B5: the sheet's party rules must match the api's 400s, and its grey labels its 409s. */

const rooms = (r: Partial<Rooms>): Rooms => ({
  double: 0,
  triple: 0,
  single: 0,
  children: 0,
  ...r,
});

const dep = (over: Partial<Departure> = {}): Departure => ({
  id: 'dep_1',
  date: '2026-12-18',
  seatsTotal: 10,
  seatsLeft: 4,
  guaranteed: false,
  priceDoublePaise: 25_999_00,
  priceTriplePaise: 23_999_00,
  priceChildPaise: 15_499_00,
  singleSupplementPaise: 11_000_00,
  badge: null,
  waiting: 0,
  waitlistOpen: false,
  ...over,
});

describe('party', () => {
  it('fills every room exactly: doubles take 2, triples 3, singles 1', () => {
    const r = rooms({ double: 1, triple: 1, single: 1, children: 2 });
    expect(partySize(r)).toBe(8);
    expect(quoteTravellers(r).map((t) => t.occupancy)).toEqual([
      'double',
      'double',
      'triple',
      'triple',
      'triple',
      'single',
      'child',
      'child',
    ]);
  });

  it('keeps slot keys stable, so a typed name survives adding a room', () => {
    const before = slotsFor(rooms({ double: 1 })).map((s) => s.key);
    const after = slotsFor(rooms({ double: 2 })).map((s) => s.key);
    expect(after.slice(0, 2)).toEqual(before);
    expect(slotsFor(rooms({ double: 2 }))[2].room).toBe('Double room 2');
  });

  it('caps the party at 12 and never lets a child travel without an adult', () => {
    expect(canAdd(rooms({ triple: 3, single: 2 }), 'single')).toBe(true); // 11 → 12
    expect(canAdd(rooms({ triple: 3, single: 2 }), 'double')).toBe(false); // 11 → 13
    expect(canAdd(rooms({ triple: 3, single: 1 }), 'double')).toBe(true); // 10 → 12
    expect(canAdd(rooms({ triple: 4 }), 'children')).toBe(false); // 12
    expect(canAdd(rooms({}), 'children')).toBe(false);
    expect(canRemove(rooms({ double: 1, children: 1 }), 'double')).toBe(false);
    expect(canRemove(rooms({ double: 1, single: 1, children: 1 }), 'double')).toBe(true);
    expect(canRemove(rooms({ double: 1 }), 'triple')).toBe(false);
  });
});

describe('unbookableReason — the api order: on request, too soon, seats', () => {
  const today = '2026-12-10';
  it('greys an unpriced departure as on request, even when it is also too soon', () => {
    expect(unbookableReason(dep({ priceChildPaise: 0, date: '2026-12-10' }), 2, today)).toBe(
      'on_request',
    );
  });
  it('refuses anything before IST today + 2', () => {
    expect(unbookableReason(dep({ date: '2026-12-11' }), 2, today)).toBe('too_soon');
    expect(unbookableReason(dep({ date: '2026-12-12' }), 2, today)).toBeNull();
  });
  it('tells sold out apart from too few seats for this party', () => {
    expect(unbookableReason(dep({ seatsLeft: 0 }), 2, today)).toBe('sold_out');
    expect(unbookableReason(dep({ seatsLeft: 3 }), 4, today)).toBe('short');
    expect(unbookableReason(dep({ seatsLeft: 4 }), 4, today)).toBeNull();
  });
  it('allows a ₹0 single supplement', () => {
    expect(unbookableReason(dep({ singleSupplementPaise: 0 }), 1, today)).toBeNull();
  });
});

describe('istToday', () => {
  it('rolls over at IST midnight, not UTC', () => {
    expect(istToday(new Date('2026-12-09T18:29:00Z'))).toBe('2026-12-09');
    expect(istToday(new Date('2026-12-09T18:31:00Z'))).toBe('2026-12-10');
  });
});

describe('formErrors', () => {
  const slots = slotsFor(rooms({ double: 1, children: 1 }));
  const contact = {
    name: 'Ananya Rao',
    phone: '+91 98450 12345',
    email: 'A@Example.com ',
    state: 'Karnataka',
    gstin: '',
    companyName: '',
  };
  const ok = {
    'double-0-0': { name: 'Ananya Rao', age: '34' },
    'double-0-1': { name: 'Vikram Rao', age: '36' },
    'child-0': { name: 'Mira Rao', age: '8' },
  };

  it('passes a complete party and sends the api its own shapes', () => {
    expect(formErrors(slots, ok, contact)).toEqual({});
    expect(orderBody('dep_1', slots, ok, contact)).toEqual({
      departureId: 'dep_1',
      pay: 'full',
      travellers: [
        { name: 'Ananya Rao', age: 34, occupancy: 'double' },
        { name: 'Vikram Rao', age: 36, occupancy: 'double' },
        { name: 'Mira Rao', age: 8, occupancy: 'child' },
      ],
      contact: {
        name: 'Ananya Rao',
        phone: '9845012345',
        email: 'a@example.com',
        state: 'Karnataka',
      },
    });
  });

  it('sends a business GSTIN, normalised, with its company — and checks it matches the State', () => {
    const business = {
      ...contact,
      state: 'Delhi',
      gstin: ' 07abcde1234f1z5',
      companyName: ' Acme ',
    };
    expect(formErrors(slots, ok, business)).toEqual({});
    expect(orderBody('dep_1', slots, ok, business).contact).toMatchObject({
      state: 'Delhi',
      gstin: '07ABCDE1234F1Z5',
      companyName: 'Acme',
    });
    expect(formErrors(slots, ok, { ...business, state: 'Karnataka', companyName: '' })).toEqual({
      'contact.gstin':
        'This GSTIN is registered in another State (code 07) — pick that State, or check the number',
      'contact.companyName': 'Enter the company name registered to this GSTIN',
    });
  });

  it('keys errors the way the api does, so a 400 lands on the same inputs', () => {
    const errors = formErrors(
      slots,
      { ...ok, 'double-0-1': { name: 'V', age: '9' }, 'child-0': { name: 'Mira', age: '3' } },
      { name: '', phone: '12345', email: 'nope', state: '', gstin: 'X', companyName: 'Y' },
    );
    expect(errors).toEqual({
      'travellers.1.name': 'Enter a name',
      'travellers.1.age': 'Under 12? Add them as a child',
      'travellers.2.age': 'The child rate is for ages 5–11',
      'contact.name': 'Enter your name',
      'contact.phone': 'Enter a 10-digit Indian mobile number',
      'contact.email': 'Enter a valid email address',
      'contact.state': 'Pick your State — it goes on the invoice',
      'contact.gstin': 'Enter a 15-character GSTIN, like 29ABCDE1234F1Z5',
    });
  });
});

describe('holdSecondsLeft', () => {
  it('clamps to Checkout’s 600 s and to zero once the hold lapses', () => {
    const now = Date.parse('2026-12-10T10:00:00Z');
    expect(holdSecondsLeft('2026-12-10T10:09:30Z', now)).toBe(570);
    expect(holdSecondsLeft('2026-12-10T10:20:00Z', now)).toBe(600);
    expect(holdSecondsLeft('2026-12-10T09:59:00Z', now)).toBe(0);
  });
});

describe('add-ons (P8)', () => {
  const offered: Addon[] = [
    {
      id: 'car',
      name: 'Transfers',
      description: '',
      pricePaise: 1_800_00,
      basis: 'booking',
      maxNights: null,
      image: null,
    },
    {
      id: 'raft',
      name: 'Rafting',
      description: '',
      pricePaise: 900_00,
      basis: 'traveller',
      maxNights: null,
      image: null,
    },
    {
      id: 'night',
      name: 'Extra night',
      description: '',
      pricePaise: 2_200_00,
      basis: 'night',
      maxNights: 2,
      image: null,
    },
  ];

  it('turns picks into the api choices in the owner order, clamped to the party and the nights', () => {
    const picks = { night: 5, raft: 4, car: 1, gone: 1 };
    expect(addonChoices(offered, picks, 3)).toEqual([
      { addonId: 'car' },
      { addonId: 'raft', travellers: 3 },
      { addonId: 'night', nights: 2 },
    ]);
    expect(addonChoices(offered, { car: 0, raft: 0 }, 2)).toEqual([]);
  });

  it('words a price and a bought line the way the api does', () => {
    expect(addonUnit(offered[2]!)).toBe('₹2,200 per traveller, per night · up to 2 nights');
    expect(addonUnit(offered[0]!)).toBe('₹1,800 per booking');
    expect(addonDetail({ basis: 'booking', travellers: 1, nights: 1 })).toBe('per booking');
    expect(addonDetail({ basis: 'traveller', travellers: 1, nights: 1 })).toBe('1 traveller');
    expect(addonDetail({ basis: 'night', travellers: 4, nights: 2 })).toBe(
      '2 nights · 4 travellers',
    );
    expect(isAddonGone('addon_unavailable')).toBe(true);
    expect(isAddonGone('coupon_unknown')).toBe(false);
  });

  it('sends the choices with the order, and nothing when there are none', () => {
    const slots = slotsFor(rooms({ single: 1 }));
    const who = { [slots[0]!.key]: { name: 'Asha Rao', age: '30' } };
    const contact = {
      name: 'Asha Rao',
      phone: '9876543210',
      email: 'a@x.in',
      state: 'Goa',
      gstin: '',
      companyName: '',
    };
    expect(orderBody('d', slots, who, contact, null, [{ addonId: 'car' }]).addons).toEqual([
      { addonId: 'car' },
    ]);
    expect(orderBody('d', slots, who, contact)).not.toHaveProperty('addons');
  });
});
