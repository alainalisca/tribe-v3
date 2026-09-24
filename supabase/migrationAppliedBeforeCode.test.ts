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

/**
 * COLUMN NAMES THAT ALREADY EXIST ON ANOTHER TABLE.
 *
 * This guard matches a column by NAME in source text, because it runs with no
 * database and no parser. That is exact for a name nothing else uses
 * (athlete_setup_completed_at) and useless for one that is everywhere:
 * `deleted_at` already exists on public.users and appears in 18 source files
 * that have nothing to do with communities. Adding communities.deleted_at in
 * 190 would therefore flag all 18, and the branch carrying 190 could never
 * merge before 190 is applied. That collides head-on with "merge the
 * branch, then paste" (CLAUDE.md). One rule would force breaking the other.
 *
 * So a collision is listed here, keyed by `migration:column`, with the reason.
 * Two things keep this from becoming a quiet hole:
 *   1. The branch that adds the column must not reference it. 190's branch
 *      does not: deletion goes through soft_delete_community(), and the SELECT
 *      policy hides deleted rows from every client read.
 *   2. The rot test below fails the moment the migration is recorded as
 *      applied, so the exemption cannot outlive the window it exists for. The
 *      mirror-sync commit after applying 190 must delete this line.
 */
const KNOWN_NAME_COLLISIONS: Record<string, string> = {
  // Empty. 190_community_soft_delete:deleted_at was listed here until 190 was
  // applied (2026-09-24) and recorded; the rot test below forced its removal.
};

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
      if (`${migration}:${column}` in KNOWN_NAME_COLLISIONS) continue;
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

  /** A name-collision exemption covers ONE unapplied migration's column. Once
   *  that migration is recorded, the exemption is doing nothing but hiding the
   *  next collision under the same name, so it must be deleted. */
  it('every known name collision still names a pending, unapplied column', () => {
    const pending = new Set(columnsFromUnappliedMigrations().map(({ column, migration }) => `${migration}:${column}`));
    const stale = Object.keys(KNOWN_NAME_COLLISIONS).filter((k) => !pending.has(k));
    expect(
      stale,
      'These exemptions no longer match an unapplied migration. The migration was applied and ' +
        'recorded, so delete its line from KNOWN_NAME_COLLISIONS in the same commit as the mirror sync.'
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
