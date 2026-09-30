import type { components } from '@/lib/api-types';
import {
  CHILD_MAX_AGE,
  CHILD_MIN_AGE,
  ROOM_SIZE,
  adultsIn,
  partySize,
  slotsFor,
  type AddonChoice,
  type AddonPicks,
  type RoomKind,
  type Rooms,
  type Slot,
} from '@/lib/booking';
import { EMAIL_RE, normalisePhone, PHONE_RE } from '@/lib/enquiry-schema';

/**
 * The counter (R56, P18): the owner books for a customer. Nothing here prices anything — the
 * receipt always shows `quoteCounterBooking`'s answer, the website's quote plus the manual
 * discount. These helpers only build the requests and mirror the api's 400s, so the owner hears
 * about a missing reason or reference before pressing the button.
 */

export type CounterTrips = components['schemas']['CounterTrips'];
export type CounterPackage = components['schemas']['CounterPackage'];
export type CounterDeparture = components['schemas']['CounterDeparture'];
export type CounterAddon = components['schemas']['AddonOut'];
export type CustomerMatch = components['schemas']['CustomerMatch'];
export type BookingChannel = components['schemas']['BookingChannel'];
export type CounterChannel = Exclude<BookingChannel, 'web'>;
export type ManualMode = 'inr' | 'percent';
export type Settle = 'paid' | 'deposit';
export type Method = 'cash' | 'upi' | 'bank';

export const CHANNEL_LABEL: Record<BookingChannel, string> = {
  web: 'Web',
  phone: 'Phone',
  walk_in: 'Walk-in',
  whatsapp: 'WhatsApp',
  enquiry: 'Enquiry',
};
export const COUNTER_CHANNELS: CounterChannel[] = ['phone', 'walk_in', 'whatsapp', 'enquiry'];
export const METHOD_LABEL: Record<Method, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank' };
export const REFERENCE_LABEL: Record<Method, string> = {
  cash: 'Cash receipt no. (optional)',
  upi: 'UPI reference (UTR)',
  bank: 'Bank transfer reference',
};
export const REASON_MIN = 3;
export const COUNTER_MAX_TRAVELLERS = 60; // api schemas/counter.py

/** Can one more of `kind` join a party capped by the seats left (not the website's 12)? */
export function canAddCounter(r: Rooms, kind: RoomKind, seatsLeft: number): boolean {
  if (kind === 'children' && adultsIn(r) === 0) return false;
  return partySize(r) + ROOM_SIZE[kind] <= Math.min(seatsLeft, COUNTER_MAX_TRAVELLERS);
}

export type Manual = { mode: ManualMode; value: string; reason: string };
export type NewCustomer = {
  name: string;
  phone: string;
  email: string;
  state: string;
};
export type Traveller = { name: string; age: string };

/** The manual discount as the api takes it, or null while it is empty or zero. */
export function manualInput(m: Manual) {
  const value = Number(m.value);
  if (!m.value.trim() || !Number.isInteger(value) || value <= 0) return null;
  return { mode: m.mode, value, reason: m.reason.trim() };
}

/** The picks as the api's choices, per-traveller counts clamped to the party. */
export function counterAddonChoices(
  offered: CounterAddon[],
  picks: AddonPicks,
  party: number,
): AddonChoice[] {
  const out: AddonChoice[] = [];
  for (const a of offered) {
    const n = picks[a.id] ?? 0;
    if (n <= 0) continue;
    if (a.basis === 'booking') out.push({ addonId: a.id });
    else if (a.basis === 'traveller') out.push({ addonId: a.id, travellers: Math.min(n, party) });
    else out.push({ addonId: a.id, nights: Math.min(n, a.maxNights ?? n) });
  }
  return out;
}

/** The party for a quote: each slot's room, and a child's age (it sets the child rate). */
export function counterTravellers(rooms: Rooms, names: Record<string, Traveller>) {
  return slotsFor(rooms).map((s) => {
    const age = Number(names[s.key]?.age);
    return {
      occupancy: s.occupancy,
      ...(names[s.key]?.age && Number.isInteger(age) ? { age } : {}),
    };
  });
}

export type Customer =
  { kind: 'match'; match: CustomerMatch } | { kind: 'new'; draft: NewCustomer };

