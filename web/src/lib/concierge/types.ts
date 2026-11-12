/**
 * The concierge's stream, as `POST /chat` sends it (api/app/routers/site/chat.py STREAM_DOC and
 * api/app/services/ai/tools.py). Hand-written: an SSE body is not in the OpenAPI contract. Every
 * payload is parsed defensively in `reducer.ts` — a field the api drops renders as absent, never
 * as a crash.
 */

export type ChatPackage = {
  slug: string;
  name: string;
  destination: string;
  nights: number;
  days: number;
  fromPricePaise: number;
  wasPricePaise: number | null;
  themes: string[];
  highlights: string[];
  coverUrl: string | null;
  badge: 'filling-fast' | 'sold-out' | 'likely-to-sell-out' | 'guaranteed' | null;
  seatsLeft: number | null;
  url: string;
};

export type ChatDeparture = {
  departureId: string;
  date: string;
  seatsLeft: number;
  pricePerPersonPaise: number;
  guaranteed: boolean;
};

export type SearchArgs = {
  destination?: string;
  maxBudget?: number;
  nights?: number;
  theme?: string;
  month?: string;
};

export type AvailabilityArgs = { packageSlug?: string; month?: string };

/** `error.reason` on a refused turn (api ChatLimitReason) plus the stream's own `error` reasons. */
export type LimitReason =
  'conversation_full' | 'ip_limit' | 'daily_cap' | 'monthly_cap' | 'ai_off' | 'ended';
