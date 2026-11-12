import Link from 'next/link';
import { Photo } from '@/components/site/Photo';
import { Stamp } from '@/components/site/Stamp';
import type { ChatDeparture, ChatPackage } from '@/lib/concierge/types';
import { duration, inr, isPriced } from '@/lib/format';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-11-27` → `Fri 27 Nov` (UTC calendar day, so no timezone shift). */
export function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

const BTN =
  'inline-flex h-9 items-center rounded-[10px] border px-3 text-[13px] font-bold whitespace-nowrap no-underline transition-colors disabled:opacity-50';

/**
 * R26's package card for the chat: cover, name, nights, from-price, badge, "View" / "Check dates".
 * The listing card's anatomy at panel width; no ♡ or compare tick in a conversation.
 */
export function ChatPackageCards({
  packages,
  total,
  busy,
  onAsk,
  onNavigate,
}: {
  packages: ChatPackage[];
  total: number;
  busy: boolean;
  onAsk: (text: string) => void;
  onNavigate: () => void;
}) {
  return (
    <div className="grid gap-2.5">
      <ul className="grid gap-2.5" aria-label={`${packages.length} matching trips`}>
        {packages.map((p, i) => (
          <li
            key={p.slug}
            style={{ animationDelay: `${120 + i * 120}ms` }}
            className="animate-card-deal overflow-hidden rounded-card border border-line bg-bg"
          >
            {p.coverUrl ? (
              <Photo src={p.coverUrl} alt="" sizes="420px" className="aspect-[16/8]">
                <Stamp value={p.badge} seatsLeft={p.seatsLeft} />
              </Photo>
            ) : (
              <div className="aspect-[16/8] bg-bg2" />
            )}
            <div className="grid gap-1 px-3.5 pt-2.5 pb-3">
              <p className="text-[12.5px] font-semibold text-mute">
                {p.destination} · {duration(p.nights, p.days)}
                {p.themes.length > 0 && (
                  <span className="capitalize"> · {p.themes.slice(0, 2).join(' · ')}</span>
                )}
              </p>
              <h3 className="text-[17px] leading-tight">{p.name}</h3>
              {p.highlights[0] && (
                <p className="line-clamp-2 text-[13px] text-ink2">{p.highlights[0]}</p>
              )}
              <div className="mt-1.5 flex items-end justify-between gap-2 border-t border-line pt-2.5">
                <div className="leading-tight">
                  <small className="block text-[11.5px] font-semibold text-mute">
                    From
                    {p.wasPricePaise != null && (
                      <s className="num ml-1.5">
                        <span className="sr-only">was </span>
                        {inr(p.wasPricePaise)}
                      </s>
                    )}
                  </small>
                  <b className="num text-[20px] font-extrabold tracking-tight whitespace-nowrap">
                    {isPriced(p.fromPricePaise) ? (
                      <>
                        {inr(p.fromPricePaise)}{' '}
                        <i className="text-[12px] font-semibold text-mute not-italic">/ person</i>
                      </>
                    ) : (
                      'On request'
                    )}
                  </b>
                </div>
                <div className="flex gap-1.5">
                  <Link
                    href={p.url}
                    onClick={onNavigate}
                    aria-label={`View ${p.name}`}
                    className={`${BTN} border-line bg-bg text-ink hover:border-ink`}
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAsk(`Show dates for ${p.name}`)}
                    aria-label={`Check dates for ${p.name}`}
                    className={`${BTN} border-primary bg-primary text-white hover:bg-primary-ink`}
                  >
                    Check dates
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {total > packages.length && (
        <Link
          href="/packages"
          onClick={onNavigate}
          className="text-[13px] font-bold text-primary-ink"
        >
          {total - packages.length} more on the trips page →
        </Link>
      )}
    </div>
  );
}

/** R26's departure list: date, seats left, price, "Book". */
export function ChatDepartures({
  slug,
  name,
  coverUrl,
  departures,
  more,
  onNavigate,
}: {
  slug: string;
  name: string;
  coverUrl: string | null;
  departures: ChatDeparture[];
  more: number;
  onNavigate: () => void;
}) {
  // C3 swaps "Book" for the Book-now sheet opened pre-filled; until then, the trip's dates.
  const href = `/packages/${slug}#dates`;
  return (
    <div className="animate-card-deal overflow-hidden rounded-card border border-line bg-bg">
      <div className="flex items-center gap-2.5 border-b border-line p-2.5">
        {coverUrl && (
          <Photo src={coverUrl} alt="" sizes="56px" className="h-11 w-14 shrink-0 rounded-[9px]" />
        )}
        <div className="min-w-0 leading-tight">
          <b className="block truncate text-[14.5px]">{name}</b>
          <small className="text-[12px] text-mute">Live seats · per adult, twin sharing</small>
        </div>
      </div>
      <ul aria-label={`Dates for ${name}`}>
        {departures.map((d) => (
          <li
            key={d.departureId}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-line px-3 py-2.5 last:border-b-0"
          >
            <div className="leading-tight">
              <b className="num block text-[14.5px]">{dayLabel(d.date)}</b>
              <small
                className={`text-[12px] ${d.guaranteed ? 'font-bold text-ok' : d.seatsLeft <= 5 ? 'font-bold text-warn' : 'text-mute'}`}
              >
                {d.guaranteed ? 'Guaranteed · ' : ''}
                {d.seatsLeft > 0 ? `${d.seatsLeft} seats left` : 'Sold out'}
              </small>
            </div>
            <span className="num text-[14.5px] font-extrabold">
              {isPriced(d.pricePerPersonPaise) ? inr(d.pricePerPersonPaise) : 'On request'}
            </span>
            {d.seatsLeft > 0 ? (
              <Link
                href={href}
                onClick={onNavigate}
                aria-label={`Book ${dayLabel(d.date)}`}
                className={`${BTN} border-action bg-action text-ink hover:bg-action-ink`}
              >
                Book
              </Link>
            ) : (
              <span className="w-[54px]" />
            )}
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link
          href={href}
          onClick={onNavigate}
          className="block border-t border-line px-3 py-2 text-[13px] font-bold text-primary-ink"
        >
          {more} more {more === 1 ? 'date' : 'dates'} on the trip page →
        </Link>
      )}
    </div>
  );
}
