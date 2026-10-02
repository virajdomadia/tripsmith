import { z } from 'zod';
import type { components } from '@/lib/api-types';
import { joinTags, splitTags } from '@/lib/leaders';

export type LeaderInput = components['schemas']['LeaderInput'];
export type AdminLeader = components['schemas']['AdminLeader'];

/** Comma-separated in the box ("English, Hindi"); split into the api's list by `toInput`. */
const tags = (what: string) =>
  z
    .string()
    .refine((t) => splitTags(t).length > 0, `Add at least one ${what}`)
    .refine((t) => splitTags(t).length <= 8, 'Eight at most')
    .refine((t) => splitTags(t).every((x) => x.length <= 40), 'Keep each one to 40 characters');

/** Mirrors `LeaderInput` in api/app/schemas/leaders.py — the api is still the authority. */
export const leaderSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only'),
  name: z.string().trim().min(1, 'Required').max(80),
  photoUrl: z.string(),
  /** Comma-separated in the box: "English, Hindi". */
  languages: tags('language'),
  regions: tags('region'),
  yearsLeading: z.preprocess(
    (v: number | string) => (v === '' ? undefined : v),
    z.coerce
      .number<number | string>({ error: 'Enter years from 0 to 60' })
      .int('Enter years from 0 to 60')
      .min(0, 'Enter years from 0 to 60')
      .max(60, 'Enter years from 0 to 60'),
  ),
  bio: z.string().trim().min(20, 'Write two or three lines').max(300, 'Keep it to 300 characters'),
  funFact: z.string().trim().max(140, 'Keep it to 140 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'A phone number, e.g. +91 98450 12345'),
});

export type LeaderFieldValues = z.input<typeof leaderSchema>;
export type LeaderFormValues = z.infer<typeof leaderSchema>;

export const EMPTY_LEADER: LeaderFieldValues = {
  slug: '',
  name: '',
  photoUrl: '',
  languages: '',
  regions: '',
  yearsLeading: 0,
  bio: '',
  funFact: '',
  phone: '',
};

export const toFieldValues = (l: AdminLeader): LeaderFieldValues => ({
  slug: l.slug,
  name: l.name,
  photoUrl: l.photoUrl ?? '',
  languages: joinTags(l.languages),
  regions: joinTags(l.regions),
  yearsLeading: l.yearsLeading,
  bio: l.bio,
  funFact: l.funFact,
  phone: l.phone,
});

/** The exact wire body; a separate step so a schema tweak cannot silently send extra fields. */
export function toInput(v: LeaderFormValues): LeaderInput {
  return {
    slug: v.slug,
    name: v.name,
    photoUrl: v.photoUrl || null,
    languages: splitTags(v.languages),
    regions: splitTags(v.regions),
    yearsLeading: v.yearsLeading,
    bio: v.bio,
    funFact: v.funFact,
    phone: v.phone,
  };
}
