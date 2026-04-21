/**
 * Sentry configuration for the Edge runtime (middleware + edge-flagged routes).
 *
 * LR-01. The Edge runtime is V8 isolates with a restricted Node API surface;
 * Sentry exposes an edge-specific init that works there. Tribe's middleware.ts
 * runs on Edge, so any uncaught exception in the CSP/auth logic lands here.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',

    // Edge is a small slice of traffic; sample every request so we don't miss
    // middleware / auth-gate issues.
    tracesSampleRate: 1.0,
  });
}
