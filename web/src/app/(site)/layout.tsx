import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { WhatsAppProvider } from '@/components/site/whatsapp/WhatsAppContext';
import { WhatsAppFab } from '@/components/site/whatsapp/WhatsAppFab';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <WhatsAppProvider>
      {/*
       * Bypass blocks (WCAG 2.4.1): the header puts five links ahead of every page's content, so
       * the first Tab offers a jump past them. Off-screen until focused.
       */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-btn focus:bg-ink focus:px-4 focus:py-2.5 focus:font-bold focus:text-white focus:no-underline"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <WhatsAppFab />
    </WhatsAppProvider>
  );
}
