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

/**
 * The static half of the users-column-grant guard.
 *
 * verify-migration-state.sql checks the LIVE database, which is the real
 * answer but only arrives when somebody remembers to paste it into the SQL
 * editor. This test is the half that fails the build, before the migration is
 * ever applied.
 *
 * WHAT IT PREVENTS
 * public.users has no table-level SELECT grant for authenticated/anon: 066
 * revoked it and re-granted SELECT column by column, 067 extended the list.
 * A column added after that snapshot is invisible to every non-service caller
 * until it is granted explicitly, and the client fails at runtime with
 * `42501 permission denied for table users`. 156 shipped exactly that way and
 * blanked the first-run introduction, all five dismissible banners and the
 * What's New badge.
 *
 * WHY NO UNIT TEST CAUGHT IT
 * Every unit test mocks the DAL, so no test in this repo can observe a
 * permission error -- the mock returns success and the component renders. That
 * is not a gap this test closes either. It closes the narrower one: catching
 * the missing GRANT in the migration text itself.
 *
 * NOTE FOR THE SQL SIDE (verify-migration-state.sql): the live check must use
 * has_column_privilege(), never information_schema.column_privileges. That view
 * lists only explicitly granted COLUMN privileges and cannot see a table-level
 * grant, so it reports "absent" both for a column readable via a table-level
 * grant and for a column that is genuinely unreadable. It gave a false pass
 * while this bug was being diagnosed. Do not swap it back.
 */
describe('public.users columns added after 067 carry an explicit SELECT grant', () => {
  /** 067 is the last migration that re-granted every column existing at the time. */
  const GRANT_SNAPSHOT = 67;

  /**
   * Columns exempt from the rule, each with the reason it is exempt.
   * Anything not listed here must appear in a `GRANT SELECT (...) ON
   * public.users` in some migration.
   */
  const EXEMPT: Record<string, string> = {
    // Added by 094 with no grant, yet verified readable in production on
    // 2026-09-09: has_column_privilege('authenticated', 'public.users',
    // 'last_seen_release', 'SELECT') = true. The grant was evidently applied
    // out of band and the migration history does not record it. Al's call
    // (2026-09-09): leave it alone rather than write a migration for a
    // privilege production already has.
    last_seen_release: 'granted out of band; confirmed readable in production',
  };

  /** Strip block and line comments so commented-out DDL never counts. */
  function stripSqlComments(sql: string): string {
    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  }

  it('every users column added after 067 is granted to authenticated', () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .sort();

    const added: { file: string; column: string }[] = [];
    const grantedColumns = new Set<string>();

    for (const file of files) {
      const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));

      // `ALTER TABLE [IF EXISTS] [ONLY] [public.]users ... ;` -- one statement
      // may add several columns, and may span many lines.
      const alters = sql.matchAll(
        /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?"?users"?\b([\s\S]*?);/gi
      );
      for (const alter of alters) {
        for (const col of alter[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi)) {
          added.push({ file, column: col[1] });
        }
      }

      for (const grant of sql.matchAll(/GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:public\s*\.\s*)?"?users"?/gi)) {
        for (const name of grant[1].split(',')) {
          const clean = name.trim().replace(/"/g, '');
          if (clean) grantedColumns.add(clean);
        }
      }
    }

    const ungranted = added
      .filter(({ file }) => parseInt(file.slice(0, 3), 10) > GRANT_SNAPSHOT)
      .filter(({ column }) => !grantedColumns.has(column) && !(column in EXEMPT));

    if (ungranted.length > 0) {
      throw new Error(
        `These columns were added to public.users after 067 without a SELECT grant:\n` +
          ungranted.map(({ file, column }) => `  ${column}  (${file})`).join('\n') +
          `\n\npublic.users has no table-level SELECT grant for authenticated/anon (066 revoked\n` +
          `it and re-granted column by column). An ungranted column is unreadable by the\n` +
          `client, which fails with "42501 permission denied for table users" at runtime --\n` +
          `and no unit test can see it, because the DAL is mocked everywhere.\n\n` +
          `Add to the migration:\n` +
          `  GRANT SELECT (<column>) ON public.users TO authenticated;\n` +
          `  GRANT SELECT (<column>) ON public.users TO anon;\n\n` +
          `If the column is deliberately withheld from the client, add it to the exclusion\n` +
          `list in supabase/verify-migration-state.sql instead, and to EXEMPT here with the\n` +
          `reason.`
      );
    }
    expect(ungranted).toEqual([]);
  });

  it('the 156/157 onboarding columns are granted', () => {
    const sql156 = fs.readFileSync(path.join(MIGRATIONS_DIR, '156_onboarding_state.sql'), 'utf-8');
    const sql157 = fs.readFileSync(path.join(MIGRATIONS_DIR, '157_grant_onboarding_columns.sql'), 'utf-8');

    // 156 carries the grant so a database rebuilt from the migrations is
    // correct; 157 carries it because 156 had already run against production.
    for (const sql of [sql156, sql157]) {
      expect(sql).toMatch(
        /GRANT\s+SELECT\s*\([^)]*onboarding_completed_at[^)]*\)\s*ON\s+public\.users\s+TO\s+authenticated/i
      );
      expect(sql).toMatch(/GRANT\s+SELECT\s*\([^)]*dismissed_banners[^)]*\)\s*ON\s+public\.users\s+TO\s+anon/i);
    }
  });
});

