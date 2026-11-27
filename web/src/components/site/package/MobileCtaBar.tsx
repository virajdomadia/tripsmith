import Link from 'next/link';
import { BookNowButton } from '@/components/site/booking/BookNow';
import { WhatsApp } from '@/components/site/home/icons';
import type { components } from '@/lib/api-types';
import { whatsappHref, whatsappInterest } from '@/lib/business';
import { enquireHref } from '@/lib/enquiry-form-state';
import { dealEnds } from '@/lib/deal';
import { inr, priceOrOnRequest } from '@/lib/format';

type PackageDetail = components['schemas']['PackageDetail'];

/**
 * Mockup `.cta-mobile` (F12): price, WhatsApp, Enquire and Book now (B5) when a date is on sale,
 * else Enquire. Review 2026-11-27 (M4): Enquire, the lower-commitment step, sits beside Book now;
 * Save is on the hero and the PDF in the itinerary, so they left the bar. Sticky to the bottom of the
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
    <div
      data-cta-bar
      className="sticky bottom-0 z-20 -mx-4 mt-10 flex items-center gap-2 border-t border-line bg-bg/95 px-4 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
    >
      <div className="mr-auto min-w-0 leading-tight">
        {pkg.deal ? (
          <>
            <b className="num block text-[20px] font-extrabold tracking-tight">
              <s className="mr-1 text-xs font-semibold text-mute">
                <span className="sr-only">was </span>
                {inr(pkg.startingPricePaise)}
              </s>
              <span className="sr-only">now </span>
              {inr(pkg.deal.pricePaise)}
            </b>
            <small className="text-xs font-bold text-warn">{dealEnds(pkg.deal)}</small>
          </>
        ) : (
          <>
            <b className="num block text-[20px] font-extrabold tracking-tight">
              {priceOrOnRequest(pkg.startingPricePaise)}
            </b>
            <small className="text-xs text-mute">per person</small>
          </>
        )}
      </div>
      <a
        href={whatsappHref(whatsappInterest(pkg.name, url))}
        target="_blank"
        rel="noopener"
        aria-label="Ask about this trip on WhatsApp"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-btn bg-wa text-white no-underline hover:brightness-105"
      >
        <WhatsApp className="size-5" />
      </a>
      {bookable ? (
        <>
          <Link
            href={enquireHref(pkg.slug)}
            className="inline-flex h-11 items-center rounded-btn border-[1.5px] border-line px-3 font-bold text-ink no-underline transition-colors hover:border-ink"
          >
            Enquire
          </Link>
          <BookNowButton
            fallbackHref={enquireHref(pkg.slug)}
            className="inline-flex h-11 items-center rounded-btn bg-action px-3.5 font-bold whitespace-nowrap text-ink no-underline transition-colors hover:bg-action-ink"
          />
        </>
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
