'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * A2's keyboard: J and K move through the list, R jumps to the reply box, F to the follow-up
 * date. Ignored while typing in a field, and with a modifier held, so it never eats a shortcut.
 */
export function InboxKeys({
  ids,
  selected,
  hrefs,
}: {
  ids: string[];
  selected?: string;
  hrefs: Record<string, string>;
}) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === 'j' || key === 'k') {
        const i = selected ? ids.indexOf(selected) : -1;
        const next = ids[key === 'j' ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1)];
        if (next && next !== selected) {
          e.preventDefault();
          router.replace(hrefs[next]!, { scroll: false });
          document
            .querySelector(`[data-inbox-row="${next}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        }
      } else if (key === 'r') {
        const box = document.getElementById('inbox-composer');
        if (box) {
          e.preventDefault();
          box.focus();
        }
      } else if (key === 'f') {
        const fu = document.querySelector<HTMLElement>(
          '#inbox-followup button, #inbox-followup input',
        );
        if (fu) {
          e.preventDefault();
          fu.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, selected, hrefs, router]);
  return null;
}
