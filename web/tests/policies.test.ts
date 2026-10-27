import { describe, expect, it } from 'vitest';
import { formatUpdated, POLICY_HEADS, POLICY_SLUGS, policies } from '../src/lib/policies';
import { cancellationSchedule } from '../src/lib/rules';
import { nth } from './nth';
import { RETENTION, RULES } from './rules';

// Q-5: the pages are built from /meta, so V5's check that read the api's .py files for drift is
// gone — nothing here is a copy any more. These tests check the copy says what the rules say.
const POLICIES = policies(RULES);

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
    const schedule = cancellationSchedule(RULES.cancellationTiers);
    expect(schedule.map((r) => r.window)).toEqual([
      '30 days or more before departure',
      '15 to 29 days before departure',
      '14 days or fewer before departure',
    ]);
    const cancel = nth(POLICIES['cancellation-policy'].blocks, 0);
    expect(cancel.list).toEqual(schedule.map((r) => `${r.window}: ${r.refund}`));
  });

  it('quote the money rules /meta serves (V5, Q-5)', () => {
    const terms = text('terms');
    expect(terms).toContain('by 30 days before departure');
    expect(terms).toContain('held for 10 minutes');
    expect(terms).toContain('We remind you 7 and 3 days before it is due, and on the day.');
    expect(terms).toContain('a deposit now of 25% of the total');
    expect(terms).not.toMatch(/30% of the package|21 days|seats are not held/);
    expect(text('cancellation-policy')).toContain('₹1,000 a traveller from 15 to 29 days before');
  });

  it('keep each retention promise with the job that deletes it (V5)', () => {
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

  it('follow the rules when they change (Q-5)', () => {
    const changed = policies({
      ...RULES,
      balanceDays: 45,
      cancellationTiers: [nth(RULES.cancellationTiers, 0)],
      retention: { ...RETENTION, enquiryDays: 90 },
    });
    const said = (slug: (typeof POLICY_SLUGS)[number]) =>
      changed[slug].blocks.flatMap((b) => [...(b.p ?? []), ...(b.list ?? [])]).join(' ');
    expect(said('terms')).toContain('by 45 days before departure');
    expect(said('privacy')).toContain('deleted 90 days after they arrive');
    expect(nth(changed['cancellation-policy'].blocks, 0).list).toHaveLength(1);
  });

  it('keeps the heads in step with the pages', () => {
    for (const slug of POLICY_SLUGS) expect(POLICIES[slug].title).toBe(POLICY_HEADS[slug].title);
  });

  it('formats the updated date for people', () => {
    expect(formatUpdated('2026-09-18')).toBe('18 September 2026');
  });
});
