'use client';

import { Check, Lock, Mail, Ticket } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { addDays, followUpLabel, LOST_REASONS, STAGE, type AdminEnquiry } from '@/lib/admin/inbox';
import { cn } from '@/lib/utils';

type Status = AdminEnquiry['status'];

/** One write, then a server refresh; errors land as the admin's usual toast. */
function useWrite() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, done?: string) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        try {
          await fn();
          if (done) toast.success(done);
          router.refresh();
          resolve(true);
        } catch (e) {
          reportAdminError(e, { router, pathname, fallback: 'Could not save — try again' });
          resolve(false);
        }
      }),
    );
  return { pending, run };
}

const STEP =
  'inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors disabled:opacity-50';

/**
 * A2's stage stepper: New → Contacted → (Quoted, with its own v2.5 row) then Won or Lost. Only
 * R24's legal moves are enabled; Lost asks why. Won is the shipped Converted, Lost is Closed.
 */
export function StageControl({ e }: { e: AdminEnquiry }) {
  const { pending, run } = useWrite();
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState<string>(LOST_REASONS[0]);
  const order: Status[] = ['new', 'contacted'];
  const cur = order.indexOf(e.status);
  const can = (s: Status) =>
    s === e.status ||
    (
      {
        new: ['contacted', 'converted', 'closed'],
        contacted: ['converted', 'closed'],
        converted: ['closed'],
        closed: ['contacted'],
      } as Record<Status, Status[]>
    )[e.status].includes(s);
  const move = (status: Status, lostReason?: string) =>
    run(
      () =>
        adminRequest(`/admin/enquiries/${e.id}/status`, {
          method: 'PATCH',
          body: { status, lostReason },
        }),
      `${e.name.split(' ')[0]} moved to ${STAGE[status].label}${lostReason ? ` · ${lostReason}` : ''}`,
    ).then((ok) => ok && setAsking(false));
  return (
    <div className="grid gap-2">
      <ol
        aria-label="Stage"
        className="grid grid-cols-3 gap-1 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)]"
      >
        {order.map((s, i) => (
          <li key={s} className="flex">
            <button
              type="button"
              aria-pressed={e.status === s}
              disabled={pending || !can(s) || e.status === s}
              onClick={() => move(s)}
              className={cn(
                STEP,
                e.status === s
                  ? 'border-primary bg-primary text-white'
                  : cur > i || e.status === 'converted'
                    ? 'border-line bg-bg2 text-ink2'
                    : 'border-line bg-bg text-mute hover:border-ink hover:text-ink',
              )}
            >
              {(cur > i || e.status === 'converted') && <Check className="size-3" aria-hidden />}
              {STAGE[s].label}
            </button>
          </li>
        ))}
        <li className="flex">
          <span
            title="Quoted arrives with its own v2.5 row"
            className={cn(STEP, 'cursor-not-allowed border-dashed border-line bg-bg text-mute')}
          >
            Quoted
          </span>
        </li>
        <li className="col-span-3 flex gap-1 sm:col-span-1">
          <button
            type="button"
            aria-pressed={e.status === 'converted'}
            disabled={pending || !can('converted') || e.status === 'converted'}
            onClick={() => move('converted')}
            className={cn(
              STEP,
              e.status === 'converted'
                ? 'border-ok bg-ok text-white'
                : 'border-line bg-bg text-mute hover:border-ink hover:text-ink',
            )}
          >
            Won
          </button>
          <button
            type="button"
            aria-pressed={e.status === 'closed'}
            aria-expanded={asking}
            disabled={pending || !can('closed') || e.status === 'closed'}
            onClick={() => setAsking(!asking)}
            className={cn(
              STEP,
              e.status === 'closed'
                ? 'border-ink2 bg-ink2 text-white'
                : 'border-line bg-bg text-mute hover:border-ink hover:text-ink',
            )}
          >
            Lost
          </button>
        </li>
      </ol>
      {asking && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg2 px-3 py-2 text-[13px]">
          <label htmlFor="lost-why" className="font-bold">
            Why was it lost?
          </label>
          <NativeSelect
            id="lost-why"
            value={why}
            onChange={(ev) => setWhy(ev.target.value)}
            className="min-w-0 flex-1"
          >
            {LOST_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </NativeSelect>
          <Button size="sm" disabled={pending} onClick={() => move('closed', why)}>
            Mark lost
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      )}
      {e.status === 'closed' && (
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          disabled={pending}
          onClick={() => move('contacted')}
        >
          Reopen as Contacted
        </Button>
      )}
    </div>
  );
}

