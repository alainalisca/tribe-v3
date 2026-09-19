/**
 * T-GYM7: a partner whose OWNER account is a seeded/test account must not
 * appear in the gym directory, the home-feed banner, or the admin queue.
 *
 * The fake below EXECUTES the query: it parses the `user:users!inner(...)`
 * embed, performs the join, honours `!inner` by dropping partners with no
 * matching owner, and applies dotted filters like `user.is_test_account` to the
 * joined row. Asserting that the filter clause is present in the source would
 * pass against a query that never runs it, and would not notice a missing
 * `!inner` at all -- PostgREST silently returns the row with a null embed in
 * that case, so the partner would still render.
 *
 * Production shape this mirrors (measured 2026-09-15): 24 users carry
 * is_test_account = true; featured_partners has exactly 2 active rows,
 * CrossFit BullBox (owner bullboxmde@gmail.com, a real account) and
 * Marce Anahata. Both must survive the filter.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchActivePartners, fetchAllPartners } from './featuredPartners';
import { fetchGymsAndStudios } from './gymDirectory';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

type Row = Record<string, unknown>;

const USERS: Row[] = [
  { id: 'u-bullbox', avatar_url: 'bb.png', is_test_account: false },
  { id: 'u-marce', avatar_url: 'ma.png', is_test_account: false },
  { id: 'u-seed', avatar_url: 'seed.png', is_test_account: true },
  // Owner row missing entirely for 'p-orphan' -- !inner must drop it.
];

function partner(id: string, name: string, userId: string, extra: Row = {}): Row {
  return {
    id,
    user_id: userId,
    business_name: name,
    business_type: 'gym',
    status: 'active',
    display_order: 0,
    tier: 'standard',
    total_impressions: 0,
    created_at: '2026-09-01T00:00:00Z',
    address: null,
    specialties: null,
    ...extra,
  };
}

const PARTNERS: Row[] = [
  partner('p-bullbox', 'CrossFit BullBox', 'u-bullbox'),
  partner('p-marce', 'Marce Anahata', 'u-marce'),
  partner('p-seed', 'Seeded Test Gym', 'u-seed'),
  partner('p-orphan', 'Orphan Gym', 'u-gone'),
];

/** Executes the query rather than recording it. */
function makeDb(partners: Row[] = PARTNERS, users: Row[] = USERS): SupabaseClient {
  return {
    from(table: string) {
      if (table !== 'featured_partners') {
        // roster / sessions_public side-queries: empty is fine for these cases
        const done = Promise.resolve({ data: [], error: null });
        const stub: Record<string, unknown> = {};
        Object.assign(stub, {
          select: () => stub,
          in: () => stub,
          eq: () => stub,
          gte: () => stub,
          lte: () => stub,
          then: (r: (v: unknown) => unknown) => done.then(r),
        });
        return stub;
      }

      let work = [...partners];
      let embedCols: string[] = [];
      let inner = false;
      const dotted: Array<[string, unknown]> = [];

      const resolve = () => {
        // PostgREST semantics, and the whole point of this fake: an embedded
        // filter narrows the EMBED, not the parent. A non-matching (or missing)
        // owner leaves the partner in the result with `user: null` -- it is
        // `!inner` that turns a null embed into a dropped parent row. Modelling
        // this the lazy way (filtering the parent directly) makes the test pass
        // against a query with the filter but WITHOUT `!inner`, which is a real
        // and silent way to ship this broken.
        let rows = work.map((p) => {
          const u = users.find((x) => x.id === p.user_id);
          if (!u) return { ...p, user: null as Row | null };
          const picked: Row = {};
          for (const c of embedCols) picked[c] = u[c];
          const matches = dotted.every(([col, val]) => picked[col.split('.')[1]] === val);
          return { ...p, user: matches ? picked : null };
        });
        if (inner) rows = rows.filter((r) => r.user !== null);
        return Promise.resolve({ data: rows, error: null });
      };

      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: (spec: string) => {
          const m = spec.match(/user:users(!inner)?\(([^)]*)\)/);
          if (m) {
            inner = !!m[1];
            embedCols = m[2].split(',').map((c) => c.trim());
          }
          return b;
        },
        eq: (col: string, val: unknown) => {
          if (col.includes('.')) dotted.push([col, val]);
          else work = work.filter((r) => r[col] === val);
          return b;
        },
        in: (col: string, vals: unknown[]) => ((work = work.filter((r) => vals.includes(r[col]))), b),
        order: () => b,
        limit: () => resolve(),
        then: (r: (v: unknown) => unknown) => resolve().then(r),
      });
      return b;
    },
  } as unknown as SupabaseClient;
}

const names = (rows: unknown[]) => (rows as Row[]).map((r) => r.business_name ?? r.businessName);

describe('T-GYM7 — partners owned by test accounts are excluded', () => {
  it('home-feed banner (fetchActivePartners): seeded gym absent, both real ones present', async () => {
    const result = await fetchActivePartners(makeDb(), 10);
    expect(result.success).toBe(true);
    const got = names(result.data!);
    expect(got).not.toContain('Seeded Test Gym');
    expect(got).toContain('CrossFit BullBox');
    expect(got).toContain('Marce Anahata');
  });

  it('admin queue (fetchAllPartners): seeded gym absent, both real ones present', async () => {
    const result = await fetchAllPartners(makeDb());
    expect(result.success).toBe(true);
    const got = names(result.data!);
    expect(got).not.toContain('Seeded Test Gym');
    expect(got).toContain('CrossFit BullBox');
    expect(got).toContain('Marce Anahata');
  });

  it('gym directory (fetchGymsAndStudios): seeded gym absent, both real ones present', async () => {
    const result = await fetchGymsAndStudios(makeDb());
    expect(result.success).toBe(true);
    const got = names(result.data!);
    expect(got).not.toContain('Seeded Test Gym');
    expect(got).toContain('CrossFit BullBox');
    expect(got).toContain('Marce Anahata');
  });

  it('a partner whose owner row is gone is dropped, not surfaced with a null user', async () => {
    // This is what `!inner` buys beyond the filter. Without it PostgREST returns
    // the partner with user: null and it renders as a gym with no avatar.
    const result = await fetchActivePartners(makeDb(), 10);
    expect(names(result.data!)).not.toContain('Orphan Gym');
  });

  it('the embed requests only columns granted to anon/authenticated', async () => {
    // SEC-SWEEP: an ungranted column in an embed fails the WHOLE read with
    // 42501 rather than degrading. avatar_url and is_test_account survive
    // migrations 067/113/115/118; email, is_admin, location_lat/lng and the
    // push columns do not.
    const REVOKED = ['email', 'is_admin', 'location_lat', 'location_lng', 'push_subscription', 'total_earnings_cents'];
    const src = readFileSync(join(process.cwd(), 'lib/dal/featuredPartners.ts'), 'utf8');
    const dir = readFileSync(join(process.cwd(), 'lib/dal/gymDirectory.ts'), 'utf8');
    for (const file of [src, dir]) {
      for (const embed of file.matchAll(/user:users!inner\(([^)]*)\)/g)) {
        const cols = embed[1].split(',').map((c) => c.trim());
        for (const c of cols) expect(REVOKED).not.toContain(c);
      }
    }
  });
});
