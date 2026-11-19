'use client';

import { WhatsApp } from '@/components/site/home/icons';
import { whatsappHref, whatsappInterest } from '@/lib/business';
import { useWhatsAppPage } from './WhatsAppContext';

/**
 * Site-wide floating WhatsApp button (mockup `.wa-fab`): bottom-right, above the safe area.
 * QA 2026-11-19: a round icon button now, not a labelled pill — the pill covered card text and
 * the footer's photo credit at 1440px. It is the bottom of a compact stack on the right, with the
 * trip-planner launcher (Concierge.tsx) right above it; the footer pads its foot by the stack's
 * height on phones so the last lines scroll clear (SiteFooter).
 * Pre-filled with the page's message when one is registered, else the generic opener; hidden by
 * CSS on pages that mark themselves (see WhatsAppPageMessage).
 */
export function WhatsAppFab() {
  const page = useWhatsAppPage();
  return (
    <a
      href={whatsappHref(page?.message ?? whatsappInterest())}
      target="_blank"
      rel="noopener"
      title="WhatsApp us"
      className="fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 grid size-12 place-items-center rounded-full bg-wa text-white no-underline shadow-[0_12px_28px_-10px_rgb(37_211_102/0.8)] transition-transform hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100 [main:has([data-whatsapp-fab=hidden])~&]:hidden lg:right-6 lg:bottom-6 lg:size-14"
    >
      <WhatsApp className="size-6 lg:size-7" />
      <span className="sr-only">WhatsApp</span>
    </a>
  );
}
