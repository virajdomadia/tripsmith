import type { components } from '@/lib/api-types';

type Health = components['schemas']['Health'];
type Meta = components['schemas']['Meta'];
type PackageList = components['schemas']['PackageList'];

type Props = { apiUrl: string } & (
  { health: Health; meta: Meta; packages: PackageList; error?: never } | { error: string }
);

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const badgeLabel = (meta: Meta, badge: PackageList['items'][number]['badge']) =>
  meta.badges.find((b) => b.value === badge)?.label ?? null;

/** Placeholder home content (S6): proves the web → api contract end to end. Replaced in F1. */
export function ApiStatus(props: Props) {
  if ('error' in props && props.error !== undefined) {
    return (
      <section aria-labelledby="api-status">
        <h1 id="api-status">API unreachable</h1>
        <p>
          <code>{props.apiUrl}</code> did not answer: {props.error}
        </p>
      </section>
    );
  }
  const { health, meta, packages, apiUrl } = props;
  return (
    <section aria-labelledby="api-status">
      <h1 id="api-status">Skeleton live</h1>
      <p>
        API at <code>{apiUrl}</code> — <code>/health</code>: <strong>{health.status}</strong>
      </p>

      <h2>Packages ({packages.total} live)</h2>
      <ul>
        {packages.items.map((p) => (
          <li key={p.slug}>
            {p.coverUrl && (
              // Plain <img>: the seed's --local URLs are not in next/image's remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.coverUrl} alt="" width={280} loading="lazy" />
            )}
            <h3>
              <a href={`/packages/${p.slug}`}>{p.name}</a>
            </h3>
            <p>
              {p.destination} · {p.nights} nights / {p.days} days · from{' '}
              <strong>{rupees.format(p.startingPricePaise / 100)}</strong> per person
              {p.badge && <> · {badgeLabel(meta, p.badge)}</>}
            </p>
            <ul>
              {p.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2>Themes</h2>
      <ul>
        {meta.themes.map((t) => (
          <li key={t.value}>
            {t.label} <code>{t.value}</code>
          </li>
        ))}
      </ul>

      <h2>Departure badges</h2>
      <ul>
        {meta.badges.map((b) => (
          <li key={b.value}>
            {b.label} <code>{b.value}</code>
          </li>
        ))}
      </ul>

      <h2>Enquiry types</h2>
      <ul>
        {meta.enquiryTypes.map((e) => (
          <li key={e.value}>
            {e.label} <code>{e.value}</code>
          </li>
        ))}
      </ul>

      <h2>Limits</h2>
      <dl>
        <dt>Max travellers</dt>
        <dd>{meta.limits.maxTravellers}</dd>
        <dt>Max themes per package</dt>
        <dd>{meta.limits.maxThemesPerPackage}</dd>
        <dt>Enquiry message max (chars)</dt>
        <dd>{meta.limits.enquiryMessageMax}</dd>
        <dt>Image max (bytes)</dt>
        <dd>{meta.limits.imageMaxBytes}</dd>
      </dl>
    </section>
  );
}
