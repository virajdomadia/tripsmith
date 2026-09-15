import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig keeps `jsx: preserve` for Next; vitest (Vite/oxc) must compile .tsx itself.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['tests/**/*.test.ts'] },
});
