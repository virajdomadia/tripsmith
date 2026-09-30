'use client';

import { useEffect, useRef, useState } from 'react';
import { errorFromResponse } from '@/lib/api-errors';
import type { Quote } from '@/lib/booking';

export type QuoteProblem = {
  message: string;
  /** A coupon refusal: the code is dropped and the quote asked again without it. */
  coupon: boolean;
  /** The manual discount's own problem (no room left, or a bad percent). */
  manual: string | null;
};

const DEBOUNCE_MS = 250;

/**
 * The receipt's live quote (`quoteCounterBooking`): asked 250 ms after the last change, the
 * older request aborted, so the receipt always matches the newest answer. A refusal keeps the
 * last good quote on screen, dimmed by the caller, with the api's own words.
 */
export function useCounterQuote(
  request: object | null,
  opts: { onCouponRefused: (message: string) => void },
) {
  const [quote, setQuote] = useState<{ key: string; quote: Quote } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<QuoteProblem | null>(null);
  const [loading, setLoading] = useState(false);
  const key = request ? JSON.stringify(request) : null;
  const onCoupon = useRef(opts.onCouponRefused);
  onCoupon.current = opts.onCouponRefused;

  useEffect(() => {
    if (!key) {
      setError(null);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/counter/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: key,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: ctl.signal,
        });
        const raw = await res.json().catch(() => undefined);
        if (ctl.signal.aborted) return;
        if (res.ok) {
          setQuote({ key, quote: raw as Quote });
          setError(null);
        } else {
          const err = errorFromResponse(res.status, res.statusText, raw);
          const reason = err.body.reason ?? '';
          const fields = err.body.fieldErrors ?? {};
          const manualField = Object.entries(fields).find(([k]) => k.startsWith('manual'));
          if (reason.startsWith('coupon_')) onCoupon.current(err.body.message);
          setError({
            message: manualField?.[1] ?? Object.values(fields)[0] ?? err.body.message,
            coupon: reason.startsWith('coupon_'),
            manual:
              reason === 'manual_no_room' || manualField
                ? (manualField?.[1] ?? err.body.message)
                : null,
          });
        }
      } catch {
        if (!ctl.signal.aborted)
          setError({
            message: 'Could not reach the server for a price — check the connection',
            coupon: false,
            manual: null,
          });
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key, nonce]);

  return {
    quote: key ? (quote?.quote ?? null) : null,
    error: key ? error : null,
    // Until the answer for this exact request is in, the one on screen is stale: not bookable.
    loading: loading || (!!key && quote?.key !== key && !error),
    requote: () => setNonce((n) => n + 1),
  };
}
