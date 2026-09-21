'use client';

import { useEffect, useState } from 'react';
import { WhatsApp } from '@/components/site/home/icons';
import { shareText, whatsappShareHref } from '@/lib/share';
import { Copy, Share } from './icons';

const BTN =
  'inline-flex h-9 items-center gap-1.5 rounded-btn bg-white/94 px-3 text-[13px] font-bold text-ink no-underline [text-shadow:none] transition-colors hover:bg-white';

/**
 * Mockup `.phero .share` (F13): WhatsApp (to a contact) · Copy link · Share. The native share
 * button appears only once hydration confirms `navigator.share`; the other two work without JS
 * as far as a plain link can (copy needs the clipboard, so it is a button).
 */
export function ShareButtons({ name, line, url }: { name: string; line: string; url: string }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = shareText(name, line, url);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context / permissions): fall back to the selectable prompt.
      window.prompt('Copy this link', url);
    }
  }

  async function share() {
    try {
      // `text` without the URL: Android's sheet appends `url` itself and would double it.
      await navigator.share({ title: name, text: `${name} — ${line}`, url });
    } catch {
      // The visitor dismissed the sheet — nothing to do.
    }
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label="Share this trip">
      <a href={whatsappShareHref(text)} target="_blank" rel="noopener" className={BTN}>
        <WhatsApp className="size-4 text-wa" />
        Share
      </a>
      <button type="button" onClick={copy} className={BTN} aria-live="polite">
        <Copy className="size-4" />
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {canShare && (
        <button type="button" onClick={share} className={BTN}>
          <Share className="size-4" />
          More
        </button>
      )}
    </div>
  );
}
