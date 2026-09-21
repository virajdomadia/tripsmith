'use client';

import { WhatsApp } from '@/components/site/home/icons';
import { whatsappHref, whatsappInterest } from '@/lib/business';
import { useWhatsAppPage } from './WhatsAppContext';

/**
 * Site-wide floating WhatsApp button (mockup `.wa-fab`): bottom-right, above the safe area.
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
      className="fixed right-4 [main:has([data-whatsapp-fab=hidden])~&]:hidden inline-flex bottom-[max(16px,env(safe-area-inset-bottom))] z-30 items-center gap-2 rounded-chip bg-wa py-3 pr-4.5 pl-3.5 font-bold text-white no-underline shadow-[0_12px_28px_-10px_rgb(37_211_102/0.8)] transition-transform hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100 lg:right-6 lg:bottom-6"
    >
      <WhatsApp className="size-5.5" />
      WhatsApp
    </a>
  );
}
