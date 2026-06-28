/**
 * BUG-206: DAL tests for the instructor approve/decline pending join request flow.
 *
 * Tests cover:
 *  - fetchPendingParticipantsForSession: returns only status='pending' rows
 *  - updateParticipantStatus: pending → confirmed (approve path)
 *  - updateParticipantStatus: surfaces DB errors correctly
 *  - deleteParticipant: decline path removes the row
 *
 * UI-level testing of PendingRequestsPanel is impractical in this Jest/Vitest
 * setup (no jsdom rendering in the DAL test suite), so we test the DAL
 * functions that the component calls directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchPendingParticipantsForSession, updateParticipantStatus, deleteParticipant } from './participants';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------
/**
 * Builds a minimal Supabase client mock with a fluent builder chain.
 * `selectData` is returned by select() chains; `updateError`/`deleteError` let
 * each operation return distinct errors.
 */
function makeMockSupabase(opts: {
  selectData?: unknown[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const { selectData = [], selectError = null, updateError = null, deleteError = null } = opts;

  return {
    from: (_table: string) => ({
      // select chain used by fetchPendingParticipantsForSession
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            order: (_col3: string, _opts: unknown) => Promise.resolve({ data: selectData, error: selectError }),
          }),
        }),
      }),
      // update chain used by updateParticipantStatus
      update: (_payload: unknown) => ({
        eq: (_col: string, _val: unknown) => Promise.resolve({ error: updateError }),
      }),
      // delete chain used by deleteParticipant
      delete: () => ({
        eq: (_col: string, _val: unknown) => Promise.resolve({ error: deleteError }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// fetchPendingParticipantsForSession
// ---------------------------------------------------------------------------
describe('fetchPendingParticipantsForSession', () => {
  it('returns pending participants when DB returns rows', async () => {
    const rows = [
      {
        id: 'part-1',
        user_id: 'user-1',
        session_id: 'session-a',
        joined_at: '2026-01-01T00:00:00Z',
        status: 'pending',
        user: { id: 'user-1', name: 'Ana Restrepo', avatar_url: null },
      },
      {
        id: 'part-2',
        user_id: 'user-2',
        session_id: 'session-a',
        joined_at: '2026-01-01T01:00:00Z',
        status: 'pending',
        user: { id: 'user-2', name: 'Carlos Gómez', avatar_url: 'https://example.com/c.jpg' },
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
  it('returns success when DB update succeeds', async () => {
    const supabase = makeMockSupabase({ updateError: null });
    const result = await updateParticipantStatus(supabase, 'part-1', 'confirmed');

    expect(result.success).toBe(true);
  });

  it('returns error when DB update fails', async () => {
    const supabase = makeMockSupabase({ updateError: { message: 'row not found' } });
    const result = await updateParticipantStatus(supabase, 'part-ghost', 'confirmed');

    expect(result.success).toBe(false);
    expect(result.error).toBe('row not found');
  });
});

// ---------------------------------------------------------------------------
// deleteParticipant — decline path
// ---------------------------------------------------------------------------
describe('deleteParticipant (decline path)', () => {
  it('returns success when DB delete succeeds', async () => {
    const supabase = makeMockSupabase({ deleteError: null });
    const result = await deleteParticipant(supabase, 'part-1');

    expect(result.success).toBe(true);
  });

  it('returns error when DB delete fails', async () => {
    const supabase = makeMockSupabase({ deleteError: { message: 'foreign key violation' } });
    const result = await deleteParticipant(supabase, 'part-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('foreign key violation');
  });
});
