'use client';

import { useEffect } from 'react';

const key = (slug: string) => `viewed:${slug}`;

/**
 * F14: tells the api this package was opened (`POST /api/views` → api `recordView`, 204). Renders
 * nothing. One count per tab session per package, so hydration re-mounts, dev strict mode and
 * back/forward never double count; `keepalive` lets the request finish if the visitor leaves at
 * once. Fire-and-forget: a failure is never surfaced. The api drops bots by user agent.
 */
export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key(slug))) return;
      sessionStorage.setItem(key(slug), '1');
    } catch {
      // Storage blocked (private mode, strict settings): count the view anyway.
    }
    void fetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => undefined);
  }, [slug]);
  return null;
}
