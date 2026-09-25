import { z } from 'zod';
import type { components } from './api-types';

/**
 * zod mirror of the api's `EnquiryCreate` (api/app/schemas/enquiries.py) — same normalisation,
 * same limits, same messages — so the browser and the no-JS proxy can reject junk before a round
 * trip. api/tests/fixtures/enquiry_cases.json is run against both; drift fails CI.
 */

export const MESSAGE_MAX = 1000;
export const TRAVELLERS = {
  maxTotal: 12,
  adults: Array.from({ length: 12 }, (_, i) => i + 1),
  children: Array.from({ length: 12 }, (_, i) => i),
} as const;
export const BUDGET = { min: 1_000, max: 10_00_000 } as const;
/** The api's own wording: f"Between ₹{BUDGET_MIN_INR:,} and ₹{BUDGET_MAX_INR:,} per person" —
 * Python's `{:,}` groups in threes, so en-US, not en-IN's lakh grouping. */
const grouped = (n: number) => n.toLocaleString('en-US');
export const BUDGET_MESSAGE = `Between ₹${grouped(BUDGET.min)} and ₹${grouped(BUDGET.max)} per person`;
export const NAME_MAX = 80;
export const PHONE_MESSAGE = 'Enter a 10-digit Indian mobile number';

export const NAME_CONTROL_MESSAGE = 'Enter your name on one line, without special characters';

export const PHONE_RE = /^[6-9][0-9]{9}$/;
/** C0 + DEL + C1 controls and U+2028/9 — mirrors `CONTROL_RE` in the api schema. */
export const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
/** Python's `str.strip()` also drops U+001C–U+001F and U+0085, which JS `trim()` keeps — so a
 * name wrapped in them must not be refused here for a control character the api never sees. */
const pythonStrip = (v: string) =>
  v.replace(/^[\s\u001c-\u001f\u0085]+|[\s\u001c-\u001f\u0085]+$/g, '');
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$/; // YYYY-MM (the form) or a date (the contract)

/** `+91 98450-22110` / `09845022110` / `919845022110` → `9845022110`. Never invents digits. */
export function normalisePhone(raw: string): string {
  let digits = raw.trim().replace(/[\s\-.()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Native forms post '' for untouched fields; the api wants them absent. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const trimmed = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const int = (min: number, max: number, message?: string) =>
  z.coerce.number({ message }).int().min(min, message).max(max, message);

export const enquirySchema = z
  .object({
    type: z.enum(['standard', 'custom', 'contact']),
    packageSlug: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(80)
        .optional(),
    ),
    name: z.preprocess(
      (v) => (typeof v === 'string' ? pythonStrip(v) : v),
      z
        .string()
        .min(2, 'Enter your name')
        .max(NAME_MAX, `Keep your name under ${NAME_MAX} characters`)
        .refine((n) => !CONTROL_RE.test(n), NAME_CONTROL_MESSAGE),
    ),
    phone: z
      .string()
      .transform(normalisePhone)
      .refine((p) => PHONE_RE.test(p), PHONE_MESSAGE),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(120)
      .refine((e) => EMAIL_RE.test(e), 'Enter a valid email address'),
    travelMonth: z.preprocess(
      blankToUndefined,
      z.string().regex(MONTH_RE, 'Pick a month').optional(),
    ),
    adults: int(1, TRAVELLERS.maxTotal, 'How many adults?'),
    children: z.preprocess((v) => (v === '' || v == null ? 0 : v), int(0, TRAVELLERS.maxTotal - 1)),
    message: trimmed(MESSAGE_MAX),
    preferredDates: trimmed(200),
    // Like the api's `int(float(v))`: "1500.5" and "1e3" are rupees, truncated, then range-checked.
    budget: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ message: 'Enter a budget in rupees' })
        .refine(Number.isFinite, 'Enter a budget in rupees')
        .transform(Math.trunc)
        .pipe(z.number().min(BUDGET.min, BUDGET_MESSAGE).max(BUDGET.max, BUDGET_MESSAGE))
        .optional(),
    ),
    changes: trimmed(MESSAGE_MAX),
    website: z.string().default(''),
  })
  .superRefine((v, ctx) => {
    if (v.adults + v.children > TRAVELLERS.maxTotal)
      ctx.addIssue({
        code: 'custom',
        path: ['children'],
        message: `Up to ${TRAVELLERS.maxTotal} travellers per enquiry — for more, call us`,
      });
    if (v.type !== 'contact' && !v.packageSlug)
      ctx.addIssue({
        code: 'custom',
        path: ['packageSlug'],
        message: 'Choose a trip to enquire about',
      });
  })
  .transform((v) => ({
    ...v,
    packageSlug: v.type === 'contact' ? undefined : v.packageSlug,
    preferredDates: v.type === 'custom' ? v.preferredDates : undefined,
    budget: v.type === 'custom' ? v.budget : undefined,
    changes: v.type === 'custom' ? v.changes : undefined,
  }));

export type EnquiryInput = z.input<typeof enquirySchema>;
export type EnquiryBody = z.output<typeof enquirySchema>;
// The wire shape must stay assignable to the generated contract type.
export const _contract = (b: EnquiryBody): components['schemas']['EnquiryCreate'] => b;

/** First message per top-level field — the same shape as the api envelope's `fieldErrors`. */
export function fieldErrorsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? 'body');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Raw strings from a native form post, `website` included; numbers stay strings for zod. */
export function enquiryFromForm(data: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The next twelve months, this one first: `{ value: '2026-11', label: 'November 2026' }`. */
export function travelMonthOptions(today = new Date()): { value: string; label: string }[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    const month = d.getUTCMonth();
    return {
      value: `${d.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[month]} ${d.getUTCFullYear()}`,
    };
  });
}
