/**
 * The concierge's state (v3 C2): the conversation as the panel draws it, plus the trip ticket.
 *
 * Pure — every stream event from `POST /chat` is one `event` action, so the whole conversation is
 * a fold over what the api sent. Held by `ConciergeProvider` in the `(site)` layout's React state:
 * it survives moving between pages, and a reload starts a new chat (no cookie, no browser storage
 * — 03-requirements-v3, decisions table).
 *
 * The ticket shows only what the concierge actually searched with — the arguments of its tool
 * calls — so every stamped field traces to a lookup, never to a guess about the visitor's words.
 */

import { inr, MONTHS } from '@/lib/format';
import type {
  AlertOffer,
  AvailabilityArgs,
  ChatBooking,
  ChatDeparture,
  ChatPackage,
  HandoffPrefill,
  LimitReason,
  SearchArgs,
} from './types';

export type ToolPart = {
  kind: 'tool';
  id: string;
  name: string;
  label: string;
  state: 'running' | 'done' | 'failed';
};
export type Part =
  | { kind: 'text'; text: string }
  | ToolPart
  | { kind: 'packages'; id: string; packages: ChatPackage[]; total: number }
  | {
      kind: 'departures';
      id: string;
      slug: string;
      name: string;
      coverUrl: string | null;
      departures: ChatDeparture[];
      more: number;
    }
  | { kind: 'booking'; id: string; booking: ChatBooking }
  | { kind: 'alert'; id: string; offer: AlertOffer };

export type Item =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; parts: Part[]; streaming: boolean; error?: string }
  | { kind: 'limit'; id: string; reason: LimitReason; message: string }
  | { kind: 'handed-off'; id: string; ref: string; firstName: string; emailed: boolean };

export type Ticket = {
  where: string | null;
  when: string | null;
  nights: string | null;
  budget: string | null;
  line: string;
};

export type State = {
  conversationId: string | null;
  items: Item[];
  busy: boolean;
  ticket: Ticket;
  /** Packages seen in this chat by slug, so a departure list can carry the trip's name. */
  known: Record<string, { name: string; coverUrl: string | null }>;
  seq: number;
  /** C3: the enquiry form open in the panel, and what it starts with. */
  form: HandoffPrefill | null;
  /** C3: a booking sheet to open once the turn that asked for it has finished. */
  go: ChatBooking | null;
  /** C3: the party the concierge last booked for, so a list's "Book" keeps it. */
  party: { adults: number; children: number } | null;
};

export type Action =
  | { type: 'send'; text: string }
  | { type: 'started'; conversationId: string }
  | { type: 'event'; event: string; data: unknown }
  | { type: 'refused'; reason: LimitReason; message: string }
  | { type: 'failed'; message: string }
  | { type: 'reset' }
  | { type: 'open-form'; prefill?: HandoffPrefill }
  | { type: 'close-form' }
  | { type: 'handed-off'; ref: string; firstName: string; emailed: boolean }
  | { type: 'went' }
  | { type: 'booked'; data: unknown };

export const IDLE_LINE = 'Waiting for your first message';

export const initialState: State = {
  conversationId: null,
  items: [],
  busy: false,
  ticket: { where: null, when: null, nights: null, budget: null, line: IDLE_LINE },
  known: {},
  seq: 0,
  form: null,
  go: null,
  party: null,
};

export const EMPTY_PREFILL: HandoffPrefill = {
  summary: '',
  package: null,
  adults: null,
  children: null,
  month: null,
};

// ---- defensive readers: the stream is our api, but a missing field must not crash the page ----

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const BADGES = ['filling-fast', 'sold-out', 'likely-to-sell-out', 'guaranteed'] as const;

function toPackage(raw: unknown): ChatPackage | null {
  const p = obj(raw);
  const slug = str(p.slug);
  const name = str(p.name);
  if (!slug || !name || !/^[a-z0-9-]+$/.test(slug)) return null;
  const badge = str(p.badge);
  return {
    slug,
    name,
    destination: str(p.destination) ?? '',
    nights: num(p.nights) ?? 0,
    days: num(p.days) ?? 0,
    fromPricePaise: num(p.fromPricePaise) ?? 0,
    wasPricePaise: num(p.wasPricePaise) ?? null,
    themes: Array.isArray(p.themes) ? p.themes.filter((t) => typeof t === 'string') : [],
    highlights: Array.isArray(p.highlights)
      ? p.highlights.filter((t) => typeof t === 'string')
      : [],
    coverUrl: str(p.coverUrl) ?? null,
    badge: (BADGES as readonly string[]).includes(badge ?? '')
      ? (badge as ChatPackage['badge'])
      : null,
    seatsLeft: num(p.seatsLeft) ?? null,
    url: `/packages/${slug}`, // built here, not taken from the stream: always an internal link
  };
}

