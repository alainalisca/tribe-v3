import { describe, it, expect, vi } from 'vitest';
import { addSessionGuest, removeSessionGuest } from './doorCheckin';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('addSessionGuest', () => {
  it('returns the participant id from a jsonb success body', async () => {
    const { client, rpc } = clientReturning({
      data: { success: true, participant_id: 'p-1', status: 'confirmed' },
      error: null,
    });
    const res = await addSessionGuest(client, 's-1', 'Maria');
    expect(rpc).toHaveBeenCalledWith('host_add_session_guest', { p_session_id: 's-1', p_guest_name: 'Maria' });
    expect(res).toEqual({ success: true, data: { participantId: 'p-1' } });
  });

  it('parses a stringified jsonb body', async () => {
    const { client } = clientReturning({ data: JSON.stringify({ success: true, participant_id: 'p-2' }), error: null });
    const res = await addSessionGuest(client, 's-1', 'Neera');
    expect(res).toEqual({ success: true, data: { participantId: 'p-2' } });
  });

  it('surfaces the RPC error string on { success: false }', async () => {
    const { client } = clientReturning({ data: { success: false, error: 'guest_name_required' }, error: null });
    const res = await addSessionGuest(client, 's-1', '   ');
    expect(res).toEqual({ success: false, error: 'guest_name_required' });
  });

  it('surfaces a transport error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'forbidden' } });
    const res = await addSessionGuest(client, 's-1', 'Salomon');
    expect(res).toEqual({ success: false, error: 'forbidden' });
  });
});

describe('removeSessionGuest', () => {
  it('succeeds on a { success: true } body', async () => {
    const { client, rpc } = clientReturning({ data: { success: true, removed: 1 }, error: null });
    const res = await removeSessionGuest(client, 's-1', 'p-1');
    expect(rpc).toHaveBeenCalledWith('host_remove_session_guest', { p_session_id: 's-1', p_participant_id: 'p-1' });
    expect(res.success).toBe(true);
  });

  it('surfaces not_removed', async () => {
    const { client } = clientReturning({ data: { success: false, error: 'not_removed' }, error: null });
    const res = await removeSessionGuest(client, 's-1', 'p-x');
    expect(res).toEqual({ success: false, error: 'not_removed' });
  });
});
