import type { components } from '@/lib/api-types';

type Item = components['schemas']['FaqItem'];

/** Native `<details>` accordion — no JS. */
export function Faq({ items }: { items: Item[] }) {
  return (
    <div>
      {items.map((f) => (
        <details key={f.q} className="group border-t border-line last:border-b">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="text-[22px] font-normal text-mute group-open:hidden">
              +
            </span>
            <span
              aria-hidden
              className="hidden text-[22px] font-normal text-mute group-open:inline"
            >
              –
            </span>
          </summary>
          <p className="mb-4 max-w-[65ch] text-ink2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
