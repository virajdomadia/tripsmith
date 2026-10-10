import type { components } from '@/lib/api-types';

/** R53 (P15b): the owner's automatic emails — the wire types and their paths. */
export type EmailType = components['schemas']['EmailType'];
export type EmailTypeSetting = components['schemas']['EmailTypeSetting'];
export type EmailSettings = components['schemas']['EmailSettings'];
export type EmailSample = components['schemas']['EmailSample'];
export type EmailSamples = components['schemas']['EmailSamples'];
export type EmailPreview = components['schemas']['EmailPreview'];
export type EmailTestSent = components['schemas']['EmailTestSent'];
export type UpcomingEmail = components['schemas']['UpcomingEmail'];

export const EMAILS_PATH = '/admin/settings/emails';
export const emailPath = (type: EmailType, rest = '') =>
  `/admin/emails/${encodeURIComponent(type)}${rest}` as const;
