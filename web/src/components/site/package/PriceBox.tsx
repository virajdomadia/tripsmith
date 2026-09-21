import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { WhatsApp } from '@/components/site/home/icons';
import { BUSINESS, whatsappHref, whatsappInterest } from '@/lib/business';
import { enquireHref } from '@/lib/enquiry-form-state';
import { formatDate, inr } from '@/lib/format';
import { CANCELLATION_SCHEDULE } from '@/lib/policies';
import { ItineraryPdfLink } from '../ItineraryPdfLink';

type PackageDetail = components['schemas']['PackageDetail'];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Sticky price box (desktop): from-price, next departure, Enquire (F9), PDF (F11), WhatsApp (F12). */
export function PriceBox({ pkg, url }: { pkg: PackageDetail; url: string }) {
  const next = pkg.departures.find((d) => d.seatsLeft > 0) ?? pkg.departures[0];
  return (
    <div className="sticky top-24 grid gap-3 rounded-card border border-line bg-bg p-5.5 shadow-[0_30px_60px_-40px_rgb(20_32_42/0.35)]">
      <div className="text-[13px] font-semibold text-mute">
        From
        <b className="num block text-[34px] leading-tight tracking-tight text-ink">
          {pkg.startingPricePaise ? inr(pkg.startingPricePaise) : 'On request'}
        </b>
        per person, double sharing
      </div>
      {next && (
        <div className="grid gap-0.5 rounded-btn border-[1.5px] border-line px-3 py-2.5">
          <span className="label-caps">Next departure</span>
          <span className="flex justify-between font-bold">
            {formatDate(next.date)}
            <span className="num">
              {next.seatsLeft > 0
                ? next.seatsLeft === 1
                  ? '1 seat'
                  : `${next.seatsLeft} seats`
                : 'Sold out'}
            </span>
          </span>
        </div>
      )}
      <Link
        href={enquireHref(pkg.slug)}
        className="block rounded-btn bg-action px-5 py-3 text-center font-bold text-ink no-underline transition-colors hover:bg-action-ink"
      >
        Enquire about this trip
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <ItineraryPdfLink slug={pkg.slug} variant="button" label="Itinerary PDF" className="px-3" />
        <a
          href={whatsappHref(whatsappInterest(pkg.name, url))}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-line px-3 py-2.5 font-bold text-ink no-underline transition-colors hover:border-ink"
        >
          <WhatsApp className="size-4.5 text-wa" />
          WhatsApp
        </a>
      </div>
      <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-mute">
        A person calls you back within 2 hours, {BUSINESS.hours}. Nothing to pay online.
      </p>
      <p className="text-[13px] leading-relaxed text-mute">
        {CANCELLATION_SCHEDULE[0].window}: {cap(CANCELLATION_SCHEDULE[0].refund)}. One free date
        change up to 30 days out.{' '}
        <Link href="/cancellation-policy">Cancellation &amp; refunds</Link>
      </p>
    </div>
  );
}
