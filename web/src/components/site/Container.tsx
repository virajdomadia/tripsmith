import type { ReactNode } from 'react';

/** The page column from the mockups: 1220px, 16px side gutters on phones. */
export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-[min(1220px,100%-32px)] ${className}`}>{children}</div>;
}
