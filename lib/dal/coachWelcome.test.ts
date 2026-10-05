import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimWelcomeForJoin, claimWelcomeForPass, saveWelcomeNote } from './coachWelcome';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const ONE = {
  success: true,
  notifications: [
    {
      event: 'welcome',
      recipient_id: 'u1',
      language: 'es',
      push: true,
      coach_id: 'c1',
      coach_first_name: 'Salomón',
      note: 'Hola',
    },
  ],
};

beforeEach(() => vi.mocked(logError).mockClear());

describe('coachWelcome DAL', () => {
  it('claims for a join with only the session id, and maps what the database decided', async () => {
    const m = rpcClient({ data: ONE, error: null });
    const res = await claimWelcomeForJoin(m.client, 's1');
    expect(m.rpc).toHaveBeenCalledWith('av_claim_welcome_for_join', { p_session_id: 's1' });
    expect(res.data).toEqual([
      { recipientId: 'u1', language: 'es', push: true, coachId: 'c1', coachFirstName: 'Salomón', note: 'Hola' },
    ]);
  });

  it('claims for a Pass with the lead and the signed-in user', async () => {
    const m = rpcClient({ data: ONE, error: null });
    await claimWelcomeForPass(m.client, 'lead-1', 'u1');
    expect(m.rpc).toHaveBeenCalledWith('av_claim_welcome_for_pass', { p_lead_id: 'lead-1', p_user_id: 'u1' });
  });

  it('push is true only when the database said exactly true', async () => {
    const m = rpcClient({ data: { ...ONE, notifications: [{ ...ONE.notifications[0], push: 'true' }] }, error: null });
    expect((await claimWelcomeForJoin(m.client, 's1')).data?.[0].push).toBe(false);
  });

  it('drops an entry without a recipient, coach or note rather than sending half a welcome', async () => {
    const m = rpcClient({
      data: { success: true, notifications: [{ recipient_id: 'u1', coach_id: 'c1' }] },
      error: null,
    });
    expect((await claimWelcomeForJoin(m.client, 's1')).data).toEqual([]);
  });

  it('a refusal (not joined) is a failure with its reason', async () => {
    const m = rpcClient({ data: { success: false, error: 'not_joined' }, error: null });
    expect(await claimWelcomeForJoin(m.client, 's1')).toEqual({ success: false, error: 'not_joined' });
  });

  it('recognises a transport error and logs it', async () => {
    const m = rpcClient({ data: null, error: { message: 'boom' } });
    expect((await claimWelcomeForJoin(m.client, 's1')).success).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), {
      action: 'claimWelcomeForJoin',
    });
  });

  it('saves the note, and null to clear it', async () => {
    const m = rpcClient({ data: { success: true }, error: null });
    await saveWelcomeNote(m.client, 'Hola');
    expect(m.rpc).toHaveBeenCalledWith('av_set_welcome_note', { p_text: 'Hola' });
    await saveWelcomeNote(m.client, null);
    expect(m.rpc).toHaveBeenCalledWith('av_set_welcome_note', { p_text: null });
  });
});
