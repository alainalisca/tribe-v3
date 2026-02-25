---
name: observability-enforcer
description: "Ensures proper structured logging, error tracking, and production observability in all code. Triggers when Claude writes async operations, catch blocks, API routes, error boundaries, or any code that could fail in production. Also triggers when the user mentions 'logging', 'monitoring', 'error tracking', 'Sentry', 'PostHog', 'observability', or 'production errors'. Console.log is for development — production needs structured logging."
---

# Observability & Logging Enforcer

In production, `console.log` disappears. You need structured logging that tells you what broke, for whom, and why — before users report it.

## Logging Levels

| Level | When to Use | Example |
|-------|------------|---------|
| `error` | Something failed that shouldn't have | Database query error, API route crash |
| `warn` | Something unexpected but handled | Rate limit approached, fallback used |
| `info` | Significant business events | User joined session, session created |
| `debug` | Detailed technical info (dev only) | Query params, response times |

## Logging Pattern

Use `lib/logger.ts` (create if it doesn't exist):

```typescript
// lib/logger.ts
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Development: console
  if (process.env.NODE_ENV === 'development') {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level.toUpperCase()}]`, message, context || '');
    return;
  }

  // Production: send to logging service
  // Replace with PostHog, Sentry, or your preferred service
  if (level === 'error') {
    // Sentry.captureException(new Error(message), { extra: context });
    console.error(`[${level.toUpperCase()}]`, message, context || '');
  }
}

export function logError(error: unknown, context?: LogContext) {
  const message = error instanceof Error ? error.message : String(error);
  log('error', message, {
    ...context,
    stack: error instanceof Error ? error.stack : undefined,
  });
}
```

## Where to Log

### Catch Blocks
```typescript
// BAD
catch (error) {
  console.error('Error:', error);
}

// GOOD
catch (error) {
  logError(error, { action: 'joinSession', userId: user.id, sessionId });
  showError('Could not join session');
}
```

### API Routes
```typescript
// Log every request (info) and every error (error)
export async function POST(request: NextRequest) {
  log('info', 'API called', { route: '/api/example', method: 'POST' });
  
  try {
    // ... business logic
    log('info', 'Action completed', { route: '/api/example', userId: user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/example', userId: user.id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Error Boundaries
```typescript
// app/error.tsx should log what it catches
'use client';
import { logError } from '@/lib/logger';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  logError(error, { action: 'error_boundary', component: 'app/error' });
  
  return (
    // ... recovery UI
  );
}
```

## Rules

1. **Never use bare `console.log` in production code** — use `lib/logger.ts`
2. **Always include context** — userId, sessionId, action name. Logs without context are useless.
3. **Log errors with the original error object** — preserves stack traces
4. **Don't log sensitive data** — no passwords, tokens, email addresses in logs
5. **Error boundaries must log** — a caught error that isn't logged is invisible in production
6. **API routes log requests and errors** — you need to know what's being called and what's failing
7. **Development-only debug logs** — wrap verbose logging in `process.env.NODE_ENV === 'development'`
