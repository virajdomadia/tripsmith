'use client';

/** The compare tray (R39, P1b): up to three trips collected while browsing, kept in
 * sessionStorage for the life of the tab. Client only — compare.ts holds the pure rows. */

import { useSyncExternalStore } from 'react';
import { MAX_COMPARE } from './compare';

// --- the tray --------------------------------------------------------------------------------

export type TrayItem = { slug: string; name: string; coverUrl: string | null };
type TrayState = { items: readonly TrayItem[]; shake: number };

const TRAY_KEY = 'ts:compare:v1';
let tray: TrayState = { items: [], shake: 0 };
let loaded = false;
const trayListeners = new Set<() => void>();

function readTray(): TrayItem[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(TRAY_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (i): i is TrayItem =>
          !!i && typeof i === 'object' && typeof i.slug === 'string' && typeof i.name === 'string',
      )
      .map((i) => ({ slug: i.slug, name: i.name, coverUrl: i.coverUrl ?? null }))
      .slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

function setTray(next: TrayState): void {
  tray = next;
  try {
    sessionStorage.setItem(TRAY_KEY, JSON.stringify(next.items));
  } catch {
    // Storage blocked: the tray still works for this page.
  }
  for (const l of trayListeners) l();
}

function subscribeTray(listener: () => void): () => void {
  if (!loaded && typeof window !== 'undefined') {
    loaded = true;
    tray = { items: readTray(), shake: 0 };
  }
  trayListeners.add(listener);
  return () => trayListeners.delete(listener);
}

const EMPTY_TRAY: TrayState = { items: [], shake: 0 };

export function useCompareTray(): TrayState {
  return useSyncExternalStore(
    subscribeTray,
    () => tray,
    () => EMPTY_TRAY,
  );
}

export const inTray = (s: TrayState, slug: string) => s.items.some((i) => i.slug === slug);

/** Adds or removes a trip. A fourth is refused (`'full'`) and the tray shakes. */
export function toggleCompare(item: TrayItem): 'added' | 'removed' | 'full' {
  if (tray.items.some((i) => i.slug === item.slug)) {
    setTray({ ...tray, items: tray.items.filter((i) => i.slug !== item.slug) });
    return 'removed';
  }
  if (tray.items.length >= MAX_COMPARE) {
    setTray({ ...tray, shake: tray.shake + 1 });
    return 'full';
  }
  setTray({ ...tray, items: [...tray.items, item] });
  return 'added';
}

export function removeFromTray(slug: string): void {
  setTray({ ...tray, items: tray.items.filter((i) => i.slug !== slug) });
}

/** The compare page makes the tray what it shows, so browsing on keeps the same trips. */
export function replaceTray(items: readonly TrayItem[]): void {
  const same =
    items.length === tray.items.length && items.every((i, n) => i.slug === tray.items[n]?.slug);
  if (!same) setTray({ ...tray, items: items.slice(0, MAX_COMPARE) });
}

export function clearTray(): void {
  setTray({ ...tray, items: [] });
}

/** Test seam. */
export function resetTrayForTests(): void {
  tray = { items: [], shake: 0 };
  loaded = false;
  trayListeners.clear();
}
