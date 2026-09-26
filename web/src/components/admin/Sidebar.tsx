import { Eye, Inbox, LayoutGrid, LogOut, MapPin, Package, Ticket } from 'lucide-react';
import Link from 'next/link';
import { BrandMark } from '@/components/site/BrandMark';
import type { SessionInfo } from '@/lib/auth/session';
import { NavLink } from './NavLink';

export const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid, exact: true },
  { href: '/admin/packages', label: 'Packages', icon: Package },
  { href: '/admin/destinations', label: 'Destinations', icon: MapPin },
  { href: '/admin/bookings', label: 'Bookings', icon: Ticket },
  { href: '/admin/enquiries', label: 'Enquiries', icon: Inbox },
] as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Mockup `.adm .sb`: ink background, cobalt active item, marigold count, owner card, sign out. */
export function Sidebar({ session }: { session: SessionInfo }) {
  const { user, newEnquiries, bookingsAttention } = session;
  // Owner-only counts from `GET /auth/session`: new enquiries, and bookings with a refund to
  // record or a cancellation to answer (B10).
  const counts: Record<string, number | undefined> = {
    '/admin/enquiries': newEnquiries ?? undefined,
    '/admin/bookings': bookingsAttention ?? undefined,
  };
  return (
    <aside className="focus-ring-light flex flex-row flex-wrap items-center gap-1 bg-ink p-3 text-ink-soft lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-stretch lg:px-3.5 lg:py-[18px]">
      <Link
        href="/admin"
        className="mb-0 flex items-center gap-2 px-2 text-lg font-extrabold text-white lg:mb-4"
      >
        <BrandMark size={24} />
        Tripsmith
      </Link>
      <nav className="flex flex-row flex-wrap gap-1 lg:flex-col" aria-label="Admin">
        {NAV.map(({ href, label, icon: Icon, ...rest }) => (
          <NavLink
            key={href}
            href={href}
            exact={'exact' in rest ? rest.exact : false}
            count={counts[href]}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <span className="hidden flex-1 lg:block" />
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[.06] hover:text-white"
      >
        <Eye className="size-4" aria-hidden />
        View site
      </Link>
      <div className="hidden items-center gap-2.5 border-t border-ink-line px-3 py-2.5 text-[13px] lg:flex">
        <span className="grid size-8 place-items-center rounded-full bg-action text-xs font-extrabold text-ink">
          {initials(user.name)}
        </span>
        <span className="min-w-0">
          <b className="block truncate text-white">{user.name}</b>
          <span className="block truncate">{user.email}</span>
        </span>
      </div>
      <form method="post" action="/api/auth/logout">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[.06] hover:text-white"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </form>
    </aside>
  );
}
