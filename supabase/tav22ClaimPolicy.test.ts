/**
 * T-AV22: the claim policy in 204 is 201's text plus exactly eight
 * IS NULL clauses, and 201 refuses to run once 204 has.
 *
 * Textual on purpose, and only for these two properties. Whether the policy
 * REFUSES a forged insert is a behaviour question and is answered against the
 * local stack by supabase/recon/t-av22-proof.LOCAL.sh (test 8). What text can
 * answer, and a database cannot, is that nothing else in the predicate moved
 * between the two copies: a shape check loosened while "adding clauses" would
 * pass every insert probe that only sets the new columns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(`supabase/migrations/${f}`, 'utf8');
const M201 = read('201_t_av21_pass_leads_showup.sql');
const M204 = read('204_t_av22_pass_leads_attribution.sql');

const policyOf = (sql: string): string => {
  const lines = sql.split('\n').filter((l) => l.startsWith('CREATE POLICY "Anyone can claim a pass"'));
  expect(lines, 'exactly one CREATE POLICY line for the claim policy').toHaveLength(1);
  return lines[0];
};

const EIGHT = [
  'referred_by_athlete_id',
  'outcome',
  'outcome_at',
  'outcome_marked_by',
  'retained_at',
  'bonus_eligible',
  'bonus_settled_at',
  'bonus_settled_by',
];

describe('the 204 claim policy', () => {
  it("is 201's policy with exactly the eight new clauses appended, and nothing else changed", () => {
    const before = policyOf(M201);
    const after = policyOf(M204);
    // 201 ends `("attended_method" IS NULL)));`: the clause's own paren,
    // then two that close WITH CHECK, then the semicolon. The eight go after
    // the clause's paren and before the last three characters `));`.
    expect(before.endsWith('("attended_method" IS NULL)));')).toBe(true);
    const appended = EIGHT.map((c) => ` AND ("${c}" IS NULL)`).join('');
    expect(after).toBe(before.slice(0, -3) + appended + '));');
  });

  it("keeps T-AV21's three clauses", () => {
    for (const c of ['attended_at', 'attended_marked_by', 'attended_method']) {
      expect(policyOf(M204)).toContain(`("${c}" IS NULL)`);
    }
  });

  it('asserts all eleven clauses in its end-state block', () => {
    for (const c of ['attended_at', 'attended_marked_by', 'attended_method', ...EIGHT]) {
      expect(M204).toContain(`'${c}'`);
    }
  });
});

describe('the 201 pre-flight', () => {
  it('checks for referred_by_athlete_id before 201 writes anything', () => {
    const preflight = M201.indexOf("attname = 'referred_by_athlete_id'");
    const firstWrite = M201.indexOf('ALTER TABLE public.pass_leads');
    expect(preflight).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(firstWrite);
    expect(M201.indexOf('BEGIN;')).toBeLessThan(preflight);
  });

  it('raises rather than notices', () => {
    const block = M201.slice(M201.indexOf('-- ── 0. Pre-flight'), M201.indexOf('-- ── 1. Columns'));
    expect(block).toContain('RAISE EXCEPTION');
    expect(block).not.toContain('RAISE NOTICE');
  });
});
