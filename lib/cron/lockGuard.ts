/**
 * Cron concurrency guard.
 *
 * Wraps a cron handler's work in a Postgres advisory lock so two
 * concurrent invocations (manual + scheduled, or duplicate firing)
 * don't both do the work and stomp on each other's writes.
 *
 * Backed by migration 084's cron_try_lock / cron_release_lock RPCs.
 * Graceful degradation: when the migration hasn't been applied
 * yet (e.g. during the period between merging the code and running
 * the SQL in production), the RPC errors are caught and the work
 * proceeds without the lock. This is the right trade-off — we
 * want the cron to run, not silently skip — but it does mean the
 * concurrency protection only kicks in after the migration lands.
 *
 * Usage:
 *   await withCronLock(service, 'reconcile-counters', async () => {
 *     // your cron work here
 *   });
 *
 * Returns the inner function's return value on success, or null
 * if the lock was held (skip case). Errors from the inner function
 * propagate so the caller can decide how to handle them; the
 * release runs in a finally so the lock is always freed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

export type CronLockResult<T> = { acquired: true; result: T } | { acquired: false; result: null };

/**
 * Try to acquire the lock for `key`, run `work` if acquired, and
 * always release on the way out. Logs the skip case at warn level
 * so duplicate-fire patterns surface in monitoring.
 */
export async function withCronLock<T>(
  supabase: SupabaseClient,
  key: string,
  work: () => Promise<T>
): Promise<CronLockResult<T>> {
  let acquired = false;

  try {
    const { data, error } = await supabase.rpc('cron_try_lock', { p_key: key });
    if (error) {
      // Most likely: migration 084 hasn't been applied yet. Log and
      // continue without the lock. The cron still runs; we just
      // don't have the concurrency guarantee.
      log('warn', 'cron_lock_unavailable', {
        action: 'cron_lock_unavailable',
        key,
        error: error.message,
      });
      acquired = false; // we don't hold a lock to release
      const result = await work();
      return { acquired: true, result };
    }
    if (data !== true) {
      log('warn', 'cron_skipped_lock_held', {
        action: 'cron_skipped_lock_held',
        key,
      });
      return { acquired: false, result: null };
    }
    acquired = true;
  } catch (err) {
    log('warn', 'cron_lock_exception', {
      action: 'cron_lock_exception',
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fall through and run the work anyway — same trade-off as the
    // RPC-error branch above.
    const result = await work();
    return { acquired: true, result };
  }

  try {
    const result = await work();
    return { acquired: true, result };
  } finally {
    if (acquired) {
      // Release errors are swallowed — at this point the work is
      // done, and a missed release will be reclaimed when the
      // pooled connection cycles. Worst case: one missed run.
      try {
        await supabase.rpc('cron_release_lock', { p_key: key });
      } catch (err) {
        log('warn', 'cron_release_failed', {
          action: 'cron_release_failed',
          key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
