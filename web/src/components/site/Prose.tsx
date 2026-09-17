import { proseBlocks } from '@/lib/prose';

/** Paragraph + bold markdown (destination intros). The first paragraph reads as a lede. */
export function Prose({ markdown, className = '' }: { markdown: string; className?: string }) {
  return (
    <div className={`grid max-w-[62ch] gap-4 leading-relaxed text-ink2 ${className}`}>
      {proseBlocks(markdown).map((para, i) => (
        <p key={i} className={i === 0 ? 'text-lg' : undefined}>
          {para.map((part, j) =>
            typeof part === 'string' ? (
              part
            ) : (
              <strong key={j} className="font-bold text-ink">
                {part.strong}
              </strong>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
