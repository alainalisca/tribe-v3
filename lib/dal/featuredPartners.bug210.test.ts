/**
 * BUG-210: DAL tests for selfActivatePartner — the free beta self-activation
 * function that moves a pending featured_partner row to active (6-month trial).
 *
 * These tests verify:
 *  - First activation returns { success: true, data: { alreadyActive: false } }
 *  - Idempotent call (already active) returns { success: true, data: { alreadyActive: true } }
 *  - RPC returning ok: false with error 'no_application' surfaces as failure
 *  - RPC returning ok: false with error 'invalid_status' surfaces as failure
 *  - Supabase RPC transport error surfaces as failure
 *
 * The RPC itself (self_activate_featured_partner) runs SECURITY DEFINER in
 * Postgres and enforces ownership + status checks server-side. These unit tests
 * cover the DAL wrapper's contract; integration coverage requires a real DB.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { selfActivatePartner } from './featuredPartners';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock builder — simulates supabase.rpc('self_activate_featured_partner')
// ---------------------------------------------------------------------------

type RpcResult = { data: unknown; error: { message: string } | null };

function makeMockSupabase(rpcResult: RpcResult): SupabaseClient {
  return {
    rpc: (_fn: string) => Promise.resolve(rpcResult),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selfActivatePartner (BUG-210: free beta activation)', () => {
  it('returns { alreadyActive: false } on first activation', async () => {
    const supabase = makeMockSupabase({
      data: { ok: true, already_active: false },
      error: null,
    });

    const result = await selfActivatePartner(supabase);

    expect(result.success).toBe(true);
    expect(result.data?.alreadyActive).toBe(false);
  });

  it('returns { alreadyActive: true } when called on an already-active record (idempotent)', async () => {
    const supabase = makeMockSupabase({
      data: { ok: true, already_active: true },
      error: null,
    });

    const result = await selfActivatePartner(supabase);

    expect(result.success).toBe(true);
    expect(result.data?.alreadyActive).toBe(true);
  });

  it('returns failure when the instructor has no application (no_application)', async () => {
    const supabase = makeMockSupabase({
      data: { ok: false, error: 'no_application' },
      error: null,
    });

    const result = await selfActivatePartner(supabase);

    expect(result.success).toBe(false);
    expect(result.error).toBe('no_application');
  });

  it('returns failure when status cannot be activated (invalid_status)', async () => {
    const supabase = makeMockSupabase({
      data: { ok: false, error: 'invalid_status' },
      error: null,
    });

    const result = await selfActivatePartner(supabase);

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_status');
  });

  it('surfaces Supabase transport errors as failure', async () => {
    const supabase = makeMockSupabase({
      data: null,
      error: { message: 'function does not exist' },
    });

    const result = await selfActivatePartner(supabase);

    expect(result.success).toBe(false);
    expect(result.error).toContain('function does not exist');
  });

  it('handles a thrown exception without crashing', async () => {
    const supabase = {
      rpc: () => {
        throw new Error('network timeout');
      },
    } as unknown as SupabaseClient;

    const result = await selfActivatePartner(supabase);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to activate partner');
  });
});
