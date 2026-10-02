// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LeaderAvatar } from '../src/components/site/LeaderAvatar';
import { LeaderCard, otherLeaders } from '../src/components/site/leaders/LeaderCard';
import { DeparturesTable } from '../src/components/site/package/DeparturesTable';
import { ReviewCard } from '../src/components/site/package/ReviewCard';
import type { components } from '../src/lib/api-types';
import { leaderJsonLd } from '../src/lib/seo/leader-jsonld';

afterEach(cleanup);

type Departure = components['schemas']['DepartureOut'];
type Leader = components['schemas']['LeaderCardOut'];

const KAVYA: Leader = {
  slug: 'kavya-rawat',
  name: 'Kavya Rawat',
  photoUrl: null,
  languages: ['English', 'Hindi'],
  yearsLeading: 7,
  regions: ['Himachal', 'Rajasthan'],
  bio: 'Splits the year between pine forests and sand dunes.',
  funFact: 'Has a playlist for every road in Himachal.',
};
const TENZIN = { slug: 'tenzin-norbu', name: 'Tenzin Norbu', photoUrl: null };

const dep = (id: string, date: string, leader: Departure['leader']): Departure => ({
  id,
  date,
  seatsTotal: 16,
  seatsLeft: 10,
  guaranteed: false,
  priceDoublePaise: 5_999_00,
  priceTriplePaise: 5_499_00,
  priceChildPaise: 2_999_00,
  singleSupplementPaise: 2_000_00,
  badge: null,
  waiting: 0,
  waitlistOpen: false,
  leader,
});

const DEPS = [
  dep('a', '2099-11-06', { slug: KAVYA.slug, name: KAVYA.name, photoUrl: null }),
  dep('b', '2099-11-20', TENZIN),
  dep('c', '2099-12-04', TENZIN),
];

describe('the package page', () => {
  it('names the dates another leader leads, once per leader', () => {
    expect(otherLeaders(KAVYA, DEPS)).toEqual([
      { ref: TENZIN, dates: ['2099-11-20', '2099-12-04'] },
    ]);
    expect(otherLeaders(KAVYA, DEPS.slice(0, 1))).toEqual([]);
  });

  it('shows the card with its facts, fun fact and the other leader', () => {
    render(<LeaderCard leader={KAVYA} departures={DEPS} />);
    expect(screen.getByRole('heading', { name: 'Kavya Rawat' })).toBeTruthy();
    expect(screen.getByText('7 years leading trips')).toBeTruthy();
    expect(screen.getByText(/Has a playlist/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /More trips with Kavya/ }).getAttribute('href')).toBe(
      '/leaders/kavya-rawat',
    );
    expect(screen.getByRole('link', { name: 'Tenzin Norbu' }).getAttribute('href')).toBe(
      '/leaders/tenzin-norbu',
    );
    expect(screen.getByText(/leads these 20 Nov, 4 Dec departures/)).toBeTruthy();
  });

  it('puts the leader on each departure row', () => {
    render(<DeparturesTable departures={DEPS} />);
    expect(screen.getAllByText('Led by Kavya')).toHaveLength(1);
    expect(screen.getAllByText('Led by Tenzin')).toHaveLength(2);
  });
});

describe('reviews', () => {
  const review = {
    id: 'r1',
    rating: 5,
    text: 'Loved every minute of it.',
    name: 'Asha B.',
    travelled: '2026-11-20',
    createdAt: '2026-11-25T00:00:00Z',
  };

  it('links the leader, or only names one who is switched off', () => {
    render(
      <ul>
        <ReviewCard
          review={{ ...review, ledBy: { name: 'Tenzin Norbu', slug: 'tenzin-norbu' } }}
          index={0}
        />
        <ReviewCard
          review={{ ...review, id: 'r2', ledBy: { name: 'Old Leader', slug: null } }}
          index={1}
        />
      </ul>,
    );
    expect(screen.getByRole('link', { name: 'Tenzin Norbu' }).getAttribute('href')).toBe(
      '/leaders/tenzin-norbu',
    );
    expect(screen.queryByRole('link', { name: 'Old Leader' })).toBeNull();
    expect(screen.getByText(/Led by Old Leader/)).toBeTruthy();
  });
});

describe('the leader page', () => {
  it('describes a Person who leads trips for the agency, without a phone', () => {
    const ld = leaderJsonLd(KAVYA, 'https://x.test/leaders/kavya-rawat', 'https://x.test');
    expect(ld).toMatchObject({
      '@type': 'Person',
      name: 'Kavya Rawat',
      jobTitle: 'Trip leader',
      knowsLanguage: ['English', 'Hindi'],
      worksFor: { '@type': 'TravelAgency', url: 'https://x.test' },
    });
    expect(ld).not.toHaveProperty('telephone');
    expect(ld).not.toHaveProperty('image'); // a monogram is not a photo of them
  });

  it('draws a monogram when there is no photo', () => {
    const { container } = render(<LeaderAvatar leader={TENZIN} size={96} />);
    expect(container.querySelector('svg text')?.textContent).toBe('TN');
    expect(container.querySelector('img')).toBeNull();
  });
});
