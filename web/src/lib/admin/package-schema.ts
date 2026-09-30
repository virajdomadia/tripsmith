import { z } from 'zod';
import type { components } from '@/lib/api-types';

export type PackageInput = components['schemas']['PackageInput'];

const NIGHTS_MAX = 30;
const PRICE_MAX_PAISE = 100_000_000;
export const DEAL_LABEL_MAX = 24;

/** The deal's own messages, word for word the api's (admin_packages.py) so either side reads
 *  the same on the field. */
export const DEAL_NEEDS_END = 'Pick the last day of the deal';
export const DEAL_NEEDS_PRICE = 'Add the deal price';
export const DEAL_LABEL_ALONE = 'Add a deal price and end date, or clear the label';

/**
 * `<input type="number">` hands over a string; an emptied one arrives as `''`, which
 * `z.coerce.number()` would happily read as 0. Treat blank as absent so clearing a field is a
 * validation error, not a silent zero. Same trick as `destination-schema.ts`'s `position`.
 */
const numberField = (message: string, min: number, max: number) =>
  z.preprocess(
    (v: number | string) => (v === '' ? undefined : v),
    z.coerce
      .number<number | string>({ error: message })
      .int(message)
      .min(min, message)
      .max(max, message),
  );

const paise = (label: string) => numberField(`${label} must be a whole amount`, 0, PRICE_MAX_PAISE);

/** A blank-able whole number (the early-bird boxes): '' → null, else an int in range. */
const optionalInt = (message: string, min: number, max: number) =>
  z.preprocess(
    (v: number | string | null | undefined) => (v === '' || v == null ? null : v),
    z.coerce
      .number<number | string>({ error: message })
      .int(message)
      .min(min, message)
      .max(max, message)
      .nullable(),
  );

/** R47 (P17), word for word the api's `EarlyBirdInput` where both check the same thing. */
export const EB_DAYS_MIN = 3; // online booking closes 2 days out
export const EB_DAYS_MAX = 365;
export const EB_DAYS_MESSAGE = `Days before departure, ${EB_DAYS_MIN}–${EB_DAYS_MAX}`;
export const EB_OFF_MESSAGE = 'Amount off must be at least ₹1';
export const EB_NEEDS_TIER = 'Add a tier, or switch early-bird off';
export const EB_TIER2_NEARER = 'Tier 2 must end nearer the date than tier 1 — give it fewer days';
export const EB_TIER2_LESS = 'Tier 2 must take off less than tier 1';

/** The one-entry-per-line editors: trim, then drop the blanks. */
const lines = z.array(z.string()).transform((xs) => xs.map((s) => s.trim()).filter(Boolean));

const mealsSchema = z.object({
  breakfast: z.boolean(),
  lunch: z.boolean(),
  dinner: z.boolean(),
});

const daySchema = z.object({
  title: z.string().trim().min(1, 'Required').max(120),
  description: z.string().trim().min(1, 'Required').max(4000),
  meals: mealsSchema,
  stay: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((s) => s || null),
});

const hotelSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  city: z.string().trim().min(1, 'Required').max(80),
  stars: numberField('Stars must be 1 to 5', 1, 5),
  nights: numberField(`Nights must be 1 to ${NIGHTS_MAX}`, 1, NIGHTS_MAX),
});

const faqSchema = z.object({
  q: z.string().trim().min(1, 'Required').max(200),
  a: z.string().trim().min(1, 'Required').max(2000),
});

/** R46 (P8): the api's limits (schemas/catalog.py `AddonInput`). */
export const ADDONS_MAX = 12;
export const ADDON_NAME_MAX = 60;
export const ADDON_DESCRIPTION_MAX = 240;
export const ADDON_NIGHTS_MAX = 14;
export const ADDON_NIGHTS_MESSAGE = `Set the most nights a party can add, 1–${ADDON_NIGHTS_MAX}`;

const addonSchema = z.object({
  /** The api row this edits; null inserts a new one. */
  id: z.string().nullish().default(null),
  name: z
    .string()
    .trim()
    .min(2, 'Name it — at least 2 characters')
    .max(ADDON_NAME_MAX, `${ADDON_NAME_MAX} characters at most`),
  description: z
    .string()
    .trim()
    .max(ADDON_DESCRIPTION_MAX, `${ADDON_DESCRIPTION_MAX} characters at most`),
  pricePaise: numberField('Price must be at least ₹1', 100, PRICE_MAX_PAISE),
  basis: z.enum(['booking', 'traveller', 'night']),
  /** Blank unless charged per night; the api drops it for the other two. */
  maxNights: z.preprocess(
    (v: number | string | null | undefined) => (v === '' || v == null ? null : v),
    z.coerce.number<number | string>().int(ADDON_NIGHTS_MESSAGE).nullable(),
  ),
  imageId: z
    .string()
    .nullish()
    .transform((s) => s || null),
  active: z.boolean(),
});

