'use client';

/**
 * Saved trips — the ♡ (R39, P1). One store per page load, shared by every heart on the page.
 *
 * - **Guests:** the list lives in localStorage `ts:saved:v1` as `[{slug, at}]`, newest first, at
 *   most `MAX_GUEST` (the api's `MAX_GUEST`). It never reaches the server until sign-in.
 * - **Signed in:** the account is the only list. `ts:saved:acct` keeps a copy of its slugs so
 *   the hearts paint at once on the next page; the api answer replaces it.
 * - **Merge:** right after the sign-in code is verified (`mergeGuestSaves`), and again on any
 *   page load that finds a session while the browser still holds guest saves. The browser list
 *   is cleared only after the api answers 200.
 *
 * Every storage call is wrapped: a private window or blocked site data just shows no hearts.
 */

import { useSyncExternalStore } from 'react';

export const MAX_GUEST = 30;
const GUEST_KEY = 'ts:saved:v1';
const MIRROR_KEY = 'ts:saved:acct';
const HINTED_KEY = 'ts:saved:hinted';
const NOTE_KEY = 'ts:saved:note'; // a toast to show on the next page (after the sign-in redirect)

export type GuestSave = { slug: string; at: string };
type Mode = 'unknown' | 'guest' | 'account';
export type SavedState = { mode: Mode; slugs: readonly string[] };
export type Toast = {
  id: number;
  text: string;
  action?: { label: string; href: string } | { label: string; run: () => void };
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// --- storage ---------------------------------------------------------------------------------

function read(key: string, store: 'local' | 'session' = 'local'): unknown {
  try {
    const raw = (store === 'local' ? localStorage : sessionStorage).getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, store: 'local' | 'session' = 'local'): void {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the page still works, the save just isn't remembered.
  }
}

/** The guest list as stored, cleaned: valid slugs only, no duplicates, newest first, capped. */
export function readGuest(): GuestSave[] {
  const raw = read(GUEST_KEY);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: GuestSave[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { slug, at } = item as Partial<GuestSave>;
    if (typeof slug !== 'string' || !SLUG.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, at: typeof at === 'string' ? at : new Date().toISOString() });
  }
  return out.slice(0, MAX_GUEST);
}

function writeGuest(list: GuestSave[]): void {
  write(GUEST_KEY, list.length ? list.slice(0, MAX_GUEST) : null);
}

