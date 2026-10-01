import { defineConfig, devices } from '@playwright/test';

/**
 * T-AV27c. The Tribe Athletes end-to-end suite, against the LOCAL stack only.
 *
 * Run it with `npm run test:e2e:av`, never directly: the runner
 * (supabase/recon/t-av27c-e2e.LOCAL.sh) refuses a non-local stack, resets the
 * seed, starts a dev:av on the proof port with the athletes flag ON for the
 * "flag-on" project and OFF for the "flag-off" one, and hands this config
 * AV_E2E_BASE_URL. There is no webServer here on purpose: a config that
 * starts `npm run dev` would load .env.local, which is main's file.
 *
 * Serial and single-worker: the loop is one story told in order, and every
 * step writes to the same seeded database.
 */
const baseURL = process.env.AV_E2E_BASE_URL;
if (!baseURL) throw new Error('AV_E2E_BASE_URL is not set: run `npm run test:e2e:av`, not playwright directly.');

export default defineConfig({
  testDir: './e2e/av',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
  },
  projects: [
    { name: 'flag-on', grepInvert: /@flag-off/ },
    { name: 'flag-off', grep: /@flag-off/ },
  ],
});
