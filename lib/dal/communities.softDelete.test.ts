import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { softDeleteCommunity } from './communities';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('softDeleteCommunity', () => {
  it('calls the migration 190 function with the id and the typed name, untrimmed', async () => {
    const { client, rpc } = clientReturning({ data: '2026-09-24T12:00:00Z', error: null });
    const res = await softDeleteCommunity(client, 'c-1', ' Runners Laureles ');
    expect(rpc).toHaveBeenCalledWith('soft_delete_community', {
      p_community_id: 'c-1',
      p_confirm_name: ' Runners Laureles ',
    });
    expect(res).toEqual({ success: true });
  });

  // Each SQLSTATE soft_delete_community raises, as rehearsed on production.
  it.each([
    ['28000', 'not_signed_in'],
    ['P0002', 'not_found'],
    ['55000', 'already_deleted'],
    ['42501', 'not_creator'],
    ['22023', 'name_mismatch'],
  ])('maps SQLSTATE %s to %s', async (code, reason) => {
    const { client } = clientReturning({ data: null, error: { code, message: 'x' } });
    const res = await softDeleteCommunity(client, 'c-1', 'x');
    expect(res.success).toBe(false);
    expect(res.reason).toBe(reason);
  });

  it('an unknown error is a generic failure, never a success', async () => {
    const { client } = clientReturning({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
    const res = await softDeleteCommunity(client, 'c-1', 'x');
    expect(res).toMatchObject({ success: false, reason: 'failed' });
  });
});
