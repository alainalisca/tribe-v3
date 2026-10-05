import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { markAttendance, fetchAttendanceMarks } from './attendanceMarks';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => vi.mocked(logError).mockClear());

describe('markAttendance', () => {
  it('calls av_mark_attendance with the session, the person and the status', async () => {
    const m = rpcClient({ data: { success: true, status: 'attended' }, error: null });
    const res = await markAttendance(m.client, 's1', 'u1', 'attended');
    expect(m.rpc).toHaveBeenCalledWith('av_mark_attendance', {
      p_session_id: 's1',
      p_user_id: 'u1',
      p_status: 'attended',
    });
    expect(res).toEqual({ success: true });
  });

  it('sends null to un-mark', async () => {
    const m = rpcClient({ data: { success: true, status: null }, error: null });
    await markAttendance(m.client, 's1', 'u1', null);
    expect(m.rpc).toHaveBeenCalledWith('av_mark_attendance', { p_session_id: 's1', p_user_id: 'u1', p_status: null });
  });

  it.each(['outside_window', 'not_participant', 'not_found', 'invalid_status'] as const)(
    'passes the server refusal %s through as its code',
    async (code) => {
      const m = rpcClient({ data: { success: false, error: code }, error: null });
      const res = await markAttendance(m.client, 's1', 'u1', 'attended');
      expect(res.success).toBe(false);
      expect(res.code).toBe(code);
    }
  );

  it('an unknown refusal is "failed", not trusted as a known code', async () => {
    const m = rpcClient({ data: { success: false, error: 'something_new' }, error: null });
    const res = await markAttendance(m.client, 's1', 'u1', 'attended');
    expect(res).toMatchObject({ success: false, code: 'failed', error: 'something_new' });
  });

  it('a body without success:true is never read as success', async () => {
    const m = rpcClient({ data: null, error: null });
    expect((await markAttendance(m.client, 's1', 'u1', 'attended')).success).toBe(false);
  });

  it('recognises a transport error: logs it and reports failed', async () => {
    const m = rpcClient({ data: null, error: { message: 'permission denied for function av_mark_attendance' } });
    const res = await markAttendance(m.client, 's1', 'u1', 'attended');
    expect(res).toMatchObject({ success: false, code: 'failed' });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'permission denied for function av_mark_attendance' }),
      expect.objectContaining({ action: 'markAttendance' })
    );
  });
});

describe('fetchAttendanceMarks', () => {
  function tableClient(rows: unknown[]) {
    const calls: Array<[string, ...unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in']) {
      chain[m] = (...a: unknown[]) => {
        calls.push([m, ...a]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    const from = vi.fn(() => chain);
    return { client: { from } as unknown as SupabaseClient, from, calls };
  }

  it('reads status and attended for the given people of one session', async () => {
    const m = tableClient([
      { user_id: 'u1', status: 'no_show', attended: false },
      { user_id: 'u2', status: 'attended', attended: true },
    ]);
    const res = await fetchAttendanceMarks(m.client, 's1', ['u1', 'u2']);
    expect(m.from).toHaveBeenCalledWith('session_attendance');
    expect(m.calls).toContainEqual(['select', 'user_id, status, attended']);
    expect(m.calls).toContainEqual(['eq', 'session_id', 's1']);
    expect(res.data).toEqual([
      { user_id: 'u1', status: 'no_show', attended: false },
      { user_id: 'u2', status: 'attended', attended: true },
    ]);
  });

  it('a status it does not know reads as not marked', async () => {
    const m = tableClient([{ user_id: 'u1', status: 'present', attended: false }]);
    expect((await fetchAttendanceMarks(m.client, 's1', ['u1'])).data?.[0].status).toBeNull();
  });

  it('asks nothing for an empty list', async () => {
    const m = tableClient([]);
    expect(await fetchAttendanceMarks(m.client, 's1', [])).toEqual({ success: true, data: [] });
    expect(m.from).not.toHaveBeenCalled();
  });
});
