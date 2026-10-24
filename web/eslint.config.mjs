import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Generated: coverage (test:coverage) and Playwright's report / traces (e2e).
    ignores: [
      '.next/**',
      'next-env.d.ts',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];

export default config;
