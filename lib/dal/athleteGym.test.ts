/**
 * T-AV26: the gym dashboard's DAL. Each test pins the RPC name AND its
 * arguments (a mock that answers any call cannot otherwise tell a wrong
 * function name from a right one), and the distinction between "not yours"
 * (null / []) and a transport failure (success: false).
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
import { logError } from '@/lib/logger';
import { fetchMyPartnerRole, fetchPartnerSummary, hasAthleteProgram, searchAthleteCandidates } from './athleteGym';
import {
  addProgramAthlete,
  markLeadBonusSettled,
  markLeadRetained,
  setProgramAthleteLevel,
  setProgramAthleteStatus,
  updateProgramSettings,
} from './athleteGymWrites';

const P = '00000000-0000-4000-8000-000000007000';

function rpcClient(answer: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => answer);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const SUMMARY = {
  success: true,
  role: 'owner',
  program: { partner_id: P, max_athletes: 5 },
  athletes: [],
  guests: [],
  totals: { invited: 0, not_credited: 0, showed_up: 0, joined: 0, retained: 0, to_close: 0 },
};

describe('fetchPartnerSummary', () => {
  it('calls av_athletes_partner_summary with the partner id and returns the body', async () => {
    const { client, rpc } = rpcClient({ data: SUMMARY, error: null });
    const r = await fetchPartnerSummary(client, P);
    expect(rpc).toHaveBeenCalledWith('av_athletes_partner_summary', { p_partner_id: P });
    expect(r.success && r.data?.role).toBe('owner');
  });

  it('not_found (not staff, or no program) is null, not a failure', async () => {
    const { client } = rpcClient({ data: { success: false, error: 'not_found' }, error: null });
    expect(await fetchPartnerSummary(client, P)).toEqual({ success: true, data: null });
  });

  it('a transport error or an unknown shape is a failure, and is logged', async () => {
    const a = rpcClient({ data: null, error: { message: 'boom' } });
    expect((await fetchPartnerSummary(a.client, P)).success).toBe(false);
    const b = rpcClient({ data: { ...SUMMARY, role: 'janitor' }, error: null });
    expect(await fetchPartnerSummary(b.client, P)).toEqual({ success: false, error: 'unexpected_shape' });
    expect(logError).toHaveBeenCalled();
  });
});

describe('fetchMyPartnerRole', () => {
  it('returns a known role, null for anything else', async () => {
    const a = rpcClient({ data: 'coach', error: null });
    expect(await fetchMyPartnerRole(a.client, P)).toEqual({ success: true, data: 'coach' });
    expect(a.rpc).toHaveBeenCalledWith('av_my_partner_role', { p_partner_id: P });
    const b = rpcClient({ data: null, error: null });
    expect(await fetchMyPartnerRole(b.client, P)).toEqual({ success: true, data: null });
    const c = rpcClient({ data: null, error: { message: 'down' } });
    expect((await fetchMyPartnerRole(c.client, P)).success).toBe(false);
  });
});

describe('searchAthleteCandidates', () => {
  it('maps id, name and avatar only', async () => {
    const { client, rpc } = rpcClient({
      data: { success: true, results: [{ id: 'u1', name: 'Ana Prueba', avatar_url: null, email: 'leak@x' }] },
      error: null,
    });
    const r = await searchAthleteCandidates(client, P, 'ana');
    expect(rpc).toHaveBeenCalledWith('av_athletes_search_candidates', { p_partner_id: P, p_query: 'ana' });
    expect(r).toEqual({ success: true, data: [{ id: 'u1', name: 'Ana Prueba', avatarUrl: null }] });
  });

  it("passes the function's own refusal word through", async () => {
    const { client } = rpcClient({ data: { success: false, error: 'rate_limited' }, error: null });
    expect(await searchAthleteCandidates(client, P, 'ana')).toEqual({ success: false, error: 'rate_limited' });
  });
});

describe('the writes call the 8205 functions with their own argument names', () => {
  it('add', async () => {
    const { client, rpc } = rpcClient({ data: { success: true }, error: null });
    await addProgramAthlete(client, P, 'u1', '+573001112233');
    expect(rpc).toHaveBeenCalledWith('av_athletes_add', {
      p_partner_id: P,
      p_user_id: 'u1',
      p_whatsapp: '+573001112233',
    });
  });

  it('status, level, retained and bonus', async () => {
    const { client, rpc } = rpcClient({ data: { success: true }, error: null });
    await setProgramAthleteStatus(client, 'pa1', 'paused');
    await setProgramAthleteLevel(client, 'pa1', 'athlete');
    await markLeadRetained(client, 'l1');
    await markLeadBonusSettled(client, 'l1');
    expect(rpc.mock.calls).toEqual([
      ['av_athletes_set_status', { p_program_athlete_id: 'pa1', p_status: 'paused' }],
      ['av_athletes_set_level', { p_program_athlete_id: 'pa1', p_level: 'athlete' }],
      ['av_athletes_mark_retained', { p_lead_id: 'l1' }],
      ['av_athletes_mark_bonus_settled', { p_lead_id: 'l1' }],
    ]);
  });

  it("a refusal is the function's word, not a success", async () => {
    const { client } = rpcClient({ data: { success: false, error: 'program_full' }, error: null });
    expect(await addProgramAthlete(client, P, 'u1', null)).toEqual({ success: false, error: 'program_full' });
  });
});

describe('updateProgramSettings', () => {
  function tableClient(answer: { data: unknown; error: unknown }) {
    const select = vi.fn(async () => answer);
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return { client: { from } as unknown as SupabaseClient, from, update, eq, select };
  }

  it('updates athlete_programs for this partner and reports whether a row changed', async () => {
    const t = tableClient({ data: [{ partner_id: P }], error: null });
    const settings = {
      welcome_offer_en: null,
      welcome_offer_es: 'x',
      showup_reward_en: null,
      showup_reward_es: null,
      class_access_en: null,
      class_access_es: null,
      conversion_bonus_note_en: null,
      conversion_bonus_note_es: null,
      conversion_bonus_cop: null,
      retention_days: 30,
      promote_at_showups: 10,
      max_athletes: 5,
      pilot_starts_on: null,
      pilot_ends_on: null,
    };
    expect(await updateProgramSettings(t.client, P, settings)).toEqual({ success: true, data: true });
    expect(t.from).toHaveBeenCalledWith('athlete_programs');
    expect(t.update).toHaveBeenCalledWith(settings);
    expect(t.eq).toHaveBeenCalledWith('partner_id', P);
    const none = tableClient({ data: [], error: null });
    expect(await updateProgramSettings(none.client, P, settings)).toEqual({ success: true, data: false });
  });
});

describe('hasAthleteProgram', () => {
  it('true only for a readable row; an error is false and logged', async () => {
    const make = (answer: { data: unknown; error: unknown }) => {
      const maybeSingle = vi.fn(async () => answer);
      const eq = vi.fn(() => ({ maybeSingle }));
      const select = vi.fn(() => ({ eq }));
      return { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
    };
    expect(await hasAthleteProgram(make({ data: { partner_id: P }, error: null }), P)).toBe(true);
    expect(await hasAthleteProgram(make({ data: null, error: null }), P)).toBe(false);
    expect(await hasAthleteProgram(make({ data: null, error: { message: 'x' } }), P)).toBe(false);
    expect(await hasAthleteProgram(make({ data: { partner_id: P }, error: null }), '')).toBe(false);
  });
});
