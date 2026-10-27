import type { ReactNode } from 'react';
import { RulesProvider } from '../src/components/rules/RulesProvider';
import { RULES } from './rules';

/** `render(ui, withRules)`: what the page around a booking sheet or compare table provides. */
export const withRules = {
  wrapper: ({ children }: { children: ReactNode }) => (
    <RulesProvider rules={RULES}>{children}</RulesProvider>
  ),
};
