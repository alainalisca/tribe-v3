/**
 * BUG-203: DAL tests for createNotification — the function that the
 * notify-join route now calls to guarantee the host sees an in-app
 * notification regardless of whether push/VAPID is configured.
 *
 * These tests verify:
 *  - createNotification inserts a row and returns success + data
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

type InsertResult = { data: unknown | null; error: { message: string } | null };

function makeMockSupabase(insertResult: InsertResult): SupabaseClient {
  return {
    from: (_table: string) => ({
      insert: (_data: unknown) => ({
        select: () => ({
          single: () => Promise.resolve(insertResult),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const NOTIFICATION_ROW = {
  id: 'notif-1',
  recipient_id: 'host-uuid',
  actor_id: 'joiner-uuid',
  type: 'join',
  entity_type: 'session',
  entity_id: 'session-uuid',
  message: 'Ana joined your Running session',
  is_read: false,
  created_at: '2026-06-28T10:00:00Z',
};

describe('createNotification (BUG-203: in-app join notification)', () => {
  it('inserts a notification row and returns success', async () => {
    const supabase = makeMockSupabase({ data: NOTIFICATION_ROW, error: null });

    const result = await createNotification(supabase, {
      recipient_id: 'host-uuid',
      actor_id: 'joiner-uuid',
      type: 'join',
      entity_type: 'session',
      entity_id: 'session-uuid',
      message: 'Ana joined your Running session',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ id: 'notif-1', type: 'join' });
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
    const supabase = makeMockSupabase({ data: null, error: { message: 'unique_violation' } });

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
    const guestRow = { ...NOTIFICATION_ROW, actor_id: null, type: 'join_guest' };
    const supabase = makeMockSupabase({ data: guestRow, error: null });

    const result = await createNotification(supabase, {
      recipient_id: 'host-uuid',
      actor_id: null,
      type: 'join_guest',
      entity_type: 'session',
      entity_id: 'session-uuid',
      message: 'A guest joined your Running session',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ actor_id: null, type: 'join_guest' });
  });
});
