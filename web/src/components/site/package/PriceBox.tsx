import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { formatDate, inr } from '@/lib/format';
import { CANCELLATION_SCHEDULE } from '@/lib/policies';

type PackageDetail = components['schemas']['PackageDetail'];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Sticky price box (desktop). Informational until the CTAs land (F11 PDF, F12 Enquire/WhatsApp). */
export function PriceBox({ pkg }: { pkg: PackageDetail }) {
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
              {next.seatsLeft > 0 ? `${next.seatsLeft} seats` : 'Sold out'}
            </span>
          </span>
        </div>
      )}
      <p className="border-t border-line pt-3 text-[13px] leading-relaxed text-mute">
        Enquiries open soon — a person calls you back within 2 hours, 10 am – 8 pm IST. Nothing to
        pay online.
      </p>
      <p className="text-[13px] leading-relaxed text-mute">
        {CANCELLATION_SCHEDULE[0].window}: {cap(CANCELLATION_SCHEDULE[0].refund)}. One free date
        change up to 30 days out.{' '}
        <Link href="/cancellation-policy">Cancellation &amp; refunds</Link>
      </p>
    </div>
  );
}
