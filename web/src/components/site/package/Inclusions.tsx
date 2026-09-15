import { Check, Cross } from './icons';

function List({ items, included }: { items: string[]; included: boolean }) {
  return (
    <ul className="grid gap-2">
      {items.map((t) => (
        <li key={t} className="flex items-baseline gap-2.5">
          {included ? (
            <Check className="h-4 w-4 shrink-0 translate-y-0.5 text-ok" />
          ) : (
            <Cross className="h-4 w-4 shrink-0 translate-y-0.5 text-mute/70" />
          )}
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Inclusions({
  inclusions,
  exclusions,
}: {
  inclusions: string[];
  exclusions: string[];
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="label-caps mb-3">Included</h3>
        <List items={inclusions} included />
      </div>
      <div>
        <h3 className="label-caps mb-3">Not included</h3>
        <List items={exclusions} included={false} />
      </div>
    </div>
  );
}
