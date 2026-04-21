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

/**
 * LR-01: lazy Sentry forwarder. Loaded on first use to avoid pulling
 * `@sentry/nextjs` into modules that only import the logger for
 * client-side `log(...)` calls. The sentry config files (client/server/
 * edge) are no-ops until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set
 * in the runtime env, so this function is safe to call unconditionally.
 */
type SentryModule = typeof import('@sentry/nextjs') | null;
let sentryPromise: Promise<SentryModule> | null = null;

function getSentry(): Promise<SentryModule> {
  if (!sentryPromise) {
    sentryPromise = import('@sentry/nextjs').then((m): SentryModule => m).catch((): SentryModule => null);
  }
  return sentryPromise;
}

export function logError(error: unknown, context?: LogContext) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  log('error', message, { ...context, stack });

  // LR-01: forward every server-side logError to Sentry. Client-side
  // errors are picked up by Sentry's own integrations (replayIntegration,
  // window.onerror, React ErrorBoundary) configured in
  // sentry.client.config.ts — no need to double-report.
  //
  // Dev is skipped so local repro doesn't flood the production issue
  // list during normal debugging.
  if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    void getSentry()
      .then((Sentry) => {
        if (!Sentry) return;
        if (error instanceof Error) {
          Sentry.captureException(error, { extra: context });
        } else {
          Sentry.captureMessage(message, { level: 'error', extra: context });
        }
      })
      .catch(() => {
        // logError must never throw — swallow any Sentry transport failure.
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
