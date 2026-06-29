/**
 * BUG-204 regression: sendDirectMessage must insert conversation_id/user_id/
 * message WITHOUT session_id, and must treat a 0-row result as failure.
 *
 * Root cause: chat_messages.session_id was NOT NULL; the DM insert omitted it,
 * causing a constraint violation → "Connection error" in the UI.
 * Migration 103 makes session_id nullable.
 *
 * These tests verify:
 *  - A successful send inserts exactly { conversation_id, user_id, message }
 *    (no session_id key) and returns { success: true }.
 *  - A DB error (constraint, RLS, etc.) surfaces as { success: false, error }.
 *  - A 0-row result (RLS silently blocked the insert) surfaces as
 *    { success: false } rather than a false success.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendDirectMessage } from './conversations';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

type InsertSelectResult = {
  data: { id: string }[] | null;
  error: { message: string } | null;
};

/**
 * Builds a minimal Supabase mock that captures the insert payload so tests
 * can assert on what was actually written to the DB.
 */
function makeMockSupabase(result: InsertSelectResult, onInsert?: (payload: unknown) => void): SupabaseClient {
  return {
    from: (_table: string) => ({
      insert: (payload: unknown) => {
        onInsert?.(payload);
        return {
          select: (_cols: string) => Promise.resolve(result),
        };
      },
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendDirectMessage (BUG-204)', () => {
  it('inserts conversation_id, user_id, and message — NOT session_id', async () => {
    let capturedPayload: unknown;
    const supabase = makeMockSupabase({ data: [{ id: 'msg-1' }], error: null }, (p) => {
      capturedPayload = p;
    });

    const result = await sendDirectMessage(supabase, 'conv-abc', 'user-xyz', 'Hola!');

    expect(result.success).toBe(true);
    expect(capturedPayload).toMatchObject({
      conversation_id: 'conv-abc',
      user_id: 'user-xyz',
      message: 'Hola!',
    });
    // session_id must NOT be present in the insert — that was the bug.
    expect(capturedPayload).not.toHaveProperty('session_id');
  });

  it('returns { success: false } on DB error', async () => {
    const supabase = makeMockSupabase({
      data: null,
      error: { message: 'not_null_violation on session_id' },
    });

    const result = await sendDirectMessage(supabase, 'conv-abc', 'user-xyz', 'Hola!');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not_null_violation');
  });

  it('returns { success: false } when insert returns 0 rows (RLS block)', async () => {
    // Supabase returns { data: [], error: null } when RLS silently rejects an
    // insert. This used to surface as { success: true } — the 0-row check
    // introduced in BUG-204 makes it a real failure.
    const supabase = makeMockSupabase({ data: [], error: null });

    const result = await sendDirectMessage(supabase, 'conv-abc', 'user-xyz', 'Hola!');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
