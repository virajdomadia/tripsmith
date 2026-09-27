'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Copies a code for a WhatsApp or an Instagram post; says so for two seconds. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${code}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // No clipboard (an old browser, a denied permission): the code is on screen to select.
        }
      }}
      className="relative z-10 inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2 py-1 text-[12px] font-bold text-ink2 transition-colors hover:border-ink"
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
