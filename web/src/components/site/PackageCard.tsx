import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { dealEnds, dealLabel } from '@/lib/deal';
import { duration, inr, isPriced } from '@/lib/format';
import { Photo } from './Photo';
import { DealStamp, Stamp } from './Stamp';

type Card = components['schemas']['PackageCard'];

export function PackageCard({ card }: { card: Card }) {
  const deal = card.deal;
  return (
    <Link
      href={`/packages/${card.slug}`}
      className="grid grid-rows-[auto_1fr] overflow-hidden rounded-card border border-line bg-bg no-underline transition-[transform,box-shadow] duration-500 ease-(--ease-out) hover:-translate-y-1 hover:shadow-lift"
    >
      {card.coverUrl ? (
        <Photo
          src={card.coverUrl}
          alt=""
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/10]"
        >
          {deal ? <DealStamp label={dealLabel(deal)} /> : <Stamp value={card.badge} />}
        </Photo>
      ) : (
        <div className="aspect-[16/10] bg-bg2" />
      )}
      <div className="grid content-start gap-2 p-4 pb-5">
        <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-mute">
          <span>
            {card.destination} · {duration(card.nights, card.days)}
          </span>
          <span className="capitalize">{card.themes.join(' · ')}</span>
        </div>
        <h3 className="text-xl leading-tight">{card.name}</h3>
        <p className="line-clamp-2 text-[13px] text-mute">{card.highlights[0]}</p>
        <div className="mt-1 flex items-end justify-between border-t border-line pt-3">
          <div>
            <small className="block text-xs font-semibold text-mute">
              From
              {deal && (
                <s className="num ml-1.5">
                  <span className="sr-only">was </span>
                  {inr(card.startingPricePaise)}
                </s>
              )}
            </small>
            <b className="num text-[22px] font-extrabold tracking-tight">
              {deal ? (
                <>
                  <span className="sr-only">now </span>
                  {inr(deal.pricePaise)}{' '}
                  <i className="text-[13px] font-semibold text-mute not-italic">/ person</i>
                </>
              ) : isPriced(card.startingPricePaise) ? (
                <>
                  {inr(card.startingPricePaise)}{' '}
                  <i className="text-[13px] font-semibold text-mute not-italic">/ person</i>
                </>
              ) : (
                'On request'
              )}
            </b>
            {deal && <small className="block text-xs font-bold text-warn">{dealEnds(deal)}</small>}
          </div>
          <span className="rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-bold text-white">
            View trip
          </span>
        </div>
      </div>
    </Link>
  );
}
