'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef, type ReactNode } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * "The route draws itself" (docs/04-ui-mockups.md, The showcase): the itinerary's vertical rule
 * grows with scroll, and each day marker lights up as the line reaches it. Server markup ships
 * fully lit (`is-lit` on every day) so no-JS and reduced-motion readers see the finished state;
 * this only runs when motion is allowed. The matchMedia is created inside the useGSAP context,
 * so it is reverted with it on unmount.
 */
export function ItineraryMotion({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
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
      });
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
