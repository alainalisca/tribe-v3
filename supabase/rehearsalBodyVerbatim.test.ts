/**
 * A REHEARSAL'S PART A MUST BE THE MIGRATION'S BODY, BYTE FOR BYTE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A TEST AND NOT A NOTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 175's rehearsal carries this instruction in its own header:
 *
 *   python3 -c "m=open('supabase/migrations/175_...sql').read().rstrip(); \
 *               r=open('supabase/rehearsals/175_..._REHEARSAL.sql').read(); \
 *               print(m in r)"
 *   ... Rerun that check after editing either file.
 *
 * It is the right check and it depends on someone remembering to run it after
 * editing one of two files. This repo has now paid several times for the
 * difference between a rule that is written down and a rule that is enforced:
 * the migration-number collisions happened three times after the rule was
 * agreed, and became a test; the applied-before-code sequencing was already a
 * rule when it caused a 35-minute outage, and became a test.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE VERBATIM PROPERTY MATTERS AT ALL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A rehearsal exists to answer "will this migration apply to production". It can
 * only answer that about the text it actually runs. A paraphrased body is a
 * different migration, and the ways that bites are not hypothetical here:
 *
 *   * 175's last guard parses the function's own prosrc after stripping line
 *     comments, so a rehearsal that dropped a comment would feed the guard a
 *     different input than production will.
 *   * 179's rehearsal spliced its body from the INSERT to the first UPDATE,
 *     straight past the DO block holding its guards, and reported 19 green arms
 *     over a migration that ABORTS on its first guard.
 *
 * So the whole body including every guard, and the comments with it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SCOPE, AND THE MEASUREMENT BEHIND IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Only migrations written in the transaction-wrapped house shape -- a top-level
 * `BEGIN;` line -- that also have a rehearsal. Measured on 2026-10-08 across all
 * 33 existing rehearsal/migration pairs: exactly ONE, 175, contains its
 * migration verbatim. The other 32 predate the convention.
 *
 * Widening this to all 33 would turn the branch red over 32 files this ticket
 * does not own, which is the state in which a guard gets deleted rather than
 * fixed. The floor is structural rather than a number, so a migration opts in by
 * being written in the current shape, and the non-vacuity assertion below fails
 * if the scope ever selects nothing -- which is how a "green" run over an empty
 * set gets caught instead of being reported as coverage.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sqlWithoutComments } from './executableSql';

const MIGRATIONS = path.join(__dirname, 'migrations');
const REHEARSALS = path.join(__dirname, 'rehearsals');

/** The line the body ends at: everything after it is bookkeeping, not schema. */
const RECORD_MARKER = '-- ── Record this migration as applied';

/** A top-level `BEGIN;` on its own line. The current house shape. */
const BEGIN_LINE = /^BEGIN;[ \t]*\n/m;

/**
 * The slice of a migration a rehearsal must contain.
 *
 * TWO OMISSIONS, both necessary rather than cosmetic, and both the reason this
 * is a slice rather than the whole file:
 *
 *   * the outer `BEGIN;` / `COMMIT;`, because the rehearsal supplies the
 *     transaction and Postgres has no nested BEGIN;
 *   * the `INSERT INTO public.migrations_applied`, because recording a migration
 *     as applied inside a transaction that rolls back is at best a no-op and at
 *     worst the one statement anybody would regret leaving committed.
 *
 * Everything between them, including every DO guard block and every comment.
 */
function spliceableBody(migrationSql: string): string | null {
  const begin = BEGIN_LINE.exec(migrationSql);
  if (!begin) return null;
  const start = begin.index + begin[0].length;
  const marker = migrationSql.indexOf(RECORD_MARKER);
  const end = marker === -1 ? migrationSql.lastIndexOf('\nCOMMIT;') : marker;
  if (end <= start) return null;
  return migrationSql.slice(start, end).replace(/^\n+|\n+$/g, '');
}

