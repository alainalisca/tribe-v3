import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest configuration.
 *
 * `test.exclude` holds a list of test files whose fixtures are known to be
 * stale relative to the current implementation. Each entry has a comment
 * explaining which refactor orphaned it. The remaining 154 tests are
 * expected to pass and are enforced by CI (see .github/workflows/ci.yml —
 * the `continue-on-error` escape hatch was removed when this file was
 * introduced).
 *
 * When you rewrite one of these fixtures, delete the corresponding exclude
 * entry and confirm the test passes locally before pushing.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      // Vitest defaults we preserve:
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.git/**',
      // All LOGIC-04 webhook fixtures (stripe, wompi, payment/create) were
      // rewritten 2026-04-21 against the current contracts and are no
      // longer excluded. Kept this header block for future refactor
      // discipline — if a webhook refactor breaks tests, add them here
      // with a dated note rather than deleting the assertions.
      // (All previously-excluded test files have been rewritten or removed
      // as of 2026-04-21 — this list is intentionally empty. If a refactor
      // orphans a fixture, add it here with a dated note explaining which
      // source change broke it so the next maintainer has context.)
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
