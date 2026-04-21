/**
 * Sentry configuration for the Node.js server runtime (API routes + RSC).
 *
 * LR-01. Mirrors sentry.client.config.ts but uses the non-public DSN env var
 * since server code isn't reachable by the browser bundle.
 *
 * Activation: set `SENTRY_DSN` in Vercel env. Unset = no-op.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',

    // Server-side sampling — higher than client because server errors are
    // operationally critical (payment webhooks, crons). 20% gives us real
    // signal without paying for volume.
    tracesSampleRate: 0.2,

    // Catch unhandled rejections + uncaught exceptions — Sentry Node SDK
    // handles this automatically when we init, but we document the intent.
    ignoreErrors: [
      // Expected cases that would otherwise flood the quota
      'UnauthorizedError',
      'NotFoundError',
    ],
  });
}
