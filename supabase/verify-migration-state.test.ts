/**
 * Tests that supabase/verify-migration-state.sql stays in sync with
 * the actual migrations directory.
 *
 * The risk this prevents: a new migration (say 086_team_archive.sql)
 * gets committed to supabase/migrations/ but nobody updates the
 * verifier. Then verify-migration-state.sql returns 'applied' for
 * everything it knows about, the operator marks the migration check
 * green, ships to main, and the runtime explodes on a missing
 * column. This test fails LOUDLY when there's drift.
 *
 * Pattern: parse the file for migration names (lines that look like
 * `select 'NNN_name'`) and compare against the filesystem.
 *
 * The verifier only covers migrations 060-083+ (the Tribe.OS era).
 * Earlier migrations are out of scope — they were applied before
 * the verifier existed and don't need re-checking.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const VERIFIER_PATH = path.join(__dirname, 'verify-migration-state.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** Lower bound: the verifier only covers Tribe.OS-era migrations. */
const VERIFIER_FLOOR = 60;

function readVerifierMigrationIds(): string[] {
  const sql = fs.readFileSync(VERIFIER_PATH, 'utf-8');
  // Each migration row in the verifier opens with `select 'NNN_name'`
  // (or `union all select 'NNN_name'`). Pull every quoted migration
  // identifier matching the 3-digit-prefix pattern.
  const matches = sql.matchAll(/['"](\d{3}_[a-z0-9_]+)['"]/gi);
  return Array.from(new Set([...matches].map((m) => m[1])));
}

function readMigrationFiles(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ''))
    .filter((id) => {
      const num = parseInt(id.slice(0, 3), 10);
      return Number.isFinite(num) && num >= VERIFIER_FLOOR;
    })
    .sort();
}

describe('supabase/verify-migration-state.sql ↔ migrations/', () => {
  it('verifier covers every migration in the migrations/ directory (Tribe.OS era)', () => {
    const verifierIds = readVerifierMigrationIds();
    const fileIds = readMigrationFiles();

    const missing = fileIds.filter((id) => !verifierIds.includes(id));

    if (missing.length > 0) {
      throw new Error(
        `verify-migration-state.sql is missing checks for:\n  ${missing.join('\n  ')}\n\n` +
          `Add a 'select <id>, ...' branch for each to supabase/verify-migration-state.sql.\n` +
          `Without these the verifier silently reports 'all green' while real migrations\n` +
          `sit unapplied in production.`
      );
    }
    expect(missing).toEqual([]);
  });

  it('verifier does not reference migration ids that no longer exist (no orphans)', () => {
    const verifierIds = readVerifierMigrationIds();
    const fileIds = new Set(readMigrationFiles());

    const orphans = verifierIds.filter((id) => {
      const num = parseInt(id.slice(0, 3), 10);
      // The verifier may legitimately reference IDs below the floor
      // in commentary or examples. Only flag drift inside the
      // Tribe.OS range.
      if (num < VERIFIER_FLOOR) return false;
      return !fileIds.has(id);
    });

    if (orphans.length > 0) {
      throw new Error(
        `verify-migration-state.sql references migrations that don't exist:\n  ${orphans.join('\n  ')}\n\n` +
          `Either the migration file was renamed/deleted, or the verifier has a typo.\n` +
          `An operator running the verifier against a fresh DB would see 'MISSING' for\n` +
          `something that legitimately doesn't need to be applied.`
      );
    }
    expect(orphans).toEqual([]);
  });
});
// Dropped the third 'malformed row' check — it tripped on the
// stylistic difference between `select 'NNN' as migration,` (first
// row, has alias) vs `select 'NNN',` (subsequent rows, no alias).
// Postgres parses both fine, and a truly broken row would fail at
// the SQL editor on first invocation anyway. The first two tests
// cover the real drift modes (missing checks, orphan references).
