import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchDoorPass, confirmPassAttendance, setPassOutcome, fetchDoorList } from './passDoor';

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
        athleteFirstName: null,
        outcome: null,
        welcomeOfferEn: null,
        welcomeOfferEs: null,
      },
    });
  });

  it('T-AV25: maps the athlete first name, the outcome and the welcome offer', async () => {
    const { client } = clientReturning({
      data: {
        success: true,
        partner_name: 'P',
        guest_first_name: 'Laura',
        claimed_at: 'x',
        attended_at: 'y',
        athlete_first_name: 'Ana',
        outcome: 'follow_up',
        welcome_offer_en: 'First month 20% off',
        welcome_offer_es: 'Primer mes 20%',
      },
      error: null,
    });
    const res = await fetchDoorPass(client, 'BU-4F7K');
    expect(res.data).toMatchObject({
      athleteFirstName: 'Ana',
      outcome: 'follow_up',
      welcomeOfferEn: 'First month 20% off',
      welcomeOfferEs: 'Primer mes 20%',
    });
  });

  it('an outcome outside the four is not passed through', async () => {
    const { client } = clientReturning({ data: { success: true, outcome: 'paid_cash' }, error: null });
    expect((await fetchDoorPass(client, 'BU-4F7K')).data?.outcome).toBeNull();
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
    // T-AV25 widened the door's view by four fields; the point is unchanged:
    // nothing of the guest beyond the first name, ever.
    expect(Object.keys(res.data ?? {}).sort()).toEqual([
      'athleteFirstName',
      'attendedAt',
      'claimedAt',
      'guestFirstName',
      'outcome',
      'partnerName',
      'welcomeOfferEn',
      'welcomeOfferEs',
    ]);
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

describe('setPassOutcome (T-AV25)', () => {
  it('calls av_athletes_set_outcome with the code and the outcome', async () => {
    const { client, rpc } = clientReturning({ data: { success: true, outcome: 'joined' }, error: null });
    expect(await setPassOutcome(client, 'BU-4F7K', 'joined')).toEqual({ success: true, data: { outcome: 'joined' } });
    expect(rpc).toHaveBeenCalledWith('av_athletes_set_outcome', { p_pass_code: 'BU-4F7K', p_outcome: 'joined' });
  });

  it('surfaces the database refusal by name (not_attended, locked, not_found)', async () => {
    for (const error of ['not_attended', 'locked', 'not_found']) {
      const { client } = clientReturning({ data: { success: false, error }, error: null });
      expect(await setPassOutcome(client, 'BU-4F7K', 'joined')).toEqual({ success: false, error });
    }
  });

  it('a transport error is recognised and logged', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'down' } });
    expect((await setPassOutcome(client, 'BU-4F7K', 'not_now')).success).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'down' }), {
      action: 'setPassOutcome',
    });
  });
});

describe('fetchDoorList (T-AV25)', () => {
  it('calls av_door_list for the partner and keeps only the listed fields', async () => {
    const { client, rpc } = clientReturning({
      data: {
        success: true,
        leads: [
          {
            guest_first_name: 'Laura',
            pass_code: 'BU-4F7K',
            claimed_at: 'x',
            attended_at: null,
            outcome: null,
            athlete_first_name: 'Ana',
            email: 'leak@example.invalid',
          },
        ],
      },
      error: null,
    });
    const res = await fetchDoorList(client, 'p-1');
    expect(rpc).toHaveBeenCalledWith('av_door_list', { p_partner_id: 'p-1' });
    expect(res.data).toEqual([
      {
        guestFirstName: 'Laura',
        passCode: 'BU-4F7K',
        claimedAt: 'x',
        attendedAt: null,
        outcome: null,
        athleteFirstName: 'Ana',
      },
    ]);
    expect(JSON.stringify(res)).not.toContain('leak@');
  });

  it('not_found (not your gym, or no such partner) is data null', async () => {
    const { client } = clientReturning({ data: { success: false, error: 'not_found' }, error: null });
    expect(await fetchDoorList(client, 'p-1')).toEqual({ success: true, data: null });
  });

  it('a transport error is recognised and logged', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'down' } });
    expect((await fetchDoorList(client, 'p-1')).success).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'down' }), {
      action: 'fetchDoorList',
    });
  });
});
