'use client';

import { useState } from 'react';
import type { PublicReview, PublicReviewPage } from '@/lib/reviews';
import { ReviewCard } from './ReviewCard';

/**
 * "Show more reviews": page 1 came with the package; each click reads the next six from
 * `GET /packages/{slug}/reviews` through the `/api` rewrite (a cached public read).
 */
export function MoreReviews({ slug, total }: { slug: string; total: number }) {
  const [items, setItems] = useState<PublicReview[]>([]);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function more() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(slug)}/reviews?page=${page + 1}`);
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as PublicReviewPage;
      setItems((have) => [...have, ...next.items.filter((r) => !have.some((h) => h.id === r.id))]);
      setPage(next.page);
      if (next.page >= next.totalPages || next.items.length === 0) setDone(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="More reviews">
          {items.map((r, i) => (
            <ReviewCard key={r.id} review={r} index={i + 2} />
          ))}
        </ul>
      )}
      {!done && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={more}
            disabled={busy}
            className="rounded-btn border-[1.5px] border-line px-4 py-2.5 text-sm font-bold transition-colors hover:border-ink disabled:opacity-50"
          >
            {busy ? 'Loading…' : `Show more reviews (${total} in all)`}
          </button>
          {error && (
            <span role="alert" className="text-sm font-semibold text-warn">
              Couldn’t load more — try again.
            </span>
          )}
        </div>
      )}
    </>
  );
}
