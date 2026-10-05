import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCoachContactOptions, logCoachContactTap, saveWhatsAppContact } from './coachContact';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => vi.mocked(logError).mockClear());

describe('fetchCoachContactOptions', () => {
  it('asks av_coach_contact_options and returns the number', async () => {
    const m = rpcClient({ data: { whatsapp: '+573001112233' }, error: null });
    const res = await fetchCoachContactOptions(m.client, 'c1');
    expect(m.rpc).toHaveBeenCalledWith('av_coach_contact_options', { p_coach_id: 'c1' });
    expect(res.data).toEqual({ whatsapp: '+573001112233' });
  });

  it('no number means no button', async () => {
    const m = rpcClient({ data: { whatsapp: null }, error: null });
    expect((await fetchCoachContactOptions(m.client, 'c1')).data).toEqual({ whatsapp: null });
  });

  it('recognises a failed read: logs it and reports failure', async () => {
    const m = rpcClient({ data: null, error: { message: 'permission denied' } });
    expect((await fetchCoachContactOptions(m.client, 'c1')).success).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'permission denied' }),
      expect.objectContaining({ action: 'fetchCoachContactOptions' })
    );
  });
});

describe('logCoachContactTap', () => {
  it('sends coach, channel, source and session to av_coach_contact_tap', async () => {
    const m = rpcClient({ data: { success: true }, error: null });
    const res = await logCoachContactTap(m.client, {
      coachId: 'c1',
      channel: 'whatsapp',
      source: 'session',
      sessionId: 's1',
    });
    expect(m.rpc).toHaveBeenCalledWith('av_coach_contact_tap', {
      p_coach_id: 'c1',
      p_channel: 'whatsapp',
      p_source: 'session',
      p_session_id: 's1',
    });
    expect(res.success).toBe(true);
  });

  it('a storefront tap sends no session', async () => {
    const m = rpcClient({ data: { success: true }, error: null });
    await logCoachContactTap(m.client, { coachId: 'c1', channel: 'whatsapp', source: 'storefront' });
    expect(m.rpc).toHaveBeenCalledWith('av_coach_contact_tap', expect.objectContaining({ p_session_id: null }));
  });

  it('a server refusal is a failure carrying its reason', async () => {
    const m = rpcClient({ data: { success: false, error: 'own_profile' }, error: null });
    expect(await logCoachContactTap(m.client, { coachId: 'c1', channel: 'whatsapp', source: 'storefront' })).toEqual({
      success: false,
      error: 'own_profile',
    });
  });
});

describe('saveWhatsAppContact', () => {
  it('sends the opt-in and the E.164 number', async () => {
    const m = rpcClient({ data: { success: true }, error: null });
    expect((await saveWhatsAppContact(m.client, true, '+573001112233')).success).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith('av_set_whatsapp_contact', { p_opt_in: true, p_whatsapp: '+573001112233' });
  });
});
