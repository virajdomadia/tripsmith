'use client';

import { Eye } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * QA 2026-11-19: the published demo owner login is read-only. The api lists it in
 * `DEMO_READ_ONLY_EMAILS` and answers every `/admin/*` write with `403 forbidden`,
 * `reason: "demo_read_only"` (api/app/services/auth/deps.py) — that is the real gate. Here the
 * shell only says so up front (`ReadOnlyBanner`), and a few big "Save" buttons read
 * `useReadOnly()` to explain themselves instead of failing on click. Any write that still goes
 * out shows the api's message as a toast (`reportAdminError`).
 */

export const READ_ONLY_REASON = 'demo_read_only';

const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

/** True for a read-only (demo) owner session. False outside the shell, e.g. in tests. */
export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** The title a disabled write button carries for a read-only session. */
export const READ_ONLY_TITLE = 'The demo owner account is read-only — changes aren’t saved';

/** Persistent strip at the top of every admin page for a read-only session. */
export function ReadOnlyBanner() {
  const readOnly = useReadOnly();
  if (!readOnly) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2.5 rounded-[12px] border border-eb/30 bg-eb-soft px-4 py-3 text-sm font-semibold text-eb"
    >
      <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Demo owner — read-only. Browse everything; changes aren’t saved.
        <span className="block font-normal">
          Saving, publishing, refunds and other changes are switched off for this login.
        </span>
      </span>
    </p>
  );
}
