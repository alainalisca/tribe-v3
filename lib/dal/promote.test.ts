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
import { insertServicePackage } from './promote';
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
