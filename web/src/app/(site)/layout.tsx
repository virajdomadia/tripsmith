import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { WhatsAppProvider } from '@/components/site/whatsapp/WhatsAppContext';
import { WhatsAppFab } from '@/components/site/whatsapp/WhatsAppFab';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <WhatsAppProvider>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <WhatsAppFab />
    </WhatsAppProvider>
  );
}
