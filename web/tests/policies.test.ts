import { describe, expect, it } from 'vitest';
import { CANCELLATION_SCHEDULE, formatUpdated, POLICIES, POLICY_SLUGS } from '../src/lib/policies';

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

  it('formats the updated date for people', () => {
    expect(formatUpdated('2026-09-18')).toBe('18 September 2026');
  });
});