function toDeparture(raw: unknown): ChatDeparture | null {
  const d = obj(raw);
  const departureId = str(d.departureId);
  const date = str(d.date);
  if (!departureId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    departureId,
    date,
    seatsLeft: num(d.seatsLeft) ?? 0,
    pricePerPersonPaise: num(d.pricePerPersonPaise) ?? 0,
    guaranteed: d.guaranteed === true,
  };
}

const SLUG = /^[a-z0-9-]+$/;

function toBooking(raw: unknown): ChatBooking | null {
  const b = obj(raw);
  const packageSlug = str(b.packageSlug);
  const date = str(b.date);
  const url = str(b.url);
  const departureId = str(b.departureId);
  // Only ever an internal package page: the URL is checked, not trusted.
  if (!packageSlug || !SLUG.test(packageSlug) || !date || !departureId) return null;
  if (!url?.startsWith(`/packages/${packageSlug}?`) || !url.endsWith('#book')) return null;
  return {
    packageSlug,
    packageName: str(b.packageName) ?? packageSlug,
    departureId,
    date,
    adults: num(b.adults) ?? 2,
    children: num(b.children) ?? 0,
    totalPaise: num(b.totalPaise) ?? 0,
    url,
  };
}

function toPrefill(raw: Obj): HandoffPrefill {
  const pkg = obj(raw.package);
  const slug = str(pkg.slug);
  const name = str(pkg.name);
  const month = str(raw.month);
  return {
    summary: str(raw.summary) ?? '',
    package: slug && name && SLUG.test(slug) ? { slug, name } : null,
    adults: num(raw.adults) ?? null,
    children: num(raw.children) ?? null,
    month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
  };
}

function toAlert(raw: unknown): AlertOffer | null {
  const a = obj(raw);
  const name = str(a.name);
  const pkg = str(a.packageSlug);
  const dest = str(a.destinationSlug);
  if (!name) return null;
  if (pkg && SLUG.test(pkg)) return { target: 'package', slug: pkg, name };
  if (dest && SLUG.test(dest)) return { target: 'destination', slug: dest, name };
  return null;
}

// ---- wording ----

