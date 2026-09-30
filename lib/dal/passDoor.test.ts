import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDoorPass, confirmPassAttendance } from './passDoor';

const { logErrorMock } = vi.hoisted(() => ({ logErrorMock: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: logErrorMock }));

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => vi.clearAllMocks());

describe('fetchDoorPass', () => {
  it('calls av_door_pass with the code and maps the door fields', async () => {
    const { client, rpc } = clientReturning({
      data: {
        success: true,
        partner_name: 'BullBox (Prueba)',
        guest_first_name: 'Laura',
        claimed_at: '2026-09-29T14:00:00Z',
        attended_at: null,
      },
      error: null,
    });
    const res = await fetchDoorPass(client, 'BU-4F7K');
    expect(rpc).toHaveBeenCalledWith('av_door_pass', { p_pass_code: 'BU-4F7K' });
    expect(res).toEqual({
      success: true,
      data: {
        partnerName: 'BullBox (Prueba)',
        guestFirstName: 'Laura',
        claimedAt: '2026-09-29T14:00:00Z',
        attendedAt: null,
      },
    });
  });

  it('keeps ONLY the door fields, even if the RPC ever returned more', async () => {
    const { client } = clientReturning({
      data: {
        success: true,
        partner_name: 'P',
        guest_first_name: 'Laura',
        claimed_at: 'x',
        attended_at: null,
        email: 'leak@example.invalid',
        whatsapp: '+573001112233',
        name: 'Laura Martinez',
      },
      error: null,
    });
    const res = await fetchDoorPass(client, 'BU-4F7K');
    expect(Object.keys(res.data ?? {}).sort()).toEqual(['attendedAt', 'claimedAt', 'guestFirstName', 'partnerName']);
    expect(JSON.stringify(res)).not.toMatch(/leak@|3001112233|Martinez/);
  });

  it('not_found (unknown code OR not your gym) is data null, not an error', async () => {
    const { client } = clientReturning({ data: { success: false, error: 'not_found' }, error: null });
    expect(await fetchDoorPass(client, 'ZZ-0000')).toEqual({ success: true, data: null });
  });

  it('parses a stringified jsonb body', async () => {
    const { client } = clientReturning({
      data: JSON.stringify({
        success: true,
        partner_name: 'P',
        guest_first_name: 'A',
        claimed_at: 'c',
        attended_at: 'd',
      }),
      error: null,
    });
    expect((await fetchDoorPass(client, 'X')).data?.attendedAt).toBe('d');
  });

  it('a transport error is recognised and logged, not swallowed', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    expect(await fetchDoorPass(client, 'X')).toEqual({ success: false, error: 'boom' });
    expect(logErrorMock).toHaveBeenCalledOnce();
  });
});

describe('confirmPassAttendance', () => {
  it('calls the confirm RPC with code and method and maps the result', async () => {
    const { client, rpc } = clientReturning({
      data: { success: true, attended_at: '2026-09-29T15:00:00Z', already_confirmed: false },
      error: null,
    });
    const res = await confirmPassAttendance(client, 'BU-4F7K', 'scan');
    expect(rpc).toHaveBeenCalledWith('av_confirm_pass_attendance', { p_pass_code: 'BU-4F7K', p_method: 'scan' });
    expect(res).toEqual({ success: true, data: { attendedAt: '2026-09-29T15:00:00Z', alreadyConfirmed: false } });
  });

  it('a second confirm reports alreadyConfirmed with the first time', async () => {
    const { client } = clientReturning({
      data: { success: true, attended_at: '2026-09-29T15:00:00Z', already_confirmed: true },
      error: null,
    });
    expect((await confirmPassAttendance(client, 'BU-4F7K', 'code')).data).toEqual({
      attendedAt: '2026-09-29T15:00:00Z',
      alreadyConfirmed: true,
    });
  });

  it('surfaces the RPC refusal', async () => {
    const { client } = clientReturning({ data: { success: false, error: 'not_found' }, error: null });
    expect(await confirmPassAttendance(client, 'X', 'toggle')).toEqual({ success: false, error: 'not_found' });
  });

  it('a transport error is recognised and logged', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    expect(await confirmPassAttendance(client, 'X', 'toggle')).toEqual({ success: false, error: 'boom' });
    expect(logErrorMock).toHaveBeenCalledOnce();
  });
});
