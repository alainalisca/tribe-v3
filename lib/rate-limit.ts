import { log } from '@/lib/logger';

/**
 * TODO: Replace in-memory rate limiter with Supabase-backed implementation.
 * The in-memory Map does NOT work reliably on serverless (each cold start resets it).
 * Create this table in Supabase SQL Editor:
 *
 *   CREATE TABLE IF NOT EXISTS rate_limits (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     key text NOT NULL,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE INDEX idx_rate_limits_key_created ON rate_limits (key, created_at);
 *
 * Then replace checkRateLimit below with Supabase queries.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof globalThis !== 'undefined') {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  };
  setInterval(cleanup, 5 * 60 * 1000);
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * In-memory rate limiter — per-instance only, not shared across cold starts.
 * Provides burst protection but not strict enforcement on serverless.
 */
export function rateLimit(
  ip: string,
  { maxRequests = 10, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {}
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: new Date(now + windowMs) };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    log('warn', 'Rate limit exceeded', { ip, count: entry.count, maxRequests });
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: new Date(entry.resetAt) };
}

/**
 * Convenience alias matching the Supabase-backed API shape.
 * When migrating to Supabase, replace the body with DB queries.
 */
export async function checkRateLimit(
  _supabase: unknown,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  return rateLimit(key, { maxRequests, windowMs });
}