function readMirror(): string[] {
  const raw = read(MIRROR_KEY);
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

// --- the store -------------------------------------------------------------------------------

let state: SavedState = { mode: 'unknown', slugs: [] };
let toasts: Toast[] = [];
let nextToast = 1;
const listeners = new Set<() => void>();
const toastListeners = new Set<() => void>();
let booted = false;

function set(next: SavedState): void {
  state = next;
  if (next.mode === 'account') write(MIRROR_KEY, next.slugs);
  for (const l of listeners) l();
}

export function toast(t: Omit<Toast, 'id'>): void {
  toasts = [...toasts.slice(-2), { ...t, id: nextToast++ }];
  for (const l of toastListeners) l();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  for (const l of toastListeners) l();
}

async function call(
  path: string,
  method: 'GET' | 'PUT' | 'DELETE' | 'POST',
  body?: unknown,
): Promise<Response | undefined> {
  try {
    return await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return undefined;
  }
}

type SlugsAnswer = { slugs: string[] };
type MergeAnswer = SlugsAnswer & { added: number; leftOut: number };

/**
 * Sends the browser's guest saves to the account. Resolves to the api's answer, or undefined
 * when there was nothing to send or it failed (the list stays for the next page load).
 */
export async function mergeGuestSaves(): Promise<MergeAnswer | undefined> {
  const guest = readGuest();
  if (!guest.length) return undefined;
  const res = await call('/api/account/saved/merge', 'POST', { items: guest });
  if (!res?.ok) return undefined;
  const answer = (await res.json()) as MergeAnswer;
  writeGuest([]);
  const note = mergeNote(answer);
  if (note) write(NOTE_KEY, note, 'session');
  return answer;
}

/** What the next page says after a merge: how many joined, and how many did not fit. */
export function mergeNote({ added, leftOut }: Pick<MergeAnswer, 'added' | 'leftOut'>): string {
  const trips = (n: number) => `${n} saved ${n === 1 ? 'trip' : 'trips'}`;
  const parts: string[] = [];
  if (added > 0)
    parts.push(
      `${trips(added)} from this device ${added === 1 ? 'is' : 'are'} now on your account.`,
    );
  if (leftOut > 0)
    parts.push(
      `Your account keeps 60 saved trips, so ${leftOut} older ${leftOut === 1 ? 'one was' : 'ones were'} left out.`,
    );
  return parts.join(' ');
}

async function boot(): Promise<void> {
  // Paint at once from what this browser knows, then ask the api who is here.
  const guest = readGuest();
  const mirror = readMirror();
  if (mirror.length) set({ mode: 'unknown', slugs: mirror });
  else if (guest.length) set({ mode: 'unknown', slugs: guest.map((g) => g.slug) });

  const note = read(NOTE_KEY, 'session');
  if (typeof note === 'string') {
    write(NOTE_KEY, null, 'session');
    toast({ text: note });
  }

  const res = await call('/api/account/saved', 'GET');
  const who = res?.ok ? ((await res.json()) as SlugsAnswer & { signedIn?: boolean }) : null;
  if (who && who.signedIn !== false) {
    let slugs = who.slugs;
    if (guest.length) {
      const merged = await mergeGuestSaves();
      if (merged) slugs = merged.slugs;
    }
    set({ mode: 'account', slugs });
    return;
  }
  // A guest (`signedIn: false`), or the api is unreachable: the browser's own list.
  write(MIRROR_KEY, null);
  set({ mode: 'guest', slugs: guest.map((g) => g.slug) });
}

let ready: Promise<void> = Promise.resolve();

function start(): void {
  if (!booted && typeof window !== 'undefined') {
    booted = true;
    ready = boot();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

/**
 * For pages without a heart: start the store only when there is something to do — guest saves
 * to merge (the visitor may have signed in on another tab) or a note left by the sign-in page.
 * A page with neither costs no request.
 */
export function wakeSaved(): void {
  if (readGuest().length || read(NOTE_KEY, 'session') !== null) start();
}

const SERVER: SavedState = { mode: 'unknown', slugs: [] };

/** The saved list for hearts and the tray; empty during SSR and until hydration. */
export function useSaved(): SavedState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => NO_TOASTS,
  );
}
const NO_TOASTS: Toast[] = [];

export function isSaved(s: SavedState, slug: string): boolean {
  return s.slugs.includes(slug);
}

const SIGN_IN = '/account/sign-in';

/**
 * Saves (`want` true) or unsaves `slug`, optimistically: the heart changes at once and goes
 * back, with a toast, if the api refuses. `want` is what the visitor asked for on the heart they
 * saw — a tap made before the store painted the hearts must never flip a save the other way.
 * Returns the new saved flag.
 */
export async function setSaved(slug: string, name: string, want: boolean): Promise<boolean> {
  // A tap before the store knows who is here waits for that answer (a few hundred ms at most),
  // so a signed-in visitor's first save never lands in the browser list by mistake.
  if (state.mode === 'unknown') {
    start();
    await ready;
  }
  const was = state.slugs.includes(slug);
  if (was === want) return want;
  const before = state;
  const slugs = was ? state.slugs.filter((s) => s !== slug) : [slug, ...state.slugs];

  if (state.mode !== 'account') {
    // A guest (or the api not answered yet): the browser list.
    const guest = readGuest().filter((g) => g.slug !== slug);
    if (!was) {
      if (guest.length >= MAX_GUEST) {
        toast({
          text: `This device keeps ${MAX_GUEST} saved trips — sign in to keep more.`,
          action: { label: 'Sign in', href: SIGN_IN },
        });
        return false;
      }
      guest.unshift({ slug, at: new Date().toISOString() });
    }
    writeGuest(guest);
    set({ mode: state.mode, slugs });
    if (!was) {
      if (read(HINTED_KEY) === true) toast({ text: `Saved ${name}` });
      else {
        write(HINTED_KEY, true);
        toast({
          text: 'Saved on this device — sign in to keep it',
          action: { label: 'Sign in', href: SIGN_IN },
        });
      }
    }
    return !was;
  }

  set({ mode: 'account', slugs });
  const res = await call(`/api/account/saved/${encodeURIComponent(slug)}`, was ? 'DELETE' : 'PUT');
  if (res?.ok) {
    set({ mode: 'account', slugs: ((await res.json()) as SlugsAnswer).slugs });
    if (!was) toast({ text: `Saved ${name}` });
    return !was;
  }
  set(before);
  let message = 'Couldn’t save that just now — try again';
  if (res) {
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Not the api's envelope: keep the plain message.
    }
  }
  if (res?.status === 401) {
    // The session ended in another tab: fall back to the browser list.
    write(MIRROR_KEY, null);
    set({ mode: 'guest', slugs: readGuest().map((g) => g.slug) });
    message = 'You were signed out — sign in to save trips to your account';
  }
  toast({ text: message });
  return was;
}

/** Test seam: forget everything this module holds. */
export function resetSavedForTests(): void {
  state = { mode: 'unknown', slugs: [] };
  toasts = [];
  booted = false;
  listeners.clear();
  toastListeners.clear();
}
