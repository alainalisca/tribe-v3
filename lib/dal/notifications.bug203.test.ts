/**
 * BUG-203: DAL tests for createNotification — the function that the
 * notify-join route now calls to guarantee the host sees an in-app
 * notification regardless of whether push/VAPID is configured.
 *
 * These tests verify:
 *  - createNotification inserts a row and returns success
 *  - createNotification does NOT read the row back (no RETURNING) — a
 *    recipient-scoped SELECT policy denies the read-back on every cross-user
 *    bell and rolls the INSERT back with it, which is how approve/decline/
 *    follow/like/interest bells were being silently dropped
 *  - createNotification skips self-notifications (actor === recipient)
 *  - createNotification surfaces DB errors correctly
 *  - createNotification handles actor_id === null (guest join path)
 *
 * The notify-join route itself wires together Next.js, Supabase admin,
 * rate-limiting, and the DAL — exercising the full route handler requires
 * an integration test environment (real Supabase or MSW). Testing the DAL
 * function directly covers the invariant that matters: an in-app row is
 * written for the host when a participant joins.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from './notifications';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

type InsertResult = { error: { message: string } | null };

/**
 * `insert()` resolves directly — there is no `.select().single()` chain. The
 * `select` property is a booby trap: if the DAL ever re-adds the RETURNING
 * read, these tests fail loudly rather than the bells silently disappearing
 * in production again.
 */
function makeMockSupabase(insertResult: InsertResult, insertedRows: unknown[] = []): SupabaseClient {
  return {
    from: (_table: string) => ({
      insert: (data: unknown) => {
        insertedRows.push(data);
        const promise = Promise.resolve(insertResult) as Promise<InsertResult> & { select: () => never };
        promise.select = () => {
          throw new Error('createNotification must not read the inserted row back (.select())');
        };
        return promise;
      },
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createNotification (BUG-203: in-app join notification)', () => {
  it('inserts a notification row and returns success, without reading it back', async () => {
    const inserted: unknown[] = [];
    const supabase = makeMockSupabase({ error: null }, inserted);

    const result = await createNotification(supabase, {
      recipient_id: 'host-uuid',
      actor_id: 'joiner-uuid',
      type: 'join',
      entity_type: 'session',
      entity_id: 'session-uuid',
      message: 'Ana joined your Running session',
    });

    expect(result.success).toBe(true);
    // No RETURNING read: the caller gets success, never a row.
    expect(result.data).toBeNull();
    expect(inserted).toEqual([
      {
        recipient_id: 'host-uuid',
        actor_id: 'joiner-uuid',
        type: 'join',
        entity_type: 'session',
        entity_id: 'session-uuid',
        message: 'Ana joined your Running session',
      },
    ]);
  });

  it('skips insert and returns success when actor_id === recipient_id (no self-notify)', async () => {
    // The mock will never be called; if it were, the test would need a db mock.
    // We pass a supabase that throws if reached to prove the guard fires first.
    const supabase = {
      from: () => {
        throw new Error('should not reach DB when actor === recipient');
      },
    } as unknown as SupabaseClient;

    const result = await createNotification(supabase, {
      recipient_id: 'same-uuid',
      actor_id: 'same-uuid',
      type: 'join',
      entity_type: 'session',
      entity_id: 'session-uuid',
      message: 'Self join — should be skipped',
    });

    // Self-notify is a no-op; the function returns success with null data.
    expect(result.success).toBe(true);
  });

  it('returns failure when the DB insert errors', async () => {
    const supabase = makeMockSupabase({ error: { message: 'unique_violation' } });

    const result = await createNotification(supabase, {
      recipient_id: 'host-uuid',
      actor_id: 'joiner-uuid',
      type: 'join',
      entity_type: 'session',
      entity_id: 'session-uuid',
      message: 'Ana joined your Running session',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('unique_violation');
  });

  it('handles null actor_id (guest join path) without throwing', async () => {
    const inserted: unknown[] = [];
    const supabase = makeMockSupabase({ error: null }, inserted);

    const result = await createNotification(supabase, {
      recipient_id: 'host-uuid',
      actor_id: null,
      type: 'join_guest',
      entity_type: 'session',
      entity_id: 'session-uuid',
      message: 'A guest joined your Running session',
    });

    expect(result.success).toBe(true);
    expect(inserted).toEqual([expect.objectContaining({ actor_id: null, type: 'join_guest' })]);
  });
});
