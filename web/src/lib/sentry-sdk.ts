/*
 * The two browser SDK functions the site uses, as named re-exports so the bundler can tree-shake
 * the rest. `import('@sentry/nextjs')` directly keeps the whole namespace — every export — in the
 * lazy chunk. Only ever loaded through lib/sentry-browser's dynamic import.
 */
export { captureException, init } from '@sentry/nextjs';
