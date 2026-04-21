import type { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';

/**
 * Supabase-backed rate limiter.
 *
 * All callers should use `checkRateLimit(supabase, key, max, windowMs)`.
 * The legacy in-memory `rateLimit()` export was removed in 2026-04-21
 * (AUDIT-P0-1): it used a module-scoped Map that resets on every
 * serverless cold start, so the effective throttle was ~0 in production.
 *
 * Storage: requires the `rate_limits` table from migration 049.
 *
 * Key construction convention: `"{namespace}:{partition}"`, e.g.
 *   - `"signup:1.2.3.4"`         — IP-partitioned rate limits
 *   - `"invite:{user-uuid}"`     — user-partitioned
 *   - `"widget:{user-uuid}"`     — feedback widget
 * Prefix is mandatory so unrelated endpoints never share a bucket.
 *
 * Failure mode: fails OPEN (allows the request) on DB errors. The threat
 * model here is DoS amplification via spammable endpoints; if the DB is
 * down we have bigger problems than rate-limit bypass, and we don't want
 * a transient Supabase hiccup to 429 every user.
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  const resetAt = new Date(Date.now() + windowMs);

  try {
    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart);

    if (countError) {
      logError(countError, { action: 'checkRateLimit_count', key });
      return { allowed: true, remaining: maxRequests, resetAt };
    }

    const currentCount = count ?? 0;

    if (currentCount >= maxRequests) {
      log('warn', 'Rate limit exceeded', { key, count: currentCount, maxRequests });
      return { allowed: false, remaining: 0, resetAt };
    }

    const { error: insertError } = await supabase.from('rate_limits').insert({ key });
    if (insertError) {
      logError(insertError, { action: 'checkRateLimit_insert', key });
      // Still allow — the count was under limit at read time.
    }

    // Fire-and-forget cleanup of old entries. `void` to silence the
    // no-floating-promises lint without awaiting.
    void supabase.from('rate_limits').delete().eq('key', key).lt('created_at', windowStart);

    return { allowed: true, remaining: maxRequests - currentCount - 1, resetAt };
  } catch (error) {
    logError(error, { action: 'checkRateLimit', key });
    return { allowed: true, remaining: maxRequests, resetAt };
  }
}
