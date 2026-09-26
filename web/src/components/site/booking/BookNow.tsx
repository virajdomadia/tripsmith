'use client';

import dynamic from 'next/dynamic';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import type { BookingPackage } from './use-booking';

/*
 * The Book-now sheet's code is fetched on first intent (hover, focus or touch on a Book now
 * button), not with the package page: most visitors only read, and the page's first-load JS is
 * the TBT budget H2 flagged. The Razorpay script is later still — on Pay (lib/razorpay-checkout).
 */
const loadSheet = () => import('./BookingSheet');
const BookingSheet = dynamic(() => loadSheet().then((m) => m.BookingSheet), { ssr: false });

/**
 * Runs `fn` once the page has loaded and the browser is idle (at most 1.5 s after load), and
 * returns the cancel. `#book` opens the sheet this way so its code is not fetched while the
 * hero photo — the page's LCP — is still downloading and painting (B14: PSI mobile measured
 * the sheet's chunks adding ~0.9 s to LCP when fetched on hydration).
 */
export function afterLoad(fn: () => void): () => void {
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(fn, { timeout: 1500 });
    else timer = setTimeout(fn, 1);
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
  return () => {
    window.removeEventListener('load', run);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) clearTimeout(timer);
  };
}

type Ctx = { open: () => void; prefetch: () => void; hydrated: boolean };
const BookNowContext = createContext<Ctx | null>(null);

/**
 * Wraps the package page so both entry points — the desktop PriceBox and the phone's sticky
 * bar — open the one sheet, whose state (date, party, contact) survives closing it. `#book` in
 * the URL opens it on arrival, once the page has loaded (`afterLoad`).
 */
export function BookNowProvider({ pkg, children }: { pkg: BookingPackage; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Set once the visitor opens the sheet: a late `#book` auto-open must not reopen one they closed.
  const touched = useRef(false);

  useEffect(() => {
    setHydrated(true);
    if (window.location.hash !== '#book') return;
    return afterLoad(() => {
      if (touched.current) return;
      setMounted(true);
      setOpen(true);
    });
  }, []);

  const value: Ctx = {
    hydrated,
    prefetch: () => void loadSheet(),
    open: () => {
      touched.current = true;
      setMounted(true);
      setOpen(true);
    },
  };

  return (
    <BookNowContext.Provider value={value}>
      {children}
      {mounted && <BookingSheet pkg={pkg} open={open} onOpenChange={setOpen} />}
    </BookNowContext.Provider>
  );
}

/**
 * "Book now" once JavaScript runs; before that — and for anyone without it — a plain link to
 * the enquiry form labelled "Enquire to book" (R14), since paying needs Checkout.js anyway.
 */
export function BookNowButton({
  fallbackHref,
  className,
}: {
  fallbackHref: string;
  className: string;
}) {
  const ctx = useContext(BookNowContext);
  if (!ctx?.hydrated)
    return (
      <a href={fallbackHref} className={className}>
        Enquire to book
      </a>
    );
  return (
    <button
      type="button"
      onClick={ctx.open}
      onPointerEnter={ctx.prefetch}
      onFocus={ctx.prefetch}
      onTouchStart={ctx.prefetch}
      className={className}
    >
      Book now
    </button>
  );
}
