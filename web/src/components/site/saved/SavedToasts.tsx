'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { dismissToast, type Toast, useToasts, wakeSaved } from '@/lib/saved';

const SHOW_MS = 5000;

/**
 * The ♡'s messages (R39, P1): "Saved on this device — sign in to keep it", a refused save, the
 * merge note after sign-in, Undo on the Saved tab. One polite live region: under the header on
 * a phone (the sticky Book bar and WhatsApp own the bottom), bottom-left from `lg`; each message
 * leaves after 5 s.
 */
export function SavedToasts() {
  const toasts = useToasts();
  useEffect(wakeSaved, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-[76px] z-40 grid justify-items-center gap-2 lg:inset-x-auto lg:top-auto lg:bottom-6 lg:left-6 lg:[body:has([data-compare-tray])_&]:bottom-24 lg:max-w-[420px] lg:justify-items-start"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastRow({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);
  const action = toast.action;
  return (
    <div className="animate-rise pointer-events-auto flex items-center gap-3 rounded-card bg-ink px-4 py-3 text-[14px] font-semibold text-white shadow-lift">
      <span className="min-w-0">{toast.text}</span>
      {action &&
        ('href' in action ? (
          <Link
            href={action.href}
            className="shrink-0 font-extrabold whitespace-nowrap text-action no-underline hover:underline"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              action.run();
              dismissToast(toast.id);
            }}
            className="shrink-0 font-extrabold whitespace-nowrap text-action hover:underline"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
