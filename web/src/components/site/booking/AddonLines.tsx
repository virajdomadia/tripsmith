import { addonDetail, type Quote } from '@/lib/booking';
import { inr } from '@/lib/format';

/**
 * A booked quote's add-ons (R46, P8), for the pages that show what was paid for — My trips and
 * the owner's booking: the trip fare after its discounts, then each add-on at full price. The
 * numbers are the snapshot's; nothing is added up here. Renders nothing without add-ons.
 */
export function AddonLines({ quote }: { quote: Quote }) {
  // `?? []`: a snapshot served by an api from before P8 (the web/api deploy race) has none.
  const addons = quote.addons ?? [];
  if (!addons.length) return null;
  return (
    <>
      <div className="mt-0.5 flex justify-between gap-3 border-t border-line pt-1.5 font-bold">
        <span>Trip fare</span>
        <span className="num">{inr(quote.totalPaise - (quote.addonsPaise ?? 0))}</span>
      </div>
      <p className="label-caps mt-1 text-[11px] text-mute">Add-ons · no discounts apply</p>
      {addons.map((a) => (
        <div key={a.addonId ?? a.name} className="flex justify-between gap-3">
          <span className="text-ink2">
            {a.name} · {addonDetail(a)}
          </span>
          <span className="num">{inr(a.amountPaise)}</span>
        </div>
      ))}
    </>
  );
}
