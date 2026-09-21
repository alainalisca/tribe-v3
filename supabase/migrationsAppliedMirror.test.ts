/**
 * The applied-migration list must be the SAME list everywhere it appears.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THREE HAND-KEPT COPIES, AND A POINTER TO A SCRIPT THAT DID NOT EXIST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * public.migrations_applied (migration 184) is the source of truth. Two things
 * that cannot read it carry a copy: supabase/migrations_applied.json, read by
 * migrationAppliedBeforeCode.test.ts, which runs with no database; and the
 * list embedded TWICE in verify-migration-state.sql, which is what lets the
 * database check the JSON.
 *
 * Found on 2026-09-21 while recording 187: those were three hand-maintained
 * copies of the same eight names, and the JSON's _comment said to regenerate
 * them with scripts/syncMigrationsApplied.ts -- which had never been written.
 * So the documented procedure was unexecutable, and adding a migration meant
 * editing three lists by hand. CLAUDE.md already records both halves of this:
 * a change that must be applied twice is telling you where the defect is, and
 * a pointer to something you cannot find is a finding about the thing pointing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS CAN AND CANNOT SAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It asserts the copies AGREE. It cannot assert they are TRUE -- no database
 * here. Truth is checked by verify-migration-state.sql's GUARD_184 probe,
 * which compares the mirror to the table in both directions. This test closes
 * the gap where the JSON says one thing and the SQL that is supposed to verify
 * it says another, in which case the verification is of a list nobody uses.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import mirror from './migrations_applied.json';

const SQL = 'supabase/verify-migration-state.sql';
const BEGIN = '-- <<<MIRROR_LIST>>>';
const END = '-- <<<END_MIRROR_LIST>>>';

/** Every marked block's entries, in order, one array per block. */
function sqlBlocks(): string[][] {
  const src = readFileSync(SQL, 'utf8');
  return src
    .split(BEGIN)
    .slice(1)
    .map((chunk) => {
      const body = chunk.slice(0, chunk.indexOf(END));
      return [...body.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
    });
}

const json = (mirror as { applied: string[] }).applied;

describe('the applied-migration mirror is one list', () => {
  /** NON-VACUITY: zero blocks, or empty ones, satisfy every toEqual below --
   *  two empty arrays are equal. This is the arm that makes the rest mean
   *  something, and it is exactly the shape that made 180's return-type guard
   *  pass over a function it could not read. */
  it('both marked blocks exist and are populated', () => {
    const blocks = sqlBlocks();
    expect(blocks).toHaveLength(2);
    for (const b of blocks) expect(b.length).toBeGreaterThan(5);
    expect(json.length).toBeGreaterThan(5);
  });

  it('every SQL block equals the JSON mirror, in order', () => {
    for (const block of sqlBlocks()) expect(block).toEqual(json);
  });

  it('the JSON is ordered by migration number, so a gap is visible', () => {
    const nums = json.map((m) => Number(m.slice(0, 3)));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('nothing below the record floor is listed', () => {
    const floor = (mirror as { _recordStartsAt: number })._recordStartsAt;
    expect(json.filter((m) => Number(m.slice(0, 3)) < floor)).toEqual([]);
  });

  /** The JSON tells the reader to use a script. That instruction was false for
   *  the file's whole life. Assert the instruction is executable. */
  it('the script the mirror names actually exists', () => {
    const comment = (mirror as { _comment: string })._comment;
    const named = comment.match(/scripts\/[A-Za-z0-9_.-]+\.ts/)?.[0];
    expect(named).toBeTruthy();
    expect(() => readFileSync(named as string, 'utf8')).not.toThrow();
  });
});
