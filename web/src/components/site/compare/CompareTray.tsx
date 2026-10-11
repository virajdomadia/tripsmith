'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { compareHref, MAX_COMPARE } from '@/lib/compare';
import { clearTray, removeFromTray, useCompareTray } from '@/lib/compare-tray';

/**
 * The compare tray (R39, P1b): a bar at the foot of the window once a trip is ticked, kept for
 * the life of the tab (sessionStorage) so it follows the visitor across pages. Up to three
 * thumbnails, each removable, and "Compare (n)" → `/compare?p=…`. Hidden on `/compare` itself.
 *
 * Placement: centred from `lg`; on a phone it sits above the WhatsApp button, and above the
 * package page's sticky Book bar where there is one (`[data-cta-bar]`).
 */
export function CompareTray() {
  const { items, shake } = useCompareTray();
  const path = usePathname();
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!shake) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 600);
    return () => clearTimeout(t);
  }, [shake]);

  if (items.length === 0 || path === '/compare') return null;
  const ready = items.length >= 2;

  return (
    <section
      aria-label="Compare tray"
      data-compare-tray
      className={`fixed inset-x-3 bottom-[calc(max(16px,env(safe-area-inset-bottom))+64px)] z-30 mx-auto flex max-w-[640px] items-center gap-2.5 rounded-card border border-line bg-bg/97 p-2.5 shadow-lift backdrop-blur [main:has([data-cta-bar])~&]:bottom-[calc(max(10px,env(safe-area-inset-bottom))+70px)] lg:bottom-6 lg:[main:has([data-cta-bar])~&]:bottom-6 ${shaking ? 'animate-tray-shake' : 'animate-rise'}`}
    >
      <ul className="flex min-w-0 gap-1.5">
        {Array.from({ length: MAX_COMPARE }, (_, n) => {
          const item = items[n];
          if (!item)
            return (
              <li
                key={`empty-${n}`}
                aria-hidden
                className="hidden size-11 rounded-[10px] border-[1.5px] border-dashed border-line sm:block"
              />
            );
          return (
            <li key={item.slug} className="relative size-11 shrink-0">
              <span className="relative block size-11 overflow-hidden rounded-[10px] bg-bg2">
                {item.coverUrl && (
                  <Image src={item.coverUrl} alt="" fill sizes="44px" className="object-cover" />
                )}
              </span>
              <button
                type="button"
                onClick={() => removeFromTray(item.slug)}
                aria-label={`Remove ${item.name} from compare`}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-[11px] leading-none font-bold text-white"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hidden min-w-0 flex-1 text-[13px] leading-tight text-ink2 sm:block">
        {ready ? (
          <>
            <b className="text-ink">{items.length} trips</b> ready to compare
          </>
        ) : (
          'Tick one more trip to compare'
        )}
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={clearTray}
          className="h-11 rounded-btn px-2.5 text-[13px] font-bold text-mute hover:text-ink"
        >
          Clear
        </button>
        {ready ? (
          <Link
            href={compareHref(items.map((i) => i.slug))}
            className="inline-flex h-11 items-center rounded-btn bg-primary px-4 text-[14px] font-bold text-white no-underline transition-colors hover:bg-primary-ink"
          >
            Compare ({items.length})
          </Link>
        ) : (
          <span className="inline-flex h-11 items-center rounded-btn bg-bg2 px-4 text-[14px] font-bold text-mute">
            Compare ({items.length})
          </span>
        )}
      </div>
    </section>
  );
}
