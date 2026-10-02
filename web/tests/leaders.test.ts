import { describe, expect, it } from 'vitest';
import { leaderSchema, toInput } from '../src/lib/admin/leader-schema';
import {
  blankDeparture,
  packageSchema,
  toInput as packageInput,
} from '../src/lib/admin/package-schema';
import { initialsOf, joinTags, MONOGRAM_TONES, splitTags, toneOf } from '../src/lib/leaders';

describe('monogram', () => {
  it('takes the first and last initials', () => {
    expect(initialsOf("Rohan D'Souza")).toBe('RD');
    expect(initialsOf('  meera   nair ')).toBe('MN');
    expect(initialsOf('Tenzin')).toBe('T');
    expect(initialsOf('Ana Maria de Souza')).toBe('AS');
    expect(initialsOf('')).toBe('?');
  });

  it('keeps a colour per slug, spread over the six tones', () => {
    expect(toneOf('tenzin-norbu')).toBe(toneOf('tenzin-norbu'));
    const slugs = ['tenzin-norbu', 'kavya-rawat', 'meera-nair', 'rohan-dsouza', 'a', 'b', 'c'];
    for (const s of slugs) expect(MONOGRAM_TONES).toContain(toneOf(s));
    expect(new Set(slugs.map(toneOf)).size).toBeGreaterThan(2);
  });

  it('splits and joins comma-separated tags', () => {
    expect(splitTags(' English, Hindi ,, Ladakhi ')).toEqual(['English', 'Hindi', 'Ladakhi']);
    expect(joinTags(['English', 'Hindi'])).toBe('English, Hindi');
  });
});

const leader = {
  slug: 'tenzin-norbu',
  name: 'Tenzin Norbu',
  photoUrl: '',
  languages: 'English, Hindi',
  regions: 'Ladakh',
  yearsLeading: '11',
  bio: 'Grew up in Leh and paces every group for the altitude.',
  funFact: '',
  phone: '+91 98450 12345',
};

describe('leaderSchema', () => {
  it('produces the exact wire body', () => {
    expect(toInput(leaderSchema.parse(leader))).toEqual({
      slug: 'tenzin-norbu',
      name: 'Tenzin Norbu',
      photoUrl: null,
      languages: ['English', 'Hindi'],
      regions: ['Ladakh'],
      yearsLeading: 11,
      bio: 'Grew up in Leh and paces every group for the altitude.',
      funFact: '',
      phone: '+91 98450 12345',
    });
  });

  it('refuses empty tags, a short bio, a bad phone and bad years', () => {
    for (const bad of [
      { languages: ' , ' },
      { regions: 'x'.repeat(41) },
      { bio: 'Too short' },
      { phone: 'call me' },
      { yearsLeading: '' },
      { yearsLeading: '61' },
    ]) {
      expect(leaderSchema.safeParse({ ...leader, ...bad }).success).toBe(false);
    }
  });
});

describe('package editor leaders', () => {
  it("sends null for no leader and for a date on the package's default", () => {
    const values = packageSchema.parse({
      slug: 'konkan-coast',
      destinationId: 'd-goa',
      name: 'Konkan Coast',
      summary: 'Three slow nights on the Konkan coast with one free beach day and a fort sunset.',
      themes: [],
      nights: 3,
      departureCity: 'Ex-Mumbai',
      highlights: [],
      inclusions: [],
      exclusions: [],
      hotels: [],
      faq: [],
      featured: false,
      depositOn: true,
      itinerary: [],
      departures: [
        { ...blankDeparture(), date: '2030-01-10' },
        { ...blankDeparture(), date: '2030-02-10', leaderId: 'L2' },
      ],
      addons: [],
      leaderId: '',
    });
    const body = packageInput(values);
    expect(body.leaderId).toBeNull();
    expect(body.departures?.map((d) => d.leaderId)).toEqual([null, 'L2']);
    expect(packageInput(packageSchema.parse({ ...values, leaderId: 'L1' })).leaderId).toBe('L1');
  });
});
