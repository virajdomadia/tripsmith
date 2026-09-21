// Owner area: always dynamic, fetched with cookies (04 §1). The sidebar shell lands in F16 as a
// nested layout; this one only sets the canvas so /admin/login renders edge to edge.
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-bg text-ink">{children}</main>;
}
