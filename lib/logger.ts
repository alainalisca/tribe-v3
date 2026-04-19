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
  }
  // info/debug suppressed in production (enable when Sentry/PostHog added)

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
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  log('error', message, { ...context, stack });
}