export function contactOf(c: Customer | null) {
  if (!c) return null;
  if (c.kind === 'match') {
    const m = c.match;
    return {
      name: m.name,
      phone: m.phone,
      email: m.email,
      state: m.state ?? null,
      gstin: m.gstin ?? null,
      companyName: m.companyName ?? null,
    };
  }
  const d = c.draft;
  return {
    name: d.name.trim(),
    phone: normalisePhone(d.phone),
    email: d.email.trim().toLowerCase(),
    state: d.state || null,
  };
}

/** Why a new customer can't be used yet: the api's contact rules, first failure per field. */
export function newCustomerErrors(d: NewCustomer): Partial<Record<keyof NewCustomer, string>> {
  const e: Partial<Record<keyof NewCustomer, string>> = {};
  if (d.name.trim().length < 2) e.name = 'Enter their name';
  if (!PHONE_RE.test(normalisePhone(d.phone))) e.phone = 'Enter a 10-digit Indian mobile';
  if (!EMAIL_RE.test(d.email.trim().toLowerCase())) e.email = 'Enter a valid email';
  return e;
}

/** A child slot's age problem, or null; adults may leave the age empty. */
export function childAgeError(age: string): string | null {
  const n = Number(age);
  if (!age.trim()) return 'Age needed for the child rate';
  if (!Number.isInteger(n) || n < CHILD_MIN_AGE || n > CHILD_MAX_AGE)
    return `Child rate is ${CHILD_MIN_AGE}–${CHILD_MAX_AGE}`;
  return null;
}

export type Draft = {
  departureId: string | null;
  rooms: Rooms;
  names: Record<string, Traveller>;
  detailsNow: boolean;
  picks: AddonPicks;
  coupon: string | null;
  manual: Manual;
  customer: Customer | null;
  settle: Settle;
  method: Method;
  reference: string;
  channel: CounterChannel;
};

/** What still stops the booking, in the order the steps come (the api re-checks all of it). */
export function blockers(d: Draft, depositOffered: boolean): string[] {
  const out: string[] = [];
  if (!d.departureId) out.push('Pick a departure');
  if (partySize(d.rooms) === 0 || adultsIn(d.rooms) === 0) out.push('Add at least one adult');
  const kids = slotsFor(d.rooms).filter((s) => s.occupancy === 'child');
  if (kids.some((s) => childAgeError(d.names[s.key]?.age ?? '')))
    out.push("Enter each child's age");
  const m = manualInput(d.manual);
  if (m && m.reason.length < REASON_MIN) out.push('Give a reason for the manual discount');
  if (!d.customer) out.push('Pick or create a customer');
  else if (d.customer.kind === 'new' && Object.keys(newCustomerErrors(d.customer.draft)).length)
    out.push("Finish the customer's details");
  if (d.detailsNow) {
    const slots = slotsFor(d.rooms);
    if (slots.some((s) => (d.names[s.key]?.name ?? '').trim().length === 1))
      out.push('Names need at least 2 letters');
  }
  if (d.settle === 'deposit' && !depositOffered)
    out.push('Deposit closes 30 days before departure: take the full amount');
  if (d.method !== 'cash' && !d.reference.trim())
    out.push(`Add the ${d.method === 'upi' ? 'UPI reference (UTR)' : 'bank reference'}`);
  return out;
}

export function bookingBody(d: Draft, enquiryId: string | null) {
  const slots: Slot[] = slotsFor(d.rooms);
  return {
    departureId: d.departureId!,
    travellers: slots.map((s) => {
      const t = d.names[s.key];
      const age = t?.age?.trim() ? Number(t.age) : null;
      return {
        occupancy: s.occupancy,
        name: d.detailsNow ? t?.name?.trim() || null : null,
        age: s.occupancy === 'child' || d.detailsNow ? age : null,
      };
    }),
    contact: contactOf(d.customer)!,
    couponCode: d.coupon,
    addons: [] as AddonChoice[],
    manual: manualInput(d.manual),
    channel: d.channel,
    enquiryId,
    settle: d.settle,
    method: d.method,
    reference: d.reference.trim() || null,
  };
}

/** "wa.me" wants the country code and digits only. */
export const waNumber = (phone: string) => `91${normalisePhone(phone)}`;

/** Initials for a customer's avatar: "Priya Nair" → "PN". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
