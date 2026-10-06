/**
 * T-AV30. The verifier's T-AV probes must read MISSING, not raise, on a
 * database where the athlete migrations have not been applied yet.
 *
 * Found in the 2026-10-06 merge rehearsal: one probe did
 * pg_get_functiondef('public.av_door_pass(text)'::regprocedure). A string
 * literal cast to a reg* type is resolved when the statement is PARSED, so it
 * raised before any CASE branch could run, and the whole verifier died on a
 * database that simply did not have the function yet. That is exactly the
 * state production is in between the merge and the pastes.
 *
 * This is the source half of the check, so CI catches it without a database:
 *   - no literal '...'::regprocedure / ::regclass (or any reg* cast) in a T-AV
 *     probe, except on main's own tables, which exist before any T-AV
 *     migration;
 *   - no text-form has_*_privilege(role, 'object', ...) on a T-AV object
 *     (the text form raises at run time on a missing object; the OID form
 *     returns NULL).
 * The behavioural half, against a real database with and without the
 * migrations, is supabase/recon/t-av30-proof.LOCAL.sh.
 *
 * Comments are stripped with the repo's tokeniser first: the verifier's own
 * T-AV30 comment quotes the forbidden form while explaining it, and a check
 * that matched prose would flag its own explanation (CLAUDE.md, "a check that
 * matches prose describing the thing it checks").
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sqlWithoutComments } from './executableSql';

const VERIFIER = path.join(__dirname, 'verify-migration-state.sql');
const MIGRATIONS = path.join(__dirname, 'migrations');

/**
 * Objects a T-AV probe may still name with a literal, each with its reason.
 * Every entry must still appear in some probe (the rot test below).
 */
const MAIN_OBJECTS: Record<string, string> = {
  public: "the public schema ('public'::regnamespace); it exists in every database this verifier runs against",
  'public.pass_leads':
    "main's own table (the /pase lead record); it exists before any T-AV migration, so resolving it at parse time cannot fail",
};

/** The T-AV probes, comments stripped: each `select '<id>_t_av...'` up to the next `union all` or the final `order by`. */
function tavProbes(): { id: string; sql: string }[] {
  const sql = sqlWithoutComments(fs.readFileSync(VERIFIER, 'utf-8'));
  return sql
    .split(/\bunion\s+all\b/i)
    .map((seg) => seg.split(/\border\s+by\s+migration\b/i)[0])
    .map((seg) => ({ id: /select\s+'([0-9]+_t_av[a-z0-9_]*)'/i.exec(seg)?.[1] ?? '', sql: seg }))
    .filter((p) => p.id !== '');
}

/** How many migrations declare `-- PROGRAM: T-AV` in their header. */
function tavMigrationCount(): number {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => /^-- PROGRAM: T-AV\s*$/m.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8'))).length;
}

const LITERAL_REG_CAST = /'([^']+)'\s*::\s*reg[a-z]+/gi;
const TEXT_PRIVILEGE = /has_[a-z_]+_privilege\s*\(\s*'[^']*'\s*,\s*'([^']+)'/gi;

describe('T-AV verifier probes read MISSING before the athlete migrations exist (T-AV30)', () => {
  it('finds one probe per T-AV migration (the read step read something)', () => {
    const probes = tavProbes();
    expect(probes.length).toBeGreaterThan(0);
    expect(probes.length).toBe(tavMigrationCount());
  });

  it('no T-AV probe resolves a T-AV object with a literal reg* cast', () => {
    const offenders = tavProbes().flatMap((p) =>
      [...p.sql.matchAll(LITERAL_REG_CAST)].filter((m) => !(m[1] in MAIN_OBJECTS)).map((m) => `${p.id}: ${m[0]}`)
    );
    expect(offenders, 'use to_regprocedure(...) / to_regclass(...) instead').toEqual([]);
  });

  it('no T-AV probe passes a T-AV object to has_*_privilege by name', () => {
    const offenders = tavProbes().flatMap((p) =>
      [...p.sql.matchAll(TEXT_PRIVILEGE)].filter((m) => !(m[1] in MAIN_OBJECTS)).map((m) => `${p.id}: ${m[0]}`)
    );
    expect(offenders, 'pass to_regprocedure(...) / to_regclass(...), the OID form returns NULL when absent').toEqual(
      []
    );
  });

  it('every MAIN_OBJECTS exemption is still used by a probe (remove it if not)', () => {
    const all = tavProbes()
      .map((p) => p.sql)
      .join('\n');
    const unused = Object.keys(MAIN_OBJECTS).filter((o) => !all.includes(`'${o}'`));
    expect(unused).toEqual([]);
  });
});
