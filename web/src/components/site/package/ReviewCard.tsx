import { BadgeCheck } from 'lucide-react';
import Link from 'next/link';
import { Stars } from '@/components/site/Stars';
import { type PublicReview, travelled } from '@/lib/reviews';
import { withOthers } from '@/lib/urgency';

const TILT = ['-rotate-[0.4deg]', 'rotate-[0.5deg]', '-rotate-[0.3deg]', 'rotate-[0.3deg]'];

/**
 * One published review: a notepaper card with tape, like the home page's testimonials. P4
 * (R42): ★ · name · ✓ Verified traveller · Travelled <Mon YYYY> · with N others · Led by X. Every
 * review hangs off a completed booking, so the label is automatic — never an owner's toggle.
 */
export function ReviewCard({ review: r, index }: { review: PublicReview; index: number }) {
  const others = withOthers(r.party ?? 1);
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
        <b className="text-ink">{r.name}</b>
        <span className="mx-1.5 inline-flex items-center gap-1 font-semibold whitespace-nowrap text-ok">
          <BadgeCheck aria-hidden className="size-3.5" />
          Verified traveller
        </span>
        <span className="block sm:inline">
          {travelled(r.travelled)}
          {others && ` · ${others}`}
          {r.ledBy && (
            // P3 (R41): the leader of the date travelled; a switched-off leader is named, unlinked.
            <>
              {' · Led by '}
              {r.ledBy.slug ? (
                <Link href={`/leaders/${r.ledBy.slug}`} className="font-semibold text-ink">
                  {r.ledBy.name}
                </Link>
              ) : (
                r.ledBy.name
              )}
            </>
          )}
        </span>
      </p>
    </li>
  );
}
