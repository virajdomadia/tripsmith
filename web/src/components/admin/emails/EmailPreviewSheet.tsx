'use client';

import { Paperclip, Send, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { adminGet, adminRequest } from '@/lib/admin/client';
import {
  type EmailPreview,
  type EmailSample,
  type EmailSamples,
  type EmailTestSent,
  type EmailTypeSetting,
  emailPath,
} from '@/lib/admin/emails';
import { reportAdminError } from '@/lib/admin/errors';
import { ApiRequestError } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; preview: EmailPreview }
  | { kind: 'bad'; message: string };

/**
 * The email rendered with a real booking, as of the day it would go (the api picks the day), in
 * a sandboxed frame — no scripts, no navigation. "Send test" mails the same email to the owner
 * with `[Test]` in front; neither touches the booking's history or the "sent once" ledger.
 */
export function EmailPreviewSheet({
  setting,
  ownerEmail,
  onOpenChange,
}: {
  setting: EmailTypeSetting | null;
  ownerEmail: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [samples, setSamples] = useState<EmailSample[] | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [sending, setSending] = useState(false);
  const type = setting?.type ?? null;

  useEffect(() => {
    if (!type) return;
    let live = true;
    setSamples(null);
    setRef(null);
    setState({ kind: 'loading' });
    adminGet<EmailSamples>(emailPath(type, '/samples'), {})
      .then((s) => {
        if (!live) return;
        setSamples(s.items);
        setRef(s.items[0]?.ref ?? null);
        if (!s.items.length) setState({ kind: 'empty' });
      })
      .catch(() => live && setState({ kind: 'bad', message: 'Could not load the bookings.' }));
    return () => {
      live = false;
    };
  }, [type]);

  useEffect(() => {
    if (!type || !ref) return;
    let live = true;
    setState({ kind: 'loading' });
    adminGet<EmailPreview>(emailPath(type, '/preview'), { ref })
      .then((p) => live && setState({ kind: 'ready', preview: p }))
      .catch((e) => {
        if (!live) return;
        const message =
          e instanceof ApiRequestError ? e.body.message : 'Could not render this email.';
        setState({ kind: 'bad', message });
      });
    return () => {
      live = false;
    };
  }, [type, ref]);

  async function sendTest() {
    if (!type || !ref) return;
    setSending(true);
    try {
      const sent = await adminRequest<EmailTestSent>(emailPath(type, '/test'), {
        method: 'POST',
        body: { ref },
      });
      toast.success(`Test sent to ${sent.to}`);
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not send the test' });
    } finally {
      setSending(false);
    }
  }

  // Only the preview of the booking and type now picked: a switch between them never shows (or
  // tests) the previous one, even for the frame before the new read starts.
  const p =
    state.kind === 'ready' && state.preview.ref === ref && state.preview.type === type
      ? state.preview
      : null;
  return (
    <Sheet open={setting !== null} onOpenChange={onOpenChange}>
      <SheetContent className="sm:w-[min(720px,100%)]">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-[18px] font-extrabold">{setting?.label}</SheetTitle>
            <SheetDescription className="text-sm text-mute">{setting?.trigger}</SheetDescription>
          </div>
          <SheetClose className="grid size-9 place-items-center rounded-full border border-line hover:border-ink">
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-line px-5 py-3">
          <label className="grid min-w-0 gap-1 text-[13px] font-semibold text-ink2">
            Preview with booking
            <select
              className="h-10 w-full min-w-0 truncate rounded-[10px] border border-line bg-bg px-3 text-sm text-ink"
              value={ref ?? ''}
              disabled={!samples?.length}
              onChange={(e) => setRef(e.target.value)}
            >
              {!samples && <option value="">Loading…</option>}
              {samples?.length === 0 && <option value="">No booking fits this email yet</option>}
              {samples?.map((s) => (
                <option key={s.ref} value={s.ref}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {p && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-mute">Subject</dt>
              <dd className="min-w-0 font-semibold break-words">{p.subject}</dd>
              <dt className="text-mute">To</dt>
              <dd className="break-all">{p.to}</dd>
              <dt className="text-mute">Goes</dt>
              <dd>{formatDate(p.asOf)} · the 09:00 run</dd>
              {p.attachments.length > 0 && (
                <>
                  <dt className="text-mute">Attached</dt>
                  <dd className="flex min-w-0 items-center gap-1 break-all">
                    <Paperclip className="size-3.5" aria-hidden />
                    {p.attachments.join(', ')}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-bg2">
          {p ? (
            <iframe
              title={`${setting?.label} preview`}
              srcDoc={p.html}
              sandbox=""
              className="size-full border-0"
            />
          ) : (
            <p role="status" className="p-6 text-sm text-mute">
              {state.kind === 'empty'
                ? 'No booking fits this email yet — it previews as soon as one does.'
                : state.kind === 'bad'
                  ? state.message
                  : 'Rendering…'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
          <p className="min-w-0 flex-1 text-[13px] text-mute">
            {ownerEmail
              ? `A test goes to ${ownerEmail} only — the customer gets nothing, and the real email still goes on its day.`
              : 'Set OWNER_NOTIFY_EMAIL on the api to send tests.'}
          </p>
          <Button type="button" disabled={!p || !ownerEmail || sending} onClick={sendTest}>
            <Send className="size-4" aria-hidden />
            {sending ? 'Sending…' : 'Send test to me'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
