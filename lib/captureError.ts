/**
 * Server-side exception capture → PostHog.
 *
 * LR-01 (revised 2026-04-21): Tribe uses PostHog for both analytics AND
 * exception tracking. Browser-side errors are handled by
 * `capture_exceptions: true` in lib/posthog.ts + the React error
 * boundaries in app/error.tsx and app/global-error.tsx. This module
 * covers the server side: API routes, webhooks, crons, and anywhere a
 * server-side try/catch wants to forward an error into the same
 * Activity → Exceptions view as the browser errors.
 *
 * Activation: set `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST`
 * in Vercel env. Until those are set, captureServerError is a no-op that
 * just logs to console — safe to call unconditionally.
 *
 * Why not `posthog-js` on the server: posthog-js is browser-only. The
 * `posthog-node` SDK is the canonical server client — separate process,
 * separate flush semantics. We configure it with `flushAt: 1` /
 * `flushInterval: 0` so every captured exception ships immediately
 * rather than being batched (we're in a short-lived serverless function;
 * there's no "later" to flush to).
 */

import { PostHog } from 'posthog-node';
import { log } from '@/lib/logger';

// Module-scope singleton. Serverless invocations may reuse the same
// warm instance, which is fine — PostHog client is safe to share.
let serverClient: PostHog | null = null;

function getServerClient(): PostHog | null {
  if (serverClient) return serverClient;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key) return null;

  serverClient = new PostHog(key, {
    host,
    // Flush immediately — we're inside a serverless function that may
    // get frozen seconds after returning the response. Batching risks
    // losing events when the lambda hibernates before the next flush.
    flushAt: 1,
    flushInterval: 0,
  });

  return serverClient;
}

interface CaptureContext {
  /** Optional — will be used as PostHog distinctId if present. */
  userId?: string;
  /** Route identifier, e.g., 'stripe-webhook' or 'cron:engagement'. */
  route?: string;
  /** Any other structured context to attach as properties. */
  [key: string]: unknown;
}

/**
 * Capture a server-side exception into PostHog. Fails open — if PostHog
 * is unreachable or unconfigured, we still log to console so the error
 * lands in Vercel's built-in log viewer.
 *
 * Usage:
 *   try { ... } catch (err) {
 *     await captureServerError(err, { route: 'stripe-webhook', event_id });
 *     return NextResponse.json({ error: 'internal' }, { status: 500 });
 *   }
 */
export async function captureServerError(err: unknown, context: CaptureContext = {}): Promise<void> {
  const error = err instanceof Error ? err : new Error(String(err));
  const stack = err instanceof Error ? err.stack : undefined;

  // Always log to console first — this is our guaranteed signal even if
  // PostHog is down. Vercel Logs picks this up automatically.
  log('error', error.message, { ...context, stack });

  const client = getServerClient();
  if (!client) return;

  try {
    const distinctId = typeof context.userId === 'string' ? context.userId : 'server';

    client.captureException(error, distinctId, {
      ...context,
      error_stack: stack,
      source: 'server',
      // Release tagging — Vercel exposes the commit SHA at build time so
      // every deploy gets its own release in the PostHog dashboard.
      release: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    });

    await client.flush();
  } catch (captureErr) {
    // captureServerError must NEVER throw. A forward-transport failure
    // would otherwise turn a captured-and-handled error into a fatal one.
    console.error('[captureServerError] failed to forward to PostHog', captureErr);
  }
}
