import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { OPEN_GRAPH } from '@/lib/seo/open-graph';
import { SITE_URL } from '@/lib/seo/site-url';

// The one typeface of the K system (docs/04-ui-mockups.md): variable weight + optical size.
const dmSans = DM_Sans({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const DESCRIPTION =
  'Short Indian holidays with real departure dates and per-person prices. Browse the trips, download the day-by-day itinerary as a PDF, and send an enquiry — a person calls you back within two hours.';

/**
 * `metadataBase` resolves every relative OG image URL (F13) against the site's own origin — a
 * crawler cannot follow a relative one.
 *
 * `openGraph` / `twitter` carry only what is true of every page (v1.0.1, lib/seo/open-graph):
 * Next fills og:title / og:description from each page's own title and description, and attaches
 * the site card (./opengraph-image.tsx) wherever a page has no card of its own.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Tripsmith', template: '%s · Tripsmith' },
  description: DESCRIPTION,
  icons: { icon: '/favicon.svg' },
  openGraph: OPEN_GRAPH,
  twitter: { card: 'summary_large_image' },
};

// Route groups own their chrome: (site) renders the public header/footer, (admin) the owner shell.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
