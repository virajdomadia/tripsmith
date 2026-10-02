import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { LeaderCards, leadsLabel } from '@/components/admin/leaders/LeaderCards';
import { LeaderForm } from '@/components/admin/leaders/LeaderForm';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Trip leaders' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Trip leaders (R41, P3), Destinations A's layout: the cards, with the leader picked (`?sel=`,
 * else the first) open in the editor beside them. On a phone the editor follows the cards.
 */
export default async function LeadersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sel = Array.isArray(sp.sel) ? sp.sel[0] : sp.sel;
  const { items } = await api('/admin/leaders', { auth: true });
  const asked = sel ? items.find((l) => l.id === sel) : undefined;
  const stale = !!sel && !asked;
  const selected = asked ?? items[0] ?? null;
  const active = items.filter((l) => l.active).length;
  return (
    <>
      <PageHead
        title="Trip leaders"
        subtitle={`${active} active${items.length > active ? ` · ${items.length - active} switched off` : ''} · each package has a default leader, and any date can switch to another in the package editor`}
        actions={
          <Link href="/admin/leaders/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New leader
          </Link>
        }
      />
      {stale && (
        <p
          role="status"
          className="rounded-card bg-warn-soft px-4 py-2.5 text-sm font-semibold text-warn"
        >
          That leader no longer exists — showing {selected?.name ?? 'the list'} instead.
        </p>
      )}
      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <LeaderCards items={items} selected={selected?.id} />
        {selected && (
          <aside
            id="edit"
            aria-label={`Edit ${selected.name}`}
            className="grid min-w-0 scroll-mt-4 content-start gap-3 lg:sticky lg:top-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] font-extrabold tracking-tight">{selected.name}</h2>
              <span className="text-[12.5px] text-mute">
                {selected.active ? leadsLabel(selected) : 'Switched off'}
              </span>
            </div>
            <LeaderForm key={selected.id} mode="edit" layout="panel" leader={selected} />
          </aside>
        )}
      </div>
    </>
  );
}
