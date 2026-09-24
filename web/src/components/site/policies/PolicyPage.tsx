import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUpdated, POLICIES, POLICY_SLUGS, type PolicySlug } from '@/lib/policies';
import { absolute } from '@/lib/seo/site-url';
import { Container } from '../Container';
import { PageHead } from '../PageHead';

export function policyMetadata(slug: PolicySlug): Metadata {
  const doc = POLICIES[slug];
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: absolute(`/${slug}`) },
  };
}

/** S10–S12: one layout, a switcher between the three, plain-language blocks. Static. */
export function PolicyPage({ slug }: { slug: PolicySlug }) {
  const doc = POLICIES[slug];
  return (
    <Container className="pb-20">
      <PageHead
        crumb="Policies"
        title={doc.title}
        lede={`${doc.summary} Last updated ${formatUpdated(doc.updated)}.`}
      />
      <nav aria-label="Policies" className="mt-3 flex flex-wrap gap-2">
        {POLICY_SLUGS.map((s) => (
          <Link
            key={s}
            href={`/${s}`}
            aria-current={s === slug ? 'page' : undefined}
            className={`rounded-chip border px-3.5 py-1.5 text-sm font-semibold no-underline transition-colors ${
              s === slug
                ? 'border-primary bg-primary text-white'
                : 'border-line text-ink2 hover:border-ink hover:text-ink'
            }`}
          >
            {POLICIES[s].short}
          </Link>
        ))}
      </nav>
      <article className="mt-8 grid max-w-[68ch] gap-7 leading-relaxed text-ink2">
        {doc.blocks.map((b) => (
          <section key={b.h} id={b.id} className="scroll-mt-24">
            <h2 className="mb-2 text-[clamp(20px,2.2vw,24px)] text-ink">{b.h}</h2>
            {b.p?.map((para) => (
              <p key={para} className="mb-3">
                {para}
              </p>
            ))}
            {b.list && (
              <ul className="grid list-disc gap-1.5 pl-5 marker:text-action-ink">
                {b.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p className="border-t border-line pt-5 text-sm text-mute">
          Questions about any of this? <Link href="/contact">Contact us</Link> — a person answers.
        </p>
      </article>
    </Container>
  );
}
