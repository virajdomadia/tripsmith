'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * What the floating WhatsApp button says and whether it shows at all. The layout owns the
 * button; a page with its own WhatsApp CTAs (the package page: mobile bar + price box) hides it
 * so a short viewport never stacks two green buttons. Server-rendered HTML always carries the
 * generic link, so the no-JS visitor still gets a working button.
 */
export type WhatsAppPage = { message: string; hidden: boolean };

type Ctx = { page: WhatsAppPage | null; setPage: (page: WhatsAppPage | null) => void };

const WhatsAppContext = createContext<Ctx>({ page: null, setPage: () => {} });

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<WhatsAppPage | null>(null);
  return <WhatsAppContext.Provider value={{ page, setPage }}>{children}</WhatsAppContext.Provider>;
}

export const useWhatsAppPage = () => useContext(WhatsAppContext).page;

/**
 * Registers this page's message for the FAB while mounted. `hidden` is also a server-rendered
 * marker the FAB's CSS reads (`main:has([data-whatsapp-fab=hidden]) ~ &`), so the button never
 * flashes before hydration and stays hidden without JS.
 */
export function WhatsAppPageMessage({
  message,
  hidden = false,
}: {
  message: string;
  hidden?: boolean;
}) {
  const { setPage } = useContext(WhatsAppContext);
  useEffect(() => {
    setPage({ message, hidden });
    return () => setPage(null);
  }, [message, hidden, setPage]);
  return <span hidden data-whatsapp-fab={hidden ? 'hidden' : undefined} />;
}
