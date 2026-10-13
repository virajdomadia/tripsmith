'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * "The route draws itself" (docs/04-ui-mockups.md, The showcase): the itinerary's vertical rule
 * grows with scroll, and each day marker lights up as the line reaches it. Server markup ships
 * fully lit (`is-lit` on every day) so no-JS and reduced-motion readers see the finished state;
 * this only runs when motion is allowed. The matchMedia is reverted on unmount.
 *
 * P19: GSAP is fetched only when the itinerary comes near the viewport, not with the page. It
 * was ~40 kB of the package page's first load, and PageSpeed charges everything requested before
 * the hero paints to the LCP.
 */
export function ItineraryMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scope.current;
    if (!root || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    let cancelled = false;
    let revert: (() => void) | undefined;

    const start = async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const route = root.querySelector<HTMLElement>('[data-route]');
      const days = Array.from(root.querySelectorAll<HTMLElement>('[data-day]'));
      if (!route || days.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        days.forEach((d) => d.classList.remove('is-lit'));
        gsap.fromTo(
          route,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top 70%', end: 'bottom 70%', scrub: 0.4 },
          },
        );
        days.forEach((day) =>
          ScrollTrigger.create({
            trigger: day,
            start: 'top 70%',
            onEnter: () => day.classList.add('is-lit'),
            onLeaveBack: () => day.classList.remove('is-lit'),
          }),
        );
        // A reader who already scrolled past some days sees them lit, not blanked.
        ScrollTrigger.refresh();
      });
      revert = () => mm.revert();
    };

    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        void start();
      },
      { rootMargin: '600px 0px' },
    );
    near.observe(root);
    return () => {
      cancelled = true;
      near.disconnect();
      revert?.();
    };
  }, []);

  return <div ref={scope}>{children}</div>;
}
