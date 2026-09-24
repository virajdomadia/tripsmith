/**
 * A form's unsaved values, parked in sessionStorage while the owner signs back in after a
 * session expired mid-edit, and picked up again by the same form after the login redirect.
 *
 * sessionStorage is per tab, so a draft never leaks into another tab's form, and it dies with
 * the tab. Every access is guarded: storage can be full, disabled or throw outright (Safari
 * private mode, blocked site data) — losing the draft then is no worse than before.
 */

const PREFIX = 'tripsmith:admin-draft:';
/** A draft older than this was abandoned, not interrupted — do not spring it on the owner. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type Draft<T> = {
  values: T;
  /** The `updatedAt` the form was editing against, so the stale-edit check still holds. */
  expectedUpdatedAt?: string | null;
};

type Stored<T> = Draft<T> & { savedAt: number };

export function saveDraft<T>(key: string, draft: Draft<T>): void {
  try {
    const stored: Stored<T> = { ...draft, savedAt: Date.now() };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(stored));
  } catch {
    // Storage unavailable or full: the redirect still happens, the edits are just not kept.
  }
}

/** Reads and removes the draft — a draft is restored at most once. */
export function takeDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    window.sessionStorage.removeItem(PREFIX + key);
    const stored = JSON.parse(raw) as Partial<Stored<T>>;
    if (typeof stored.savedAt !== 'number' || Date.now() - stored.savedAt > MAX_AGE_MS) {
      return null;
    }
    if (stored.values === undefined || stored.values === null) return null;
    return { values: stored.values, expectedUpdatedAt: stored.expectedUpdatedAt ?? null };
  } catch {
    return null;
  }
}