/**
 * The static half of the sessions write-grant guard (T-GYM1).
 *
 * 158 put public.sessions under column-level INSERT and UPDATE grants so a
 * session's creator cannot set partner_status themselves -- the gym owns its
 * own name. The cost of that mechanism is a new trap: from 158 on, a column
 * added to sessions is NOT writable by authenticated until it is granted, and
 * it fails in production while every test passes, because the DAL is mocked
 * everywhere and a mock cannot return a permission error.
 *
 * That is the same failure shape as 156's missing SELECT grant on users, which
 * took three attempts to find. verify-migration-state.sql catches it against
 * the live database; this catches it in CI, before the migration is applied.
 *
 * The live check must use has_column_privilege(), never
 * information_schema.column_privileges -- that view cannot see table-level
 * grants and returns the same answer whether a column is writable or not. Do
 * not swap it back.
 */
describe('public.sessions columns added after 158 carry an explicit write grant', () => {
  const WRITE_GRANT_MIGRATION = 158;

  /**
   * Deliberately NOT writable by authenticated. THREE columns, not two:
   * partner_status and partner_reviewed_at are the gym's verdict (158), and
   * partner_id is the only way that verdict gets computed (162) -- a client
   * that can set it directly can leave partner_status NULL, a state
   * set_session_partner cannot produce.
   *
   * 158's DO block re-grants every live column except a hard-coded list, and
   * copying that pattern verbatim silently re-grants partner_id and undoes 162
   * with no error. That is what this list exists to catch.
   */
  const VERDICT_COLUMNS = ['partner_status', 'partner_reviewed_at', 'partner_id'];

  function stripSqlComments(sql: string): string {
    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  }

  it('every sessions column added after 158 is granted INSERT and UPDATE', () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .sort();

    const added: { file: string; column: string }[] = [];
    const granted = { INSERT: new Set<string>(), UPDATE: new Set<string>() };

    for (const file of files) {
      const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));

      const alters = sql.matchAll(
        /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?"?sessions"?\b([\s\S]*?);/gi
      );
      for (const alter of alters) {
        for (const col of alter[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi)) {
          added.push({ file, column: col[1] });
        }
      }

      for (const privilege of ['INSERT', 'UPDATE'] as const) {
        // Matches both `GRANT INSERT (a, b) ON sessions` and the combined
        // `GRANT INSERT (a), UPDATE (a) ON sessions` form, where the privilege
        // is followed by another privilege rather than by ON.
        const re = new RegExp(
          `GRANT[\\s\\S]{0,80}?\\b${privilege}\\s*\\(([^)]*)\\)[\\s\\S]{0,80}?ON\\s+(?:public\\s*\\.\\s*)?"?sessions"?`,
          'gi'
        );
        for (const grant of sql.matchAll(re)) {
          for (const name of grant[1].split(',')) {
            const clean = name.trim().replace(/"/g, '');
            if (clean) granted[privilege].add(clean);
          }
        }
      }
    }

    // 158 re-grants dynamically from the live catalog (`|| cols ||`), which the
    // regex above cannot enumerate. Columns existing at 158 are covered by that
    // block; only later additions need naming, so scope the assertion to them.
    const ungranted = added
      .filter(({ file }) => parseInt(file.slice(0, 3), 10) > WRITE_GRANT_MIGRATION)
      .filter(({ column }) => !VERDICT_COLUMNS.includes(column))
      .flatMap(({ file, column }) => {
        const missing = (['INSERT', 'UPDATE'] as const).filter((p) => !granted[p].has(column));
        return missing.length > 0 ? [{ file, column, missing: missing.join('+') }] : [];
      });

    if (ungranted.length > 0) {
      throw new Error(
        `These columns were added to public.sessions after 158 without a write grant:\n` +
          ungranted.map((u) => `  ${u.column}  (${u.file}) -- missing ${u.missing}`).join('\n') +
          `\n\n158 revoked table-level INSERT/UPDATE on public.sessions from authenticated and\n` +
          `re-granted column by column, so the session creator cannot set partner_status.\n` +
          `A column added afterwards is NOT writable until granted: writes fail at runtime\n` +
          `with "permission denied for column", and no unit test can see it because the DAL\n` +
          `is mocked everywhere.\n\n` +
          `Add to the migration:\n` +
          `  GRANT INSERT (<column>), UPDATE (<column>) ON public.sessions TO authenticated;\n\n` +
          `If the column must NOT be client-writable, add it to VERDICT_COLUMNS here and to\n` +
          `the exclusion list in supabase/verify-migration-state.sql.`
      );
    }
    expect(ungranted).toEqual([]);
  });

  it('158 revokes both privileges and re-grants from the live catalog', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '158_gym_venue_approval.sql'), 'utf-8');

    // INSERT as well as UPDATE: revoking only UPDATE would leave the guarantee
    // bypassable by creating the session with partner_status already 'approved'.
    expect(sql).toMatch(/REVOKE\s+UPDATE\s+ON\s+public\.sessions\s+FROM\s+authenticated/i);
    expect(sql).toMatch(/REVOKE\s+INSERT\s+ON\s+public\.sessions\s+FROM\s+authenticated/i);

    // Enumerated from information_schema at apply time, never from
    // lib/database.types.ts, which 137 records as three columns stale.
    expect(sql).toMatch(/FROM information_schema\.columns/i);
    expect(sql).toMatch(/GRANT UPDATE \(' \|\| cols \|\| '\) ON public\.sessions/);
    expect(sql).toMatch(/GRANT INSERT \(' \|\| cols \|\| '\) ON public\.sessions/);
    expect(sql).toContain("NOT IN ('partner_status', 'partner_reviewed_at')");
  });

  it('no migration after 162 re-grants a verdict column to authenticated', () => {
    // Addition 2, and the case a negative probe showed was NOT covered: the
    // "columns added after 158" check filters verdict columns out, so a
    // migration that copies 158's two-column exclusion and re-grants
    // partner_id was invisible to CI and would only surface in the live guard.
    const offenders: string[] = [];
    for (const file of fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .sort()) {
      if (parseInt(file.slice(0, 3), 10) <= 162) continue;
      const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
      for (const privilege of ['INSERT', 'UPDATE'] as const) {
        const re = new RegExp(
          `GRANT[\\s\\S]{0,80}?\\b${privilege}\\s*\\(([^)]*)\\)[\\s\\S]{0,200}?ON\\s+(?:public\\s*\\.\\s*)?"?sessions"?[\\s\\S]{0,80}?authenticated`,
          'gi'
        );
        for (const grant of sql.matchAll(re)) {
          for (const name of grant[1].split(',').map((n) => n.trim().replace(/"/g, ''))) {
            if (VERDICT_COLUMNS.includes(name)) offenders.push(`${file}: GRANT ${privilege} (${name})`);
          }
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `These migrations re-grant a verdict column on public.sessions:\n  ` +
          offenders.join('\n  ') +
          `\n\npartner_status and partner_reviewed_at are the gym's verdict; partner_id is the\n` +
          `only way that verdict gets computed. A client that can write partner_id can leave\n` +
          `partner_status NULL, a state set_session_partner cannot produce.\n\n` +
          `158's DO block re-grants every live column except a hard-coded list of TWO.\n` +
          `Any re-grant on this table must exclude THREE.`
      );
    }
    expect(offenders).toEqual([]);
  });

  it('162 revokes both write privileges on partner_id and asserts it stuck', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '162_revoke_partner_id_write.sql'), 'utf-8');
    expect(sql).toMatch(
      /REVOKE\s+INSERT\s*\(partner_id\),\s*UPDATE\s*\(partner_id\)\s*ON\s+public\.sessions\s+FROM\s+authenticated/i
    );
    // The assertion must use has_column_privilege; information_schema cannot
    // see table-level grants and would pass either way.
    expect(sql).toContain("has_column_privilege('authenticated', 'public.sessions', 'partner_id', 'INSERT')");
    expect(sql).toContain("has_column_privilege('authenticated', 'public.sessions', 'partner_id', 'UPDATE')");
  });

  it('names all three verdict columns in the loud header, so a copied re-grant is caught by eye too', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '162_revoke_partner_id_write.sql'), 'utf-8');
    expect(sql).toContain('THREE COLUMNS, NOT TWO');
    for (const column of ['partner_status', 'partner_reviewed_at', 'partner_id']) {
      expect(sql).toContain(column);
    }
  });

  it('the verdict columns are never added to the host-editable allow-list', () => {
    // updateSessionAsHost takes a Pick<> allow-list. If partner_status ever
    // appears there, the creator can approve their own request through the
    // ordinary edit flow and the RPC guarantee is moot.
    const dal = fs.readFileSync(path.join(__dirname, '..', 'lib', 'dal', 'sessions.ts'), 'utf-8');
    const allowList = dal.slice(
      dal.indexOf('HostEditableSessionUpdate'),
      dal.indexOf('>;', dal.indexOf('HostEditableSessionUpdate'))
    );
    for (const column of VERDICT_COLUMNS) {
      expect(allowList).not.toContain(column);
    }
  });
});

// Dropped the third 'malformed row' check — it tripped on the
// stylistic difference between `select 'NNN' as migration,` (first
// row, has alias) vs `select 'NNN',` (subsequent rows, no alias).
// Postgres parses both fine, and a truly broken row would fail at
// the SQL editor on first invocation anyway. The first two tests
// cover the real drift modes (missing checks, orphan references).
