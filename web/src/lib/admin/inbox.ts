import type { components } from '@/lib/api-types';
import { inr, MONTHS } from '@/lib/format';

/**
 * Enquiries A2 (R59, P20): the pure helpers behind the inbox — waiting against the 2-hour
 * first-reply target, follow-up wording, where an enquiry came from, the conversation thread,
 * and the snippets and templates that drop real trip facts into a reply.
 */

export type EnquiryRow = components['schemas']['EnquiryRow'];
export type AdminEnquiry = components['schemas']['AdminEnquiry'];
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute' | 'primary';

export const FIRST_REPLY_TARGET_MIN = 120; // api schemas/admin_enquiries.py
export const LOST_REASONS = [
  'Price too high',
  'Dates did not work',
  'Chose another option',
  'No reply after 3 follow-ups',
  'Just browsing',
] as const;

/** Won and Lost are the shipped Converted and Closed (R24's statuses, renamed on screen). */
export const STAGE: Record<AdminEnquiry['status'], { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'primary' },
  contacted: { label: 'Contacted', tone: 'warn' },
  converted: { label: 'Won', tone: 'ok' },
  closed: { label: 'Lost', tone: 'mute' },
};

const OPEN = new Set(['new', 'contacted']);
export const isOpen = (s: string) => OPEN.has(s);

/** Where it came from, read off its type: A2's Form / Callback / Concierge chip. */
export function source(type: string): { label: string; icon: 'form' | 'phone' | 'chat' } {
  if (type === 'callback') return { label: 'Callback', icon: 'phone' };
  if (type === 'chat-handoff') return { label: 'Concierge', icon: 'chat' };
  return { label: 'Form', icon: 'form' };
}

