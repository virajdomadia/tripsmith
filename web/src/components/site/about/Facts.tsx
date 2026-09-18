/** The four-number strip from S8 (two live from the api, two static). */
export function Facts({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <dl className="mt-5.5 flex flex-wrap gap-6">
      {items.map(([num, label]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-sm font-semibold text-mute">{label}</dt>
          <dd className="num text-[26px] font-extrabold tracking-tight">{num}</dd>
        </div>
      ))}
    </dl>
  );
}
