'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Photo } from '@/components/site/Photo';
import type { components } from '@/lib/api-types';

type ImageOut = components['schemas']['ImageOut'];

const GRID_MAX = 5; // cells on sm+
const GRID_MAX_PHONE = 3; // cells ≥ 3 are hidden below sm

/**
 * The S5 gallery: one tall cell + four small on desktop, three cells on phones; every cell and
 * the "+N photos" chip open the lightbox. The lightbox is a native `<dialog>` (focus trap, Escape,
 * backdrop) so there is no library and no scroll-lock code.
 */
export function Gallery({ images }: { images: ImageOut[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const open = useCallback((i: number) => setIndex(i), []);
  const close = useCallback(() => setIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setIndex((i) => (i === null ? i : (i + delta + images.length) % images.length)),
    [images.length],
  );

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (index !== null && !el.open) el.showModal();
    if (index === null && el.open) el.close();
  }, [index]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, step]);

  if (images.length < 2) return null;
  // The cover is the hero already; the grid starts from the second photo (lightbox has them all).
  const grid = images.slice(1, 1 + GRID_MAX).map((img, i) => ({ img, index: i + 1 }));
  // "+N photos" counts what the viewer cannot see at their breakpoint (cover excluded).
  const extraDesktop = images.length - 1 - grid.length;
  const extraPhone = images.length - 1 - Math.min(grid.length, GRID_MAX_PHONE);
  const chip = (n: number) => `+ ${n} ${n === 1 ? 'photo' : 'photos'}`;
  const current = index === null ? null : images[index];

  return (
    <>
      <div className="mt-2 grid auto-rows-[110px] grid-cols-2 gap-2 sm:auto-rows-[150px] sm:grid-cols-[2fr_1fr_1fr]">
        {grid.map(({ img, index: i }, cell) => (
          <button
            key={img.url}
            type="button"
            onClick={() => open(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}: ${img.alt}`}
            className={`h-full w-full cursor-zoom-in overflow-hidden rounded-[10px] focus-visible:outline-2 ${
              cell === 0 ? 'col-span-2 sm:col-span-1 sm:row-span-2' : ''
            } ${cell >= 3 ? 'hidden sm:block' : ''}`}
          >
            <Photo
              src={img.url}
              alt={img.alt}
              sizes="(min-width: 640px) 400px, 50vw"
              className="h-full"
            >
              {cell === grid.length - 1 && extraDesktop > 0 && (
                // Fixed 8px: shadcn's --radius-* redefined rounded-lg to 12px site-wide (globals.css
                // @theme inline); these counter pills were designed at 8px, so pin the value here.
                <span className="absolute right-2.5 bottom-2.5 hidden rounded-[8px] bg-bg px-2.5 py-1.5 text-xs font-bold text-ink sm:block">
                  {chip(extraDesktop)}
                </span>
              )}
              {cell === Math.min(grid.length, GRID_MAX_PHONE) - 1 && extraPhone > 0 && (
                // Fixed 8px — see the comment above the desktop chip.
                <span className="absolute right-2.5 bottom-2.5 rounded-[8px] bg-bg px-2.5 py-1.5 text-xs font-bold text-ink sm:hidden">
                  {chip(extraPhone)}
                </span>
              )}
            </Photo>
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        onClose={close}
        aria-label="Photo gallery"
        className="m-auto h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-ink/90"
      >
        {current && (
          // The wrapper fills the dialog, so "backdrop" clicks land here, not on <dialog>.
          <div
            onClick={(e) => e.target === e.currentTarget && close()}
            className="relative flex h-full w-full items-center justify-center p-4 sm:p-10"
          >
            <Image
              key={current.url}
              src={current.url}
              alt={current.alt}
              width={current.width}
              height={current.height}
              sizes="100vw"
              className="max-h-full w-auto max-w-full rounded-[10px] object-contain"
            />
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-chip bg-bg/90 px-3 py-1 text-xs font-semibold whitespace-nowrap text-ink">
              {(index ?? 0) + 1} / {images.length} · {current.alt}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute top-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-bg text-lg font-bold text-ink"
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-3 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-bg/90 text-xl text-ink"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className="absolute top-1/2 right-3 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-bg/90 text-xl text-ink"
            >
              ›
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
