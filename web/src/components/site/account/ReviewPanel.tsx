'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { control } from '@/components/site/enquiry/Field';
import { Stars } from '@/components/site/Stars';
import { istDay, sendReview } from '@/lib/account';
import { formatDate } from '@/lib/format';
import {
  type AccountReview,
  RATING_WORDS,
  REVIEW_MAX,
  REVIEW_MIN,
  reviewLength,
  STATE_LABEL,
} from '@/lib/reviews';

const TONE = {
  pending: 'bg-warn-soft text-warn',
  published: 'bg-ok-soft text-ok',
  hidden: 'bg-bg2 text-mute',
} as const;

/**
 * The booking page's review block (R21, B13). Shown only for a completed trip: the form while it
 * has no review, then the review itself with its state. A review is final once sent — the form
 * says so — and stays off the package page until the owner publishes it.
 */
export function ReviewPanel({
  bookingRef,
  packageName,
  review,
  canReview,
}: {
  bookingRef: string;
  packageName: string;
  review: AccountReview | null;
  canReview: boolean;
}) {
  if (!review && !canReview) return null;
  return (
    <section
      className="grid gap-3 rounded-card border border-line p-5"
      aria-labelledby="review-title"
    >
      <h2 id="review-title" className="text-[18px]">
        {review ? 'Your review' : 'How was the trip?'}
      </h2>
      {review ? (
        <Sent review={review} />
      ) : (
        <ReviewForm bookingRef={bookingRef} name={packageName} />
      )}
    </section>
  );
}

function Sent({ review }: { review: AccountReview }) {
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Stars value={review.rating} />
        <span className={`rounded-chip px-2.5 py-0.5 text-[12px] font-bold ${TONE[review.state]}`}>
          {STATE_LABEL[review.state]}
        </span>
      </div>
      <p className="border-l-2 border-line pl-2.5 text-[15px] whitespace-pre-line">{review.text}</p>
      <p className="text-[13px] text-mute">
        Sent {formatDate(istDay(review.createdAt))}.{' '}
        {review.state === 'pending'
          ? 'We read every review before it goes on the trip’s page.'
          : review.state === 'published'
            ? 'It’s on the trip’s page — thank you.'
            : 'It isn’t shown on the trip’s page.'}
      </p>
    </div>
  );
}

function ReviewForm({ bookingRef, name }: { bookingRef: string; name: string }) {
  const router = useRouter();
  const id = useId();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const length = reviewLength(text);
  const shown = hover || rating;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!rating) return setError('Pick a rating — one to five stars.');
    if (length < REVIEW_MIN)
      return setError(`Tell other travellers a little more — at least ${REVIEW_MIN} characters.`);
    setBusy(true);
    setError(null);
    const res = await sendReview(bookingRef, rating, text.trim());
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <p className="text-[14px] text-ink2">
        Your review helps the next traveller choose {name}. It appears with your first name and last
        initial once we’ve read it.
      </p>
      <fieldset className="grid gap-1.5">
        <legend className="label-caps mb-1.5 text-mute">Your rating</legend>
        <div className="flex items-center gap-3" onMouseLeave={() => setHover(0)}>
          <div className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                onMouseEnter={() => setHover(n)}
                className="cursor-pointer rounded-md px-0.5 text-[30px] leading-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
              >
                <input
                  type="radio"
                  name={`${id}-rating`}
                  value={n}
                  checked={rating === n}
                  onChange={() => {
                    setRating(n);
                    setError(null);
                  }}
                  className="sr-only"
                />
                <span aria-hidden className={n <= shown ? 'text-star' : 'text-line'}>
                  ★
                </span>
                <span className="sr-only">
                  {n} {n === 1 ? 'star' : 'stars'} — {RATING_WORDS[n]}
                </span>
              </label>
            ))}
          </div>
          <span className="num text-[15px] font-bold" aria-hidden>
            {shown ? `${shown} · ${RATING_WORDS[shown]}` : ''}
          </span>
        </div>
      </fieldset>
      <label htmlFor={`${id}-text`} className="label-caps text-mute">
        Your review
      </label>
      <textarea
        id={`${id}-text`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={REVIEW_MAX}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        placeholder="What stood out — the stays, the guide, the pace, what you’d tell a friend"
        className={`${control} resize-y text-[15px]`}
      />
      <p id={`${id}-hint`} className="flex justify-between gap-3 text-xs text-mute">
        <span className={error ? 'font-semibold text-warn' : ''} role={error ? 'alert' : undefined}>
          {error ?? 'Reviews can’t be changed once sent.'}
        </span>
        <span className="num shrink-0">
          {length}/{REVIEW_MAX}
        </span>
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded-btn bg-primary px-4 py-3 font-bold text-white transition-colors hover:bg-primary-ink disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send review'}
      </button>
    </form>
  );
}
