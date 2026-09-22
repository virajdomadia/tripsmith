import type { ReactNode } from 'react';

/** Mockup `.adm .hd`: title + one-line subtitle on the left, actions on the right. */
export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3.5">
      <div>
        <h1 className="text-[26px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 sm:ml-auto">{actions}</div>}
    </header>
  );
}
