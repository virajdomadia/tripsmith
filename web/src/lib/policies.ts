/**
 * The three policy pages as data (S10–S12), rendered by `PolicyPage`. Plain language on
 * purpose: these are read by travellers, not lawyers. The cancellation schedule is exported
 * separately because the package price box quotes it.
 */
import { BUSINESS } from './business';

export type PolicySlug = 'terms' | 'privacy' | 'cancellation-policy';

/** `id` makes a block linkable (`/privacy#demo`). */
export type PolicyBlock = { id?: string; h: string; p?: string[]; list?: string[] };

export type PolicyDoc = {
  slug: PolicySlug;
  /** Page h1 and <title>. */
  title: string;
  /** Switcher label. */
  short: string;
  /** Meta description and the lede under the h1. */
  summary: string;
  /** ISO date of the last change. */
  updated: string;
  blocks: PolicyBlock[];
};

export const POLICY_SLUGS = [
  'terms',
  'privacy',
  'cancellation-policy',
] as const satisfies readonly PolicySlug[];

const UPDATED = '2026-09-18';

export const CANCELLATION_SCHEDULE = [
  {
    window: '30 days or more before departure',
    refund: 'full refund, minus any non-refundable flight or train tickets we bought for you',
  },
  {
    window: '15 to 29 days before departure',
    refund: '50% of the package price is retained',
  },
  { window: '14 days or fewer before departure', refund: 'no refund' },
] as const;

const terms: PolicyDoc = {
  slug: 'terms',
  title: 'Terms of service',
  short: 'Terms',
  summary: 'What you are buying when you book a Tripsmith trip, and what each of us promises.',
  updated: UPDATED,
  blocks: [
    {
      h: 'Who we are',
      p: [
        `${BUSINESS.legalName}, ${BUSINESS.address}, ${BUSINESS.city}, is a tour operator registered in Karnataka. When you book with us you are booking with the four of us, not a marketplace — the person who answers the phone is the person who planned the trip.`,
      ],
    },
    {
      h: 'What a package includes',
      p: [
        'Exactly what the package page lists under "Included". Anything under "Not included" is paid by you locally, and we say what it usually costs so there are no surprises.',
        'Hotels are the ones named on the page. If a hotel cannot honour a booking we move you to one of the same standard or better and tell you before you travel.',
      ],
    },
    {
      h: 'Prices',
      p: [
        'Per person, in Indian rupees, for the sharing shown (double, triple, child, or a single supplement). Prices on the site are for the departure date shown next to them and hold for 7 days from a written quote.',
        'GST at 5% applies to the package price and is shown on your quote and invoice.',
      ],
    },
    {
      h: 'Booking and payment',
      p: [
        'A booking is confirmed when we receive the advance — 30% of the package price — and send you a confirmation with a booking reference. Until then seats are not held, and dates that fill up on the site do fill up.',
        'The balance is due 21 days before departure. For bookings made inside 21 days, the full amount is due at booking.',
      ],
    },
    {
      h: 'Changes and cancellations',
      p: [
        'One free date change up to 30 days before departure, subject to seats on the new date. Name changes are free at any time. Cancellations follow our cancellation & refunds policy, linked from every package page.',
      ],
    },
    {
      h: 'Your responsibilities',
      list: [
        'Carry a government photo ID for every traveller — hotels and ferries ask for it.',
        'Tell us about medical conditions, dietary needs and anyone under 12 or over 70 at booking, so the trip is planned around them.',
        'Be at the pick-up point on time; the coach or car cannot wait for late arrivals, and joining later is at your own cost.',
        'Look after your belongings; we are not responsible for loss or theft during the trip.',
      ],
    },
    {
      h: 'Our responsibilities and their limits',
      p: [
        'We choose our partners carefully, but we do not run the hotels, coaches, ferries or airlines ourselves. We are not liable for delays or changes caused by weather, road closures, strikes, ferry cancellations or events outside our control — but when they happen we rebook, reroute and stay on the phone until it is sorted out.',
        'Our liability for any claim is limited to the amount you paid us for the trip.',
      ],
    },
    {
      h: 'Disputes',
      p: [
        `Talk to us first — ${BUSINESS.email} or ${BUSINESS.phoneDisplay} — and we will try to fix it within seven days. Anything that cannot be resolved is subject to the courts of Bengaluru.`,
      ],
    },
  ],
};

