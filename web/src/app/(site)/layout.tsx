import { RulesProvider } from '@/components/rules/RulesProvider';
import { loadRules } from '@/lib/meta';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SavedToasts } from '@/components/site/saved/SavedToasts';
import { CompareTray } from '@/components/site/compare/CompareTray';
import { Concierge } from '@/components/site/concierge/Concierge';
import { WhatsAppProvider } from '@/components/site/whatsapp/WhatsAppContext';
import { WhatsAppFab } from '@/components/site/whatsapp/WhatsAppFab';

/** The browser calls `POST /chat` on the api's own domain (v3), so it needs the address. */
const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <RulesProvider rules={await loadRules()}>
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
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter />
        <WhatsAppFab />
        <CompareTray />
        {/* v3 C2: after the tray, so the launcher can sit above it (`[data-compare-tray]~&`). */}
        <Concierge apiUrl={API_URL} />
        <SavedToasts />
      </WhatsAppProvider>
    </RulesProvider>
  );
}
