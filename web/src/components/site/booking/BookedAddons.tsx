import type { ReactNode } from 'react';
import type { components } from '@/lib/api-types';
import { addonDetail, type Quote } from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';

type BookedAddon = components['schemas']['BookedAddon'];

/** The IST day of a timestamp, `YYYY-MM-DD` (what `formatDate` reads). */
const istDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * A booking's add-ons (R46, P8) where the price is shown — My trips and the owner's booking:
 * the trip fare after its discounts (from the quote), then every add-on the booking has had, at
 * full price — bought with the booking, added later (P8b, with the day), or taken off by the
 * owner and refunded (struck through). `action` puts a control beside a row (the desk's Remove).
 * Nothing is added up here; the total below it is the booking's own. Renders nothing without
 * add-ons.
 */
export function BookedAddons({
  quote,
  addons,
  action,
}: {
  quote: Quote;
  addons: BookedAddon[];
  action?: (a: BookedAddon) => ReactNode;
}) {
  if (!addons.length) return null;
  return (
    <>
      <div className="mt-0.5 flex justify-between gap-3 border-t border-line pt-1.5 font-bold">
        <span>Trip fare</span>
        <span className="num">{inr(quote.totalPaise - (quote.addonsPaise ?? 0))}</span>
      </div>
      <p className="label-caps mt-1 text-[11px] text-mute">Add-ons · no discounts apply</p>
      {addons.map((a) => {
        const gone = !!a.removedAt;
        return (
          <div key={a.id} className="flex items-start justify-between gap-3">
            <span className={gone ? 'text-mute' : 'text-ink2'}>
              <span className={gone ? 'line-through' : undefined}>
                {a.name} · {addonDetail(a)}
              </span>
              {gone ? (
                <small className="block text-[12px] font-semibold text-mute">
                  Taken off {formatDate(istDay(a.removedAt!))} · refunded
                </small>
              ) : (
                a.addedLater && (
                  <small className="block text-[12px] font-semibold text-primary-ink">
                    Added {formatDate(istDay(a.addedAt))}
                  </small>
                )
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className={`num ${gone ? 'text-mute line-through' : ''}`}>
                {inr(a.amountPaise)}
              </span>
              {!gone && action?.(a)}
            </span>
          </div>
        );
      })}
    </>
  );
}
