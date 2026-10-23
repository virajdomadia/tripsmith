import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_SCHEDULE,
  formatUpdated,
  PAYMENT_TERMS,
  POLICIES,
  POLICY_SLUGS,
  RETENTION,
} from '../src/lib/policies';

const API = resolve(__dirname, '../../api/app/services');

/** The literal on the right of `NAME = …` in an api module, `_` separators dropped. */
function pyConst(file: string, name: string): string {
  const src = readFileSync(resolve(API, file), 'utf8');
  const m = src.match(new RegExp(`^${name} = (.+?)(?:\\s+#.*)?$`, 'm'));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return m[1].replace(/_/g, '');
}

const text = (slug: (typeof POLICY_SLUGS)[number]) =>
  POLICIES[slug].blocks.flatMap((b) => [...(b.p ?? []), ...(b.list ?? [])]).join(' ');

const PLACEHOLDERS = /lorem|ipsum|tbd|todo|coming soon|\[|\]/i;

describe('policy documents', () => {
  it('cover the three footer links', () => {
    expect(POLICY_SLUGS).toEqual(['terms', 'privacy', 'cancellation-policy']);
    for (const slug of POLICY_SLUGS) expect(POLICIES[slug].slug).toBe(slug);
  });

  it('are real copy with a heading and body in every block', () => {
    for (const slug of POLICY_SLUGS) {
      const doc = POLICIES[slug];
      expect(doc.blocks.length).toBeGreaterThanOrEqual(4);
      for (const b of doc.blocks) {
        expect(b.h.length).toBeGreaterThan(3);
        const body = [...(b.p ?? []), ...(b.list ?? [])].join(' ');
        expect(body.length).toBeGreaterThan(40);
        expect(body).not.toMatch(PLACEHOLDERS);
      }
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('quotes one cancellation schedule everywhere', () => {
    expect(CANCELLATION_SCHEDULE.map((r) => r.window)).toEqual([
      '30 days or more before departure',
      '15 to 29 days before departure',
      '14 days or fewer before departure',
    ]);
    const cancel = POLICIES['cancellation-policy'].blocks[0];
    expect(cancel.list).toEqual(CANCELLATION_SCHEDULE.map((r) => `${r.window}: ${r.refund}`));
  });

  it('quote the money rules the api enforces (V5)', () => {
    expect(PAYMENT_TERMS).toEqual({
      depositPercent: Number(pyConst('booking/deposit.py', 'DEPOSIT_PERCENT')),
      balanceDays: Number(pyConst('booking/deposit.py', 'BALANCE_DAYS')),
      graceDays: Number(pyConst('booking/deposit.py', 'GRACE_DAYS')),
      minPartPaise: Number(pyConst('booking/deposit.py', 'MIN_PART_PAISE')),
      reminderDays: JSON.parse(
        pyConst('booking/deposit.py', 'REMINDER_DAYS').replace('(', '[').replace(')', ']'),
      ),
      holdMinutes: Number(pyConst('booking/orders.py', 'HOLD').match(/minutes=(\d+)/)?.[1]),
      freeChangeDays: Number(pyConst('booking/changes.py', 'FREE_DAYS')),
      onlineChangeDays: Number(pyConst('booking/changes.py', 'ONLINE_DAYS')),
      changeFeePaise: Number(pyConst('booking/changes.py', 'FEE_PER_TRAVELLER_PAISE')),
      gstPercent: Number(pyConst('gst/tax.py', 'RATE_PERCENT')),
    });
    const terms = text('terms');
    expect(terms).toContain('by 30 days before departure');
    expect(terms).toContain('held for 10 minutes');
    expect(terms).toContain('We remind you 7 and 3 days before it is due, and on the day.');
    expect(terms).toContain('a deposit now of 25% of the total');
    expect(terms).not.toMatch(/30% of the package|21 days|seats are not held/);
    expect(text('cancellation-policy')).toContain('₹1,000 a traveller from 15 to 29 days before');
  });

  it('keep each retention promise with the job that deletes it (V5)', () => {
    expect(RETENTION).toEqual({
      enquiryDays: Number(pyConst('enquiries.py', 'KEEP_DAYS')),
      detailsDays: Number(pyConst('booking/details.py', 'PURGE_AFTER_DAYS')),
      sessionDays: Number(pyConst('auth/sessions.py', 'SESSION_TTL').match(/days=(\d+)/)?.[1]),
    });
    expect(RETENTION.enquiryDays).toBe(365); // the page says "12 months"
    const privacy = text('privacy');
    for (const said of [
      'deleted 12 months after they arrive',
      'deleted 30 days after the trip comes back',
      'keeps you signed in for 30 days',
      'a 2-minute cookie',
      'stay in that Gmail mailbox',
    ])
      expect(privacy).toContain(said);
    for (const named of [
      'date of birth',
      'emergency contact',
      'medical notes',
      'GSTIN',
      'keyed hash',
    ])
      expect(privacy).toContain(named);
    for (const service of ['Supabase', 'Vercel', 'Razorpay', 'Gmail', 'Sentry'])
      expect(privacy).toContain(service);
  });

  it('formats the updated date for people', () => {
    expect(formatUpdated('2026-09-18')).toBe('18 September 2026');
  });
});
