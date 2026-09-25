'use client';

import gsap from 'gsap';
import { useEffect, useRef } from 'react';
import { inr } from '@/lib/format';

/**
 * The total counts to its new value when the quote changes (B0 "price counter motion") and
 * flashes the ocean ink for a beat, so a re-quote is seen as well as read. The DOM text is
 * written by the tween, not by React, between renders; the accessible value is a separate
 * sr-only copy of the final one, so a screen reader never hears the numbers roll past. Reduced
 * motion: it jumps.
 */
export function AnimatedPrice({ paise, className }: { paise: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(paise);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const from = shown.current;
    shown.current = paise;
    if (from === paise) {
      node.textContent = inr(paise);
      return;
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      node.textContent = inr(paise);
      return;
    }
    const state = { v: from };
    const tween = gsap.to(state, {
      v: paise,
      duration: 0.7,
      ease: 'power3.out',
      onUpdate: () => {
        node.textContent = inr(Math.round(state.v / 100) * 100);
      },
    });
    const flash = gsap.fromTo(
      node,
      { color: '#1b4fd8' },
      { color: 'currentColor', duration: 0.9, ease: 'power2.out', clearProps: 'color' },
    );
    return () => {
      tween.kill();
      flash.kill();
      node.textContent = inr(paise);
    };
  }, [paise]);

  return (
    <span className={`num ${className ?? ''}`}>
      <span ref={el} aria-hidden>
        {inr(paise)}
      </span>
      <span className="sr-only">{inr(paise)}</span>
    </span>
  );
}
