import Image from 'next/image';
import type { ReactNode } from 'react';

type Props = {
  src: string;
  alt: string;
  sizes: string;
  /** Aspect ratio + radius live here, e.g. "aspect-[16/10] rounded-card". */
  className?: string;
  priority?: boolean;
  /** Overlays (Stamp, captions). */
  children?: ReactNode;
};

/** A positioned box with a cover-fit `next/image`; slow zoom on `group` hover. */
export function Photo({ src, alt, sizes, className = '', priority, children }: Props) {
  return (
    <div className={`group relative overflow-hidden bg-line ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover transition-transform duration-[1200ms] ease-(--ease-out) group-hover:scale-105"
      />
      {children}
    </div>
  );
}
