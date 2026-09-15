import type { ReactNode } from 'react';

/** A nav-addressable section; `scroll-mt` clears the sticky header + section nav. */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string | null;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={title ? `${id}-title` : undefined}
      className="scroll-mt-32 pt-11 first:pt-0"
    >
      {title && (
        <h2 id={`${id}-title`} className="mb-4 text-[clamp(24px,2.8vw,30px)]">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
