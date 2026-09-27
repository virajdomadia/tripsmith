import { ArrowLeft, Check, FileText, Lock, Mail, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { buttonVariants } from '@/components/ui/button';
import { emailSubject, mailtoHref, telHref, waHref } from '@/lib/admin/enquiry-links';
import {
  isOpen,
  monthLabel,
  party,
  snippets,
  source,
  STAGE,
  templates,
  thread,
  tripLine,
  type AdminEnquiry,
  type TripFacts,
} from '@/lib/admin/inbox';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Composer, ConvertPreview, FollowUpControl, StageControl } from './InboxControls';
import { EnquiryChips } from './InboxList';

const H3 = 'label-caps flex items-center gap-2 text-[11px] text-mute';

/**
 * Mockup Enquiries A2's panel: the enquiry read as a conversation — their form first, then your
 * emails, dashed internal notes and status pills — with the stage stepper, Convert to booking,
 * the follow-up date and the composer, and the same customer's past trips underneath. On a phone
 * it is the whole screen, with a back link and a sticky Call / WhatsApp / Reply bar.
 */
export function InboxPanel({
  e,
  today,
  trip,
  backHref,
  signOff,
  hrefFor,
}: {
  e: AdminEnquiry | null;
  today: string;
  trip: TripFacts | null;
  backHref: string;
  signOff: string;
  hrefFor: (id: string) => string;
}) {
  if (!e) {
    return (
      <aside className="grid place-items-center rounded-card border border-dashed border-line bg-bg p-8 text-center text-sm text-mute max-lg:hidden">
        Pick an enquiry to read it and reply here.
      </aside>
    );
  }
  const bookings = e.bookings ?? [];
  const hello = `Hi ${e.name.split(' ')[0]}, this is Tripsmith about your enquiry ${e.ref}.`;
  const subject = emailSubject(e);
  const estimate = e.package?.startingPricePaise
    ? e.package.startingPricePaise * (e.adults + e.children)
    : null;
  const items = thread(e);
  const src = source(e.type);
  const fit = trip?.dates.find(([, left]) => left >= e.adults + e.children) ?? null;
  const facts: [string, string][] = [
    ['Trip', e.package?.name ?? 'General question'],
    ...(e.travelMonth ? [['Month', monthLabel(e.travelMonth)!] as [string, string]] : []),
    ['Party', party(e.adults, e.children)],
    ...(e.preferredDates ? [['Dates', e.preferredDates] as [string, string]] : []),
    ...(e.budgetPaise ? [['Budget', `${inr(e.budgetPaise)} per person`] as [string, string]] : []),
    ...(e.changes ? [['Changes', e.changes] as [string, string]] : []),
  ];
  return (
    <aside
      aria-label={`Enquiry ${e.ref}`}
      className="animate-rise grid content-start overflow-hidden rounded-card border border-line bg-bg"
    >
      <section className="grid gap-2 border-b border-line p-4">
        <Link
          href={backHref}
          scroll={false}
          className={cn(
            buttonVariants({ size: 'sm', variant: 'ghost' }),
            'justify-self-start lg:hidden',
          )}
        >
          <ArrowLeft className="size-4" aria-hidden /> All enquiries
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold text-mute">
          <span>
            <span className="font-mono">{e.ref}</span> · received {istFullDate(e.createdAt)},{' '}
            {istTime(e.createdAt)} · {e.device.toLowerCase()} · {src.label.toLowerCase()}
          </span>
        </div>
        <h2 className="text-[21px] leading-tight font-extrabold tracking-tight">{e.name}</h2>
        <p className="text-[13.5px] text-ink2">
          {tripLine(e)}
          {estimate ? (
            <>
              {' '}
              ·{' '}
              <b className="num">
                {e.status === 'converted' ? '' : 'about '}
                {inr(estimate)}
              </b>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1">
          <EnquiryChips
            e={{ ...e, replied: e.messages.some((m) => m.sent) }}
            today={today}
            withSource={false}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 max-lg:hidden">
          <a href={telHref(e.phone)} className={buttonVariants({ size: 'sm' })}>
            <Phone className="size-4" aria-hidden /> Call
          </a>
          <a
            href={waHref(e.phone, hello)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
          <a
            href={mailtoHref(e.email, subject)}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <Mail className="size-4" aria-hidden /> Email
          </a>
        </div>
      </section>

      <section className="grid gap-2 border-b border-line p-4">
        <h3 className={H3}>Stage</h3>
        <StageControl e={e} />
      </section>

      <section className="grid gap-2 border-b border-line p-4">
        {e.status === 'converted' ? (
          <p className="flex items-center gap-1.5 text-[13.5px]">
            <Check className="size-4 text-ok" aria-hidden /> Won
            {bookings[0] ? (
              <>
                {' '}
                · their latest booking{' '}
                <Link
                  href={`/admin/bookings/${bookings[0].ref}`}
                  className="font-mono font-bold text-primary"
                >
                  {bookings[0].ref}
                </Link>
              </>
            ) : null}
          </p>
        ) : isOpen(e.status) ? (
          <ConvertPreview
            enquiryId={e.id}
            canWin
            rows={[
              [
                'Trip',
                e.package?.name ?? 'Not chosen yet',
                e.package ? 'ok' : 'warn',
                e.package ? 'Pre-filled' : 'You pick',
              ],
              [
                'Departure',
                fit
                  ? `${fit[0]} · ${fit[1]} seats left`
                  : e.travelMonth
                    ? `${monthLabel(e.travelMonth)} · no open date with room`
                    : 'No month given',
                fit ? 'ok' : 'warn',
                fit ? 'Suggested' : 'You pick',
              ],
              ['Party', party(e.adults, e.children), 'ok', 'Pre-filled'],
              [
                'Discounts',
                e.budgetPaise
                  ? `Deals apply by themselves · their budget ${inr(e.budgetPaise)} pp noted`
                  : 'Deals apply by themselves',
                'mute',
                'Automatic',
              ],
              [
                'Customer',
                `${e.name} · ${e.phone} · ${e.email}`,
                'ok',
                bookings.length || e.related.length ? 'Matched' : 'New',
              ],
              [
                'Note on the booking',
                `From enquiry ${e.ref}${e.changes ? ` · ${e.changes}` : ''}`,
                'ok',
                'Pre-filled',
              ],
            ]}
          />
        ) : (
          <p className="text-[13.5px] text-mute">
            Lost{e.lostReason ? ` · ${e.lostReason}` : ''}. Reopen it above to work on it again.
          </p>
        )}
      </section>

      {isOpen(e.status) && (
        <section className="grid gap-2 border-b border-line p-4" id="inbox-followup">
          <h3 className={H3}>Follow up</h3>
          <FollowUpControl e={e} today={today} />
        </section>
      )}

      <section className="grid gap-3 border-b border-line p-4">
        <h3 className={H3}>
          Conversation
          <span className="ml-auto tracking-normal normal-case">
            {items.filter((i) => i.kind === 'out' || i.kind === 'note').length + 1} messages and
            notes
          </span>
        </h3>
        <div className="grid max-h-[420px] content-start gap-2.5 overflow-y-auto p-0.5 max-lg:max-h-none">
          {items.map((m, i) => {
            if (m.kind === 'sys') {
              return (
                <span
                  key={`sys-${i}`}
                  className="justify-self-center rounded-chip border border-line px-2.5 py-0.5 text-center text-[11.5px] font-bold text-mute"
                >
                  {m.body} · {istFullDate(m.at).slice(0, -5)}
                </span>
              );
            }
            if (m.kind === 'in') {
              return (
                <div key="in" className="grid max-w-[92%] gap-1">
                  <span className="text-[11.5px] font-bold text-mute">
                    {e.name.split(' ')[0]} · {src.label.toLowerCase()} · {istFullDate(m.at)},{' '}
                    {istTime(m.at)}
                  </span>
                  <div className="rounded-[4px_12px_12px_12px] border border-line bg-bg2 px-3 py-2 text-[13.5px] leading-relaxed break-words">
                    <dl className="mb-1.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
                      {facts.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-mute">{k}</dt>
                          <dd className="m-0 font-bold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {e.message ? (
                      <p className="whitespace-pre-line">{e.message}</p>
                    ) : (
                      <p className="text-mute">No message, just the form.</p>
                    )}
                  </div>
                </div>
              );
            }
            if (m.kind === 'note') {
              return (
                <div key={m.id} className="grid gap-1">
                  <span className="flex items-center gap-1 text-[11.5px] font-bold text-warn">
                    <Lock className="size-3" aria-hidden /> Internal note · only you see this ·{' '}
                    {istFullDate(m.at)}, {istTime(m.at)}
                  </span>
                  <p className="rounded-xl border border-dashed border-action/70 bg-action/10 px-3 py-2 text-[13.5px] break-words whitespace-pre-line">
                    {m.body}
                  </p>
                </div>
              );
            }
            return (
              <div key={m.id} className="grid max-w-[92%] gap-1 justify-self-end">
                <span className="text-right text-[11.5px] font-bold text-mute">
                  You · email · {istFullDate(m.at)}, {istTime(m.at)}
                  {!m.sent && (
                    <span className="text-bad"> · not sent{m.error ? ` (${m.error})` : ''}</span>
                  )}
                </span>
                <div className="rounded-[12px_4px_12px_12px] border border-primary/20 bg-primary-soft px-3 py-2 text-[13.5px] leading-relaxed break-words">
                  <b className="mb-1 block text-[12.5px]">{m.subject}</b>
                  <p className="whitespace-pre-line">{m.body}</p>
                  {m.attachment && (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2 py-0.5 text-[12px] font-bold">
                      <FileText className="size-3.5" aria-hidden /> {m.attachment} itinerary
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Composer
          e={e}
          subject={e.messages.some((m) => m.sent) ? `Re: ${subject}` : subject}
          snippets={snippets(e, trip)}
          templates={templates(e, trip, signOff)}
          canAttach={Boolean(e.package && e.package.status === 'live')}
        />
      </section>

      <section className="grid gap-1.5 p-4 text-[13px]">
        <h3 className={H3}>
          Same customer <span className="ml-auto tracking-normal normal-case">{e.phone}</span>
        </h3>
        <b className="text-[12.5px]">Past trips</b>
        {bookings.length ? (
          bookings.map((b) => (
            <div key={b.ref} className="flex flex-wrap items-baseline gap-2">
              <Link href={`/admin/bookings/${b.ref}`} className="font-mono font-bold text-primary">
                {b.ref}
              </Link>
              <span>{b.packageName}</span>
              <span className="text-mute">
                · {formatDate(b.departs)} · {b.status.replace('_', ' ')}
              </span>
            </div>
          ))
        ) : (
          <span className="text-mute">No trips with us yet.</span>
        )}
        <b className="mt-1 text-[12.5px]">Other enquiries from this number</b>
        {e.related.length ? (
          e.related.map((r) => (
            <div key={r.id} className="flex flex-wrap items-baseline gap-2">
              <Link
                href={hrefFor(r.id)}
                scroll={false}
                className="font-mono font-bold text-primary"
              >
                {r.ref}
              </Link>
              <span>{r.packageName ?? 'General enquiry'}</span>
              <span className="text-mute">
                · {STAGE[r.status].label} · {istFullDate(r.createdAt)}
              </span>
            </div>
          ))
        ) : (
          <span className="text-mute">None, this is the first.</span>
        )}
      </section>

      <nav
        aria-label="Actions"
        className="sticky bottom-0 z-[4] grid grid-cols-3 gap-1.5 border-t border-line bg-bg p-2 shadow-[0_-12px_24px_-20px_rgba(20,32,42,.4)] lg:hidden"
      >
        <a
          href={telHref(e.phone)}
          className={cn(buttonVariants({ size: 'sm' }), 'flex-col gap-0.5 py-2 text-[12px]')}
        >
          <Phone className="size-4" aria-hidden /> Call
        </a>
        <a
          href={waHref(e.phone, hello)}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ size: 'sm', variant: 'outline' }),
            'flex-col gap-0.5 py-2 text-[12px]',
          )}
        >
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
        <a
          href="#inbox-composer"
          className={cn(
            buttonVariants({ size: 'sm', variant: 'outline' }),
            'flex-col gap-0.5 py-2 text-[12px]',
          )}
        >
          <Mail className="size-4" aria-hidden /> Reply
        </a>
      </nav>
    </aside>
  );
}
