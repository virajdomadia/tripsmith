import { z } from 'zod';
import { LIMITS, MONTH_RE, SLUG_RE, SORTS, THEMES } from '../constants';

const csv = (inner: z.ZodType<string>) =>
  z.preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v), z.array(inner));

/** Query string of GET /packages. Arrays arrive as CSV (`?destination=goa,kerala`). */
export const searchParamsSchema = z.object({
  destination: csv(z.string().regex(SLUG_RE)).optional(),
  maxBudget: z.coerce.number().int().positive().optional(), // rupees per person
  nightsMin: z.coerce.number().int().min(1).max(30).optional(),
  nightsMax: z.coerce.number().int().min(1).max(30).optional(),
  themes: csv(z.enum(THEMES)).optional(),
  month: z.string().regex(MONTH_RE).optional(), // YYYY-MM
  sort: z.enum(SORTS).default('price-asc'),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

export const hotelSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  nights: z.number().int().min(1),
});
export const faqSchema = z.object({ q: z.string().min(1), a: z.string().min(1) });
export const itineraryDaySchema = z.object({
  dayNo: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  mealB: z.boolean(),
  mealL: z.boolean(),
  mealD: z.boolean(),
  stay: z.string().nullable(),
  locationName: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});
export const departureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seatsTotal: z.number().int().min(0),
  guaranteed: z.boolean().default(false),
  priceDoublePaise: z.number().int().min(0),
  priceTriplePaise: z.number().int().min(0),
  priceChildPaise: z.number().int().min(0),
  singleSupplementPaise: z.number().int().min(0),
});
export const packageSchema = z
  .object({
    slug: z.string().regex(SLUG_RE),
    destinationSlug: z.string().regex(SLUG_RE),
    name: z.string().min(1).max(80),
    summary: z.string().min(1).max(400),
    themes: z.array(z.enum(THEMES)).min(1).max(LIMITS.maxThemesPerPackage),
    nights: z.number().int().min(1).max(30),
    days: z.number().int().min(2).max(31),
    departureCity: z.string().min(1),
    highlights: z.array(z.string().min(1)).min(3).max(6),
    inclusions: z.array(z.string().min(1)).min(1),
    exclusions: z.array(z.string().min(1)).min(1),
    hotels: z.array(hotelSchema).min(1),
    faq: z.array(faqSchema),
    featured: z.boolean().default(false),
    itinerary: z.array(itineraryDaySchema).min(1),
    departures: z.array(departureSchema).min(1),
  })
  .refine((p) => p.days === p.nights + 1, { message: 'days must equal nights + 1', path: ['days'] })
  .refine((p) => p.itinerary.length === p.days, {
    message: 'itinerary must have one entry per day',
    path: ['itinerary'],
  })
  .refine((p) => p.itinerary.every((d, i) => d.dayNo === i + 1), {
    message: 'itinerary dayNo must be 1..days in order',
    path: ['itinerary'],
  });
export type PackageInput = z.infer<typeof packageSchema>;

export const destinationSchema = z.object({
  slug: z.string().regex(SLUG_RE),
  name: z.string().min(1),
  tagline: z.string().min(1).max(80),
  intro: z.string().min(1),
  region: z.string().min(1),
  bestMonths: z.array(z.number().int().min(1).max(12)).min(1),
  position: z.number().int().min(0),
});
export type DestinationInput = z.infer<typeof destinationSchema>;
