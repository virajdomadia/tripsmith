import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { Container } from './Container';

/** Public header. Links fill in as their pages land (F8 About/Contact). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-ink no-underline"
        >
          <BrandMark />
          Tripsmith
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold text-mute">
          <Link href="/" className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
            Home
          </Link>
          <Link href="/destinations" className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
            Destinations
          </Link>
          <Link href="/packages" className="rounded-chip px-3 py-2 hover:bg-bg2 hover:text-ink">
            Trips
          </Link>
        </nav>
      </Container>
    </header>
  );
}