const departureSchema = z.object({
  /** The api row this edits; null inserts a new one. Never invent an id on the client. */
  id: z.string().nullish().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  seatsTotal: numberField('Seats must be 1 to 200', 1, 200),
  guaranteed: z.boolean(),
  priceDoublePaise: paise('Double'),
  priceTriplePaise: paise('Triple'),
  priceChildPaise: paise('Child'),
  singleSupplementPaise: paise('Single supplement'),
});

/** Mirrors `PackageInput` in api/app/schemas/catalog.py — the api is still the authority. */
export const packageSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, 'Required')
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only'),
    destinationId: z.string().min(1, 'Pick a destination'),
    name: z.string().trim().min(1, 'Required').max(120),
    summary: z.string().trim().min(40, 'Write at least a sentence or two').max(600),
    themes: z.array(z.enum(['beach', 'hills', 'honeymoon', 'family', 'adventure', 'heritage'])),
    nights: numberField(`Nights must be 1 to ${NIGHTS_MAX}`, 1, NIGHTS_MAX),
    departureCity: z.string().trim().min(1, 'Required').max(80),
    highlights: lines,
    inclusions: lines,
    exclusions: lines,
    hotels: z.array(hotelSchema).max(10),
    faq: z.array(faqSchema).max(15),
    featured: z.boolean(),
    /** P5: the sheet offers a 25 % deposit. */
    depositOn: z.boolean(),
    itinerary: z.array(daySchema).max(NIGHTS_MAX + 1),
    departures: z.array(departureSchema).max(60),
    addons: z.array(addonSchema).max(ADDONS_MAX),
    /** B12. Blank = no deal; the price box holds paise like the departure prices. */
    dealPricePaise: z.preprocess(
      (v: number | string | null | undefined) => (v === '' || v == null ? null : v),
      z.coerce
        .number<number | string>({ error: 'Deal price must be a whole amount' })
        .int('Deal price must be a whole amount')
        .min(100, 'Deal price must be at least ₹1')
        .max(PRICE_MAX_PAISE)
        .nullable(),
    ),
    dealLabel: z
      .string()
      .trim()
      .max(DEAL_LABEL_MAX, `${DEAL_LABEL_MAX} characters at most — it sits on the card's stamp`)
      .nullish()
      .transform((s) => s || null),
    dealEndsOn: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date')
      .nullish()
      .transform((s) => s || null),
    /** P17: the switch and up to two tiers; the ₹ boxes hold paise like the deal's. */
    ebOn: z.boolean().default(false),
    eb1Days: optionalInt(EB_DAYS_MESSAGE, EB_DAYS_MIN, EB_DAYS_MAX),
    eb1OffPaise: optionalInt(EB_OFF_MESSAGE, 100, PRICE_MAX_PAISE),
    eb2Days: optionalInt(EB_DAYS_MESSAGE, EB_DAYS_MIN, EB_DAYS_MAX),
    eb2OffPaise: optionalInt(EB_OFF_MESSAGE, 100, PRICE_MAX_PAISE),
  })
  .superRefine((v, ctx) => {
    // Price and end date together or not at all; a label needs both. The price-vs-starting-
    // price and end-date-from-today rules are the api's (it knows the saved deal and the base).
    if (v.dealPricePaise !== null && !v.dealEndsOn) {
      ctx.addIssue({ code: 'custom', path: ['dealEndsOn'], message: DEAL_NEEDS_END });
    }
    if (v.dealEndsOn && v.dealPricePaise === null) {
      ctx.addIssue({ code: 'custom', path: ['dealPricePaise'], message: DEAL_NEEDS_PRICE });
    }
    if (v.dealLabel && v.dealPricePaise === null && !v.dealEndsOn) {
      ctx.addIssue({ code: 'custom', path: ['dealLabel'], message: DEAL_LABEL_ALONE });
    }
    // Early-bird: each tier's two boxes together; tier 2 only after tier 1, nearer and smaller.
    const pairs = [
      ['eb1Days', 'eb1OffPaise', v.eb1Days, v.eb1OffPaise],
      ['eb2Days', 'eb2OffPaise', v.eb2Days, v.eb2OffPaise],
    ] as const;
    for (const [dayKey, offKey, d, off] of pairs) {
      if (d !== null && off === null)
        ctx.addIssue({ code: 'custom', path: [offKey], message: 'Add the amount off' });
      if (off !== null && d === null)
        ctx.addIssue({ code: 'custom', path: [dayKey], message: 'Add the days before departure' });
    }
    if (v.ebOn && v.eb1Days === null && v.eb1OffPaise === null)
      ctx.addIssue({ code: 'custom', path: ['eb1Days'], message: EB_NEEDS_TIER });
    if (v.eb2Days !== null && v.eb1Days === null && v.eb1OffPaise === null)
      ctx.addIssue({ code: 'custom', path: ['eb1Days'], message: 'Fill tier 1 first' });
    if (v.eb1Days !== null && v.eb2Days !== null && v.eb2Days >= v.eb1Days)
      ctx.addIssue({ code: 'custom', path: ['eb2Days'], message: EB_TIER2_NEARER });
    if (v.eb1OffPaise !== null && v.eb2OffPaise !== null && v.eb2OffPaise >= v.eb1OffPaise)
      ctx.addIssue({ code: 'custom', path: ['eb2OffPaise'], message: EB_TIER2_LESS });
    const days = v.nights + 1;
    if (v.itinerary.length > days) {
      ctx.addIssue({
        code: 'custom',
        path: ['itinerary'],
        message: `A ${v.nights}-night trip has ${days} days at most`,
      });
    }
    const seen = new Set<string>();
    v.departures.forEach((d, i) => {
      if (seen.has(d.date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['departures', i, 'date'],
          message: 'Two departures cannot share the same date',
        });
      }
      seen.add(d.date);
    });
    const names = new Set<string>();
    v.addons.forEach((a, i) => {
      const key = a.name.toLowerCase(); // the api compares with str.lower()
      if (names.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['addons', i, 'name'],
          message: 'Two add-ons cannot share a name',
        });
      }
      names.add(key);
      if (a.basis === 'night' && a.maxNights !== null && a.maxNights > v.nights) {
        ctx.addIssue({
          code: 'custom',
          path: ['addons', i, 'maxNights'],
          message: `A ${v.nights}-night trip can add up to ${v.nights} nights`,
        });
      }
      if (
        a.basis === 'night' &&
        (a.maxNights === null || a.maxNights < 1 || a.maxNights > ADDON_NIGHTS_MAX)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['addons', i, 'maxNights'],
          message: ADDON_NIGHTS_MESSAGE,
        });
      }
    });
  });

