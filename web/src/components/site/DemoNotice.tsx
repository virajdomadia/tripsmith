import Link from 'next/link';

/**
 * Tripsmith is a portfolio piece: the owner dashboard has a public demo login, so anything sent
 * through the enquiry form is readable by whoever uses it. Said plainly wherever a visitor might
 * type their details (the form, the thanks page); the privacy policy says the same at length.
 */
export function DemoNotice({ className = '' }: { className?: string }) {
  return (
    <p
      className={`rounded-btn border border-line bg-bg2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink2 ${className}`}
    >
      <b className="font-bold text-ink">This is a portfolio demo.</b> Enquiries sent here are
      visible to anyone who signs in with the public demo login, so please don’t use your real name,
      number or email — made-up details work just as well.{' '}
      <Link href="/privacy#demo" className="whitespace-nowrap">
        More in the privacy policy
      </Link>
    </p>
  );
}
