import { z } from 'zod';
import type { components } from '@/lib/api-types';

export type DestinationInput = components['schemas']['DestinationInput'];

/** Mirrors `DestinationInput` in api/app/schemas/catalog.py — the api is still the authority. */
export const destinationSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only'),
  name: z.string().trim().min(1, 'Required').max(80),
  tagline: z.string().trim().min(1, 'Required').max(80, 'Keep it to one line (80 characters)'),
  intro: z.string().trim().min(40, 'Write at least a couple of sentences').max(5000),
  coverUrl: z.string().url('Upload a cover photo'),
  region: z.string().trim().min(1, 'Required').max(80),
  bestMonths: z
    .array(z.number().int().min(1).max(12))
    .min(1, 'Pick at least one month')
    .transform((m) => [...new Set(m)].sort((a, b) => a - b)),
  // The generic names the form's input (`<input type="number">` hands over a string) so
  // `z.input<typeof destinationSchema>` is usable as react-hook-form's field type.
  position: z.coerce.number<number | string>().int().min(0).max(999),
});

/** The parsed output — what `onSubmit` receives; the form's field values are `z.input<...>`. */
export type DestinationFormValues = z.infer<typeof destinationSchema>;

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
].map((label, i) => ({ value: i + 1, label }));

/** The exact wire body; a separate step so a schema tweak cannot silently send extra fields. */
export function toInput(v: DestinationFormValues): DestinationInput {
  return {
    slug: v.slug,
    name: v.name,
    tagline: v.tagline,
    intro: v.intro,
    coverUrl: v.coverUrl,
    region: v.region,
    bestMonths: v.bestMonths,
    position: v.position,
  };
}
