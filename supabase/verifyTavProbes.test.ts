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

/**
 * WHICH PROBES THIS COVERS, AND THE ONE MUTATION IT CANNOT CATCH.
 *
 * ── How the scope got here ──────────────────────────────────────────────────
 *
 * Written for T-AV, keyed on the literal string `_t_av`. T-GROW1 then added
 * three probes (211 to 213) with exactly the same exposure -- they read objects
 * that do not exist on production until the migrations are pasted, which is the
 * state the verifier is RUN IN, between the merge and the paste -- and the guard
 * could not see one of them.
 *
 * The first fix was a hardcoded `COVERED_PROGRAMS = ['T-AV', 'T-GROW']` with a
 * comment claiming the count assertion made adding a program non-optional.
 * A MUTATION PROVED THAT CLAIM FALSE: narrowing it back to `['T-AV']` left this
 * file GREEN, because the probes matched and the migrations counted both shrink
 * to the same smaller number. The comment would have shipped as documentation of
 * a property that did not exist. Second attempt, reading the family out of the
 * `-- PROGRAM:` header, failed the identical mutation for the identical reason.
 *
 * ── The scope now, and why the filename and not the header ──────────────────
 *
 * The TICKET FILENAME CONVENTION, `NNN_t_<ticket><n>_*.sql`, which this repo has
 * used since 172. Two reasons it beats the header it replaced:
 *
 *   1. It covers more. 16 probes against 13: T-LEAD's 172, 173 and 175 predate
 *      the `-- PROGRAM:` header and were silently outside a header-based scope,
 *      while being exactly as exposed. Measured clean before being adopted, so
 *      this widening is coverage and not a new red.
 *   2. A migration cannot have a probe without having a filename. A header is a
 *      line someone remembers to write, and the failure mode of forgetting it
 *      was invisible.
 *
 * ── THE EQUIVALENT MUTANT, recorded rather than dropped ─────────────────────
 *
 * Narrowing TICKET_MIGRATION itself -- back to `_t_av`, or to anything smaller
 * -- leaves this file GREEN, and no version of this test can change that. After
 * such an edit the guard is a correct guard over a smaller domain, and a guard
 * is always self-consistent at its own scope. That is not a hole in the
 * assertions; it is the same fact as "no test detects its own deletion", since
 * shrinking a scope to exclude a case and deleting the case's assertion are the
 * same act. Three attempts at closing it from inside this file failed, and the
 * third attempt is why this paragraph exists instead of a fourth.
 *
 * What actually catches it is a human reading a diff that narrows a guard, so
 * the regex below is deliberately one line, named, and commented: the point is
 * that such a diff is impossible to mistake for anything else.
 *
 * What IS caught, proved by mutation on 2026-10-08. Every arm asserts the
 * mutation landed before reading the guard's response and asserts the restore
 * landed after, because a mutation that silently does not apply reports the
 * right answer to a question it never asked:
 *   M1  a probe segment deleted outright                       CAUGHT
 *   M2  a literal `'public.x'::regclass` on a T-GROW object    CAUGHT
 *   M3  a text-form has_*_privilege on a T-GROW object         CAUGHT
 *   M4  a literal `::regprocedure` on 212's function           CAUGHT
 *   M5  a header migration named outside the convention        CAUGHT
 *   --  the scope selector itself narrowed                     NOT CAUGHT, above
 */
const TICKET_MIGRATION = /^\d{3}_t_[a-z]+\d/;

/** Migration stems that follow the ticket filename convention. */
function programMigrations(): Array<{ stem: string; program: string }> {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      stem: f.replace(/\.sql$/, ''),
      // Only for the failure message, so it can say which program is uncovered.
      // `\b` and not `\s*$`: T-AV writes a bare `-- PROGRAM: T-AV`, T-GROW
      // writes `-- PROGRAM: T-GROW Growth Engine`, and T-LEAD writes no header
      // at all -- which is why the header is not the selector.
      program: /^-- PROGRAM:\s*(\S+)/m.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8'))?.[1] ?? '(no header)',
    }))
    .filter((m) => TICKET_MIGRATION.test(m.stem));
}

