/**
 * Sentry configuration for the browser runtime.
 *
 * LR-01 (Launch Readiness). Tribe runs with a solo on-call; Sentry is the
 * difference between "notification in minutes" and "user complaint next day."
 *
 * Activation: set `NEXT_PUBLIC_SENTRY_DSN` in Vercel env (Production + Preview).
 * Until that value exists, this init is a no-op — no events are sent and
 * no bundle cost is paid beyond the SDK import. Safe to ship on an unactivated
 * state.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // Release tagging — Vercel sets VERCEL_GIT_COMMIT_SHA automatically, so
    // every deploy gets its own release in the Sentry dashboard. This is what
    // makes "which deploy introduced this issue?" answerable.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development',

    // Sampling:
    //   - traces: 5% is defensive. Tribe is pre-launch; we can ratchet up
    //     once we have baseline volume.
    //   - replays: 10% on all sessions + 100% of sessions with an error, so
    //     we always have a replay for a crashed session without paying for
    //     all successful ones.
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all form inputs and text — users are in sensitive contexts
        // (payment forms, chat). We'd rather lose fidelity than leak PII.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // Ignore patterns — noise we don't want filling Sentry quota:
    ignoreErrors: [
      // Browser extensions leaking errors into the page
      /extension\//i,
      /^chrome-extension:\/\//i,
      // ResizeObserver loop warnings (benign, Chrome-specific)
      /ResizeObserver loop limit exceeded/,
      /ResizeObserver loop completed with undelivered notifications/,
      // User navigated away mid-request
      'AbortError',
    ],
  });
}
