/**
 * BUG-206: DAL tests for the instructor approve/decline pending join request flow.
 *
 * Tests cover:
 *  - fetchPendingParticipantsForSession: returns only status='pending' rows
 *  - updateParticipantStatus: pending → confirmed (approve path)
 *  - updateParticipantStatus: surfaces DB errors correctly
 *  - updateParticipantStatus: treats 0 affected rows as failure (RLS block detection)
 *  - deleteParticipant: decline path removes the row
 *  - deleteParticipant: treats 0 affected rows as failure (RLS block detection)
 *
 * UI-level testing of PendingRequestsPanel is impractical in this Jest/Vitest
 * setup (no jsdom rendering in the DAL test suite), so we test the DAL
 * functions that the component calls directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchPendingParticipantsForSession,
  updateParticipantStatus,
  deleteParticipant,
  deleteParticipantBySessionAndUser,
} from './participants';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------
/**
 * Builds a minimal Supabase client mock with a fluent builder chain.
 * `selectData` is returned by select() chains; `updateData`/`deleteData`
 * simulate affected rows returned by .select() after update/delete.
 * An empty array (default) simulates an RLS-blocked write (0 rows affected).
 */
function makeMockSupabase(opts: {
  selectData?: unknown[];
  selectError?: { message: string } | null;
  updateData?: unknown[];
  updateError?: { message: string } | null;
  deleteData?: unknown[];
  deleteError?: { message: string } | null;
}) {
  const {
    selectData = [],
    selectError = null,
    updateData = [{ id: 'part-1' }],
    updateError = null,
    deleteData = [{ id: 'part-1' }],
    deleteError = null,
  } = opts;

  // RLS-H3: writes now detect success via affected-row COUNT (no RETURNING
  // readback), and fetchPendingParticipantsForSession reads the flat roster view.
  // `updateData`/`deleteData` length simulates the affected-row count (empty = 0,
  // an RLS-blocked or no-match write).
  return {
    from: (_table: string) => ({
      // select chain used by fetchPendingParticipantsForSession (roster view)
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            order: (_col3: string, _opts: unknown) => Promise.resolve({ data: selectData, error: selectError }),
          }),
        }),
      }),
      // update chain: .update(payload, { count: 'exact' }).eq(id) → { count, error }
      update: (_payload: unknown, _opts?: unknown) => ({
        eq: (_col: string, _val: unknown) => Promise.resolve({ count: updateData.length, error: updateError }),
      }),
      // delete chain (thenable node): .delete({ count }).eq()[.eq()] → { count, error }
      delete: (_opts?: unknown) => {
        const node = {
          eq: () => node,
          then: (resolve: (v: { count: number; error: { message: string } | null }) => unknown) =>
            resolve({ count: deleteData.length, error: deleteError }),
        };
        return node;
      },
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// fetchPendingParticipantsForSession
// ---------------------------------------------------------------------------
describe('fetchPendingParticipantsForSession', () => {
  it('returns pending participants when DB returns rows', async () => {
    // Flat session_participants_roster rows; the DAL maps them back to nested {user}.
    const rows = [
      {
        id: 'part-1',
        user_id: 'user-1',
        session_id: 'session-a',
        joined_at: '2026-01-01T00:00:00Z',
        status: 'pending',
        user_profile_id: 'user-1',
        user_name: 'Ana Restrepo',
        user_avatar_url: null,
        user_preferred_language: 'es',
      },
      {
        id: 'part-2',
        user_id: 'user-2',
        session_id: 'session-a',
        joined_at: '2026-01-01T01:00:00Z',
        status: 'pending',
        user_profile_id: 'user-2',
        user_name: 'Carlos Gómez',
        user_avatar_url: 'https://example.com/c.jpg',
        user_preferred_language: 'en',
      },
    ];
    const supabase = makeMockSupabase({ selectData: rows });
    const result = await fetchPendingParticipantsForSession(supabase, 'session-a');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data![0].id).toBe('part-1');
    expect(result.data![1].user?.name).toBe('Carlos Gómez');
  });

  it('returns empty array when no pending requests exist', async () => {
    const supabase = makeMockSupabase({ selectData: [] });
    const result = await fetchPendingParticipantsForSession(supabase, 'session-b');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it('surfaces DB errors correctly', async () => {
    const supabase = makeMockSupabase({ selectError: { message: 'connection refused' } });
    const result = await fetchPendingParticipantsForSession(supabase, 'session-c');

    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

// ---------------------------------------------------------------------------
// updateParticipantStatus — approve path (pending → confirmed)
// ---------------------------------------------------------------------------
describe('updateParticipantStatus (approve path)', () => {
  it('returns success when DB update succeeds and returns an affected row', async () => {
    const supabase = makeMockSupabase({ updateData: [{ id: 'part-1' }], updateError: null });
    const result = await updateParticipantStatus(supabase, 'part-1', 'confirmed');

    expect(result.success).toBe(true);
  });

  it('returns error when DB update fails (Supabase error)', async () => {
    const supabase = makeMockSupabase({ updateData: [], updateError: { message: 'row not found' } });
    const result = await updateParticipantStatus(supabase, 'part-ghost', 'confirmed');

    expect(result.success).toBe(false);
    expect(result.error).toBe('row not found');
  });

  it('returns error when 0 rows are affected (RLS-blocked write)', async () => {
    // Simulates an RLS block: Supabase returns no error but 0 rows updated.
    const supabase = makeMockSupabase({ updateData: [], updateError: null });
    const result = await updateParticipantStatus(supabase, 'part-ghost', 'confirmed');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No rows updated/);
  });
});

// ---------------------------------------------------------------------------
// deleteParticipant — decline path
// ---------------------------------------------------------------------------
describe('deleteParticipant (decline path)', () => {
  it('returns success when DB delete succeeds and returns an affected row', async () => {
    const supabase = makeMockSupabase({ deleteData: [{ id: 'part-1' }], deleteError: null });
    const result = await deleteParticipant(supabase, 'part-1');

    expect(result.success).toBe(true);
  });

  it('returns error when DB delete fails (Supabase error)', async () => {
    const supabase = makeMockSupabase({ deleteData: [], deleteError: { message: 'foreign key violation' } });
    const result = await deleteParticipant(supabase, 'part-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('foreign key violation');
  });

  it('returns error when 0 rows are affected (RLS-blocked delete)', async () => {
    // Simulates an RLS block: Supabase returns no error but 0 rows deleted.
    const supabase = makeMockSupabase({ deleteData: [], deleteError: null });
    const result = await deleteParticipant(supabase, 'part-ghost');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No rows deleted/);
  });
});

// ---------------------------------------------------------------------------
// deleteParticipantBySessionAndUser — leave path (T-NOTIF1 hardening)
// ---------------------------------------------------------------------------
describe('deleteParticipantBySessionAndUser (leave path)', () => {
  it('returns success when a row is actually removed', async () => {
    const supabase = makeMockSupabase({ deleteData: [{ id: 'part-1' }], deleteError: null });
    const result = await deleteParticipantBySessionAndUser(supabase, 'sess-1', 'user-1');
    expect(result.success).toBe(true);
  });

  it('returns not_removed when 0 rows are deleted (RLS block or already gone)', async () => {
    const supabase = makeMockSupabase({ deleteData: [], deleteError: null });
    const result = await deleteParticipantBySessionAndUser(supabase, 'sess-1', 'user-ghost');
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_removed');
  });

  it('surfaces a Supabase error', async () => {
    const supabase = makeMockSupabase({ deleteData: [], deleteError: { message: 'db down' } });
    const result = await deleteParticipantBySessionAndUser(supabase, 'sess-1', 'user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});
