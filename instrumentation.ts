/**
 * Next.js instrumentation hook.
 *
 * `register()` is called once per runtime when a server instance starts.
 * We use it to validate that the env vars our server-side code paths
 * actually need are non-empty, and to log loudly when one is missing.
 *
 * Why this exists: the Wompi outage of 2026-05-27 (see
 * docs/PAYMENTS_HANDOFF.md) was caused by `WOMPI_PRIVATE_KEY` being an
 * empty string in Vercel's env config. The Wompi adapter threw
 * "Missing Wompi credentials" inside a try/catch that returned null,
 * which surfaced as "Failed to create Wompi transaction" in the UI for
 * an unknown number of months. Nothing flagged it — there was no boot
 * validation at all. This module is the diagnostic that surfaces it.
 *
 * IMPORTANT — why this NEVER throws:
 *   An earlier version threw on missing CRITICAL vars in production,
 *   on the theory that it would "fail the deploy fast." That theory was
 *   wrong: `register()` does not run at build time, it runs at runtime on
 *   the serverless function. Throwing here does not fail the deploy — the
 *   deploy goes green, and then EVERY dynamically-rendered route 500s on
 *   cold start with "An error occurred while loading instrumentation
 *   hook." On 2026-06-14 a missing PAYMENT_GATEWAY_OVERRIDE=stripe (so the
 *   empty Wompi keys counted as required) took down /session/[id],
 *   /communities, /messages and every other dynamic route this way, while
 *   the statically-served home page kept working — a confusing, total
 *   outage caused by an OPTIONAL payment gateway not being configured.
 *
 *   So: a missing env var must never take down request handling. We log a
 *   loud, greppable error (visible in Vercel runtime logs) and let the
 *   server start. Genuinely load-bearing vars (Supabase URL/key) will
 *   still fail their own code paths with clear per-request errors if
 *   absent — that is strictly better than 500-ing everything from boot.
 *
 *   If you want a HARD failure for missing vars, do it at BUILD time
 *   (a prebuild script or a check in next.config), not in this hook.
 */

export function register() {
  // Only run on the Node.js server runtime, not Edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /**
   * CRITICAL vars: server code paths assume these are non-empty. A
   * missing one means a major feature (payments, auth, push, email,
   * cron, Tribe-OS shell) breaks in production. We log — we do not throw.
   */
  const CRITICAL: ReadonlyArray<string> = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'RESEND_API_KEY',
    'CRON_SECRET',
    'VAPID_PRIVATE_KEY',
    'VAPID_EMAIL',
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'FIREBASE_SERVICE_ACCOUNT_KEY',
  ];

  /**
   * WOMPI vars matter ONLY when the Stripe override is OFF. When
   * PAYMENT_GATEWAY_OVERRIDE=stripe is in effect (current state per the
   * 2026-05-27 fix), Wompi is bypassed entirely and missing Wompi keys
   * are fine. See docs/PAYMENTS_HANDOFF.md for the full story.
   */
  const wompiActive = process.env.PAYMENT_GATEWAY_OVERRIDE?.toLowerCase() !== 'stripe';
  const WOMPI_CRITICAL: ReadonlyArray<string> = wompiActive
    ? ['WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY', 'WOMPI_EVENTS_SECRET']
    : [];

  const allRequired = [...CRITICAL, ...WOMPI_CRITICAL];
  const missing = allRequired.filter((key) => {
    const v = process.env[key];
    return v === undefined || v === '';
  });

  if (missing.length === 0) return;

  // Loud, greppable, and non-fatal. Surfaces in Vercel runtime logs without
  // taking the app down. Never throw here — see the header comment.
  const banner = `[instrumentation] Missing or empty required env vars: ${missing.join(', ')}`;
  // eslint-disable-next-line no-console -- boot diagnostic must be visible in Vercel logs
  console.error(banner);
}
