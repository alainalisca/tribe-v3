import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for end-to-end smoke tests.
 *
 * Setup (one-time):
 *   npm install -D @playwright/test
 *   npx playwright install chromium  # downloads the browser binaries
 *
 * Run:
 *   npx playwright test
 *   npx playwright test --ui            # debug headed
 *   npx playwright test smoke.spec.ts   # single file
 *
 * Environment expectations:
 *   - PLAYWRIGHT_BASE_URL: target server (defaults to localhost:3000).
 *     CI sets this to the Vercel preview URL for the current PR.
 *   - PLAYWRIGHT_TEST_USER_EMAIL / PASSWORD: pre-seeded staging
 *     account that exists in the target Supabase. Required for any
 *     test that signs in. Public-page smokes (landing, /auth) work
 *     without them.
 *
 * Coverage scope: these tests are SMOKE tests, not exhaustive flows.
 * The intent is "the critical user paths still work end-to-end" — a
 * one-minute green light before a merge to main. Deep behavior
 * (every filter combination, every error path) belongs in the
 * unit test suite where it's faster and more deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  // Bound test runtime so a hung test doesn't block CI for 30 minutes.
  // Individual tests can extend via test.setTimeout if a flow legitimately
  // needs more time.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Chromium covers ~80% of real-world bugs at a fraction of the
    // browser-install cost. Add webkit/firefox projects only when
    // a Safari- or Firefox-specific bug surfaces.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Dev-server boot: when running locally without PLAYWRIGHT_BASE_URL,
  // start `npm run dev` and wait for it. CI hits a deployed URL so
  // skip this branch.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
