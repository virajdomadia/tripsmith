/**
 * The three policy pages as data (S10–S12), rendered by `PolicyPage`. Plain language on
 * purpose: these are read by travellers, not lawyers. The cancellation schedule is exported
 * separately because the package price box quotes it.
 *
 * V5 (OP-5): every number a page promises comes from `PAYMENT_TERMS` or `RETENTION`, and every
 * retention promise names the job that keeps it — the pages say what the code does.
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

const V5 = '2026-10-23';

/**
 * The money rules the terms quote. Mirrors the api — `services/booking/deposit.py`
 * (DEPOSIT_PERCENT, BALANCE_DAYS, GRACE_DAYS, MIN_PART_PAISE), `orders.py` (HOLD),
 * `changes.py` (FREE_DAYS, ONLINE_DAYS, FEE_PER_TRAVELLER_PAISE) and `gst/tax.py`
 * (RATE_PERCENT); tests/policies.test.ts reads those files and fails when they drift.
 */
export const PAYMENT_TERMS = {
  depositPercent: 25,
  balanceDays: 30,
  graceDays: 2,
  minPartRupees: 1_000,
  holdMinutes: 10,
  freeChangeDays: 30,
  onlineChangeDays: 15,
  changeFeeRupees: 1_000,
  gstPercent: 5,
} as const;

/**
 * How long the privacy page says things are kept, each with the job that deletes them. Mirrors
 * `services/enquiries.py` KEEP_DAYS, `services/booking/details.py` PURGE_AFTER_DAYS and
 * `services/auth/sessions.py` SESSION_TTL (all run by `/cron/daily`); tested like PAYMENT_TERMS.
 */
export const RETENTION = {
  enquiryDays: 365,
  detailsDays: 30,
  sessionDays: 30,
} as const;

const T = PAYMENT_TERMS;
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

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

/** The date-change rule (`changes.py`), quoted on the terms and the cancellation page. */
const changeRule = `One date change per booking, from your account, subject to seats on the new date: free ${T.freeChangeDays} days or more before departure, ${rupees(T.changeFeeRupees)} a traveller from ${T.onlineChangeDays} to ${T.freeChangeDays - 1} days before, and ${T.onlineChangeDays - 1} days or fewer before only by talking to us. Any difference in fare is paid or refunded.`;

const terms: PolicyDoc = {
  slug: 'terms',
  title: 'Terms of service',
  short: 'Terms',
  summary: 'What you are buying when you book a Tripsmith trip, and what each of us promises.',
  updated: V5,
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
        `GST at ${T.gstPercent}% applies to the package price and is shown on your quote and invoice.`,
      ],
    },
    {
      h: 'Booking and payment',
      p: [
        `Seats are held for ${T.holdMinutes} minutes while you pay. A booking is confirmed when the payment goes through, and we email a confirmation with a booking reference; if the time runs out first, the seats go back on sale.`,
        `You can pay in full, or — when the package offers it — a ${T.depositPercent}% deposit now (the total after any discounts, rounded up to the rupee) and the balance by ${T.balanceDays} days before departure. Departures ${T.balanceDays} days away or less are paid in full at booking.`,
        `The balance can be paid in parts of at least ${rupees(T.minPartRupees)}. We remind you 7 and 3 days before it is due, and on the day. If it is still unpaid ${T.graceDays} days after that, the booking is cancelled and refunded under our cancellation & refunds policy, counted from that day.`,
      ],
    },
    {
      h: 'Changes and cancellations',
      p: [
        `${changeRule} Cancellations follow our cancellation & refunds policy, linked from every package page.`,
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
  updated: V5,
  blocks: [
    {
      id: 'demo',
      h: 'This site is a portfolio demo',
      p: [
        'Tripsmith is a working demonstration built for a developer’s portfolio, not a trading travel agency. Nobody will call you back, and no trip will be booked.',
        'The owner dashboard has a public demo login so that anyone can try it. That means everything sent through this site can be read by anyone who signs in with it: enquiries (name, phone number, email and message), bookings, waitlist entries, and the traveller details asked for after booking — dates of birth, emergency contacts, food and medical notes. ID numbers are the exception: the demo shows them masked. Please do not submit real personal details; made-up ones show the flow just as well.',
        'Emails are really sent: sign-in codes, booking confirmations and waitlist offers go to the address you type. An address ending in @example.com is never emailed — its sign-in code shows on screen instead — so use one of those if you would rather not receive anything. Because anyone can act as the owner here, emails the owner sends from the dashboard — inbox replies, and everything about a booking made at the counter — go to the demo owner’s own inbox, never to the address on the booking.',
      ],
    },
    {
      h: 'What we collect',
      p: [
        'When you enquire: your name, phone number and email, the trip you asked about, your travel month, party size and anything you write to us. We also keep a keyed hash of your internet address (it cannot be turned back into the address) and your browser’s name, to trace abuse of the form.',
        'When you book: the lead traveller’s name, phone number and email; each traveller’s name, age and room sharing; any coupon used; and, if you ask for a GST invoice, your company name, GSTIN and billing State. The payment itself — card, UPI or bank details — is handled by Razorpay; we keep only Razorpay’s payment reference, the amount and the payment record it sends us.',
        'After you book, for the trip itself: each traveller’s ID type and number (stored encrypted), date of birth, an emergency contact, food choice, allergies and medical notes.',
        'When you sign in: your name and email for your account, the packages you save, any review you write, and — for each signed-in device — its internet address and browser name. When you join a waitlist: your name, email, party size and internet address.',
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
        'On this demo: anyone who signs in with the public demo login can see every enquiry and booking, as described above.',
        'The services that run the site for us, each under its own privacy terms: Supabase stores the database (in Mumbai), Vercel hosts the site, Razorpay takes payments, Gmail sends our emails, and Sentry receives error reports.',
        'In a real agency it would be the four of us at Tripsmith, and the hotels, transport partners and permit offices that need travellers’ names for a booking.',
      ],
    },
    {
      h: 'Cookies and analytics',
      p: [
        `The site sets one cookie of its own, and only when you sign in: a session cookie that keeps you signed in for ${RETENTION.sessionDays} days. It sets no advertising cookies. Your browser also keeps, for the life of the tab, the packages in your compare tray, the email you just booked with (to fill in the sign-in form), and which package pages you have already viewed, so a refresh is not counted twice.`,
        'Vercel Web Analytics counts page visits without cookies and without identifying you. When something breaks, Sentry records the page, the browser and the error — with addresses, cookies and form contents stripped out. The map on our contact page is embedded from Google Maps and may set its own cookies when you interact with it.',
      ],
    },
    {
      h: 'How long we keep it',
      p: [
        'Each of these is done by our nightly clean-up job, so it happens without anyone remembering to:',
      ],
      list: [
        'Enquiries that did not lead to a booking are deleted 12 months after they arrive, with our notes and replies.',
        `Traveller details — ID numbers, dates of birth, emergency contacts, food and medical notes — are deleted ${RETENTION.detailsDays} days after the trip comes back.`,
        `A signed-in device’s session, with its internet address, is deleted when it expires, ${RETENTION.sessionDays} days after sign-in or at sign-out. Sign-in codes are deleted a day after they expire.`,
        'Booking records, payments and GST invoices are kept for at least 8 years, because tax law requires it. Your account, saved packages, reviews and waitlist entries stay until you ask us to delete them.',
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
  updated: V5,
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
      p: [changeRule],
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
