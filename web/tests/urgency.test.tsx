// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge, badgeText } from '../src/components/site/Badge';
import { Stamp } from '../src/components/site/Stamp';
import { ReviewCard } from '../src/components/site/package/ReviewCard';
import { Reviews } from '../src/components/site/package/Reviews';
import type { PublicReview } from '../src/lib/reviews';
import { lastBooked, proofLine, withOthers } from '../src/lib/urgency';

afterEach(cleanup);

describe('P2 urgency wording (R40)', () => {
  it('prints the exact seat count on Filling fast, never "few"', () => {
    expect(badgeText('filling-fast', 3)).toBe('Filling fast · 3 left');
    expect(badgeText('filling-fast')).toBe('Filling fast');
    expect(badgeText('likely-to-sell-out', 6)).toBe('Likely to sell out');
    expect(badgeText('sold-out', 0)).toBe('Sold out');
    render(<Badge value="filling-fast" seatsLeft={1} />);
    expect(screen.getByText('Filling fast · 1 left')).toBeTruthy();
  });

  it('stamps the count on a card', () => {
    render(<Stamp value="likely-to-sell-out" seatsLeft={6} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Likely to sell out 6 left');
  });

  it('names the last booking by IST day', () => {
    expect(lastBooked(0)).toBe('Booked today');
    expect(lastBooked(1)).toBe('Booked yesterday');
    expect(lastBooked(7)).toBe('Last booked 7 days ago');
  });

  it('says nothing without a fact from the api', () => {
    expect(proofLine(null)).toBeNull();
    expect(proofLine(undefined, 'both')).toBeNull();
    expect(proofLine({ recentBookings: null, lastBookedDays: null })).toBeNull();
  });

  it('shows one fact on cards (Booked wins) and both on the package page', () => {
    const both = { recentBookings: 5, lastBookedDays: 2 };
    expect(proofLine(both)).toBe('Booked 5× in the last 30 days');
    expect(proofLine(both, 'both')).toBe('Booked 5× in the last 30 days · last booked 2 days ago');
    expect(proofLine({ recentBookings: 3, lastBookedDays: 0 }, 'both')).toBe(
      'Booked 3× in the last 30 days · booked today',
    );
    expect(proofLine({ recentBookings: null, lastBookedDays: 1 }, 'both')).toBe('Booked yesterday');
    expect(proofLine({ recentBookings: 4, lastBookedDays: null }, 'both')).toBe(
      'Booked 4× in the last 30 days',
    );
  });
});

const review: PublicReview = {
  id: 'r1',
  rating: 5,
  text: 'Tents by the river, a great host.',
  name: 'Asha B.',
  travelled: '2026-11-06',
  party: 4,
  createdAt: '2026-11-12T10:00:00Z',
  ledBy: { name: 'Kavya Rawat', slug: 'kavya-rawat' },
};

describe('P4 verified review card (R42)', () => {
  it('counts the others in the party; a solo traveller gets no clause', () => {
    expect(withOthers(4)).toBe('with 3 others');
    expect(withOthers(2)).toBe('with 1 other');
    expect(withOthers(1)).toBeNull();
  });

  it('reads ★ · name · Verified traveller · Travelled · with N others · Led by', () => {
    render(
      <ul>
        <ReviewCard review={review} index={0} />
        <ReviewCard review={{ ...review, id: 'r2', party: 1, ledBy: null }} index={1} />
      </ul>,
    );
    const [group, solo] = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(group).toContain('Asha B.');
    expect(group).toContain('Verified traveller');
    expect(group).toContain('Travelled Nov 2026 · with 3 others');
    expect(group).toContain('Led by Kavya Rawat');
    expect(solo).toContain('Verified traveller');
    expect(solo).not.toContain('other');
  });

  it('says every review comes from a completed trip', () => {
    render(<Reviews slug="kasol" rating={{ avg: 4.5, count: 1 }} reviews={[review]} />);
    expect(
      screen.getByText('All reviews are from travellers who completed this trip'),
    ).toBeTruthy();
  });
});
