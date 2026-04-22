/**
 * Next.js instrumentation hook.
 *
 * Currently unused — kept as a placeholder so the hook is available
 * the moment we wire OpenTelemetry / tracing. Previously held Sentry
 * bootstrap; removed when we pivoted to PostHog for exception tracking
 * (LR-01 revised 2026-04-21).
 *
 * If you need this file for something, `register()` is called once per
 * runtime at server startup; `onRequestError()` is called on uncaught
 * errors in any route handler.
 */

export function register() {
  // no-op
}
