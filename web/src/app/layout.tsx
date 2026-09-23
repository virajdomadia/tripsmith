import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/seo/site-url';

// The one typeface of the K system (docs/04-ui-mockups.md): variable weight + optical size.
const dmSans = DM_Sans({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-dm-sans',
  display: 'swap',
});

/**
 * `metadataBase` resolves every relative OG image URL (F13) against the site's own origin — a
 * crawler cannot follow a relative one.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Tripsmith', template: '%s · Tripsmith' },
  description:
    'Browse holiday packages, pay online, and chat with an AI concierge that plans an itinerary and books it for you.',
  icons: { icon: '/favicon.svg' },
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
