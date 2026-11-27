'use client';

import Link from 'next/link';
import { compareHref } from '@/lib/compare';
import { useCompareTray } from '@/lib/compare-tray';

/** Review 2026-11-27 (L7): a bare `/compare` offers the trips already ticked in the tray. */
export function TrayCompareLink() {
  const { items } = useCompareTray();
  if (items.length < 2) return null;
  return (
    <Link
      href={compareHref(items.map((i) => i.slug))}
      className="mt-1 rounded-btn bg-primary px-5 py-3 font-bold text-white no-underline transition-colors hover:bg-primary-ink"
    >
      Compare the {items.length} trips you ticked
    </Link>
  );
}
