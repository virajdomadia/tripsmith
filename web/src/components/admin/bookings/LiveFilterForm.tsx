'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const TYPING_MS = 300;

/**
 * P20 desk A: the desk's GET form, made live. Without JavaScript it is a plain form with an
 * Apply button; once hydrated the button hides, a select or a date applies at once, and the
 * search applies 300 ms after the owner stops typing. Either way the URL is the filter state.
 */
export function LiveFilterForm({
  action,
  children,
  submit,
  clear,
}: {
  action: string;
  children: ReactNode;
  submit: ReactNode;
  /** The no-JS Clear link; once live, Clear empties the visible fields and applies. */
  clear: ReactNode;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(true);
    return () => clearTimeout(timer.current);
  }, []);

  function apply() {
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      if (typeof value === 'string' && value.trim()) params.append(key, value.trim());
    }
    const qs = params.toString();
    router.replace(qs ? `${action}?${qs}` : action, { scroll: false });
  }

  return (
    <form
      ref={form}
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        apply();
      }}
      onChange={(e) => {
        clearTimeout(timer.current);
        const typing = (e.target as HTMLElement).getAttribute('type') === 'search';
        timer.current = setTimeout(apply, typing ? TYPING_MS : 0);
      }}
    >
      {children}
      <span hidden={live}>{submit}</span>
      {live ? (
        <button
          type="button"
          onClick={() => {
            clearTimeout(timer.current);
            for (const el of Array.from(form.current?.elements ?? [])) {
              if (
                (el instanceof HTMLInputElement && el.type !== 'hidden') ||
                el instanceof HTMLSelectElement
              ) {
                el.value = '';
              }
            }
            apply();
          }}
          className="px-2 py-1.5 text-sm font-bold text-mute hover:text-ink"
        >
          Clear
        </button>
      ) : (
        clear
      )}
    </form>
  );
}
