import { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';

/**
 * Supabase-backed rate limiter for serverless environments.
 * Requires this table (run in Supabase SQL Editor):
 *
 *   CREATE TABLE IF NOT EXISTS rate_limits (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     key text NOT NULL,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON rate_limits (key, created_at);
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Supabase-backed rate limit check.
 * Counts recent entries for the given key within the window.
 * Fails open (allows request) if DB is unavailable.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  const resetAt = new Date(Date.now() + windowMs);

  try {
    // Count recent entries within the window
    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart);

    if (countError) {
      logError(countError, { action: 'checkRateLimit_count', key });
      // Fail open — allow the request if DB is unavailable
      return { allowed: true, remaining: maxRequests, resetAt };
    }

    const currentCount = count ?? 0;

    if (currentCount >= maxRequests) {
      log('warn', 'Rate limit exceeded', { key, count: currentCount, maxRequests });
      return { allowed: false, remaining: 0, resetAt };
    }

    // Insert a new entry for this request
    const { error: insertError } = await supabase.from('rate_limits').insert({ key });
    if (insertError) {
      logError(insertError, { action: 'checkRateLimit_insert', key });
      // Still allow — the count was under limit
    }

    // Fire-and-forget cleanup of old entries
    supabase
      .from('rate_limits')
      .delete()
      .eq('key', key)
      .lt('created_at', windowStart)
      .then(() => {
        /* cleanup done */
      });

    return { allowed: true, remaining: maxRequests - currentCount - 1, resetAt };
  } catch (error) {
    logError(error, { action: 'checkRateLimit', key });
    // Fail open
    return { allowed: true, remaining: maxRequests, resetAt };
  }
}

/**
 * In-memory rate limiter fallback for cases where Supabase client isn't available.
 * Per-instance only — not shared across serverless cold starts.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

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
    log('warn', 'Rate limit exceeded (in-memory)', { ip, count: entry.count, maxRequests });
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: new Date(entry.resetAt) };
}
