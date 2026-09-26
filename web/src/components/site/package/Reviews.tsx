import { Stars } from '@/components/site/Stars';
import { type PublicReview, type Rating, reviewsCount } from '@/lib/reviews';
import { MoreReviews } from './MoreReviews';
import { ReviewCard } from './ReviewCard';

/**
 * The package page's reviews (R21): the aggregate — published reviews only, never the home
 * page's testimonials — then the newest six as notepaper cards (the testimonial look), and a
 * button for the rest. Not rendered at all while nothing is published.
 */
export function Reviews({
  slug,
  rating,
  reviews,
}: {
  slug: string;
  rating: Rating;
  reviews: PublicReview[];
}) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="num text-[44px] leading-none font-extrabold tracking-tight">
          {rating.avg.toFixed(1)}
        </span>
        <span className="grid gap-1">
          <Stars
            value={rating.avg}
            number={null}
            label={`Rated ${rating.avg.toFixed(1)} out of 5`}
            className="text-lg"
          />
          <span className="text-sm text-mute">
            {reviewsCount(rating.count)} from travellers who went
          </span>
        </span>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {reviews.map((r, i) => (
          <ReviewCard key={r.id} review={r} index={i} />
        ))}
      </ul>
      {rating.count > reviews.length && <MoreReviews slug={slug} total={rating.count} />}
    </div>
  );
}
