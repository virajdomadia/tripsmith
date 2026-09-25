import Link from 'next/link';
import { BookNowButton } from '@/components/site/booking/BookNow';
import { File, WhatsApp } from '@/components/site/home/icons';
import type { components } from '@/lib/api-types';
import { whatsappHref, whatsappInterest } from '@/lib/business';
import { enquireHref } from '@/lib/enquiry-form-state';
import { priceOrOnRequest } from '@/lib/format';
import { itineraryPdfHref } from '@/lib/pdf';

type PackageDetail = components['schemas']['PackageDetail'];

const ICON_BTN =
  'inline-flex h-11 items-center gap-1.5 rounded-btn border-[1.5px] border-line px-3 font-bold text-ink no-underline transition-colors hover:border-ink';

/**
 * Mockup `.cta-mobile` (F12): price · PDF · WhatsApp · Enquire (Book now from B5 when a date is
 * on sale — the enquiry form stays one tap away in the sheet and the page), sticky to the bottom of the
 * viewport while the page content is on screen. It is the last child of the page and `sticky`
 * rather than `fixed`, so it scrolls away with the footer and never covers anything. Full-bleed
 * through the Container's 16px gutters; hidden from `lg` where the PriceBox aside takes over.
 */
export function MobileCtaBar({
  pkg,
  url,
  bookable,
}: {
  pkg: PackageDetail;
  url: string;
  bookable: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-10 flex items-center gap-2 border-t border-line bg-bg/95 px-4 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
      <div className="mr-auto min-w-0 leading-tight">
        <b className="num block text-[20px] font-extrabold tracking-tight">
          {priceOrOnRequest(pkg.startingPricePaise)}
        </b>
        <small className="text-xs text-mute">per person</small>
      </div>
      <a
        href={itineraryPdfHref(pkg.slug)}
        target="_blank"
        rel="noopener"
        aria-label="Download itinerary (PDF)"
        className={ICON_BTN}
      >
        <File className="size-5 text-primary" />
        <span className="sr-only sm:not-sr-only">PDF</span>
      </a>
      <a
        href={whatsappHref(whatsappInterest(pkg.name, url))}
        target="_blank"
        rel="noopener"
        aria-label="Ask about this trip on WhatsApp"
        className={`${ICON_BTN} border-wa bg-wa text-white hover:border-wa hover:brightness-105`}
      >
        <WhatsApp className="size-5" />
        <span className="sr-only sm:not-sr-only">WhatsApp</span>
      </a>
      {bookable ? (
        <BookNowButton
          fallbackHref={enquireHref(pkg.slug)}
          className="inline-flex h-11 items-center rounded-btn bg-action px-4 font-bold whitespace-nowrap text-ink no-underline transition-colors hover:bg-action-ink"
        />
      ) : (
        <Link
          href={enquireHref(pkg.slug)}
          className="inline-flex h-11 items-center rounded-btn bg-action px-4.5 font-bold text-ink no-underline transition-colors hover:bg-action-ink"
        >
          Enquire
        </Link>
      )}
    </div>
  );
}
