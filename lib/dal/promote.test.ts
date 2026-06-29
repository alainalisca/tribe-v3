/**
 * DAL unit tests for insertServicePackage (BUG-209).
 *
 * We mock the Supabase client so no real DB connection is needed.
 * The tests verify that insertServicePackage:
 *   1. Passes the exact payload to supabase.from('service_packages').insert()
 *   2. Returns { success: true, data: <row> } on success
 *   3. Returns { success: false, error: <message> } on DB error
 */
import { describe, it, expect, vi } from 'vitest';
import { insertServicePackage, followUser, unfollowUser } from './promote';
import type { SupabaseClient } from '@supabase/supabase-js';

function makeSupabaseMock(overrides: { data?: Record<string, unknown> | null; error?: { message: string } | null }) {
  const { data = null, error = null } = overrides;
  const single = vi.fn().mockResolvedValue({ data, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { from, insert, select, single } as unknown as SupabaseClient & {
    from: typeof from;
    insert: typeof insert;
    select: typeof select;
    single: typeof single;
  };
}

/** Build a mock for insert().select() or delete().eq().eq().select() chains */
function makeFollowMock({
  insertData,
  insertError,
  deleteData,
  deleteError,
}: {
  insertData?: unknown[] | null;
  insertError?: { message: string } | null;
  deleteData?: unknown[] | null;
  deleteError?: { message: string } | null;
}) {
  // delete chain: .delete().eq().eq().select()
  const deletedSelect = vi.fn().mockResolvedValue({ data: deleteData ?? null, error: deleteError ?? null });
  const deleteEq2 = vi.fn().mockReturnValue({ select: deletedSelect });
  const deleteEq1 = vi.fn().mockReturnValue({ eq: deleteEq2 });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEq1 });

  // insert chain: .insert().select()
  const insertSelect = vi.fn().mockResolvedValue({ data: insertData ?? null, error: insertError ?? null });
  const insertFn = vi.fn().mockReturnValue({ select: insertSelect });

  const from = vi.fn().mockReturnValue({ insert: insertFn, delete: deleteFn });
  return { from, insertFn, deleteFn } as unknown as SupabaseClient & { from: typeof from };
}

// ─── BUG-215: followUser / unfollowUser 0-row detection ──────────────────────

describe('followUser', () => {
  it('returns success when insert writes ≥1 row', async () => {
    const mock = makeFollowMock({ insertData: [{ follower_id: 'u1', following_id: 'u2' }] });
    const result = await followUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result).toEqual({ success: true, data: null });
  });

  it('returns failure when insert is RLS-blocked (0 rows, no error)', async () => {
    const mock = makeFollowMock({ insertData: [] });
    const result = await followUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blocked/i);
  });

  it('returns failure when insert returns null data (RLS-blocked edge case)', async () => {
    const mock = makeFollowMock({ insertData: null });
    const result = await followUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result.success).toBe(false);
  });

  it('returns failure when supabase returns an error', async () => {
    const mock = makeFollowMock({ insertError: { message: 'unique constraint' } });
    const result = await followUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result).toEqual({ success: false, error: 'unique constraint' });
  });
});

describe('unfollowUser', () => {
  it('returns success when delete removes ≥1 row', async () => {
    const mock = makeFollowMock({ deleteData: [{ follower_id: 'u1', following_id: 'u2' }] });
    const result = await unfollowUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result).toEqual({ success: true, data: null });
  });

  it('returns failure when delete is RLS-blocked (0 rows, no error)', async () => {
    const mock = makeFollowMock({ deleteData: [] });
    const result = await unfollowUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/blocked/i);
  });

  it('returns failure when delete returns null data (RLS-blocked edge case)', async () => {
    const mock = makeFollowMock({ deleteData: null });
    const result = await unfollowUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result.success).toBe(false);
  });

  it('returns failure when supabase returns an error', async () => {
    const mock = makeFollowMock({ deleteError: { message: 'foreign key violation' } });
    const result = await unfollowUser(mock as unknown as SupabaseClient, 'u1', 'u2');
    expect(result).toEqual({ success: false, error: 'foreign key violation' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('insertServicePackage', () => {
  it('calls insert with the correct payload and returns success', async () => {
    const row = {
      id: 'pkg-1',
      instructor_id: 'user-1',
      name: '10-Session Pack',
      description: 'Ten training sessions',
      price_cents: 1500000,
      currency: 'COP',
      package_type: 'session_pack',
      session_count: 10,
      duration_days: 60,
      is_active: true,
      tag: 'Popular',
      display_order: 0,
      created_at: '2026-06-28T00:00:00Z',
      updated_at: '2026-06-28T00:00:00Z',
    };
    const mock = makeSupabaseMock({ data: row, error: null });

    const payload = {
      instructor_id: 'user-1',
      name: '10-Session Pack',
      description: 'Ten training sessions',
      price_cents: 1500000,
      currency: 'COP',
      package_type: 'session_pack',
      session_count: 10,
      duration_days: 60,
      is_active: true,
      tag: 'Popular',
    };

    const result = await insertServicePackage(mock, payload);

    expect(mock.from).toHaveBeenCalledWith('service_packages');
    expect(mock.insert).toHaveBeenCalledWith(payload);
    expect(result).toEqual({ success: true, data: row });
  });

  it('returns { success: false } when supabase returns an error', async () => {
    const mock = makeSupabaseMock({ data: null, error: { message: 'duplicate key' } });

    const result = await insertServicePackage(mock, {
      instructor_id: 'user-1',
      name: 'Dupe Pack',
      price_cents: 500000,
    });

    expect(result).toEqual({ success: false, error: 'duplicate key' });
  });

  it('returns { success: false } on unexpected throw', async () => {
    // Override single to throw
    const single = vi.fn().mockRejectedValue(new Error('network failure'));
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const mock = { from } as unknown as SupabaseClient;

    const result = await insertServicePackage(mock, {
      instructor_id: 'user-1',
      name: 'Throw Pack',
      price_cents: 100000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to create service package/);
  });
});
