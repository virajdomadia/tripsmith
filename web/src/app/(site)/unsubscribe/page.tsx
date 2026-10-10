import type { Metadata } from 'next';
import { Container } from '@/components/site/Container';
import { UnsubscribeCard } from '@/components/site/unsubscribe/UnsubscribeCard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

type Search = Record<string, string | string[] | undefined>;

/**
 * Where the review request's and the still-thinking email's "Unsubscribe" link lands (R53,
 * P15): `?t=` is the api's signed token. The page names the email and the address (masked) and
 * asks for one click — a GET never unsubscribes, so a link scanner can't do it by accident.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { t } = await searchParams;
  return (
    <Container className="grid min-h-[60dvh] place-items-center py-14">
      <UnsubscribeCard token={typeof t === 'string' ? t : ''} />
    </Container>
  );
}
