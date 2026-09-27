'use client';

import Image, { type StaticImageData } from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export type PostcardPhoto = { src: StaticImageData; alt: string; place: string; region: string };

/**
 * Sign in B · Postcard (R59, P20): the page is one real destination photo, captioned like the
 * storefront, with thumbs that cross-fade to the others. Decoration only: the form works the
 * same with JavaScript off (the first photo stays).
 */
export function Postcard({ photos }: { photos: readonly PostcardPhoto[] }) {
  const [on, setOn] = useState(0);
  const shown = photos[on]!;
  return (
    <>
      <div aria-hidden className="absolute inset-0 max-lg:bottom-auto max-lg:h-[340px]">
        {photos.map((p, i) => (
          <Image
            key={p.place}
            src={p.src}
            alt=""
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? 'high' : 'auto'}
            placeholder="blur"
            sizes="100vw"
            className={cn(
              'object-cover transition-[opacity,transform] duration-[900ms] motion-reduce:transition-none',
              i === on ? 'scale-100 opacity-100' : 'scale-[1.04] opacity-0',
            )}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,20,28,.25),rgba(12,20,28,.2)_45%,rgba(12,20,28,.7)),linear-gradient(transparent_55%,rgba(12,20,28,.75))]" />
      </div>
      <div className="relative grid justify-items-start gap-1">
        <p className="max-w-[16ch] text-[26px] leading-[1.05] font-extrabold tracking-[-0.03em] [text-shadow:0_2px_20px_rgba(0,0,0,.35)] lg:text-[34px]">
          {shown.place}
        </p>
        <p className="mb-2.5 text-sm font-semibold text-white/85">{shown.region}</p>
        <div role="group" aria-label="Change the photo" className="flex gap-2">
          {photos.map((p, i) => (
            <button
              key={p.place}
              type="button"
              aria-pressed={i === on}
              aria-label={p.alt}
              onClick={() => setOn(i)}
              className={cn(
                'relative h-[42px] w-[58px] overflow-hidden rounded-[10px] border-2 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none',
                i === on ? 'border-action' : 'border-white/35',
              )}
            >
              <Image src={p.src} alt="" fill sizes="58px" className="object-cover" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
