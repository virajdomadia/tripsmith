'use client';

import dynamic from 'next/dynamic';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { BookingPackage } from './use-booking';

/*
 * The Book-now sheet's code is fetched on first intent (hover, focus or touch on a Book now
 * button), not with the package page: most visitors only read, and the page's first-load JS is
 * the TBT budget H2 flagged. The Razorpay script is later still — on Pay (lib/razorpay-checkout).
 */
const loadSheet = () => import('./BookingSheet');
const BookingSheet = dynamic(() => loadSheet().then((m) => m.BookingSheet), { ssr: false });

type Ctx = { open: () => void; prefetch: () => void; hydrated: boolean };
const BookNowContext = createContext<Ctx | null>(null);

/**
 * Wraps the package page so both entry points — the desktop PriceBox and the phone's sticky
 * bar — open the one sheet, whose state (date, party, contact) survives closing it. `#book` in
 * the URL opens it on arrival.
 */
export function BookNowProvider({ pkg, children }: { pkg: BookingPackage; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (window.location.hash === '#book') {
      setMounted(true);
      setOpen(true);
    }
  }, []);

  const value: Ctx = {
    hydrated,
    prefetch: () => void loadSheet(),
    open: () => {
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
