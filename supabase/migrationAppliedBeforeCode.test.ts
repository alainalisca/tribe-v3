import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripJsComments } from '../lib/stripJsComments';
import { sqlWithoutComments } from './executableSql';
import mirror from './migrations_applied.json';

/**
 * CODE THAT WRITES A COLUMN MUST NOT MERGE BEFORE THE MIGRATION ADDING THAT
 * COLUMN HAS BEEN APPLIED.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE OUTAGE THIS EXISTS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * On 2026-09-21 migration 182 (notifications.action_url) and the code writing
 * that column merged in the SAME branch. The code deployed at 16:15 UTC; the
 * migration was applied at ~16:50. For ~35 minutes createNotification sent
 * `action_url` in EVERY insert payload -- not only for invites, there is no
 * branch on type -- and PostgREST rejects an insert naming a column that does
 * not exist. Every notification in the app failed, and nothing retries.
 *
 * The additive-first rule already covered this. It was broken because the
 * migration and the code were in one branch, so "merge the branch" and "apply
 * the migration" looked like one act and were two.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A MIRROR FILE, WHEN A HAND-KEPT FILE IS WHAT JUST DRIFTED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Applied-state lives in public.migrations_applied (migration 184). These
 * tests run with NO database, so they cannot read it.
 *
 * So there are two layers, and the second is what makes the first honest:
 *
 *   1. THIS TEST reads supabase/migrations_applied.json and fails the merge.
 *   2. verify-migration-state.sql, which DOES run against the database,
 *      asserts that file equals the table.
 *
 * A stale mirror is therefore DETECTED rather than silent -- which is the
 * precise objection to the hand-kept record that was wrong about migration 181
 * within hours of being written. A mirror that can drift undetected would
 * reproduce that failure; one the database checks cannot.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FLOOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The record begins at 179, because that is where 184's backfill starts.
 * Migrations below it predate the record and are presumed applied -- they have
 * been in production for months. Without the floor this guard would fail on
 * every column in the schema, which is the failure mode where a guard is so
 * loud it gets deleted.
 */

const DIR = 'supabase/migrations';
const applied = new Set((mirror as { applied: string[] }).applied);
const FLOOR = (mirror as { _recordStartsAt: number })._recordStartsAt;

/**
 * `ADD COLUMN [IF NOT EXISTS] <name>` -- the only shape this repo uses.
 *
 * MATCHED AGAINST sqlWithoutComments, NOT THE RAW FILE. Migration 189's header
 * contains "Set separately from ADD COLUMN so a re-run..." in a comment, and
 * matching the raw text taught this guard about a column named "so" -- then
 * flagged every source file containing that word and turned main red. Fourth
 * instance in this repo of a check matching prose that describes the thing it
 * checks.
 */
const ADD_COLUMN = /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;

const numberOf = (f: string): number | null => {
  const m = /^(\d{3})_/.exec(f);
  return m ? parseInt(m[1], 10) : null;
};

/** Columns introduced by a migration AT OR ABOVE the floor that is NOT recorded
 *  as applied. These are the columns no source file may reference yet. */
function columnsFromUnappliedMigrations(): Array<{ column: string; migration: string }> {
  const out: Array<{ column: string; migration: string }> = [];
  for (const file of readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const n = numberOf(file);
    if (n === null || n < FLOOR) continue;
    const stem = file.replace(/\.sql$/, '');
    if (applied.has(stem)) continue;
    const sql = sqlWithoutComments(readFileSync(join(DIR, file), 'utf8'));
    for (const m of sql.matchAll(ADD_COLUMN)) out.push({ column: m[1], migration: stem });
  }
  return out;
}

const ROOTS = ['app', 'components', 'lib', 'contexts', 'hooks'];
const SELF = 'supabase/migrationAppliedBeforeCode.test.ts';

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) out.push(relative(process.cwd(), full));
    }
  };
  ROOTS.forEach(walk);
  return out.filter((f) => f !== SELF);
}

describe('a column must be applied before code references it', () => {
  /** NON-VACUITY. If the migration directory or the source walk came back
   *  empty, every assertion below is true of nothing. */
  it('reads both the migrations and the source tree', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.sql')).length).toBeGreaterThan(50);
    expect(sourceFiles().length).toBeGreaterThan(100);
    expect(applied.size).toBeGreaterThan(0);
  });

  it('no source file references a column from an unapplied migration', () => {
    const pending = columnsFromUnappliedMigrations();
    const offenders: string[] = [];

    for (const { column, migration } of pending) {
      // Comments stripped: a file EXPLAINING an upcoming column is not a file
      // writing it, and prose that names one must not block a merge.
      const users = sourceFiles().filter((f) => stripJsComments(readFileSync(f, 'utf8')).includes(column));
      for (const f of users) offenders.push(`${f} uses "${column}" from unapplied ${migration}`);
    }

    expect(
      offenders,
      'Apply the migration FIRST, record it in public.migrations_applied, sync ' +
        'supabase/migrations_applied.json, and then merge the code. This is the ' +
        '35-minute notification outage of 2026-09-21: code and migration shipped ' +
        'in one branch, the code deployed 35 minutes before the column existed, ' +
        'and every notification insert failed with PGRST204.'
    ).toEqual([]);
  });

  /** The mirror must not claim a migration that is not in the repo at all --
   *  a typo there would silently mark a real migration "applied". */
  it('every mirrored migration exists on disk', () => {
    const onDisk = new Set(
      readdirSync(DIR)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => f.replace(/\.sql$/, ''))
    );
    const ghosts = [...applied].filter((m) => !onDisk.has(m));
    expect(ghosts, 'These are recorded as applied but do not exist as files.').toEqual([]);
  });

  /** The floor must stay meaningful. If it drifted above the lowest recorded
   *  migration, everything between would be silently exempt. */
  it('the floor is at or below the lowest recorded migration', () => {
    const lowest = Math.min(...[...applied].map((m) => numberOf(m) ?? Number.POSITIVE_INFINITY));
    expect(FLOOR).toBeLessThanOrEqual(lowest);
  });
});
