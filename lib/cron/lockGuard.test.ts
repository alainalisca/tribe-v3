/**
 * Tests for withCronLock — the advisory-lock wrapper around every
 * tribe-os cron handler.
 *
 * Three control flows to pin:
 *   1. Lock acquired → work runs, lock released in finally
 *   2. Lock already held by another session → work SKIPPED (not run)
 *   3. RPC unavailable (migration 084 not yet applied) → work runs
 *      WITHOUT the lock (graceful degradation)
 *
 * The release-on-error case is also tested because a thrown error
 * inside the work function must not leak the lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

import { withCronLock } from './lockGuard';

function mockSupabase(opts: {
  tryLockResult?: { data: boolean | null; error: { message: string } | null };
  releaseLockResult?: { data: boolean | null; error: { message: string } | null };
}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const supabase = {
    rpc: vi.fn((name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === 'cron_try_lock') {
        return Promise.resolve(opts.tryLockResult ?? { data: true, error: null });
      }
      if (name === 'cron_release_lock') {
        return Promise.resolve(opts.releaseLockResult ?? { data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return { supabase, rpcCalls };
}

describe('withCronLock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs work and releases the lock when acquired (happy path)', async () => {
    const { supabase, rpcCalls } = mockSupabase({});
    const work = vi.fn().mockResolvedValue('done');

    const result = await withCronLock(supabase as never, 'test-cron', work);

    expect(result).toEqual({ acquired: true, result: 'done' });
    expect(work).toHaveBeenCalledOnce();
    // Verify both RPC calls happened in the right order: try, then release.
    expect(rpcCalls.map((c) => c.name)).toEqual(['cron_try_lock', 'cron_release_lock']);
    expect(rpcCalls[0].args).toEqual({ p_key: 'test-cron' });
    expect(rpcCalls[1].args).toEqual({ p_key: 'test-cron' });
  });

  it('skips work (does NOT call it) when another session holds the lock', async () => {
    // cron_try_lock returns false → the lock is held elsewhere.
    // The wrapper must NOT run the work, must NOT call release
    // (we never had the lock to begin with).
    const { supabase, rpcCalls } = mockSupabase({
      tryLockResult: { data: false, error: null },
    });
    const work = vi.fn().mockResolvedValue('should-not-run');

    const result = await withCronLock(supabase as never, 'test-cron', work);

    expect(result).toEqual({ acquired: false, result: null });
    expect(work).not.toHaveBeenCalled();
    // Only the try-lock call — no release attempt for a lock we
    // don't hold.
    expect(rpcCalls.map((c) => c.name)).toEqual(['cron_try_lock']);
  });

  it('falls back to lock-free execution when the RPC errors (migration not yet applied)', async () => {
    // RPC error simulates migration 084 not yet applied in production.
    // The cron MUST still run — refusing to run because the lock
    // function doesn't exist would block every cron until the
    // SQL is applied.
    const { supabase, rpcCalls } = mockSupabase({
      tryLockResult: { data: null, error: { message: 'function cron_try_lock does not exist' } },
    });
    const work = vi.fn().mockResolvedValue('ran-without-lock');

    const result = await withCronLock(supabase as never, 'test-cron', work);

    expect(result.acquired).toBe(true);
    expect(result.result).toBe('ran-without-lock');
    expect(work).toHaveBeenCalledOnce();
    // We tried to acquire, failed, ran the work anyway, didn't
    // try to release a lock we didn't get.
    expect(rpcCalls.map((c) => c.name)).toEqual(['cron_try_lock']);
  });

  it('releases the lock even when work throws (the finally clause)', async () => {
    // A bug in the work function MUST NOT leak the advisory lock.
    // The next scheduled invocation would skip forever waiting
    // for the missing release. The wrapper's finally block is
    // what prevents this.
    const { supabase, rpcCalls } = mockSupabase({});
    const work = vi.fn().mockRejectedValue(new Error('boom inside work'));

    await expect(withCronLock(supabase as never, 'test-cron', work)).rejects.toThrow('boom inside work');

    // Both try AND release fired even though work threw.
    expect(rpcCalls.map((c) => c.name)).toEqual(['cron_try_lock', 'cron_release_lock']);
  });

  it('swallows release errors so a release hiccup never breaks the cron response', async () => {
    // If pg_advisory_unlock somehow errors, we still want the work's
    // result returned cleanly. The release error becomes a logged
    // warning, not an unhandled rejection.
    const { supabase } = mockSupabase({
      releaseLockResult: { data: null, error: { message: 'release failed' } },
    });
    const work = vi.fn().mockResolvedValue('happy result');

    const result = await withCronLock(supabase as never, 'test-cron', work);

    expect(result).toEqual({ acquired: true, result: 'happy result' });
  });

  it('passes the same key to both RPC calls (release matches acquire)', async () => {
    // A bug that hashed the key differently between try and release
    // would silently never unlock anything. Pin that they're identical.
    const { supabase, rpcCalls } = mockSupabase({});
    await withCronLock(supabase as never, 'audit-watchdog', async () => 'x');
    expect(rpcCalls[0].args).toEqual(rpcCalls[1].args);
  });
});
