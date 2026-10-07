import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
import { logError } from '@/lib/logger';
import { fetchMyAthleteSummary, hasActiveAthleteRow, fetchPartnerSlug } from './athleteHome';

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn(async () => result) } as unknown as SupabaseClient; // only rpc() is used
}

describe('fetchMyAthleteSummary', () => {
  it('returns the programs on success', async () => {
    const r = await fetchMyAthleteSummary(
      rpcClient({ data: { success: true, programs: [{ ref_code: 'ANA-7KQ' }] }, error: null })
    );
    expect(r).toEqual({ success: true, data: [{ ref_code: 'ANA-7KQ' }] });
  });

  it('not_found is "not in a program": an empty list, not a failure', async () => {
    expect(
      await fetchMyAthleteSummary(rpcClient({ data: { success: false, error: 'not_found' }, error: null }))
    ).toEqual({ success: true, data: [] });
  });

  it('a transport error or an unknown shape is a failure, and is logged', async () => {
    expect((await fetchMyAthleteSummary(rpcClient({ data: null, error: { message: 'down' } }))).success).toBe(false);
    expect((await fetchMyAthleteSummary(rpcClient({ data: { weird: true }, error: null }))).success).toBe(false);
    expect(logError).toHaveBeenCalledTimes(2);
  });
});

describe('hasActiveAthleteRow', () => {
  it('selects only id, filtered to this user and status active, and answers a boolean', async () => {
    const rec: { select?: string; eq: Array<[string, unknown]> } = { eq: [] };
    const builder = {
      select(c: string) {
        rec.select = c;
        return builder;
      },
      eq(c: string, v: unknown) {
        rec.eq.push([c, v]);
        return builder;
      },
      limit: async () => ({ data: [{ id: 'pa-1' }], error: null }),
    };
    const supabase = { from: () => builder } as unknown as SupabaseClient; // recording stub
    expect(await hasActiveAthleteRow(supabase, 'u-1')).toBe(true);
    expect(rec).toEqual({
      select: 'id',
      eq: [
        ['user_id', 'u-1'],
        ['status', 'active'],
      ],
    });
  });

  it('no row or an error is false', async () => {
    const empty = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
      }),
    } as unknown as SupabaseClient;
    const broken = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'x' } }) }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await hasActiveAthleteRow(empty, 'u')).toBe(false);
    expect(await hasActiveAthleteRow(broken, 'u')).toBe(false);
  });
});

describe('fetchPartnerSlug', () => {
  it('returns the slug, or null when unreadable', async () => {
    const ok = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { slug: 'bullbox-prueba' }, error: null }) }),
        }),
      }),
    } as unknown as SupabaseClient;
    const none = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    } as unknown as SupabaseClient;
    expect(await fetchPartnerSlug(ok, 'p')).toBe('bullbox-prueba');
    expect(await fetchPartnerSlug(none, 'p')).toBeNull();
  });
});
