import { describe, it, expect, vi } from 'vitest';
import { enableInstructorAccount } from './users';

/**
 * The whole reason this helper exists is that a plain Supabase update returns
 * { error: null } when it matched nothing -- RLS, a missing row, the wrong id.
 * Callers then navigate a user onward as if the write happened.
 */
function client(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; patch?: unknown; id?: string; selected?: string } = {};
  const chain = {
    update(patch: unknown) {
      calls.patch = patch;
      return chain;
    },
    eq(_col: string, id: string) {
      calls.id = id;
      return chain;
    },
    select: async (cols: string) => {
      calls.selected = cols;
      return result;
    },
  };
  return {
    calls,
    supabase: {
      from(table: string) {
        calls.table = table;
        return chain;
      },
    } as never,
  };
}

describe('enableInstructorAccount', () => {
  it('writes is_instructor on the given user', async () => {
    const { supabase, calls } = client({ data: [{ id: 'u1' }], error: null });
    const r = await enableInstructorAccount(supabase, 'u1');
    expect(r.success).toBe(true);
    expect(calls.table).toBe('users');
    expect(calls.patch).toEqual({ is_instructor: true });
    expect(calls.id).toBe('u1');
  });

  it('reports a 0-row write as a FAILURE, not a success', async () => {
    // This is the case a bare .update() reports as { error: null }.
    const { supabase } = client({ data: [], error: null });
    const r = await enableInstructorAccount(supabase, 'u1');
    expect(r.success).toBe(false);
    expect(r.error).toBe('no_rows_updated');
  });

  it('reports a null result as a failure too', async () => {
    const { supabase } = client({ data: null, error: null });
    await expect(enableInstructorAccount(supabase, 'u1')).resolves.toMatchObject({ success: false });
  });

  it('surfaces a real error', async () => {
    const { supabase } = client({ data: null, error: { message: 'permission denied' } });
    const r = await enableInstructorAccount(supabase, 'u1');
    expect(r.success).toBe(false);
    expect(r.error).toBe('permission denied');
  });

  it('asks for a column back, because that is what makes 0 rows detectable', async () => {
    const { supabase, calls } = client({ data: [{ id: 'u1' }], error: null });
    await enableInstructorAccount(supabase, 'u1');
    expect(calls.selected).toBeTruthy();
  });
});
