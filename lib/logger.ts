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
}

export function logError(error: unknown, context?: LogContext) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  log('error', message, { ...context, stack });
}
