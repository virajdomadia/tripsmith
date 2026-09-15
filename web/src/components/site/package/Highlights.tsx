import { Check } from './icons';

export function Highlights({ items }: { items: string[] }) {
  return (
    <>
      <h2 className="mt-8 mb-4 text-[clamp(24px,2.8vw,30px)]">Highlights</h2>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {items.map((h) => (
          <li key={h} className="flex items-baseline gap-2.5">
            <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-ok" />
            {h}
          </li>
        ))}
      </ul>
    </>
  );
}
