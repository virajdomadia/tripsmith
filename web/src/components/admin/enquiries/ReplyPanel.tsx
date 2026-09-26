'use client';

import { AlertTriangle, Check, Paperclip, RotateCw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { components } from '@/lib/api-types';
import { ApiRequestError } from '@/lib/api-errors';
import { noteTime } from './NotesPanel';

type Message = components['schemas']['EnquiryMessageOut'];
type AdminEnquiry = components['schemas']['AdminEnquiry'];
type LivePackage = { slug: string; name: string };

// api schemas/admin_enquiries.py SUBJECT_MAX / REPLY_MAX
const SUBJECT_MAX = 150;
const BODY_MAX = 5000;

/**
 * R23: email the enquirer from the inbox. The thread lists every try oldest first — a failed one
 * stays visible, red, with the reason and a "Send again" that re-sends it as written. The
 * composer clears after a send either way: a failed reply is already saved in the thread.
 *
 * Any live package's itinerary PDF can go with it (the enquiry's own is the default), so a
 * contact enquiry can still get "here's the trip I mentioned".
 */
export function ReplyPanel({
  id,
  email,
  messages,
  subject: defaultSubject,
  body: defaultBody,
  packages,
  packageSlug,
}: {
  id: string;
  email: string;
  messages: Message[];
  subject: string;
  body: string;
  packages: LivePackage[];
  packageSlug: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fieldId = useId();
  const sent = messages.some((m) => m.sent);
  const [subject, setSubject] = useState(sent ? `Re: ${defaultSubject}` : defaultSubject);
  const [body, setBody] = useState(sent ? '' : defaultBody);
  const [attach, setAttach] = useState(
    packageSlug && packages.some((p) => p.slug === packageSlug) ? packageSlug : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function outcome(res: AdminEnquiry, messageId?: string) {
    const m = messageId
      ? res.messages.find((x) => x.id === messageId)
      : res.messages[res.messages.length - 1];
    if (m?.sent) toast.success('Reply sent');
    else toast.error(`Not sent — ${m?.error ?? 'try again'}`);
  }

  async function send() {
    const found: Record<string, string> = {};
    if (!subject.trim()) found.subject = 'Add a subject';
    if (!body.trim()) found.body = 'Write the reply';
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy(true);
    try {
      const res = await adminRequest<AdminEnquiry>(`/admin/enquiries/${id}/reply`, {
        method: 'POST',
        body: { subject: subject.trim(), body: body.trim(), packageSlug: attach || null },
      });
      outcome(res);
      setSubject(`Re: ${defaultSubject}`);
      setBody('');
      startTransition(() => router.refresh());
    } catch (e) {
      if (e instanceof ApiRequestError && e.body.fieldErrors) setErrors(e.body.fieldErrors);
      else reportAdminError(e, { router, pathname, fallback: 'Could not send — try again' });
    } finally {
      setBusy(false);
    }
  }

  async function retry(messageId: string) {
    setRetrying(messageId);
    try {
      const res = await adminRequest<AdminEnquiry>(
        `/admin/enquiries/${id}/messages/${messageId}/resend`,
        { method: 'POST' },
      );
      outcome(res, messageId);
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not send — try again' });
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="grid gap-4">
      {messages.length === 0 ? (
        <p className="text-sm text-mute">No replies yet. Write one below — it goes to {email}.</p>
      ) : (
        <ol className="grid gap-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`grid gap-1.5 rounded-card border p-3 text-sm ${
                m.sent ? 'border-line bg-bg2' : 'border-bad/40 bg-bad/5'
              }`}
            >
              <b className="break-words">{m.subject}</b>
              <p className="break-words whitespace-pre-line text-ink2">{m.body}</p>
              {m.attachment && (
                <span className="inline-flex items-center gap-1 text-xs text-mute">
                  <Paperclip className="size-3.5" aria-hidden />
                  {m.attachment.name} itinerary (PDF)
                </span>
              )}
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {m.sent ? (
                  <span className="inline-flex items-center gap-1 text-mute">
                    <Check className="size-3.5 text-ok" aria-hidden />
                    Sent {noteTime(m.sentAt)}
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 font-semibold text-bad">
                      <AlertTriangle className="size-3.5" aria-hidden />
                      Not sent · {m.error ?? 'unknown error'} · {noteTime(m.sentAt)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={retrying !== null}
                      onClick={() => void retry(m.id)}
                    >
                      <RotateCw className="size-3.5" aria-hidden />
                      {retrying === m.id ? 'Sending…' : 'Send again'}
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-3 border-t border-line pt-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-subject`}>Subject</Label>
          <Input
            id={`${fieldId}-subject`}
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={errors.subject ? true : undefined}
          />
          {errors.subject && (
            <p className="text-xs font-semibold text-bad" role="alert">
              {errors.subject}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-body`}>Message</Label>
          <Textarea
            id={`${fieldId}-body`}
            rows={7}
            maxLength={BODY_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={errors.body ? true : undefined}
          />
          {errors.body && (
            <p className="text-xs font-semibold text-bad" role="alert">
              {errors.body}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${fieldId}-pdf`}>Attach an itinerary</Label>
          <NativeSelect
            id={`${fieldId}-pdf`}
            value={attach}
            onChange={(e) => setAttach(e.target.value)}
            aria-invalid={errors.packageSlug ? true : undefined}
          >
            <option value="">No attachment</option>
            {packages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          {errors.packageSlug && (
            <p className="text-xs font-semibold text-bad" role="alert">
              {errors.packageSlug}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-mute">To {email} · replies come back to your inbox</span>
          <Button type="button" size="sm" disabled={busy} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </div>
    </div>
  );
}
