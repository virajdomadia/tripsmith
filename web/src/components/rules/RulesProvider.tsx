'use client';

import { createContext, useContext } from 'react';
import type { Rules } from '@/lib/rules';

const RulesContext = createContext<Rules | null>(null);

/** Hands `GET /meta`'s booking rules (Q-5) to a client tree; the layout fetches them (`loadRules`),
 * null when the api was unreachable. */
export function RulesProvider({
  rules,
  children,
}: {
  rules: Rules | null;
  children: React.ReactNode;
}) {
  return <RulesContext.Provider value={rules}>{children}</RulesContext.Provider>;
}

/** For a surface that must work without the api (the enquiry form): null when unavailable. */
export const useOptionalRules = (): Rules | null => useContext(RulesContext);

export function useRules(): Rules {
  const rules = useContext(RulesContext);
  if (!rules) throw new Error('The booking rules (GET /meta) are unavailable');
  return rules;
}