/** The parsed output — what `onSubmit` receives; the form's field values are `z.input<...>`. */
export type PackageFormValues = z.output<typeof packageSchema>;
/** What the inputs hold (numbers may still be strings until zod coerces them). */
export type PackageFieldValues = z.input<typeof packageSchema>;

export const THEMES = [
  { value: 'beach', label: 'Beach' },
  { value: 'hills', label: 'Hills' },
  { value: 'honeymoon', label: 'Honeymoon' },
  { value: 'family', label: 'Family' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'heritage', label: 'Heritage' },
] as const;

export const blankDay = (): PackageFieldValues['itinerary'][number] => ({
  title: '',
  description: '',
  meals: { breakfast: false, lunch: false, dinner: false },
  stay: '',
});

export const blankDeparture = (): PackageFieldValues['departures'][number] => ({
  id: null,
  date: '',
  seatsTotal: 16,
  guaranteed: false,
  priceDoublePaise: 0,
  priceTriplePaise: 0,
  priceChildPaise: 0,
  singleSupplementPaise: 0,
});

export const blankAddon = (): PackageFieldValues['addons'][number] => ({
  id: null,
  name: '',
  description: '',
  pricePaise: '',
  basis: 'traveller',
  maxNights: '',
  imageId: null,
  active: true,
});

export const emptyPackage = (destinationId: string): PackageFieldValues => ({
  slug: '',
  destinationId,
  name: '',
  summary: '',
  themes: [],
  nights: 3,
  departureCity: 'Ex-Mumbai',
  highlights: [],
  inclusions: [],
  exclusions: [],
  hotels: [],
  faq: [],
  featured: false,
  depositOn: true,
  itinerary: [],
  departures: [],
  addons: [],
  dealPricePaise: '',
  dealLabel: '',
  dealEndsOn: '',
  ebOn: false,
  eb1Days: '',
  eb1OffPaise: '',
  eb2Days: '',
  eb2OffPaise: '',
});

/** The exact wire body; a separate step so a schema tweak cannot silently send extra fields. */
export function toInput(v: PackageFormValues): PackageInput {
  return {
    slug: v.slug,
    destinationId: v.destinationId,
    name: v.name,
    summary: v.summary,
    themes: v.themes,
    nights: v.nights,
    departureCity: v.departureCity,
    highlights: v.highlights,
    inclusions: v.inclusions,
    exclusions: v.exclusions,
    hotels: v.hotels,
    faq: v.faq,
    featured: v.featured,
    depositOn: v.depositOn,
    itinerary: v.itinerary,
    departures: v.departures,
    addons: v.addons.map((a) => ({
      ...a,
      maxNights: a.basis === 'night' ? a.maxNights : null,
    })),
    dealPricePaise: v.dealPricePaise,
    dealLabel: v.dealLabel,
    dealEndsOn: v.dealEndsOn,
    earlyBird: {
      on: v.ebOn,
      tiers: [
        [v.eb1Days, v.eb1OffPaise],
        [v.eb2Days, v.eb2OffPaise],
      ].flatMap(([days, offPaise]) =>
        days != null && offPaise != null ? [{ days, offPaise }] : [],
      ),
    },
  };
}
