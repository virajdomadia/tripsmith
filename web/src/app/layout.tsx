import type { Metadata } from 'next';
import { Newsreader, Public_Sans } from 'next/font/google';
const serif = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  axes: ['opsz'],
  style: ['normal', 'italic'],
});
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
import './globals.css';

export const metadata: Metadata = {
  title: 'Tripsmith \u2014 trips planned in a chat',
  description:
    'Browse holiday packages, pay online, and chat with an AI concierge that plans an itinerary and books it for you.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
