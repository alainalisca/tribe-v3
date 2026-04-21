/**
 * Next.js instrumentation hook.
 *
 * Next.js calls `register()` once at server startup for the target runtime.
 * We use it to load the correct Sentry init based on whether we're running
 * on Node or Edge, so Node code doesn't try to `require` Edge-specific
 * modules and vice versa.
 *
 * LR-01: this is the canonical Sentry-in-Next.js wiring pattern.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * LR-01: onRequestError hook — Next.js 16 calls this on every uncaught
 * request error (both server and client-reflected). Forwarding to
 * Sentry.captureRequestError ensures every request error gets a Sentry
 * event even if the route forgot to wrap its body in a try/catch.
 */
export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string>;
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
    renderSource?: string;
    revalidateReason?: string;
  }
) {
  // Dynamically import so bundles for routes that never throw don't pay
  // for the SDK twice.
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(err, request, context);
}