/** `2026-11` → `Nov 2026` */
export function monthLabel(month: string | undefined): string | null {
  const m = month?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const name = MONTHS[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : null;
}

const titleCase = (s: string) =>
  s
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function searchArgs(raw: unknown): SearchArgs {
  const a = obj(raw);
  return {
    destination: str(a.destination),
    maxBudget: num(a.maxBudget),
    nights: num(a.nights),
    theme: str(a.theme),
    month: str(a.month),
  };
}

function searchSummary(a: SearchArgs): string {
  const bits = [
    a.destination ? titleCase(a.destination) : 'every destination',
    a.nights ? plural(a.nights, 'night') : null,
    monthLabel(a.month),
    a.theme ? a.theme.replace(/-/g, ' ') : null,
    a.maxBudget ? `up to ${inr(a.maxBudget * 100)} a person` : null,
  ];
  return bits.filter(Boolean).join(' · ');
}

// ---- reducer ----

function patchTurn(state: State, fn: (turn: Extract<Item, { kind: 'assistant' }>) => void): State {
  const items = [...state.items];
  const i = items.findLastIndex((it) => it.kind === 'assistant');
  const found = items[i];
  if (!found || found.kind !== 'assistant' || !found.streaming) return state;
  const turn = { ...found, parts: [...found.parts] };
  fn(turn);
  items[i] = turn;
  return { ...state, items };
}

function onToolCall(state: State, data: Obj): State {
  const id = str(data.id) ?? `t${state.seq}`;
  const name = str(data.name) ?? '';
  let ticket = state.ticket;
  let label = 'Looking that up';
  if (name === 'searchPackages') {
    const a = searchArgs(data.args);
    label = `Searching ${searchSummary(a)}`;
    // A search states the whole brief, so it replaces the ticket's fields rather than merging.
    ticket = {
      where: a.destination ? titleCase(a.destination) : 'Anywhere',
      when: monthLabel(a.month),
      nights: a.nights ? String(a.nights) : null,
      budget: a.maxBudget ? inr(a.maxBudget * 100) : null,
      line: 'Searching live trips…',
    };
  } else if (name === 'checkAvailability') {
    const a = obj(data.args) as AvailabilityArgs;
    const slug = str(a.packageSlug) ?? '';
    const trip = state.known[slug]?.name ?? titleCase(slug);
    label = `Checking live dates for ${trip}`;
    ticket = {
      ...ticket,
      where: trip,
      when: monthLabel(str(a.month)) ?? ticket.when,
      line: 'Checking live dates…',
    };
  } else if (name === 'startBooking') {
    const a = obj(data.args);
    const people = (num(a.adults) ?? 0) + (num(a.children) ?? 0);
    label = people ? `Checking that date for ${plural(people, 'traveller')}` : 'Checking that date';
    ticket = { ...ticket, line: 'Getting the booking sheet ready…' };
  } else if (name === 'createEnquiry') {
    label = 'Getting the enquiry form ready';
    ticket = { ...ticket, line: 'Passing you to a person…' };
  }
  const next = patchTurn(state, (turn) => {
    turn.parts.push({ kind: 'tool', id, name, label, state: 'running' });
  });
  return { ...next, ticket, seq: state.seq + 1 };
}

function onToolResult(state: State, data: Obj): State {
  const id = str(data.id) ?? '';
  const name = str(data.name) ?? '';
  const result = obj(data.result);
  const failed = typeof result.error === 'string';
  let ticket = state.ticket;
  let known = state.known;
  let done = 'Looked it up';
  const extra: Part[] = [];
  let form = state.form;
  let go = state.go;
  let party = state.party;

  if (failed) {
    done = 'That lookup failed';
    ticket = { ...ticket, line: 'A lookup failed — trying again' };
  } else if (name === 'searchPackages') {
    const packages = (Array.isArray(result.packages) ? result.packages : [])
      .map(toPackage)
      .filter((p): p is ChatPackage => p !== null);
    const unknown = str(result.unknownDestination);
    const total = num(result.totalMatches) ?? packages.length;
    known = { ...known };
    for (const p of packages) known[p.slug] = { name: p.name, coverUrl: p.coverUrl };
    if (unknown) {
      done = `${titleCase(unknown)}: not a place we go yet`;
      ticket = { ...ticket, where: `${titleCase(unknown)} ✕`, line: 'Not something we sell yet' };
    } else if (packages.length) {
      done = `Found ${plural(total, 'trip')}`;
      ticket = { ...ticket, line: `Found ${plural(total, 'matching trip')}` };
      extra.push({ kind: 'packages', id: `${id}-r`, packages, total });
    } else {
      done = 'No trip matched';
      ticket = { ...ticket, line: 'Nothing matched — loosen one thing' };
    }
    const alert = toAlert(result.alertFor);
    if (alert) extra.push({ kind: 'alert', id: `${id}-a`, offer: alert });
  } else if (name === 'checkAvailability') {
    const slug = str(result.packageSlug) ?? '';
    const departures = (Array.isArray(result.departures) ? result.departures : [])
      .map(toDeparture)
      .filter((d): d is ChatDeparture => d !== null);
    const more = num(result.more) ?? 0;
    const trip = known[slug];
    done = departures.length ? `${plural(departures.length + more, 'date')} open` : 'No open dates';
    ticket = {
      ...ticket,
      line: departures.length
        ? `${plural(departures.length + more, 'date')} open`
        : 'No open dates',
    };
    if (departures.length && /^[a-z0-9-]+$/.test(slug)) {
      extra.push({
        kind: 'departures',
        id: `${id}-r`,
        slug,
        name: trip?.name ?? titleCase(slug),
        coverUrl: trip?.coverUrl ?? null,
        departures,
        more,
      });
    }
    const alert = toAlert(result.alertFor);
    if (alert) extra.push({ kind: 'alert', id: `${id}-a`, offer: alert });
  } else if (name === 'startBooking') {
    const booking = toBooking(result);
    if (booking) {
      done = 'Booking sheet ready';
      ticket = { ...ticket, where: booking.packageName, line: 'Opening the booking sheet' };
      extra.push({ kind: 'booking', id: `${id}-r`, booking });
      go = booking;
      party = { adults: booking.adults, children: booking.children };
    }
  } else if (name === 'createEnquiry') {
    done = 'Enquiry form open';
    ticket = { ...ticket, line: 'Add your details in the form' };
    form = toPrefill(result);
  }

  const next = patchTurn(state, (turn) => {
    const i = turn.parts.findIndex((p) => p.kind === 'tool' && p.id === id);
    const part = turn.parts[i];
    if (part?.kind === 'tool') {
      turn.parts[i] = { ...part, state: failed ? 'failed' : 'done', label: done };
    }
    turn.parts.push(...extra);
  });
  return { ...next, ticket, known, form, go, party };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'send': {
      const seq = state.seq + 2;
      return {
        ...state,
        busy: true,
        seq,
        items: [
          ...state.items,
          { kind: 'user', id: `u${state.seq}`, text: action.text },
          { kind: 'assistant', id: `a${state.seq + 1}`, parts: [], streaming: true },
        ],
        ticket: { ...state.ticket, line: 'Reading your message…' },
      };
    }
    case 'started':
      return { ...state, conversationId: action.conversationId };
    case 'event': {
      const data = obj(action.data);
      switch (action.event) {
        case 'text-delta': {
          const text = str(data.text);
          if (!text) return state;
          return patchTurn(state, (turn) => {
            const last = turn.parts.at(-1);
            if (last?.kind === 'text')
              turn.parts[turn.parts.length - 1] = { ...last, text: last.text + text };
            else turn.parts.push({ kind: 'text', text });
          });
        }
        case 'replace': {
          // C4 guardrail: the reply quoted something no tool returned. Its text goes; the cards
          // (real tool results) stay; the replacement line takes the text's place at the end.
          const text = str(data.text);
          if (!text) return state;
          return patchTurn(state, (turn) => {
            turn.parts = [...turn.parts.filter((p) => p.kind !== 'text'), { kind: 'text', text }];
          });
        }
        case 'tool-call':
          return onToolCall(state, data);
        case 'tool-result':
          return onToolResult(state, data);
        case 'done': {
          const next = patchTurn(state, (turn) => {
            turn.streaming = false;
          });
          const settled = next.ticket.line.endsWith('…');
          return {
            ...next,
            busy: false,
            conversationId: str(data.conversationId) ?? state.conversationId,
            ticket: settled
              ? { ...next.ticket, line: 'Ask me anything about these trips' }
              : next.ticket,
          };
        }
        case 'error': {
          const next = patchTurn(state, (turn) => {
            turn.streaming = false;
            turn.error =
              str(data.message) ?? 'Something went wrong on our side. Try again in a moment.';
          });
          return { ...next, busy: false, ticket: { ...next.ticket, line: 'Something went wrong' } };
        }
        default:
          return state; // an event this build doesn't know yet (C3 adds some): ignore it
      }
    }
    case 'refused': {
      // Refused before the stream opened: drop the empty answer, say why instead.
      const items = state.items.filter(
        (it, i) => !(i === state.items.length - 1 && it.kind === 'assistant' && !it.parts.length),
      );
      return {
        ...state,
        busy: false,
        seq: state.seq + 1,
        conversationId: action.reason === 'ended' ? null : state.conversationId,
        items: [
          ...items,
          { kind: 'limit', id: `l${state.seq}`, reason: action.reason, message: action.message },
        ],
        ticket: { ...state.ticket, line: 'Paused — the quick links below still work' },
      };
    }
    case 'failed': {
      const next = patchTurn(state, (turn) => {
        turn.streaming = false;
        turn.error = action.message;
      });
      return { ...next, busy: false, ticket: { ...next.ticket, line: 'Something went wrong' } };
    }
    case 'reset':
      return { ...initialState, seq: state.seq };
    case 'open-form':
      return { ...state, form: action.prefill ?? state.form ?? EMPTY_PREFILL };
    case 'close-form':
      return { ...state, form: null };
    case 'handed-off':
      return {
        ...state,
        form: null,
        seq: state.seq + 1,
        items: [
          ...state.items,
          {
            kind: 'handed-off',
            id: `h${state.seq}`,
            ref: action.ref,
            firstName: action.firstName,
            emailed: action.emailed,
          },
        ],
        ticket: { ...state.ticket, line: `Sent to the team · ${action.ref}` },
      };
    case 'went':
      return { ...state, go: null };
    case 'booked': {
      // A departure list's "Book" answered (POST /chat/booking): the same hand-off, no turn.
      const booking = toBooking(action.data);
      return booking ? { ...state, go: booking } : state;
    }
  }
}

/** The visible reply so far — what the panel announces when a turn ends. */
export function turnText(item: Item): string {
  return item.kind === 'assistant'
    ? item.parts
        .filter((p) => p.kind === 'text')
        .map((p) => p.text)
        .join('')
    : '';
}
