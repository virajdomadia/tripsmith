import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig keeps `jsx: preserve` for Next; vitest (Vite/oxc) must compile .tsx itself.
  oxc: { jsx: { runtime: 'automatic' } },
  // Mirrors tsconfig's `@/*` -> `./src/*` (Vite doesn't read tsconfig paths on its own); F11's
  // pdf.test.ts is the first test to import via the alias.
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // Component tests opt into jsdom per-file (`// @vitest-environment jsdom` as their first
  // line); everything else keeps running in node, which is what the pure-module tests need.
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
});
