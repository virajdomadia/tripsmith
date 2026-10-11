'use client';

import { MapPinned } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { dealEnds } from '@/lib/deal';
import { duration, formatDate, inr, priceOrOnRequest } from '@/lib/format';
import { setSaved, toast, useSaved } from '@/lib/saved';
import { SaveHeart } from '@/components/site/saved/SaveHeart';

type SavedTrip = components['schemas']['SavedTrip'];

/**
 * My trips · Saved (R39, P1): the account's saved trips, newest first, as compact rows in
 * TripRow's shape — photo, trip, today's from-price, the next date with seats, and the ♡ to
 * remove (with Undo). The list follows the save store, so a heart tapped here (or on another
 * card on this page) removes the row at once; Undo saves it again and it comes back.
 */
export function SavedTrips({ items }: { items: SavedTrip[] }) {
  const store = useSaved();
  // Before the store has asked the api, the server's list is the truth.
  const shown =
    store.mode === 'account' ? items.filter((i) => store.slugs.includes(i.card.slug)) : items;

  if (shown.length === 0)
    return (
      <section className="mt-8 grid justify-items-start gap-3 rounded-card border border-dashed border-line bg-bg2 p-8">
        <h2 className="text-[22px]">Nothing saved yet.</h2>
        <p className="max-w-[52ch] text-ink2">
          Tap ♡ on any trip to keep it here — on this account, on every device you sign in on.
        </p>
        <Link
          href="/packages"
          className="mt-1 rounded-btn bg-action px-5 py-3 font-bold text-ink no-underline transition-colors hover:bg-action-ink"
        >
          Browse trips
        </Link>
      </section>
    );

  return (
    <ol className="mt-6 grid gap-4" aria-label="Saved trips">
      {shown.map((item, i) => (
        <SavedRow key={item.card.slug} item={item} index={i} />
      ))}
    </ol>
  );
}

function SavedRow({ item, index }: { item: SavedTrip; index: number }) {
  const c = item.card;
  const next = item.nextDeparture;
  return (
    <li
      className="relative grid grid-cols-[72px_1fr_auto] gap-x-4 gap-y-3 rounded-card border border-line bg-bg p-4 animate-rise sm:grid-cols-[96px_1fr_auto_auto] sm:items-center"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <div className="relative size-[72px] overflow-hidden rounded-[14px] bg-bg2 sm:size-24">
        {c.coverUrl ? (
          <Image src={c.coverUrl} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <MapPinned className="absolute inset-0 m-auto size-7 text-mute" aria-hidden />
        )}
      </div>

      <div className="grid min-w-0 gap-1">
        <p className="text-[13px] font-semibold text-mute">
          {c.destination} · {duration(c.nights, c.days)}
        </p>
        <h2 className="text-[19px] leading-snug">
          <Link
            href={`/packages/${c.slug}`}
            className="text-ink no-underline after:absolute after:inset-0 after:rounded-card hover:underline"
          >
            {c.name}
          </Link>
        </h2>
        <p className="text-[14px] text-ink2">
          {next ? (
            <>
              Next: {formatDate(next.date)} ·{' '}
              <span className={next.seatsLeft <= 4 ? 'font-bold text-warn' : ''}>
                {next.seatsLeft} {next.seatsLeft === 1 ? 'seat' : 'seats'} left
              </span>
            </>
          ) : (
            <span className="text-mute">No dates on sale right now</span>
          )}
        </p>
      </div>

      <p className="num col-span-2 col-start-2 text-[14px] text-mute sm:col-span-1 sm:col-start-3 sm:text-right">
        From{' '}
        {c.deal ? (
          <>
            <s className="text-[13px]">
              <span className="sr-only">was </span>
              {inr(c.startingPricePaise)}
            </s>{' '}
            <b className="text-[17px] font-extrabold text-ink">
              <span className="sr-only">now </span>
              {inr(c.deal.pricePaise)}
            </b>
            <span className="block text-[12.5px] font-semibold text-warn">{dealEnds(c.deal)}</span>
          </>
        ) : (
          <b className="text-[17px] font-extrabold text-ink">
            {priceOrOnRequest(c.startingPricePaise)}
          </b>
        )}
      </p>

      <UnsaveHeart slug={c.slug} name={c.name} />
    </li>
  );
}

/** The row's ♡: removing says so, with Undo (which saves the trip again). */
function UnsaveHeart({ slug, name }: { slug: string; name: string }) {
  return (
    <div className="relative z-10 col-start-3 row-start-1 self-start sm:col-start-4 sm:self-center">
      <SaveHeart
        slug={slug}
        name={name}
        variant="bar"
        onToggled={(saved) => {
          if (!saved)
            toast({
              text: `Removed ${name}`,
              action: { label: 'Undo', run: () => void setSaved(slug, name, true) },
            });
        }}
      />
    </div>
  );
}