/** A2's follow-up: today, tomorrow, four days out, any date, or clear. */
export function FollowUpControl({ e, today }: { e: AdminEnquiry; today: string }) {
  const { pending, run } = useWrite();
  const set = (day: string | null) =>
    run(
      () =>
        adminRequest(`/admin/enquiries/${e.id}/follow-up`, {
          method: 'PATCH',
          body: { followUpOn: day },
        }),
      day ? `Follow up ${followUpLabel(day)}` : 'Follow-up cleared',
    );
  const commit = (day: string) => {
    if (day && day >= today && day !== e.followUpOn) set(day);
  };
  const quick: [string, string][] = [
    [addDays(today, 0), 'Today'],
    [addDays(today, 1), 'Tomorrow'],
    [addDays(today, 4), followUpLabel(addDays(today, 4))],
  ];
  const pill =
    'rounded-chip border border-line px-3 py-1 text-[12.5px] font-bold transition-colors disabled:opacity-50';
  return (
    <div role="group" aria-label="Follow-up date" className="flex flex-wrap items-center gap-1.5">
      {quick.map(([day, label]) => (
        <button
          key={label}
          type="button"
          disabled={pending}
          aria-pressed={e.followUpOn === day}
          onClick={() => set(day)}
          className={cn(
            pill,
            e.followUpOn === day
              ? 'border-ink bg-ink text-white'
              : 'bg-bg text-ink2 hover:border-ink',
          )}
        >
          {label}
        </button>
      ))}
      <Input
        // Keyed on the saved day, so a quick pick or Clear shows in the box too.
        key={e.followUpOn ?? ''}
        type="date"
        aria-label="Pick a follow-up date"
        min={today}
        defaultValue={e.followUpOn ?? ''}
        // Committed on blur or Enter, never per keystroke: a half-typed year is a valid date.
        onBlur={(ev) => commit(ev.target.value)}
        onKeyDown={(ev) => ev.key === 'Enter' && commit(ev.currentTarget.value)}
        className="h-8 w-auto rounded-chip text-[12.5px]"
      />
      {e.followUpOn && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set(null)}
          className={cn(pill, 'bg-bg text-mute hover:border-ink')}
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** A2's Convert to booking: what the counter wizard (P18) will be pre-filled with. Until P18
 *  ships the owner books by hand and marks the enquiry Won. */
export function ConvertPreview({
  rows,
  canWin,
  enquiryId,
}: {
  rows: [string, string, 'ok' | 'warn' | 'mute', string][];
  canWin: boolean;
  enquiryId: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useWrite();
  if (!open) {
    return (
      <div className="grid gap-1.5">
        <Button
          className="justify-self-start bg-action text-ink hover:bg-action-ink"
          onClick={() => setOpen(true)}
        >
          <Ticket className="size-4" aria-hidden />
          Convert to booking
        </Button>
        <span className="text-[12px] text-mute">
          See what the counter booking will be pre-filled with.
        </span>
      </div>
    );
  }
  const TONE = {
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    mute: 'bg-bg2 text-mute',
  } as const;
  return (
    <div className="grid gap-2.5 rounded-xl border border-action/40 bg-action/10 p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold">
        <Ticket className="size-4" aria-hidden /> Convert to booking
      </h3>
      <ol className="grid gap-2">
        {rows.map(([k, v, tone, word], i) => (
          <li
            key={k}
            className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 text-[13px]"
          >
            <span className="grid size-5 place-items-center rounded-full border border-line bg-bg text-[11px] font-extrabold">
              {i + 1}
            </span>
            <span className="min-w-0 break-words">
              <small className="block text-[11.5px] font-bold text-mute">{k}</small>
              {v}
            </span>
            <span className={cn('rounded-chip px-2 py-0.5 text-[11.5px] font-bold', TONE[tone])}>
              {word}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[12px] text-mute">
        The counter booking opens with these filled in; booking marks this enquiry Won and links the
        two. Already booked some other way? Mark it Won instead.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/bookings/new?enquiry=${encodeURIComponent(enquiryId)}`}
          className={cn(buttonVariants({ size: 'sm' }), 'bg-action text-ink hover:bg-action-ink')}
        >
          <Ticket className="size-4" aria-hidden /> Open the counter booking
        </Link>
        {canWin && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  adminRequest(`/admin/enquiries/${enquiryId}/status`, {
                    method: 'PATCH',
                    body: { status: 'converted' },
                  }),
                'Marked Won',
              )
            }
          >
            <Check className="size-4" aria-hidden /> Mark Won only
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/**
 * A2's composer: reply by email (the R23 reply, with an optional itinerary PDF) or an internal
 * note. Snippets insert trip facts at the cursor; a template replaces the draft. Ctrl+Enter
 * sends.
 */
export function Composer({
  e,
  snippets,
  templates,
  subject,
  canAttach,
}: {
  e: AdminEnquiry;
  snippets: { label: string; text: string }[];
  templates: { key: string; label: string; text: string }[];
  subject: string;
  canAttach: boolean;
}) {
  const { pending, run } = useWrite();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [draft, setDraft] = useState({ reply: `Hi ${e.name.split(' ')[0]},\n\n`, note: '' });
  const [attach, setAttach] = useState(canAttach);
  const text = draft[mode];
  const setText = (v: string) => setDraft({ ...draft, [mode]: v });

  function insert(snippet: string) {
    const el = document.getElementById('inbox-composer') as HTMLTextAreaElement | null;
    // At the caret while the box has focus; otherwise at the end, never before the greeting.
    const at = el && document.activeElement === el ? el.selectionStart : text.length;
    const next = `${text.slice(0, at)}${at && !/\s$/.test(text.slice(0, at)) ? ' ' : ''}${snippet}${text.slice(at)}`;
    setText(next);
    requestAnimationFrame(() => el?.focus());
  }

  async function send() {
    if (!text.trim()) return;
    const ok = await run(
      () =>
        mode === 'reply'
          ? adminRequest(`/admin/enquiries/${e.id}/reply`, {
              method: 'POST',
              body: {
                subject,
                body: text,
                packageSlug: attach && e.package ? e.package.slug : null,
              },
            })
          : adminRequest(`/admin/enquiries/${e.id}/notes`, {
              method: 'POST',
              body: { body: text },
            }),
      mode === 'reply' ? 'Reply sent' : 'Note saved',
    );
    if (ok)
      setDraft({ ...draft, [mode]: mode === 'reply' ? `Hi ${e.name.split(' ')[0]},\n\n` : '' });
  }

  const seg =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-bold transition-colors';
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Write" className="flex gap-1 rounded-lg bg-bg2 p-1">
          <button
            type="button"
            aria-pressed={mode === 'reply'}
            onClick={() => setMode('reply')}
            className={cn(seg, mode === 'reply' ? 'bg-bg text-ink shadow-sm' : 'text-mute')}
          >
            <Mail className="size-3.5" aria-hidden /> Reply by email
          </button>
          <button
            type="button"
            aria-pressed={mode === 'note'}
            onClick={() => setMode('note')}
            className={cn(seg, mode === 'note' ? 'bg-bg text-ink shadow-sm' : 'text-mute')}
          >
            <Lock className="size-3.5" aria-hidden /> Internal note
          </button>
        </div>
        {mode === 'reply' && (
          <NativeSelect
            aria-label="Insert a template"
            value=""
            onChange={(ev) => {
              const t = templates.find((x) => x.key === ev.target.value);
              if (t) setText(t.text);
            }}
            className="min-w-0 flex-1"
          >
            <option value="">Template…</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      {mode === 'reply' && (
        <>
          <span className="text-[12px] break-words text-mute">
            To {e.email} · {subject}
          </span>
          <div aria-label="Quick replies" className="flex flex-wrap gap-1.5">
            {snippets.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => insert(s.text)}
                className="rounded-chip border border-dashed border-line bg-bg px-2.5 py-0.5 text-[12px] font-bold text-ink2 transition-[transform,color,border-color] hover:-translate-y-px hover:border-primary hover:text-primary"
              >
                + {s.label}
              </button>
            ))}
          </div>
        </>
      )}
      <label htmlFor="inbox-composer" className="sr-only">
        {mode === 'reply' ? 'Reply' : 'Internal note'}
      </label>
      <textarea
        id="inbox-composer"
        value={text}
        maxLength={mode === 'reply' ? 5000 : 2000}
        onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            void send();
          }
        }}
        placeholder={mode === 'reply' ? 'Write your reply' : 'Called, quoted, promised to…'}
        className={cn(
          'min-h-[110px] w-full resize-y rounded-xl border px-3 py-2 text-[14px] leading-relaxed text-ink focus:outline-2 focus:outline-primary',
          mode === 'note' ? 'border-dashed border-action bg-action/5' : 'border-line bg-bg',
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'reply' && canAttach && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-bold">
            <input
              type="checkbox"
              checked={attach}
              onChange={(ev) => setAttach(ev.target.checked)}
              className="size-4 accent-primary"
            />
            Attach itinerary PDF
          </label>
        )}
        <span className="text-[12px] text-mute">
          <kbd className="rounded border border-b-2 border-line bg-bg2 px-1 text-[10.5px] font-bold">
            Ctrl
          </kbd>{' '}
          <kbd className="rounded border border-b-2 border-line bg-bg2 px-1 text-[10.5px] font-bold">
            Enter
          </kbd>
        </span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={pending || !text.trim()}
          onClick={() => void send()}
        >
          {mode === 'reply' ? (
            <>
              <Mail className="size-4" aria-hidden /> {pending ? 'Sending…' : 'Send reply'}
            </>
          ) : (
            <>
              <Lock className="size-4" aria-hidden /> {pending ? 'Saving…' : 'Save note'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
