import type { components } from './api-types';
import { CONTROL_RE, EMAIL_RE, normalisePhone, PHONE_MESSAGE, PHONE_RE } from './enquiry-schema';

/**
 * Book now (B5): the party the sheet builds, and the rules it shows before the api is asked.
 *
 * Nothing here prices anything — the breakdown and the total always come from `quoteBooking`.
 * The rules below only mirror the api's 400s (`party_errors` in api/app/schemas/bookings.py)
 * and the picker's grey labels (`unbookable_reason`), so the visitor hears about a problem
 * while choosing rather than after pressing Pay. The api stays the authority on both.
 */

export type Departure = components['schemas']['DepartureOut'];
export type Quote = components['schemas']['Quote'];
export type QuoteLine = components['schemas']['QuoteLine'];
export type BookingOrder = components['schemas']['BookingOrder'];
export type PaymentResult = components['schemas']['PaymentResult'];
export type Occupancy = components['schemas']['Occupancy'];

export const MAX_TRAVELLERS = 12; // api schemas/meta.py MAX_TRAVELLERS
export const CHILD_MIN_AGE = 5;
export const CHILD_MAX_AGE = 11;
export const ADULT_MIN_AGE = CHILD_MAX_AGE + 1;
export const NAME_MIN = 2;
export const NAME_MAX = 80;
/** Bookable from IST today + 2 days (03-requirements-v2 R14). */
export const LEAD_DAYS = 2;
/** Razorpay Checkout closes itself after this many seconds — the length of the seat hold. */
export const HOLD_SECONDS = 600;
/**
 * Razorpay's test mode refuses a single payment above ₹15,000 ("Amount exceeds maximum amount
 * allowed"). Tripsmith stays in test mode for good and its trips cost more than that, so the
 * sheet says so before Pay rather than letting Razorpay's error be the first word on it.
 */
export const TEST_MODE_MAX_PAISE = 15_000_00;
/** The two trips priced under that cap for two travellers (api/content/packages), named in
 * the notice so a tester knows where a full test payment can finish. */
export const TEST_MODE_TRIPS = [
  { slug: 'old-goa-weekend', name: 'Old Goa & Dudhsagar Weekend' },
  { slug: 'kasol-weekend-camp', name: 'Kasol Riverside Weekend' },
] as const;

export type Rooms = { double: number; triple: number; single: number; children: number };
export type RoomKind = keyof Rooms;

/** Adults per room; children share a parent's room at the child rate. */
export const ROOM_SIZE: Record<RoomKind, number> = { double: 2, triple: 3, single: 1, children: 1 };

export const adultsIn = (r: Rooms) => r.double * 2 + r.triple * 3 + r.single;
export const partySize = (r: Rooms) => adultsIn(r) + r.children;

/** Can one more of `kind` be added without breaking the 12-traveller cap (or a child with no adult)? */
export function canAdd(r: Rooms, kind: RoomKind): boolean {
  if (kind === 'children' && adultsIn(r) === 0) return false;
  return partySize(r) + ROOM_SIZE[kind] <= MAX_TRAVELLERS;
}

/** Removing the last adult room while children remain would leave a child travelling alone. */
export function canRemove(r: Rooms, kind: RoomKind): boolean {
  if (r[kind] === 0) return false;
  if (kind === 'children') return true;
  return r.children === 0 || adultsIn(r) - ROOM_SIZE[kind] > 0;
}

/** One traveller slot. `key` is stable across count changes so typed names survive them. */
export type Slot = { key: string; occupancy: Occupancy; room: string };

export function slotsFor(r: Rooms): Slot[] {
  const slots: Slot[] = [];
  const rooms: [Exclude<RoomKind, 'children'>, string][] = [
    ['double', 'Double room'],
    ['triple', 'Triple room'],
    ['single', 'Single room'],
  ];
  for (const [kind, label] of rooms) {
    for (let room = 0; room < r[kind]; room++) {
      const name = r[kind] > 1 ? `${label} ${room + 1}` : label;
      for (let seat = 0; seat < ROOM_SIZE[kind]; seat++)
        slots.push({ key: `${kind}-${room}-${seat}`, occupancy: kind, room: name });
    }
  }
  for (let i = 0; i < r.children; i++)
    slots.push({ key: `child-${i}`, occupancy: 'child', room: 'Child 5–11' });
  return slots;
}

/** Occupancies only — what a quote needs. */
export const quoteTravellers = (r: Rooms) =>
  slotsFor(r).map((s) => ({ occupancy: s.occupancy }) as const);

/* ------------------------------------------------------------------ dates */

