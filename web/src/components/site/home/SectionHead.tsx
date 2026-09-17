import Link from 'next/link';

type Props = { title: string; sub?: string; href?: string; link?: string };

/** Section heading row from the mockups: h2 + one-line sub on the left, a bold link on the right. */
export function SectionHead({ title, sub, href, link }: Props) {
  return (
    <div className="mb-5.5 flex items-end justify-between gap-5">
      <div>
        <h2 className="text-[clamp(26px,3.2vw,38px)]">{title}</h2>
        {sub && <p className="mt-1 text-mute">{sub}</p>}
      </div>
      {href && link && (
        <Link
          href={href}
          className="whitespace-nowrap font-bold text-primary no-underline hover:underline"
        >
          {link} →
        </Link>
      )}
    </div>
  );
}
