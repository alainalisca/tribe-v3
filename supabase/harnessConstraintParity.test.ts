/**
 * THE LOCAL HARNESS MUST ENFORCE EVERY CONSTRAINT THE MIGRATIONS DECLARE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS EXISTS FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * supabase/recon/t-grow1-harness.LOCAL.sql ran all three T-GROW1 rehearsals
 * green. The live run of 211 then failed five arms -- B1, B5, B7, C2 and C4 --
 * all with 23514 on `pass_leads_pass_code`, because every rehearsal pass code was
 * shaped 'REHB1' and the live CHECK is `^[A-Z]{2}-[A-Z2-9]{4}$`.
 *
 * The harness had NONE of migration 173's eight CHECK constraints. So the local
 * run could not see it, and the local run was the thing that was supposed to stop
 * exactly this.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND WHY THE REHEARSAL'S OWN NEGATIVE ARMS HID IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Worth writing down, because it is the subtler half. Postgres evaluates CHECK
 * constraints in NAME ORDER, and `pass_leads_attr_tag_bounds`,
 * `_first_touch_bounds` and `_landing_path_bounds` all sort before
 * `pass_leads_pass_code`. Every arm that EXPECTED a violation therefore got the
 * violation it was looking for, asserted the constraint name, and reported PASS
 * over a row that was invalid for a second, unnoticed reason.
 *
 * Only the arms expecting SUCCESS could reveal it. A rehearsal made only of
 * negative arms would have been green on production too -- which is the inverse
 * of CLAUDE.md's 179 finding, where only failure arms existed and the migration
 * aborted on a precondition nobody had tested.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS GUARD DOES, AND THE ONE IT DELIBERATELY DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It reads the NAMED constraints the migrations declare on the two tables the
 * harness models, and fails naming any the harness does not CREATE.
 *
 * CREATE, NOT MENTION, and the difference is the whole guard. The first version
 * asked `harness.includes(name)` -- and a mutation deleting the entire
 * `ADD CONSTRAINT pass_leads_pass_code CHECK (...)` statement left this test
 * GREEN, because the `DROP CONSTRAINT IF EXISTS pass_leads_pass_code` line one
 * line above still mentioned the name. The guard written to catch this exact
 * regression could not catch this exact regression. Two of six mutation arms
 * MISSED, and they were the two that mattered.
 *
 * So it requires a creating occurrence: `CONSTRAINT <name> CHECK`, with or
 * without a leading ADD, which covers both the inline CREATE TABLE form and the
 * ALTER form. DROP lines no longer satisfy it.
 *
 * It is still a NAME check, which CLAUDE.md is rightly suspicious of -- a name
 * tells you the constraint is spelled, not that it is enforced the same way.
 * That residue is accepted with a reason: the thing that went wrong was an
 * OMISSION, and a creating-occurrence check catches every omission. The
 * divergence question is answered by the other half -- the harness copies each
 * CHECK's expression verbatim from the migration, and the rehearsals then RUN
 * against it, which is a behavioural check no name comparison could be.
 *
 * It also does not model production. The migrations are the source here, and
 * CLAUDE.md is explicit that they are not authoritative about the live database
 * in either direction. A constraint applied to production by hand is invisible to
 * this test and to the harness alike, and the live rehearsal is still what
 * decides.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { sqlWithoutComments } from './executableSql';
import mirror from './migrations_applied.json';

const APPLIED = new Set((mirror as { applied: string[] }).applied);
const FLOOR = (mirror as { _recordStartsAt: number })._recordStartsAt;

const MIGRATIONS = join(__dirname, 'migrations');
const HARNESS = join(__dirname, 'recon', 't-grow1-harness.LOCAL.sql');

/** The tables the harness models, and therefore the ones it owes constraints for. */
const MODELLED = ['pass_leads', 'featured_partners'] as const;

