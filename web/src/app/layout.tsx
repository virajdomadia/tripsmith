import { Analytics } from '@vercel/analytics/next';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Tripsmith', template: '%s · Tripsmith' },
  description:
    'Browse holiday packages, pay online, and chat with an AI concierge that plans an itinerary and books it for you.',
  icons: { icon: '/favicon.svg' },
};

// Route groups own their chrome: (site) renders the public header/footer, (admin) the owner shell.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
