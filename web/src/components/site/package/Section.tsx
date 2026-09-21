import type { ReactNode } from 'react';

/** A nav-addressable section; `scroll-mt` clears the sticky header + section nav. */
export function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={title ? `${id}-title` : undefined}
      className="scroll-mt-32 pt-11 first:pt-0"
    >
      {title && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id={`${id}-title`} className="text-[clamp(24px,2.8vw,30px)]">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
