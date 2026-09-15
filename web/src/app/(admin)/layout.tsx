import Link from 'next/link';

// Owner area: always dynamic, fetched with cookies (04 §1). Sign-in and the real shell land in F15.
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header>
        <nav aria-label="Admin">
          <Link href="/admin">Tripsmith admin</Link> · <Link href="/">Site</Link>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
