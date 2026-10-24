import { defineConfig, devices } from '@playwright/test';

/*
 * V9 end-to-end journeys (web/e2e): the production build against the real api over a throwaway
 * Postgres, with Razorpay, email, rate limiting and Sentry faked inside the api process
 * (api/tests/e2e_app.py). Nothing leaves the machine: the specs stub Checkout.js and abort every
 * other third-party request.
 *
 *   E2E_DATABASE_URL=postgresql+asyncpg://tripsmith@localhost:5432/tripsmith_e2e pnpm --filter web e2e
 *
 * The api server's command migrates and reseeds that database first (api/tests/e2e_seed.py), so
 * the web build — which prerenders the package pages from the api — sees the seeded catalog.
 * Playwright starts the servers in order, api first. Ports default to 8000 / 3000; set
 * E2E_API_PORT / E2E_WEB_PORT when those are taken. E2E_SKIP_BUILD=1 reuses the last build (it
 * must have been built against the same API_URL: the /api rewrite is fixed at build time).
 */

const apiPort = Number(process.env.E2E_API_PORT ?? 8000);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
// Server-to-server hops (web → api, the readiness check) use 127.0.0.1: on Windows `localhost`
// tries ::1 first, which uvicorn does not listen on. The browser and the seeded photo URLs keep
// `localhost` (next.config's dev image allow-list names that host).
const apiUrl = `http://127.0.0.1:${apiPort}`;
const photoHost = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;
const databaseUrl = process.env.E2E_DATABASE_URL ?? '';

const apiEnv = {
  E2E_DATABASE_URL: databaseUrl,
  E2E_API_URL: photoHost,
  E2E_WEB_URL: webUrl,
  PYTHONUNBUFFERED: '1',
};
const webEnv = {
  API_URL: apiUrl,
  NEXT_PUBLIC_SITE_URL: webUrl,
  NEXT_TELEMETRY_DISABLED: '1',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one api process, one database: the journeys run in turn
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `uv run --directory ../api python -m tests.e2e_seed && uv run --directory ../api uvicorn tests.e2e_app:app --no-access-log --port ${apiPort}`,
      url: `${apiUrl}/health`,
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: process.env.E2E_SKIP_BUILD
        ? `pnpm exec next start -p ${webPort}`
        : `pnpm exec next build --turbopack && pnpm exec next start -p ${webPort}`,
      url: webUrl,
      env: webEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
