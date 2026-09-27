import { Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { DestinationCards, packagesLabel } from '@/components/admin/destinations/DestinationCards';
import { DestinationForm } from '@/components/admin/destinations/DestinationForm';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Destinations' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Destinations A (R59, P20): cover cards in their order, with the destination picked (`?sel=`,
 * else the first) open in the editor beside them. The order sets the home page and the Explore
 * menu. On a phone the editor follows the cards.
 */
export default async function DestinationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sel = Array.isArray(sp.sel) ? sp.sel[0] : sp.sel;
  const { items } = await api('/admin/destinations', { auth: true });
  const asked = sel ? items.find((d) => d.id === sel) : undefined;
  const stale = !!sel && !asked;
  const selected = asked ?? items[0] ?? null;
  const live = items.reduce((n, d) => n + d.livePackageCount, 0);
  const hidden = items.filter((d) => d.livePackageCount === 0).length;
  return (
    <>
      <PageHead
        title="Destinations"
        subtitle={`${items.length} ${items.length === 1 ? 'destination' : 'destinations'} · ${live} live ${live === 1 ? 'package' : 'packages'}${hidden ? ` · ${hidden} hidden from the public grid (no live package)` : ''} · the order sets the home page and the Explore menu`}
        actions={
          <Link href="/admin/destinations/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New destination
          </Link>
        }
      />
      {stale && (
        <p
          role="status"
          className="rounded-card bg-warn-soft px-4 py-2.5 text-sm font-semibold text-warn"
        >
          That destination no longer exists — showing {selected?.name ?? 'the list'} instead.
        </p>
      )}
      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <DestinationCards items={items} selected={selected?.id} />
        {selected && (
          <aside
            id="edit"
            aria-label={`Edit ${selected.name}`}
            className="grid min-w-0 scroll-mt-4 content-start gap-3 lg:sticky lg:top-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] font-extrabold tracking-tight">{selected.name}</h2>
              <span className="text-[12.5px] text-mute">{packagesLabel(selected)}</span>
              {selected.livePackageCount > 0 && (
                <a
                  href={`/destinations/${selected.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: 'sm', variant: 'ghost', className: 'ml-auto' })}
                >
                  <Eye className="size-4" aria-hidden />
                  View page
                </a>
              )}
            </div>
            <DestinationForm
              // A fresh form per destination; a refresh never resets a dirty one.
              key={selected.id}
              mode="edit"
              layout="panel"
              destination={selected}
            />
          </aside>
        )}
      </div>
    </>
  );
}
