'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useSaved } from '@/lib/saved';

/**
 * My trips is rendered on the server before this browser's guest saves may have merged in (a
 * slow merge at sign-in is finished by the next page load, or the visitor signed in on another
 * tab). When the save store holds a trip the page did not render, refresh the page once so the
 * Saved tab — and its count — include it.
 */
export function SavedRefresh({ rendered }: { rendered: string[] }) {
  const store = useSaved();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || store.mode !== 'account') return;
    if (store.slugs.some((s) => !rendered.includes(s))) {
      done.current = true;
      router.refresh();
    }
  }, [store, rendered, router]);
  return null;
}
