import { trackEvent } from '@/lib/analytics';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  route?: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, context?: LogContext) {
  const isDev = process.env.NODE_ENV === 'development';

  if (level === 'debug' && !isDev) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (isDev) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level.toUpperCase()}]`, message, context || '');
    return;
  }

  // Production: structured JSON for Vercel log parsing
  // console.error/warn still used so Vercel surfaces them in logs
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else if (level === 'info') {
    // LR-05: emit `info` in production so cron-run success lines are
    // visible in Vercel logs. Without this, a silently-succeeding cron
    // is indistinguishable from one that never ran. Kept as JSON for
    // structured parsing; Vercel surfaces console.log lines under the
    // Functions tab.
    console.log(JSON.stringify(entry));
  }
  // debug still suppressed in production — that level is for local noise.

  if (typeof window !== 'undefined' && (level === 'error' || level === 'warn')) {
    try {
      trackEvent('error_occurred', {
        message: typeof message === 'string' ? message : String(message),
        level,
        route: window.location.pathname,
        action: context?.action,
        component: context?.component,
      });
    } catch {
      // Silently fail — analytics should never break the app
    }
  }
}

export function logError(error: unknown, context?: LogContext) {
  // Extract a meaningful message + context for non-Error shapes. Without this,
  // plain-object errors (like Supabase's { code, message, details, hint }
  // shape) get stringified to "[object Object]" which is useless for
  // debugging. Pull the common fields into context and fall back to a JSON
  // dump so nothing gets silently dropped.
  let message: string;
  let stack: string | undefined;
  const extraContext: Record<string, unknown> = {};

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  } else if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    message = typeof errObj.message === 'string' ? errObj.message : JSON.stringify(error);
    // Surface Supabase / PostgREST / Stripe error fields if present.
    if (typeof errObj.code === 'string' || typeof errObj.code === 'number') {
      extraContext.code = errObj.code;
    }
    if (typeof errObj.details === 'string') extraContext.details = errObj.details;
    if (typeof errObj.hint === 'string') extraContext.hint = errObj.hint;
    if (typeof errObj.statusCode === 'number') extraContext.statusCode = errObj.statusCode;
    if (typeof errObj.type === 'string') extraContext.type = errObj.type;
    stack = typeof errObj.stack === 'string' ? errObj.stack : undefined;
  } else {
    message = String(error);
  }

  log('error', message, { ...context, ...extraContext, stack });

  // LR-01 (PostHog): forward every server-side logError to PostHog so
  // exceptions show up in PostHog → Activity → Exceptions alongside the
  // analytics/funnel events. Client-side errors are captured by PostHog's
  // own `capture_exceptions: true` option in lib/posthog.ts + the
  // React error boundaries in app/error.tsx and app/global-error.tsx.
  //
  // Dev is skipped so local repro doesn't pollute the production
  // exception list during normal debugging.
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    // Lazy import — captureServerError itself lazy-inits posthog-node, so
    // modules that only use log() don't pay the import cost.
    void import('@/lib/captureError')
      .then(({ captureServerError }) => captureServerError(error, context ?? {}))
      .catch(() => {
        // logError must never throw — swallow any forward-transport failure.
      });
  }
}

/**
 * LR-05: cron-run logger. Every app/api/cron/(name)/route.ts handler should
 * wrap its work in this helper so every run emits a consistent trio of
 * log lines Vercel can surface:
 *
 *   {"level":"info","message":"cron_start","route":"<name>",...}
 *   {"level":"info","message":"cron_complete","route":"<name>","duration_ms":X,...}
 *   (OR on failure)
 *   {"level":"error","message":"cron_failed","route":"<name>","duration_ms":X,...}
 *
 * `extra` is merged into the success log — use it for counts of rows
 * processed, emails sent, sessions cancelled, etc. Those numbers show
 * up in Vercel logs and give "did the cron actually do anything?"
 * answers without a DB query.
 *
 * Return the handler's result so the caller can still shape the JSON
 * response it sends back to the cron runner.
 */
export async function runCron<T>(
  route: string,
  handler: () => Promise<T & { extra?: Record<string, unknown> }>
): Promise<T> {
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });
  try {
    const result = await handler();
    const duration_ms = Date.now() - startedAt;
    log('info', 'cron_complete', {
      action: 'cron_complete',
      route,
      duration_ms,
      ...(result?.extra ?? {}),
    });
    return result;
  } catch (error) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    throw error;
  }
}