/**
 * THE EXEMPTION IS DERIVED, NOT WRITTEN DOWN.
 *
 * A constraint declared by a migration that has NOT been applied yet must be
 * ABSENT from the harness, and that is not a loophole -- it is the thing being
 * rehearsed. 211's body adds pass_leads_attr_tag_bounds when the rehearsal runs;
 * a harness that already had it would make Part A's arms assert over a
 * constraint the migration did not create.
 *
 * So the rule is: applied constraints are REQUIRED, unapplied ones are
 * FORBIDDEN. Both halves are asserted below, and the list maintains itself --
 * the moment 211 is applied and recorded in migrations_applied.json, its three
 * CHECKs flip from forbidden to required and this test says so.
 *
 * That is deliberately not a hand-kept allow-list. CLAUDE.md records what those
 * become: `'unete'` sat in LEAVE_UNACCENTED with no comment, silencing a real
 * defect across 13 occurrences, and a rot test could never have caught it
 * because the entry kept "earning its place". An exemption nobody has to write
 * cannot go stale and cannot be wrong about why it exists.
 */

/**
 * Does this SQL CREATE a constraint by this name, as opposed to merely naming it?
 *
 * `CONSTRAINT <name> CHECK`, optionally preceded by ADD, which is both the
 * inline CREATE TABLE form and the ALTER form. Crucially this does NOT match
 * `DROP CONSTRAINT IF EXISTS <name>`, which is what made the first version of
 * this guard blind to a deleted ADD.
 */
function creates(sql: string, name: string): boolean {
  return new RegExp(`(?:ADD\\s+)?CONSTRAINT\\s+${name}\\s+CHECK`, 'i').test(sql);
}

/** Applied = below 184's backfill floor, or listed in the mirror. */
function isApplied(migrationFile: string): boolean {
  const stem = migrationFile.replace(/\.sql$/, '');
  const n = parseInt(stem.slice(0, 3), 10);
  if (Number.isFinite(n) && n < FLOOR) return true;
  return APPLIED.has(stem);
}

/**
 * Every `CONSTRAINT <name> CHECK` and `ADD CONSTRAINT <name>` on a modelled
 * table, from the executable SQL of every migration.
 *
 * COMMENTS STRIPPED FIRST, with the repo's tokeniser. Migration 211's header
 * discusses `pass_leads_attr_tag_bounds` in prose while explaining the design,
 * and 201's addendum names `pass_leads_attended_method_check`. A check reading
 * the raw text would collect constraints that are only ever mentioned -- the
 * prose-matching failure this repo has now hit six times.
 */
function declaredConstraints(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()) {
    const sql = sqlWithoutComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
    // Only statements that actually touch a modelled table. A constraint named
    // on some other table is not this harness's business.
    for (const table of MODELLED) {
      if (!sql.includes(table)) continue;
      // Inline in a CREATE TABLE, or added by ALTER. DROP is ignored: a
      // migration that drops and re-adds appears once either way, and a
      // constraint that was dropped and never re-added is caught by the
      // re-add being absent.
      for (const m of sql.matchAll(/(?:ADD\s+)?CONSTRAINT\s+([a-z_][a-z0-9_]*)/gi)) {
        const name = m[1].toLowerCase();
        // Keyed on the name, which is unique per table in Postgres; the value is
        // only for the failure message.
        if (name.startsWith(table.slice(0, 4)) || name.includes(table)) {
          if (!out.has(name)) out.set(name, file);
        }
      }
    }
  }
  return out;
}

