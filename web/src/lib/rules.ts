import type { components } from './api-types';

/**
 * Q-5: the booking rules the api enforces — deposit, balance days, cancellation tiers, age limits —
 * as `GET /meta` serves them. The web reads these and never keeps a copy: server pages fetch them
 * with `getMeta()` (`lib/meta.ts`), client trees get them from `RulesProvider`.
 */
type Meta = components['schemas']['Meta'];
/** The booking rules plus the party cap (`limits.maxTravellers`) and how long things are kept —
 * the one object pages and helpers take. */
export type Rules = components['schemas']['BookingRules'] & {
  maxTravellers: number;
  retention: Retention;
};
export type Retention = components['schemas']['Retention'];
export type AgeLimits = components['schemas']['AgeLimits'];
type Tier = components['schemas']['CancellationTierOut'];

export const rulesOf = (meta: Meta): Rules => ({
  ...meta.rules,
  maxTravellers: meta.limits.maxTravellers,
  retention: meta.retention,
});

/** `[7, 3, 0]` → "7 and 3": the reminders sent before the due day (0 = on the day itself). */
export function remindersBefore(reminderDays: readonly number[]): string {
  const before = reminderDays.filter((d) => d > 0);
  if (before.length <= 1) return before.join('');
  return `${before.slice(0, -1).join(', ')} and ${before.at(-1)}`;
}

export type ScheduleRow = { window: string; refund: string };

/** `[30, 15, 0]` → "30 days or more", "15 to 29 days", "14 days or fewer" before departure. */
export function cancellationSchedule(tiers: readonly Tier[]): ScheduleRow[] {
  return tiers.map((t, i) => {
    const prev = tiers[i - 1];
    const window =
      prev === undefined
        ? `${t.fromDays} days or more`
        : t.fromDays === 0
          ? `${prev.fromDays - 1} days or fewer`
          : `${t.fromDays} to ${prev.fromDays - 1} days`;
    return { window: `${window} before departure`, refund: t.refund };
  });
}

/** The tier that applies to a cancellation asked `daysOut` days before departure (the api's
 * `refund_tier`): the first whose start the day reaches. */
export function refundTierIndex(tiers: readonly Tier[], daysOut: number): number {
  const i = tiers.findIndex((t) => Math.max(daysOut, 0) >= t.fromDays);
  return i === -1 ? tiers.length - 1 : i;
}
