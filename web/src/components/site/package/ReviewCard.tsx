import { Stars } from '@/components/site/Stars';
import { type PublicReview, travelled } from '@/lib/reviews';

const TILT = ['-rotate-[0.4deg]', 'rotate-[0.5deg]', '-rotate-[0.3deg]', 'rotate-[0.3deg]'];

/** One published review: a notepaper card with tape, like the home page's testimonials. */
export function ReviewCard({ review: r, index }: { review: PublicReview; index: number }) {
  return (
    <li
      className={`relative grid content-start gap-2.5 rounded-[12px] border border-line bg-bg p-5 shadow-[0_16px_34px_-22px_rgb(20_32_42/0.35)] ${TILT[index % TILT.length]}`}
    >
      <span
        aria-hidden
        className="absolute -top-2.5 left-8 h-[20px] w-[62px] -rotate-3 rounded-[2px] bg-action/45"
      />
      <Stars value={r.rating} className="text-[14px]" />
      <p className="text-[15px] whitespace-pre-line">{r.text}</p>
      <p className="text-[13px] text-mute">
        <b className="text-ink">{r.name}</b> · {travelled(r.travelled)}
      </p>
    </li>
  );
}
