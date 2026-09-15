import Link from 'next/link';

/** Public header. Unstyled by design until S12; links fill in as their pages land (F1–F14). */
export function SiteHeader() {
  return (
    <header>
      <nav aria-label="Main">
        <Link href="/">Tripsmith</Link>
      </nav>
    </header>
  );
}
