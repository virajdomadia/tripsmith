import { z } from 'zod';
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';

export type AdminCoupon = components['schemas']['AdminCoupon'];
export type CouponInput = components['schemas']['CouponInput'];
export type CouponState = components['schemas']['CouponState'];

/** A rupee amount typed into a text box: blank = none, otherwise a whole number of rupees. */
const rupees = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{1,7}$/.test(v), 'Whole rupees, e.g. 500');
const whole = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= max), message);

/**
 * Mirrors `CouponInput` in api/app/schemas/coupons.py — the api is still the authority (the
 * code's uniqueness, the lock on a used coupon, the limit's floor are its 409 / 400s). Money is
 * typed in rupees here and sent as paise.
 */
export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9-]{3,20}$/, '3–20 letters, digits or dashes')),
    kind: z.enum(['flat', 'percent']),
    amount: rupees,
    percent: whole(90, 'A whole number from 1 to 90'),
    cap: rupees,
    min: rupees,
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date'),
    endsOn: z.string(),
    useLimit: whole(1_000_000, 'A whole number, or blank for no limit'),
    allPackages: z.boolean(),
    packageIds: z.array(z.string()),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const need = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    if (v.kind === 'flat' && !Number(v.amount)) need('amount', 'Enter the ₹ off');
    if (v.kind === 'percent' && v.percent === '') need('percent', 'Enter the % off (1–90)');
    if (v.endsOn && v.endsOn < v.startsOn) need('endsOn', 'Ends before it starts');
    if (!v.allPackages && v.packageIds.length === 0)
      need('packageIds', 'Choose at least one package');
  });

export type CouponFormFields = z.input<typeof couponSchema>;
export type CouponFormValues = z.output<typeof couponSchema>;

/** The api's field names → the form's, so a server error lands under its input. */
export const SERVER_FIELD: Record<string, keyof CouponFormFields> = {
  code: 'code',
  kind: 'kind',
  amountPaise: 'amount',
  percent: 'percent',
  capPaise: 'cap',
  minPaise: 'min',
  startsOn: 'startsOn',
  endsOn: 'endsOn',
  useLimit: 'useLimit',
  packageIds: 'packageIds',
};

const paise = (v: string) => (v === '' ? null : Number(v) * 100);
const rupeesOf = (p: number | null) => (p === null ? '' : String(p / 100));

export function toInput(v: CouponFormValues): CouponInput {
  const flat = v.kind === 'flat';
  return {
    code: v.code,
    kind: v.kind,
    amountPaise: flat ? paise(v.amount) : null,
    percent: flat ? null : Number(v.percent),
    capPaise: flat ? null : paise(v.cap),
    minPaise: paise(v.min),
    startsOn: v.startsOn,
    endsOn: v.endsOn || null,
    useLimit: v.useLimit === '' ? null : Number(v.useLimit),
    allPackages: v.allPackages,
    packageIds: v.allPackages ? [] : v.packageIds,
    active: v.active,
  };
}

export function fromCoupon(c: AdminCoupon): CouponFormFields {
  return {
    code: c.code,
    kind: c.kind,
    amount: rupeesOf(c.amountPaise),
    percent: c.percent === null ? '' : String(c.percent),
    cap: rupeesOf(c.capPaise),
    min: rupeesOf(c.minPaise),
    startsOn: c.startsOn,
    endsOn: c.endsOn ?? '',
    useLimit: c.useLimit === null ? '' : String(c.useLimit),
    allPackages: c.allPackages,
    packageIds: c.packages.map((p) => p.id),
    active: c.active,
  };
}

/** "10 % off, up to ₹1,000" / "₹500 off" — what the list says a coupon gives. */
export function couponTerms(c: Pick<AdminCoupon, 'kind' | 'amountPaise' | 'percent' | 'capPaise'>) {
  if (c.kind === 'flat') return `${inr(c.amountPaise ?? 0)} off`;
  return `${c.percent} % off${c.capPaise ? `, up to ${inr(c.capPaise)}` : ''}`;
}

export const STATE_LABEL: Record<CouponState, string> = {
  active: 'Active',
  paused: 'Paused',
  scheduled: 'Starts later',
  expired: 'Expired',
  used_up: 'Used up',
};