const privacy: PolicyDoc = {
  slug: 'privacy',
  title: 'Privacy policy',
  short: 'Privacy',
  summary: 'What we collect when you enquire or book, why, who sees it, and how to delete it.',
  updated: '2026-09-24',
  blocks: [
    {
      id: 'demo',
      h: 'This site is a portfolio demo',
      p: [
        'Tripsmith is a working demonstration built for a developer’s portfolio, not a trading travel agency. Nobody will call you back, and no trip will be booked.',
        'The owner dashboard has a public demo login so that anyone can try it. That means every enquiry sent through this site — name, phone number, email and message included — can be read by anyone who signs in with it. Please do not submit real personal details; made-up ones show the flow just as well.',
      ],
    },
    {
      h: 'What we collect',
      p: [
        'When you enquire we store your name, phone number, email, the trip you asked about, your travel month, party size and anything you write to us, so that we can call you back and send you an itinerary.',
        'When you book we also store the names, ages and ID numbers of everyone travelling, because hotels, ferries and permits need them.',
      ],
    },
    {
      h: 'What we do with it',
      p: [
        'We use it to respond to your enquiry and, if you book, to run your trip. We do not sell it, we do not add you to a newsletter, and we do not run advertising that follows you around the internet.',
      ],
    },
    {
      h: 'Who sees it',
      p: [
        'On this demo: anyone who signs in with the public demo login can see every enquiry, as described above. The confirmation email goes out through our email provider, and the database and hosting providers store it on our behalf under their own privacy terms.',
        'In a real agency it would be the four of us at Tripsmith, and the hotels, transport partners and permit offices that need travellers’ names for a booking.',
      ],
    },
    {
      h: 'Cookies and analytics',
      p: [
        'The site sets no advertising cookies. We use privacy-respecting page analytics that count visits without identifying you, and an error-reporting service that records the page and browser when something breaks. The map on our contact page is embedded from Google Maps and may set its own cookies when you interact with it.',
      ],
    },
    {
      h: 'How long we keep it',
      p: [
        'Enquiries that did not lead to a booking are deleted after 12 months. Booking records are kept for 8 years because tax law requires it.',
      ],
    },
    {
      h: 'Your choices',
      p: [
        `Email ${BUSINESS.email} to see, correct or delete what we hold about you. We answer within 7 days. WhatsApp conversations are on WhatsApp’s terms; delete them from your side any time.`,
      ],
    },
  ],
};

const cancellation: PolicyDoc = {
  slug: 'cancellation-policy',
  title: 'Cancellation & refunds',
  short: 'Cancellation & refunds',
  summary:
    'One schedule for every trip on this site, counted from the departure date. No fine print.',
  updated: UPDATED,
  blocks: [
    {
      h: 'If you cancel',
      p: ['Every package on this site follows the same schedule, counted from the departure date:'],
      list: CANCELLATION_SCHEDULE.map((r) => `${r.window}: ${r.refund}`),
    },
    {
      h: 'If we cancel',
      p: [
        'If a departure does not reach minimum numbers, or cannot run safely because of weather, road closures or ferry cancellations, we tell you at least 10 days before departure and offer a full refund or a free move to another date. Departures marked "guaranteed" run regardless of numbers.',
      ],
    },
    {
      h: 'Changes',
      p: [
        'One free date change up to 30 days before departure, subject to seats on the new date. Name changes are free at any time. Changes inside 30 days are treated as a cancellation and a new booking.',
      ],
    },
    {
      h: 'Leaving a trip early',
      p: [
        'If you leave a trip after it has started, unused hotel nights and services are not refundable — they were paid for before you arrived.',
      ],
    },
    {
      h: 'How refunds are paid',
      p: [
        'To the original payment method within 7 working days of our confirming the cancellation in writing. Bank charges, if any, are deducted.',
      ],
    },
  ],
};

export const POLICIES: Record<PolicySlug, PolicyDoc> = {
  terms,
  privacy,
  'cancellation-policy': cancellation,
};

/** `2026-09-18` → `18 September 2026` (en-IN puts the day first). */
export function formatUpdated(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