/** Migration stems that declare a `-- PROGRAM:` header, whatever their name. */
function headerMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => /^-- PROGRAM:\s*\S+/m.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8')))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();
}

/**
 * The verifier split into one segment per probe, keyed by the migration stem it
 * opens with. Comments are stripped first: the verifier's own T-AV30 comment
 * quotes the forbidden form while explaining it, and a check that matched prose
 * would flag its own explanation.
 */
function probeSegments(): Map<string, string> {
  const sql = sqlWithoutComments(fs.readFileSync(VERIFIER, 'utf-8'));
  const out = new Map<string, string>();
  for (const raw of sql.split(/\bunion\s+all\b/i)) {
    const seg = raw.split(/\border\s+by\s+migration\b/i)[0];
    const id = /select\s+'(\d{3}_[a-z0-9_]+)'/i.exec(seg)?.[1];
    if (id) out.set(id, seg);
  }
  return out;
}

/** The probe segments belonging to a program-era migration. */
function tavProbes(): { id: string; sql: string }[] {
  const segments = probeSegments();
  return programMigrations()
    .map(({ stem }) => ({ id: stem, sql: segments.get(stem) ?? '' }))
    .filter((p) => p.sql !== '');
}

const LITERAL_REG_CAST = /'([^']+)'\s*::\s*reg[a-z]+/gi;
const TEXT_PRIVILEGE = /has_[a-z_]+_privilege\s*\(\s*'[^']*'\s*,\s*'([^']+)'/gi;

describe('T-AV and T-GROW verifier probes read MISSING before their migrations exist (T-AV30)', () => {
  /**
   * NON-VACUITY, AND THE SCOPE CHECK THE COUNT VERSION COULD NOT MAKE.
   *
   * Per stem, not per count. `probes.length === migrationCount` is true at every
   * scope, including a scope that has silently stopped covering a whole family,
   * which is what the mutation above the helpers found. Naming the missing stem
   * is also the only form that says what to do about it.
   */
  it('every program-era migration has a probe segment this guard can read', () => {
    const all = programMigrations();
    expect(all.length, 'no migration declares a -- PROGRAM: header; the read step read nothing').toBeGreaterThan(0);

    const segments = probeSegments();
    const uncovered = all.filter(({ stem }) => !segments.has(stem)).map(({ stem, program }) => `${program} ${stem}`);
    expect(
      uncovered,
      "These migrations declare a program but have no `select '<stem>'` probe in " +
        'verify-migration-state.sql, so nothing checks that their probe reads MISSING ' +
        'rather than raising on a database where the migration has not been pasted yet.'
    ).toEqual([]);

    expect(tavProbes().length).toBe(all.length);
  });

  /**
   * THE TWO SELECTORS MUST NOT DIVERGE.
   *
   * The scope is the ticket filename convention, and it is a superset of the
   * `-- PROGRAM:` header set today. This fails if a future program declares a
   * header on a migration whose filename does NOT follow the convention, which
   * is the one way a genuinely new family could land outside the scope without
   * anybody editing the regex above.
   *
   * It does not catch the regex above being narrowed -- nothing in this file
   * can, see the note on TICKET_MIGRATION -- but it does catch the drift that
   * would otherwise make narrowing unnecessary.
   */
  it('every migration declaring a program also follows the ticket filename convention', () => {
    const inScope = new Set(programMigrations().map((m) => m.stem));
    const outside = headerMigrations().filter((stem) => !inScope.has(stem));
    expect(
      outside,
      'These declare a -- PROGRAM: header but their filename does not match ' +
        "NNN_t_<ticket><n>_*.sql, so they fall outside this guard's scope. Rename the " +
        'migration to the convention, or widen TICKET_MIGRATION and say why in its note.'
    ).toEqual([]);
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