const IST_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar day in India, `YYYY-MM-DD` (the api's `ist_today`). */
export function istToday(now: Date = new Date()): string {
  const parts = IST_PARTS.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ bookability */

/** `short` is ours, not the api's: seats remain, just fewer than this party needs. */
export type Unbookable = 'on_request' | 'too_soon' | 'sold_out' | 'short';

/** Mirrors `unbookable_reason` in api/app/services/booking/pricing.py, in the same order. */
export function unbookableReason(d: Departure, party: number, today: string): Unbookable | null {
  if (Math.min(d.priceDoublePaise, d.priceTriplePaise, d.priceChildPaise) <= 0) return 'on_request';
  if (d.date < addDays(today, LEAD_DAYS)) return 'too_soon';
  if (d.seatsLeft <= 0) return 'sold_out';
  if (d.seatsLeft < party) return 'short';
  return null;
}

export const UNBOOKABLE_LABEL: Record<Unbookable, string> = {
  on_request: 'On request — enquire',
  too_soon: 'Departs too soon',
  sold_out: 'Sold out',
  short: 'Not enough seats',
};

/* ------------------------------------------------------------- the form */

export type TravellerInput = { name: string; age: string };
export type Contact = { name: string; phone: string; email: string };

function nameError(raw: string, whose: 'your' | 'the'): string | undefined {
  const v = raw.trim();
  if (v.length < NAME_MIN) return whose === 'your' ? 'Enter your name' : 'Enter a name';
  if (v.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters`;
  if (CONTROL_RE.test(v)) return 'Enter the name on one line, without special characters';
  return undefined;
}

function ageError(raw: string, occupancy: Occupancy): string | undefined {
  if (!/^[0-9]{1,3}$/.test(raw.trim())) return 'Enter an age';
  const age = Number(raw);
  if (occupancy === 'child') {
    if (age < CHILD_MIN_AGE || age > CHILD_MAX_AGE)
      return `The child rate is for ages ${CHILD_MIN_AGE}–${CHILD_MAX_AGE}`;
  } else if (age < ADULT_MIN_AGE) return `Under ${ADULT_MIN_AGE}? Add them as a child`;
  else if (age > 120) return 'Enter an age';
  return undefined;
}

/**
 * Field errors keyed the way the api names them (`travellers.0.name`, `contact.phone`), so a
 * 400 from the api lands on the same inputs as a client-side check.
 */
export function formErrors(
  slots: Slot[],
  travellers: Record<string, TravellerInput>,
  contact: Contact,
): Record<string, string> {
  const errors: Record<string, string> = {};
  slots.forEach((s, i) => {
    const t = travellers[s.key] ?? { name: '', age: '' };
    const n = nameError(t.name, 'the');
    if (n) errors[`travellers.${i}.name`] = n;
    const a = ageError(t.age, s.occupancy);
    if (a) errors[`travellers.${i}.age`] = a;
  });
  const n = nameError(contact.name, 'your');
  if (n) errors['contact.name'] = n;
  if (!PHONE_RE.test(normalisePhone(contact.phone))) errors['contact.phone'] = PHONE_MESSAGE;
  if (!EMAIL_RE.test(contact.email.trim().toLowerCase()))
    errors['contact.email'] = 'Enter a valid email address';
  return errors;
}

export function orderBody(
  departureId: string,
  slots: Slot[],
  travellers: Record<string, TravellerInput>,
  contact: Contact,
): components['schemas']['BookingRequest'] {
  return {
    departureId,
    travellers: slots.map((s) => ({
      name: travellers[s.key].name.trim(),
      age: Number(travellers[s.key].age),
      occupancy: s.occupancy,
    })),
    contact: {
      name: contact.name.trim(),
      phone: normalisePhone(contact.phone),
      email: contact.email.trim().toLowerCase(),
    },
  };
}

/* ------------------------------------------------------------ breakdown */

export const OCCUPANCY_LABEL: Record<Occupancy, string> = {
  double: 'Double sharing',
  triple: 'Triple sharing',
  single: 'Single room',
  child: 'Child 5–11',
};

/** The words for one server line; the numbers beside it are the server's. */
export function lineLabel(line: QuoteLine, dealLabel?: string | null): string {
  switch (line.kind) {
    case 'single_supplement':
      return 'Single supplement';
    case 'deal':
      return `${dealLabel || 'Deal'} · ${OCCUPANCY_LABEL[line.occupancy].toLowerCase()}`;
    default:
      return OCCUPANCY_LABEL[line.occupancy];
  }
}

/** Whole seconds left on a hold, clamped to Checkout's 600 s ceiling; 0 once it has lapsed. */
export function holdSecondsLeft(holdExpiresAt: string, now: number = Date.now()): number {
  const left = Math.floor((new Date(holdExpiresAt).getTime() - now) / 1000);
  return Math.max(0, Math.min(HOLD_SECONDS, left));
}

/**
 * Whether the package page offers Book now at all: some date is priced and has a seat. Only
 * build-time facts — "too soon" moves with the clock, so the sheet judges that one live.
 */
export const offersBooking = (departures: Departure[]) =>
  departures.some(
    (d) =>
      Math.min(d.priceDoublePaise, d.priceTriplePaise, d.priceChildPaise) > 0 && d.seatsLeft > 0,
  );
