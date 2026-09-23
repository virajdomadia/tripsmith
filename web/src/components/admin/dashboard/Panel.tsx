import type { ReactNode } from 'react';

/** Mockup A2 `.panel`: a titled card. The optional `sub` carries the window ("· 30 days"). */
export function Panel({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-bg">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-extrabold">
          {title}
          {sub && <span className="ml-1.5 font-semibold text-mute">{sub}</span>}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
}
