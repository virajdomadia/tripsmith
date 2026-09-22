import { describe, expect, it } from 'vitest';
import { destinationSchema, MONTHS, toInput } from '../src/lib/admin/destination-schema';

const valid = {
  slug: 'kerala',
  name: 'Kerala',
  tagline: 'Backwaters and tea hills',
  intro: 'Two paragraphs of markdown intro text that comfortably clears the minimum length rule.',
  coverUrl: 'https://blob.test/destinations/uploads/k.jpg',
  region: 'South India',
  bestMonths: [12, 1, 11],
  position: 2,
};

describe('destinationSchema', () => {
  it('accepts a full record and normalises months', () => {
    const out = destinationSchema.parse(valid);
    expect(out.bestMonths).toEqual([1, 11, 12]);
    expect(toInput(out)).toEqual({ ...valid, bestMonths: [1, 11, 12] });
  });
  it('mirrors the api rules: slug pattern, lengths, at least one month, a cover', () => {
    expect(destinationSchema.safeParse({ ...valid, slug: 'Kerala Hills' }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, tagline: 'x'.repeat(81) }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, intro: 'short' }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, bestMonths: [] }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, coverUrl: '' }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, position: -1 }).success).toBe(false);
    expect(destinationSchema.safeParse({ ...valid, position: 1000 }).success).toBe(false);
  });
  it('coerces the position field from the text input', () => {
    expect(destinationSchema.parse({ ...valid, position: '7' }).position).toBe(7);
    expect(destinationSchema.parse({ ...valid, position: 0 }).position).toBe(0);
  });
  it('treats a cleared Order field as invalid, not a silent 0', () => {
    const result = destinationSchema.safeParse({ ...valid, position: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Enter a number from 0 to 999');
    }
  });
  it('lists twelve months', () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toEqual({ value: 1, label: 'Jan' });
  });
});