/** Rehearsal files paired with the migration sharing their three-digit number. */
function pairs(): Array<{ rehearsal: string; migration: string }> {
  if (!fs.existsSync(REHEARSALS)) return [];
  const migrations = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.*\.sql$/.test(f));
  return fs
    .readdirSync(REHEARSALS)
    .filter((f) => /^\d{3}_.*_REHEARSAL\.sql$/.test(f))
    .sort()
    .flatMap((rehearsal) => {
      const migration = migrations.find((m) => m.slice(0, 3) === rehearsal.slice(0, 3));
      return migration ? [{ rehearsal, migration }] : [];
    });
}

/** The pairs in scope: the migration is written in the transaction-wrapped shape. */
function inScope(): Array<{ rehearsal: string; migration: string; body: string }> {
  return pairs().flatMap(({ rehearsal, migration }) => {
    const body = spliceableBody(fs.readFileSync(path.join(MIGRATIONS, migration), 'utf8'));
    return body === null ? [] : [{ rehearsal, migration, body }];
  });
}

describe("a rehearsal's Part A is its migration's body, verbatim", () => {
  /**
   * NON-VACUITY, AND IT IS THE ASSERTION THAT MATTERS MOST HERE.
   *
   * Every other assertion in this file is a forall over `inScope()`. An empty
   * scope satisfies all of them and reports green, which is indistinguishable
   * from this guard working. CLAUDE.md records the migration 180 version of
   * exactly this: a catalog read returned nothing, `'' !~* '...'` was true of the
   * empty string, and three separate checks passed over a function that returned
   * the forbidden column.
   */
  it('selects at least one rehearsal, and names what it selected', () => {
    const scope = inScope();
    expect(
      scope.map((s) => s.rehearsal),
      'No rehearsal pairs with a transaction-wrapped migration, so every assertion ' +
        'below is a statement about the empty set. Either the scope rule is wrong or ' +
        'the directories moved.'
    ).not.toEqual([]);
  });

  it('every in-scope rehearsal contains its migration body byte for byte', () => {
    const offenders = inScope()
      .filter(({ rehearsal, body }) => !fs.readFileSync(path.join(REHEARSALS, rehearsal), 'utf8').includes(body))
      .map(({ rehearsal, migration }) => `${rehearsal} does not contain the body of ${migration} verbatim`);

    expect(
      offenders,
      "Part A of a rehearsal must be the migration's body spliced in, not retyped. " +
        "A paraphrased body rehearses a different migration: 175's last guard parses " +
        "its own prosrc with comments stripped, and 179's rehearsal spliced around its " +
        'DO guard and reported 19 green arms over a migration that aborts on it. ' +
        'Re-splice from the migration rather than editing the rehearsal copy.'
    ).toEqual([]);
  });

  /**
   * The two omissions are deliberate, so they are asserted rather than left to a
   * reader to infer from an absence. A rehearsal that DID contain the
   * migrations_applied insert would roll it back today and commit it the first
   * time someone adapted the file to apply for real.
   *
   * MATCHED AGAINST sqlWithoutComments, NOT THE RAW FILE, and this is not a
   * precaution -- it is a fix. The first version read the raw text and flagged
   * 211's rehearsal immediately, because that rehearsal's header EXPLAINS that it
   * omits the `INSERT INTO public.migrations_applied` and the explanation
   * contains the phrase. Fifth instance in this repo of a check matching prose
   * that describes the thing it checks, after migration 165's counter guard, the
   * T-AU3 template-key guard, `'unete'` inside its own exemption list, and
   * migration 189 teaching a guard about a column named "so".
   *
   * The repo's tokeniser is the fix rather than a regex, because it keeps string
   * literals intact while removing comments -- 179's abort message contains
   * `-- do NOT widen this to a range` inside a quoted string, and a naive
   * stripper truncates there while producing a perfectly stable result.
   */
  it('no in-scope rehearsal records its migration as applied', () => {
    const offenders = inScope()
      .filter(({ rehearsal }) =>
        /INSERT\s+INTO\s+public\.migrations_applied/i.test(
          sqlWithoutComments(fs.readFileSync(path.join(REHEARSALS, rehearsal), 'utf8'))
        )
      )
      .map(({ rehearsal }) => rehearsal);
    expect(
      offenders,
      'A rehearsal must not carry the migrations_applied insert. It is a no-op under ' +
        'ROLLBACK and a false record the moment the file is adapted to run for real.'
    ).toEqual([]);
  });

  /** A rehearsal that never rolls back is a migration with extra steps. */
  it('every in-scope rehearsal rolls back', () => {
    const offenders = inScope()
      .filter(({ rehearsal }) => !/^ROLLBACK;/m.test(fs.readFileSync(path.join(REHEARSALS, rehearsal), 'utf8')))
      .map(({ rehearsal }) => rehearsal);
    expect(offenders, 'A rehearsal must end its transaction with ROLLBACK on its own line.').toEqual([]);
  });

  /**
   * The stated total in the closing comment must match the highest seq the file
   * can emit.
   *
   * CLAUDE.md records this exact slip happening TWICE IN ONE DAY, both times
   * because an edit ran `replace("-- Every row must read PASS. 16 of 16.", ...)`
   * where the `-- ` prefix is not adjacent to `Every`, so the pattern matched
   * nothing and the replace silently did nothing -- leaving the file telling the
   * operator to expect fewer rows than it emits. A rule written after the first
   * instance did not prevent the second, so it is parsed out of the file here.
   */
  it("each rehearsal's stated arm total matches the highest seq it emits", () => {
    const offenders: string[] = [];
    for (const { rehearsal } of inScope()) {
      const sql = fs.readFileSync(path.join(REHEARSALS, rehearsal), 'utf8');
      const stated = /Every row must read PASS\.\s*(\d+)\s*of\s*(\d+)\./.exec(sql);
      if (!stated) {
        offenders.push(`${rehearsal} has no "Every row must read PASS. N of N." line`);
        continue;
      }
      // Only the arms inside the rolled-back transaction count. Part G runs
      // after the ROLLBACK and is its own separately numbered result set.
      const beforeRollback = sql.slice(0, sql.search(/^ROLLBACK;/m));
      const seqs = [...beforeRollback.matchAll(/^\s*\(\s*(\d+),\s*'[A-Z]\d/gm)].map((m) => Number(m[1]));
      const highest = seqs.length ? Math.max(...seqs) : 0;
      if (stated[1] !== stated[2]) offenders.push(`${rehearsal} says "${stated[1]} of ${stated[2]}"`);

      // THE READ STEP, ASSERTED BEFORE WHAT IT FOUND. An empty seqs array makes
      // every comparison below a statement about zero arms.
      if (seqs.length === 0) {
        offenders.push(`${rehearsal}: read no arm seqs at all, so this check read nothing`);
        continue;
      }

      // BOTH the count and the maximum, which together force contiguity from 1.
      // The maximum alone passes a file whose arms jump 1, 2, 4 while claiming 4
      // -- three PASS rows read as four, which is the short-result-set failure
      // this check exists for, wearing the check's own clothes. The count alone
      // passes a file numbered 0..N-1, which is how 212 came to say "34 of 34"
      // over 35 rows when A0 was inserted ahead of A1.
      if (Number(stated[2]) !== seqs.length || Number(stated[2]) !== highest) {
        offenders.push(
          `${rehearsal} states ${stated[2]} arms but emits ${seqs.length} of them, numbered up to ${highest}`
        );
      }
    }
    expect(
      offenders,
      'The closing comment tells the operator how many PASS rows to expect. ' +
        'A stale number there is how a short result set reads as complete.'
    ).toEqual([]);
  });
});
