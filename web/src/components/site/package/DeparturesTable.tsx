'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/site/Badge';
import type { components } from '@/lib/api-types';
import { istToday } from '@/lib/booking';
import type { Deal } from '@/lib/deal';
import { afterDiscounts, type EarlyBird, tierFor, tierLabel } from '@/lib/early-bird';
import { formatDate, inr, isPriced, priceOrOnRequest } from '@/lib/format';

type Departure = components['schemas']['DepartureOut'];

/**
 * Seat bar + status pill per departure. The price is after the deal and (P17) the early-bird
 * tier the date earns today. The page is prerendered and the daily cron only rebuilds it within
 * the hour after IST midnight, so the table hydrates with the day it was built (`builtOn`, no
 * mismatch) and then re-reads the IST day: a tier or deal that ended at midnight leaves the
 * table at once, as it leaves the quote.
 */
export function DeparturesTable({
  departures,
  deal,
  earlyBird,
  builtOn,
}: {
  departures: Departure[];
  deal?: Deal | null;
  earlyBird?: EarlyBird | null;
  /** `istToday()` where the page was rendered. */
  builtOn?: string;
}) {
  const [today, setToday] = useState(() => builtOn ?? istToday());
  useEffect(() => setToday(istToday()), []);
  const running = deal && deal.endsOn >= today ? deal : null;
  if (departures.length === 0) {
    return (
      <p className="rounded-[14px] border border-line bg-bg2 p-5 text-mute">
        No fixed departures are open right now — dates on request.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-bg2 text-left">
            <th className="label-caps px-3.5 py-3">Departure</th>
            <th className="label-caps px-3.5 py-3">Per person</th>
            <th className="label-caps px-3.5 py-3">Seats</th>
            <th className="label-caps px-3.5 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((d) => {
            const fill = Math.max(0, Math.min(1, d.seatsLeft / d.seatsTotal));
            const low = d.seatsLeft > 0 && d.seatsLeft <= 4;
            const tier = tierFor(earlyBird, d.date, today);
            const price = afterDiscounts(d.priceDoublePaise, running, tier);
            return (
              <tr key={d.id} className="border-t border-line hover:bg-bg2/60">
                <td className="px-3.5 py-3 font-bold">
                  {formatDate(d.date)}
                  {tier && isPriced(d.priceDoublePaise) && (
                    <small className="mt-1 block w-fit rounded-chip bg-eb-soft px-2 py-0.5 text-[11.5px] font-extrabold whitespace-nowrap text-eb">
                      {tierLabel(tier)}
                    </small>
                  )}
                </td>
                {/* 0 is the api's "priced later" — a date parked before the rate is set. */}
                <td className="num px-3.5 py-3">
                  {price < d.priceDoublePaise && isPriced(d.priceDoublePaise) ? (
                    <>
                      <s className="mr-1.5 text-mute">
                        <span className="sr-only">was </span>
                        {inr(d.priceDoublePaise)}
                      </s>
                      <span className="sr-only">now </span>
                      <b>{inr(price)}</b>
                    </>
                  ) : (
                    priceOrOnRequest(d.priceDoublePaise)
                  )}
                </td>
                <td className="px-3.5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <i
                      aria-hidden
                      className="inline-block h-1.5 w-14 overflow-hidden rounded-chip bg-line"
                    >
                      <b
                        className={`block h-full rounded-chip ${low ? 'bg-warn' : 'bg-primary'}`}
                        style={{ width: `${fill * 100}%` }}
                      />
                    </i>
                    <span className="num">{d.seatsLeft > 0 ? `${d.seatsLeft} left` : '—'}</span>
                  </span>
                </td>
                <td className="px-3.5 py-3">
                  <Badge value={d.badge} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
