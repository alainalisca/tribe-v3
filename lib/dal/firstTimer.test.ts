import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchFirstTimerBlock, saveFirstTimerText } from './firstTimer';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => vi.mocked(logError).mockClear());

describe('fetchFirstTimerBlock', () => {
  it('asks av_first_timer_block for the session and returns the coach name and text', async () => {
    const m = rpcClient({ data: { show: true, coach_first_name: 'Salomón', text: 'Trae agua.' }, error: null });
    const res = await fetchFirstTimerBlock(m.client, 's1');
    expect(m.rpc).toHaveBeenCalledWith('av_first_timer_block', { p_session_id: 's1' });
    expect(res.data).toEqual({ coachFirstName: 'Salomón', text: 'Trae agua.' });
  });

  it('show false means no block, even if a text came back', async () => {
    const m = rpcClient({ data: { show: false, text: 'Trae agua.' }, error: null });
    expect((await fetchFirstTimerBlock(m.client, 's1')).data).toBeNull();
  });

  it('recognises a failed read: logs it, and shows no block', async () => {
    const m = rpcClient({ data: null, error: { message: 'boom' } });
    expect((await fetchFirstTimerBlock(m.client, 's1')).success).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({ action: 'fetchFirstTimerBlock' })
    );
  });
});

describe('saveFirstTimerText', () => {
  it('sends the text, and null to clear it', async () => {
    const m = rpcClient({ data: { success: true }, error: null });
    expect((await saveFirstTimerText(m.client, 'Trae agua.')).success).toBe(true);
    expect(m.rpc).toHaveBeenCalledWith('av_set_first_timer_text', { p_text: 'Trae agua.' });
    await saveFirstTimerText(m.client, null);
    expect(m.rpc).toHaveBeenCalledWith('av_set_first_timer_text', { p_text: null });
  });

  it('a refusal is a failure with its reason', async () => {
    const m = rpcClient({ data: { success: false, error: 'too_long' }, error: null });
    expect(await saveFirstTimerText(m.client, 'x')).toEqual({ success: false, error: 'too_long' });
  });
});