export function duration(minutes: number): string {
  if (minutes >= 1440) {
    const d = Math.floor(minutes / 1440);
    return `${d} ${d === 1 ? 'day' : 'days'}`;
  }
  return minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${Math.max(0, minutes)} min`;
}

const minutesSince = (iso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);

/** New and unanswered: how long it has waited against the 2-hour target, in words and tone. */
export function waiting(
  e: { status: string; replied: boolean; createdAt: string },
  now: Date = new Date(),
): { tone: Tone; text: string } | null {
  if (e.status !== 'new' || e.replied) return null;
  const m = minutesSince(e.createdAt, now);
  if (m >= FIRST_REPLY_TARGET_MIN)
    return { tone: 'bad', text: `Waiting ${duration(m)} · over target` };
  if (m >= 45) {
    return {
      tone: 'warn',
      text: `Waiting ${duration(m)} · ${duration(FIRST_REPLY_TARGET_MIN - m)} to target`,
    };
  }
  return { tone: 'ok', text: `Waiting ${duration(m)} · on target` };
}

const dayName = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const dayDiff = (iso: string, today: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/** "Follow up today" / "…tomorrow" / "…Thu 1 Oct" / "Follow-up overdue · …", and whether due. */
export function followUp(
  e: { status: string; followUpOn?: string | null },
  today: string,
): { due: boolean; text: string } | null {
  if (!e.followUpOn || !isOpen(e.status)) return null;
  const d = dayDiff(e.followUpOn, today);
  if (d < 0) return { due: true, text: `Follow-up overdue · ${dayName(e.followUpOn)}` };
  if (d === 0) return { due: true, text: 'Follow up today' };
  return {
    due: false,
    text: d === 1 ? 'Follow up tomorrow' : `Follow up ${dayName(e.followUpOn)}`,
  };
}

export const addDays = (today: string, n: number) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const followUpLabel = dayName;

export function party(adults: number, children: number): string {
  const a = `${adults} ${adults === 1 ? 'adult' : 'adults'}`;
  return children ? `${a}, ${children} ${children === 1 ? 'child' : 'children'}` : a;
}

export function monthLabel(iso?: string | null): string | null {
  if (!iso) return null;
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export function tripLine(e: {
  package?: { name: string } | null;
  travelMonth?: string | null;
  adults: number;
  children: number;
}): string {
  return [
    e.package?.name ?? 'General question',
    monthLabel(e.travelMonth),
    party(e.adults, e.children),
  ]
    .filter(Boolean)
    .join(' · ');
}

// --- the conversation ---------------------------------------------------------------------------

export type ThreadItem =
  | { kind: 'in'; at: string }
  | {
      kind: 'out';
      at: string;
      id: string;
      subject: string;
      body: string;
      sent: boolean;
      error: string | null;
      attachment: string | null;
    }
  | { kind: 'note'; at: string; id: string; body: string }
  | { kind: 'sys'; at: string; body: string };

/** Status moves and follow-ups are written as notes by the api; A2 shows them as system pills. */
const SYSTEM_NOTE = /^(Status changed from |Follow-up set for |Follow-up cleared$)/;

/** Their form first, then the owner's replies, internal notes and status pills, oldest first. */
export function thread(e: AdminEnquiry): ThreadItem[] {
  const items: ThreadItem[] = [
    ...e.messages.map((m) => ({
      kind: 'out' as const,
      at: m.sentAt,
      id: m.id,
      subject: m.subject,
      body: m.body,
      sent: m.sent,
      error: m.error,
      attachment: m.attachment?.name ?? null,
    })),
    ...e.notes.map((n) =>
      SYSTEM_NOTE.test(n.body)
        ? {
            kind: 'sys' as const,
            at: n.createdAt,
            body: n.body
              .replace('Status changed from ', 'Moved from ')
              .replace(/\bConverted\b/g, 'Won')
              .replace(/\bClosed\b/g, 'Lost'),
          }
        : { kind: 'note' as const, at: n.createdAt, id: n.id, body: n.body },
    ),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return [{ kind: 'in', at: e.createdAt }, ...items];
}

// --- snippets and templates ---------------------------------------------------------------------

export interface TripFacts {
  name: string;
  nights: number;
  fromPaise: number;
  /** Next departures with seats, soonest first: [label, seats left]. */
  dates: [string, number][];
}

const first = (name: string) => name.split(' ')[0] ?? name;

export function priceLine(e: AdminEnquiry, t: TripFacts | null): string {
  if (!t || !t.fromPaise) return 'I can price it as soon as you pick a trip and a month.';
  const pax = e.adults + e.children;
  return `${t.name} starts at ${inr(t.fromPaise)} per person for ${t.nights} nights. For ${party(e.adults, e.children)} that comes to about ${inr(t.fromPaise * pax)}.`;
}

export function datesLine(t: TripFacts | null): string {
  if (!t || t.dates.length === 0) return 'I will send the next dates as soon as they open.';
  return `Next dates with seats: ${t.dates
    .slice(0, 3)
    .map(([d, s]) => `${d} (${s} left)`)
    .join(', ')}.`;
}

export function snippets(e: AdminEnquiry, t: TripFacts | null): { label: string; text: string }[] {
  return [
    { label: 'Price from', text: priceLine(e, t) },
    { label: 'Next dates', text: datesLine(t) },
    { label: 'Call time', text: 'What time suits you for a 10-minute call today?' },
    {
      label: 'Itinerary',
      text: t
        ? `I can send you the day-by-day ${t.name} itinerary as a PDF.`
        : 'I can send a day-by-day itinerary once you pick a trip.',
    },
  ];
}

export function templates(e: AdminEnquiry, t: TripFacts | null, signOff: string) {
  const hi = `Hi ${first(e.name)},`;
  return [
    {
      key: 'first',
      label: 'First reply · trip facts',
      text: `${hi}\n\nThanks for your enquiry. ${priceLine(e, t)}\n\n${datesLine(t)}\n\nWould a quick call today suit you?\n\n${signOff}`,
    },
    {
      key: 'group',
      label: 'Group enquiry',
      text: `${hi}\n\nThanks for thinking of us for ${e.adults + e.children} people. For groups we run a private departure: one vehicle for the whole trip and rooms together where the hotel allows. ${priceLine(e, t)}\n\nCould you confirm the dates and where you start from? I will send a group quote within a day.\n\n${signOff}`,
    },
    {
      key: 'nudge',
      label: 'Quote follow-up',
      text: `${hi}\n\nJust checking in on the ${t?.name ?? 'trip'} quote. ${datesLine(t)} Shall I hold seats while you decide?\n\n${signOff}`,
    },
  ];
}