describe('the T-GROW1 local harness enforces what the migrations declare', () => {
  /** NON-VACUITY. An empty extraction satisfies every assertion below. */
  it('finds the constraints the migrations declare', () => {
    const declared = declaredConstraints();
    // 173 alone declares eight on pass_leads; 201, 204, 211 and 163 add more.
    expect(
      [...declared.keys()].sort(),
      'read no constraints out of the migrations, so this test is about nothing'
    ).not.toEqual([]);
    expect(declared.size).toBeGreaterThan(8);
  });

  it('the harness CREATES every APPLIED constraint on the tables it models', () => {
    const harness = sqlWithoutComments(readFileSync(HARNESS, 'utf8'));
    const missing = [...declaredConstraints().entries()]
      .filter(([, file]) => isApplied(file))
      .filter(([name]) => !creates(harness, name))
      .map(([name, file]) => `${name}  (declared in ${file}, which IS applied)`)
      .sort();

    expect(
      missing,
      'The harness does not enforce these, so a rehearsal can pass locally and ' +
        'fail live. That is exactly what happened on 2026-10-08: the harness had ' +
        "none of 173's eight CHECKs, every rehearsal pass code violated " +
        'pass_leads_pass_code, and five arms of 211 failed 23514 on production ' +
        'after a clean local run.\n\nCopy the constraint into ' +
        'supabase/recon/t-grow1-harness.LOCAL.sql, expression verbatim.'
    ).toEqual([]);
  });

  /**
   * THE OTHER HALF, and it is the one that keeps Part A honest.
   *
   * A constraint from an UNAPPLIED migration must NOT be in the harness. If it
   * were, the rehearsal's body would find it already present, its ADD CONSTRAINT
   * would be a no-op over an identical definition, and every arm asserting the
   * constraint exists would pass without the migration having created it -- an
   * arm measuring the harness and reporting it as the migration.
   */
  it('the harness does NOT pre-create a constraint from an unapplied migration', () => {
    const harness = sqlWithoutComments(readFileSync(HARNESS, 'utf8'));
    const premature = [...declaredConstraints().entries()]
      .filter(([, file]) => !isApplied(file))
      .filter(([name]) => creates(harness, name))
      .map(([name, file]) => `${name}  (from unapplied ${file})`)
      .sort();

    expect(
      premature,
      'The harness already has these, so the rehearsal cannot show that the ' +
        'MIGRATION creates them. Remove them from the harness; they arrive when ' +
        "the migration's own body runs, which is the thing being rehearsed."
    ).toEqual([]);
  });

  /**
   * THE REHEARSALS' OWN PASS CODES MUST SATISFY THE LIVE CHECK.
   *
   * The direct lesson, asserted on the thing that broke rather than on the
   * harness. Every pass code literal in a rehearsal is checked against
   * pass_leads_pass_code's regex, READ OUT OF MIGRATION 173 rather than restated
   * here -- a restated regex is a second copy that agrees until someone changes
   * the first.
   */
  it("every rehearsal pass code matches 173's pass_code CHECK", () => {
    const m173 = sqlWithoutComments(readFileSync(join(MIGRATIONS, '173_t_lead1_pass_leads.sql'), 'utf8'));
    const found = /pass_code\s*~\s*'([^']+)'/.exec(m173);
    expect(found, 'could not read the pass_code regex out of 173, so this check read nothing').not.toBeNull();
    const live = new RegExp(found![1]);

    const offenders: string[] = [];
    const dir = join(__dirname, 'rehearsals');
    for (const file of readdirSync(dir).filter((f) => /^21[123]_.*_REHEARSAL\.sql$/.test(f))) {
      const sql = sqlWithoutComments(readFileSync(join(dir, file), 'utf8'));
      // The literal in the pass_code position of each seeded INSERT, plus any
      // bare code-shaped literal, so a code moved into a variable is still seen.
      for (const m of sql.matchAll(/'([A-Z]{2}-[A-Z0-9]{4})'/g)) {
        if (!live.test(m[1])) offenders.push(`${file}: '${m[1]}'`);
      }
      for (const m of sql.matchAll(/'(REH[A-Z0-9]*)'/g)) {
        offenders.push(`${file}: '${m[1]}' (old REH-prefixed shape)`);
      }
    }

    expect(
      offenders,
      `These do not match pass_leads_pass_code (${found![1]}), so the INSERT ` +
        'raises 23514 on production. The tail charset is [A-Z2-9]: 0 and 1 are ' +
        'forbidden, which is why HR-0001 was invalid and HR-SEED is not.'
    ).toEqual([]);
  });
});
