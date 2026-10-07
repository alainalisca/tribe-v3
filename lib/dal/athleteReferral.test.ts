/**
 * T-AV23: the two attribution reads, against a query builder that RECORDS
 * every filter, so a dropped filter is a failed assertion here.
 *
 * A mock cannot prove a filter works against the database (it answers any
 * query the same way; CLAUDE.md, the Supabase mock that answered any
 * .select()). That proof is supabase/recon/t-av23-proof.LOCAL.sh, test 4,
 * and its mutation arm. This file pins the query SHAPE.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAthleteProgramStatus, findActiveAthleteByRefCode } from './athleteReferral';

interface Recorded {
  table: string;
  select: string;
  eq: Array<[string, unknown]>;
}

function client(result: { data: unknown; error: { message: string } | null }) {
  const rec: Recorded = { table: '', select: '', eq: [] };
  const builder = {
    select(cols: string) {
      rec.select = cols;
      return builder;
    },
    eq(col: string, val: unknown) {
      rec.eq.push([col, val]);
      return builder;
    },
    maybeSingle: async () => result,
  };
  const supabase = {
    from(table: string) {
      rec.table = table;
      return builder;
    },
  } as unknown as SupabaseClient; // a recording stub: only from/select/eq/maybeSingle are used
  return { supabase, rec };
}

describe('fetchAthleteProgramStatus', () => {
  it('reads is_active for exactly this partner', async () => {
    const { supabase, rec } = client({ data: { is_active: true }, error: null });
    expect(await fetchAthleteProgramStatus(supabase, 'p-1')).toEqual({ isActive: true });
    expect(rec).toEqual({ table: 'athlete_programs', select: 'is_active', eq: [['partner_id', 'p-1']] });
  });

  it('no row is no program; a non-true is_active is inactive', async () => {
    expect(await fetchAthleteProgramStatus(client({ data: null, error: null }).supabase, 'p-1')).toBeNull();
    expect(await fetchAthleteProgramStatus(client({ data: { is_active: null }, error: null }).supabase, 'p-1')).toEqual(
      { isActive: false }
    );
  });

  it('THROWS on a database error, so a failure never reads as "no program"', async () => {
    await expect(
      fetchAthleteProgramStatus(client({ data: null, error: { message: 'boom' } }).supabase, 'p-1')
    ).rejects.toThrow('boom');
  });
});

describe('findActiveAthleteByRefCode', () => {
  it('filters by this partner, active status and the uppercased code', async () => {
    const { supabase, rec } = client({ data: { id: 'pa-1', user: { name: 'Ana Prueba' } }, error: null });
    expect(await findActiveAthleteByRefCode(supabase, 'p-1', 'ana-7kq')).toEqual({
      programAthleteId: 'pa-1',
      firstName: 'Ana',
    });
    expect(rec.table).toBe('program_athletes');
    expect(rec.eq).toEqual([
      ['partner_id', 'p-1'],
      ['status', 'active'],
      ['ref_code', 'ANA-7KQ'],
    ]);
  });

  it('names the user_id foreign key (program_athletes references users twice)', async () => {
    const { supabase, rec } = client({ data: null, error: null });
    await findActiveAthleteByRefCode(supabase, 'p-1', 'ANA-7KQ');
    expect(rec.select).toContain('users!program_athletes_user_id_fkey(name)');
  });

  it('returns first name only, and nothing when there is no name to show', async () => {
    const ok = client({ data: { id: 'pa-1', user: [{ name: '  Caro   Prueba Otra ' }] }, error: null });
    expect(await findActiveAthleteByRefCode(ok.supabase, 'p-1', 'CARO-P9R')).toEqual({
      programAthleteId: 'pa-1',
      firstName: 'Caro',
    });
    const blank = client({ data: { id: 'pa-1', user: { name: '   ' } }, error: null });
    expect(await findActiveAthleteByRefCode(blank.supabase, 'p-1', 'CARO-P9R')).toBeNull();
  });

  it('THROWS on a database error', async () => {
    await expect(
      findActiveAthleteByRefCode(client({ data: null, error: { message: 'down' } }).supabase, 'p-1', 'X-123')
    ).rejects.toThrow('down');
  });
});
