/**
 * Next.js instrumentation hook.
 *
 * `register()` is called once per runtime at server startup. We use it
 * to validate that the env vars our server-side code paths actually
 * need are non-empty.
 *
 * Why this exists: the Wompi outage of 2026-05-27 (see
 * docs/PAYMENTS_HANDOFF.md) was caused by `WOMPI_PRIVATE_KEY` being an
 * empty string in Vercel's env config. The Wompi adapter threw
 * "Missing Wompi credentials" inside a try/catch that returned null,
 * which surfaced as "Failed to create Wompi transaction" in the UI for
 * an unknown number of months. Nothing failed the boot — there was no
 * boot validation at all. This module is the structural fix.
 *
 * Behavior:
 *   - On the Node.js runtime, log every missing/empty required var.
 *   - In production, throw on missing CRITICAL vars (fails the deploy
 *     fast — the alternative is silently 500-ing every payment).
 *   - In dev / preview, log warnings only so local development isn't
 *     blocked by half-configured features.
 *
 * To temporarily allow a critical var to be missing (e.g. during the
 * Wompi outage when PAYMENT_GATEWAY_OVERRIDE=stripe is set), add the
 * key to the override allow-list at the bottom of this file.
 */

export function register() {
  // Only run on the Node.js server runtime, not Edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /**
   * CRITICAL vars: server code paths assume these are non-empty. A
   * missing one means a major feature (payments, auth, push, email,
   * cron, Tribe-OS shell) silently breaks in production.
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
   * WOMPI vars are critical ONLY when the Stripe override is OFF. When
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

  const banner = `[instrumentation] Missing or empty required env vars: ${missing.join(', ')}`;

  // In production, fail loudly. The cost of a noisy boot failure is
  // smaller than the cost of silent breakage discovered weeks later.
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console -- boot diagnostic must be visible in Vercel logs
    console.error(banner);
    throw new Error(banner);
  }

  // In dev / preview, warn but allow the server to start.
  // eslint-disable-next-line no-console -- boot diagnostic
  console.warn(banner);
}
