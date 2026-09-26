import type { components } from '@/lib/api-types';
import { MONTHS } from '@/lib/format';

export type Rating = components['schemas']['RatingOut'];
export type PublicReview = components['schemas']['PublicReview'];
export type PublicReviewPage = components['schemas']['PublicReviewPage'];
export type AccountReview = components['schemas']['AccountReview'];
export type ReviewState = components['schemas']['ReviewState'];

/** api schemas/reviews.py TEXT_MIN / TEXT_MAX, counted in code points after trimming. */
export const REVIEW_MIN = 20;
export const REVIEW_MAX = 1000;

/** api scripts/seed.py DEMO_EMAIL: the seeded customer with two completed trips (B13). */
export const DEMO_TRAVELLER = 'traveller.demo@example.com';

export const reviewLength = (text: string) => [...text.trim()].length;

/** `2026-11-20` → `Travelled Nov 2026` */
export function travelled(iso: string): string {
  const [y, m] = iso.split('-');
  return `Travelled ${MONTHS[Number(m) - 1]} ${y}`;
}

export const reviewsCount = (n: number) => (n === 1 ? '1 review' : `${n} reviews`);

/** What the customer sees about their own review. */
export const STATE_LABEL: Record<ReviewState, string> = {
  pending: 'Waiting for approval',
  published: 'Published',
  hidden: 'Not published',
};

export const RATING_WORDS = ['', 'Poor', 'Below par', 'Good', 'Very good', 'Excellent'] as const;
